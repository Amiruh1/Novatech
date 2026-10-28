const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');

let queryHandler = () => { throw new Error('Unexpected database access'); };
const dbPath = require.resolve('../dist/src/access-data/config/db');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: { __esModule: true, default: { query: (...args) => queryHandler(...args) } }
};

const auth = require('../dist/src/business/services/auth.service');
const products = require('../dist/src/business/services/products.service');
const sales = require('../dist/src/business/services/sales.service');
const users = require('../dist/src/business/services/users.service');
const categories = require('../dist/src/business/services/categories.service');

async function withDatabase(steps, run) {
  const remaining = [...steps];
  const failures = [];
  queryHandler = async (sql, params = []) => {
    try {
      const step = remaining.shift();
      assert.ok(step, `Unexpected SQL: ${sql}`);
      assert.match(sql.replace(/\s+/g, ' '), step.sql);
      if (step.params) assert.deepEqual(params, step.params);
      if (step.check) await step.check(params, sql);
      return [step.rows ?? { affectedRows: 1 }, []];
    } catch (error) {
      failures.push(error);
      throw error;
    }
  };
  try {
    await run();
    assert.equal(remaining.length, 0, 'Expected database operations were not executed');
    if (failures.length) throw failures[0];
  } finally {
    queryHandler = () => { throw new Error('Database access outside a test'); };
  }
}

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : file.endsWith('.ts') ? [file] : [];
  });
}

test('the three layers respect their dependency direction and isolate external access', () => {
  const src = path.resolve(__dirname, '../src');
  for (const layer of ['application', 'business', 'access-data']) {
    const files = sourceFiles(path.join(src, layer));
    assert.ok(files.length, `Missing layer: ${layer}`);
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      const label = path.relative(src, file);
      if (layer !== 'access-data') {
        assert.doesNotMatch(source, /\bdb\.(?:query|execute|getConnection)\s*\(|\bfetch\s*\(/, label);
      }
      for (const [, imported] of source.matchAll(/(?:from\s+|require\s*\(\s*)['"]([^'"]+)['"]/g)) {
        if (!imported.startsWith('.')) {
          if (layer !== 'access-data') {
            assert.doesNotMatch(imported, /^(?:mysql2(?:\/|$)|@aws-sdk\/|nodemailer$|google-auth-library$)/, label);
          }
          continue;
        }
        const target = path.relative(src, path.resolve(path.dirname(file), imported)).split(path.sep)[0];
        if (layer === 'application') assert.notEqual(target, 'access-data', label);
        if (layer === 'business') assert.notEqual(target, 'application', label);
        if (layer === 'access-data') assert.ok(!['application', 'business'].includes(target), label);
      }
    }
  }
  assert.doesNotMatch(fs.readFileSync(path.resolve(__dirname, '../index.ts'), 'utf8'), /access-data|\bdb\.(?:query|execute)/);
});

test('readiness reports database failure without exposing the database error', async () => {
  const healthRepository = require('../dist/src/access-data/repositories/health.repository');
  const health = require('../dist/src/application/controllers/health.controller');
  const originalProbe = healthRepository.probeDatabase;
  const response = { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  try {
    healthRepository.probeDatabase = async () => {};
    await health.getReadiness({}, response);
    assert.equal(response.code, 200);
    assert.deepEqual(response.body, { status: 'ready' });
    healthRepository.probeDatabase = async () => { throw new Error('internal connection details'); };
    await health.getReadiness({}, response);
    assert.equal(response.code, 503);
    assert.deepEqual(response.body, { status: 'not_ready' });
  } finally { healthRepository.probeDatabase = originalProbe; }
});

test('login normalizes email, verifies bcrypt and excludes the password', async () => {
  const password = await bcrypt.hash('CorrectPass123', 4);
  await withDatabase([
    { sql: /SELECT .*password.*FROM usuarios/, params: ['ana@example.test'], rows: [{ id: 2, nombre: 'Ana', email: 'ana@example.test', rol: 'cliente', password }] }
  ], async () => {
    const result = await auth.loginWithCredentials(' ANA@example.test ', 'CorrectPass123');
    assert.equal(result.id, 2);
    assert.equal(result.rol, 'cliente');
    assert.equal(Object.hasOwn(result, 'password'), false);
  });
});

test('invalid password does not authenticate or write to the database', async () => {
  const password = await bcrypt.hash('CorrectPass123', 4);
  await withDatabase([
    { sql: /SELECT .*password/, rows: [{ id: 2, password }] }
  ], async () => assert.equal(await auth.loginWithCredentials('ana@example.test', 'wrong'), null));
});

test('legacy login upgrades the stored password to bcrypt', async () => {
  await withDatabase([
    { sql: /SELECT .*password/, rows: [{ id: 2, nombre: 'Ana', email: 'ana@example.test', rol: 'cliente', password: 'LegacyPass123' }] },
    { sql: /UPDATE usuarios SET password/, check: async ([hash, id]) => {
      assert.equal(id, 2);
      assert.notEqual(hash, 'LegacyPass123');
      assert.equal(await bcrypt.compare('LegacyPass123', hash), true);
    } }
  ], async () => assert.equal((await auth.loginWithCredentials('ana@example.test', 'LegacyPass123')).id, 2));
});

test('registration rejects duplicate identity before inserting an account', async () => {
  await withDatabase([
    { sql: /SELECT email, numero_documento/, params: ['ana@example.test', '12345678'], rows: [{ email: 'ana@example.test', numero_documento: '12345678' }] }
  ], async () => assert.rejects(
    auth.registerCustomerAccount(' Ana ', ' ANA@example.test ', 'Password123', 'DNI', '12345678'),
    /EMAIL_AND_DOC_EXISTS/
  ));
});

test('expired reset codes cannot change a password', async () => {
  await withDatabase([
    { sql: /SELECT id, reset_token, reset_token_expires/, rows: [{ id: 2, reset_token: crypto.createHash('sha256').update('ABC234').digest('hex'), reset_token_expires: new Date(0) }] }
  ], async () => assert.rejects(auth.resetPasswordByCode('ana@example.test', 'abc234', 'NewPass123'), /CODE_EXPIRED/));
});

test('password change checks the old password and persists only a new hash', async () => {
  const password = await bcrypt.hash('OldPassword123', 4);
  await withDatabase([
    { sql: /SELECT password FROM usuarios/, params: [2], rows: [{ password }] },
    { sql: /UPDATE usuarios SET password/, check: async ([hash, id]) => {
      assert.equal(id, 2);
      assert.equal(await bcrypt.compare('NewPassword123', hash), true);
    } }
  ], async () => assert.equal(await auth.changeAccountPassword(2, 'OldPassword123', 'NewPassword123'), 'UPDATED'));
});

test('setup links persist the SHA-256 token expected by password reset', async () => {
  let storedHash;
  await withDatabase([
    { sql: /UPDATE usuarios SET reset_token/, check: ([hash, expiry, id]) => {
      storedHash = hash;
      assert.equal(id, 12);
      assert.ok(expiry.getTime() > Date.now() + 71 * 60 * 60 * 1000);
    } }
  ], async () => {
    const token = await users.issueAccountSetupToken(12);
    assert.match(token, /^[a-f0-9]{64}$/);
    assert.notEqual(token, storedHash);
    assert.equal(crypto.createHash('sha256').update(token).digest('hex'), storedHash);
  });
});

test('catalog search keeps user filters parameterized and paginates only the result query', async () => {
  const query = "x' OR 1=1 --";
  const conditions = [`%${query}%`, `%${query}%`, `%${query}%`, 'Computadoras', 20];
  await withDatabase([
    { sql: /SELECT COUNT\(\*\).*categoria = \?.*COALESCE/, params: conditions, rows: [{ total: 1 }] },
    { sql: /ORDER BY COALESCE\(precio_oferta, precio\) ASC LIMIT \? OFFSET \?/, params: [...conditions, 10, 20], rows: [{ id: 7 }], check: (_params, sql) => assert.equal(sql.includes(query), false) }
  ], async () => assert.deepEqual(await products.listProducts({ query, categoria: 'Computadoras', precioMin: 20, orden: 'precio_asc', limit: 10, offset: 20 }), { data: [{ id: 7 }], total: 1 }));
});

test('product creation keeps defaults in the service layer', async () => {
  await withDatabase([
    { sql: /INSERT INTO productos/, params: [null, 'Teclado', null, 80, null, null, 3, 0, 'General', 'NovaTech', null, 0, null, null, null], rows: { insertId: 7 } }
  ], async () => assert.deepEqual(await products.createProduct({ nombre: 'Teclado', precio: 80, stock: 3 }), { insertId: 7 }));
});

test('stock adjustment records the previous value, difference and operator', async () => {
  await withDatabase([
    { sql: /SELECT stock FROM productos/, params: [7], rows: [{ stock: 10 }] },
    { sql: /UPDATE productos SET stock/, params: [6, 7] },
    { sql: /INSERT INTO inventario_movimientos.*'AJUSTE'/, params: [7, 4, 10, 6, 'Conteo fisico', 2] }
  ], async () => assert.equal(await products.adjustStockWithMovement(7, 6, ' Conteo fisico ', 2), 10));
});

test('sale registration retains procedure arguments, shipping and inventory movement', async () => {
  await withDatabase([
    { sql: /CALL sp_registrar_venta\(\?, \?, \?\)/, params: [2, 'Ana', '[{"id":7,"cantidad":2}]'], rows: [[{ id_venta: 24, total_venta: 118 }]] },
    { sql: /UPDATE ventas SET impuesto/, params: [15, 15, 24] },
    { sql: /SELECT stock/, params: [7], rows: [{ stock: 8 }] },
    { sql: /INSERT INTO inventario_movimientos.*'VENTA'/, params: [7, 2, 10, 8, 'Venta #24', 24, 2] },
    { sql: /SELECT total FROM ventas/, params: [24], rows: [{ total: 133 }] }
  ], async () => assert.deepEqual(await sales.createSale({ id_usuario: 2, nombre_usuario: 'Ana', detalle: [{ id: 7, cantidad: 2 }], costo_envio: 15 }), { id_venta: 24, total_venta: 133 }));
});

test('payment amount comes from the server total and wallets require review', async () => {
  await withDatabase([
    { sql: /SELECT id, nombre FROM metodos_pago/, rows: [{ id: 5, nombre: 'Yape' }] },
    { sql: /UPDATE ventas SET metodo_pago_id/, check: params => {
      assert.equal(params[0], 5);
      const metadata = JSON.parse(params[2]);
      assert.equal(metadata.monto_pagado, 133);
      assert.equal(metadata.referencia_pago, 'ABC123');
    } },
    { sql: /DELETE FROM ventas_pagos/, params: [24] },
    { sql: /INSERT INTO ventas_pagos.*'pendiente'/, params: [24, 5, 133, 'ABC123'] }
  ], async () => sales.saveSalePaymentMetadata(24, 133, { metodo_key: 'billetera', monto_pagado: 0.01, referencia_pago: ' ABC123 ' }));
});

test('an invalid sale transition leaves state and inventory untouched', async () => {
  await withDatabase([
    { sql: /SELECT id, estado, detalle FROM ventas/, rows: [{ id: 24, estado: 'pendiente', detalle: [] }] }
  ], async () => assert.rejects(sales.updateSaleStatus(24, 'entregado', 2), error => JSON.parse(error.message).code === 'INVALID_TRANSITION'));
});

test('cancellation restores stock and records the operator and transition', async () => {
  await withDatabase([
    { sql: /SELECT id, estado, detalle FROM ventas/, rows: [{ id: 24, estado: 'pendiente', detalle: '[{"id":7,"cantidad":2}]' }] },
    { sql: /UPDATE ventas SET estado/, params: ['cancelado', 24] },
    { sql: /SELECT stock FROM productos/, params: [7], rows: [{ stock: 8 }] },
    { sql: /UPDATE productos SET stock/, params: [10, 7] },
    { sql: /INSERT INTO inventario_movimientos.*'DEVOLUCION'/, params: [7, 2, 8, 10, 'Cancelacion venta #24', 24, 2] },
    { sql: /INSERT INTO auditoria.*'UPDATE_ESTADO'/, params: [2, '24', 'cancelado'] }
  ], async () => sales.updateSaleStatus(24, 'cancelado', 2));
});

test('delivery updates the sale without returning products to inventory', async () => {
  await withDatabase([
    { sql: /SELECT id, estado, detalle FROM ventas/, rows: [{ id: 24, estado: 'en camino', detalle: '[{"id":7,"cantidad":2}]' }] },
    { sql: /UPDATE ventas SET estado/, params: ['entregado', 24] },
    { sql: /INSERT INTO auditoria.*'UPDATE_ESTADO'/, params: [2, '24', 'entregado'] }
  ], async () => sales.updateSaleStatus(24, 'entregado', 2));
});

test('a payment cannot be confirmed twice', async () => {
  await withDatabase([
    { sql: /SELECT id FROM ventas_pagos/, params: [24], rows: [] }
  ], async () => assert.rejects(sales.confirmSalePayment(24, 2), /No hay pago pendiente/));
});

test('category updates only accept known column names', async () => {
  await withDatabase([
    { sql: /^UPDATE categorias SET nombre = \? WHERE id = \?$/, params: ['Accesorios', 3] }
  ], async () => categories.updateCategoria(3, { nombre: 'Accesorios', 'activo = 0 WHERE 1=1 --': 1 }));
});
