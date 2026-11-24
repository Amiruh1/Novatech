// Pruebas de extremo a extremo del handler real sobre SQLite en memoria.  Ejecutar: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
process.env.MAIL_MODE = 'console';
process.env.OUTBOX_DIR = mkdtempSync(join(tmpdir(), 'outbox-'));
process.env.ADMIN_EMAIL = 'owner@novatech.test';
process.env.FRONTEND_URL = 'https://demo.github.io/NovaTech';
process.env.IDP = 'memory'; // Cognito simulado en memoria

const { handleRequest } = await import('../src/app.js');
const { getDb, setDb } = await import('../src/lib/db/index.js');
const { createSqliteDb } = await import('./support/sqlite-db.js'); // BD en memoria con el mismo contrato que Mongo
const { seed } = await import('../scripts/seed-data.js');
setDb(createSqliteDb(':memory:'));
const { getIdp } = await import('../src/lib/idp.js');
await seed(await getDb(), (id, email, password) => getIdp().create(id, email, password));

async function api(method, path, body, token) {
  const [p, qs] = path.split('?');
  const r = await handleRequest({
    method, path: p, query: Object.fromEntries(new URLSearchParams(qs || '')),
    headers: token ? { authorization: `Bearer ${token}` } : {}, rawBody: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: r.body ?? null };
}
const login = async (email, modo) => (await api('POST', '/auth/login', { email, password: 'NovaTech123!', modo })).data.token;
const OTP_RX = /monospace[^>]*>([A-HJ-NP-Z2-9]{6})</; // RF-03: 6 caracteres, sin O, 0, I ni 1
const CARD = { metodo_pago: 'tarjeta', tarjeta: { titular: 'Cliente Demo', ultimos4: '4242', marca: 'Visa' } };
const wrongCode = (c) => (c === 'AAAAAA' ? 'BBBBBB' : 'AAAAAA');
const mails = () => readdirSync(process.env.OUTBOX_DIR).map((f) => readFileSync(join(process.env.OUTBOX_DIR, f), 'utf8'));
let admin, cli, laptop, monitor, addr;

test('login, token inválido y bloqueo por intentos', async () => {
  admin = await login('admin@novatech.com', 'empresa'); cli = await login('cliente@novatech.com');
  assert.ok(admin && cli);
  assert.equal((await api('GET', '/admin/dashboard')).status, 401);
  assert.equal((await api('GET', '/admin/dashboard', null, cli)).status, 403);
  assert.equal((await api('GET', '/admin/dashboard', null, admin)).status, 200);
  for (let i = 0; i < 5; i++) await api('POST', '/auth/login', { email: 'cliente@novatech.com', password: 'mala-clave-1' });
  assert.equal((await api('POST', '/auth/login', { email: 'cliente@novatech.com', password: 'NovaTech123!' })).status, 429);
  // desbloqueo manual para seguir con las demás pruebas
  const db = await getDb(); const u = (await db.listBy('user', 'email', 'cliente@novatech.com'))[0];
  await db.put('user', { ...u, lockedUntil: null, failedLogins: 0 });
});

test('registro con código OTP por correo, validaciones y bienvenida', async () => {
  const datos = { nombre: 'Ana Perez', email: 'ana@test.com', password: 'ClaveSegura1', tipo_documento: 'DNI', numero_documento: '12345678' };
  assert.equal((await api('POST', '/auth/register', { ...datos, password: 'corta' })).status, 400);
  assert.equal((await api('POST', '/auth/register', { ...datos, confirmacion: 'OtraCosa123' })).status, 400); // confirmación distinta
  assert.equal((await api('POST', '/auth/register', { ...datos, numero_documento: '1234567' })).status, 400); // HU-001 CA-3
  // 1) el registro no crea la cuenta: envía un código y queda pendiente
  const pend = await api('POST', '/auth/register', datos);
  assert.equal(pend.status, 202);
  assert.equal(pend.data.pendiente, true);
  assert.equal(pend.data.token, undefined);
  assert.equal((await api('POST', '/auth/login', { email: 'ana@test.com', password: 'ClaveSegura1' })).status, 401); // aún no existe
  const codeOf = () => mails().filter((m) => m.includes('To: ana@test.com') && m.includes('código de verificación')).pop().match(OTP_RX)[1];
  const code = codeOf();
  // reenviar antes de 60 s → 429
  assert.equal((await api('POST', '/auth/register/resend', { email: 'ana@test.com' })).status, 429);
  // 2) código incorrecto → 400; correcto (también en minúsculas) → crea la cuenta y vuelve al login (HU-001)
  assert.equal((await api('POST', '/auth/register/verify', { email: 'ana@test.com', code: wrongCode(code) })).status, 400);
  const okr = await api('POST', '/auth/register/verify', { email: 'ana@test.com', code: code.toLowerCase() });
  assert.equal(okr.status, 201);
  assert.equal(okr.data.creado, true);
  assert.equal(okr.data.token, undefined); // no inicia sesión automáticamente
  const ana = (await (await getDb()).listBy('user', 'email', 'ana@test.com'))[0];
  assert.equal(ana.email_verificado, true);
  assert.equal(ana.passHash, undefined); // RNF-03: la contraseña vive en Cognito, no en la base
  assert.equal(ana.cognito, true);
  assert.ok(getIdp().has(ana.id));
  assert.equal((await api('POST', '/auth/register/verify', { email: 'ana@test.com', code })).status, 400); // un solo uso
  assert.equal((await api('POST', '/auth/register', { ...datos, email: 'ANA@test.com' })).status, 409);
  // RF-01: el documento también es único (mismo DNI con otro correo → 409)
  assert.equal((await api('POST', '/auth/register', { ...datos, email: 'otra@test.com' })).status, 409);
  assert.ok(mails().some((m) => m.includes('Bienvenido a NovaTech') && m.includes('ana@test.com')));
  assert.equal((await api('POST', '/auth/login', { email: 'ana@test.com', password: 'ClaveSegura1' })).status, 200);
});

test('registro accesible: cuenta activa al instante, sin código, con sesión y auditoría', async () => {
  const datos = { nombre: 'Luis Rojas', email: 'luis@test.com', password: 'ClaveSegura1', tipo_documento: 'DNI', numero_documento: '41230001', accesible: true };
  assert.equal((await api('POST', '/auth/register', { ...datos, password: 'corta' })).status, 400); // valida igual que el normal
  const r = await api('POST', '/auth/register', datos);
  assert.equal(r.status, 201);
  assert.equal(r.data.activada, true);
  assert.ok(r.data.token);
  assert.equal(r.data.user.email, 'luis@test.com');
  assert.ok(!mails().some((m) => m.includes('To: luis@test.com') && m.includes('código de verificación'))); // sin código
  assert.ok(mails().some((m) => m.includes('Bienvenido a NovaTech') && m.includes('luis@test.com')));
  const u = (await (await getDb()).listBy('user', 'email', 'luis@test.com'))[0];
  assert.equal(u.email_verificado, false); // el correo queda sin verificar
  assert.equal(u.registro_accesible, true);
  assert.equal((await api('GET', '/auth/me', null, r.data.token)).status, 200);
  assert.equal((await api('POST', '/auth/register', { ...datos, email: 'otro@test.com' })).status, 409); // documento único
  assert.equal((await api('POST', '/auth/register', datos)).status, 409); // correo único
  const logs = (await api('GET', '/admin/audit', null, admin)).data.registros;
  assert.ok(logs.some((l) => l.accion === 'REGISTRO_ACCESIBLE' && l.descripcion.includes('luis@test.com')));
});

test('recuperación de contraseña con código por correo', async () => {
  await api('POST', '/auth/forgot-password', { email: 'ana@test.com' });
  const mail = mails().find((m) => m.includes('To: ana@test.com') && m.includes('Subject: Código'));
  const code = mail.match(OTP_RX)[1];
  assert.equal((await api('POST', '/auth/forgot-password', { email: 'noexiste@test.com' })).data.message,
    (await api('POST', '/auth/forgot-password', { email: 'cliente@novatech.com' })).data.message); // respuesta neutral
  assert.equal((await api('POST', '/auth/reset-password', { email: 'ana@test.com', code: wrongCode(code), password: 'NuevaClave123' })).status, 400);
  assert.equal((await api('POST', '/auth/reset-password', { email: 'ana@test.com', code, password: 'NuevaClave123', confirmacion: 'Distinta123' })).status, 400);
  const reset = await api('POST', '/auth/reset-password', { email: 'ana@test.com', code, password: 'NuevaClave123', confirmacion: 'NuevaClave123' });
  assert.equal(reset.status, 200);
  assert.equal(reset.data.token, undefined); // RF-04: no inicia sesión
  assert.equal((await api('POST', '/auth/login', { email: 'ana@test.com', password: 'NuevaClave123' })).status, 200);
  assert.equal((await api('POST', '/auth/reset-password', { email: 'ana@test.com', code, password: 'OtraClave1234' })).status, 400); // el código es de un solo uso
});

test('catálogo público oculta costos y filtra', async () => {
  const all = (await api('GET', '/products')).data;
  assert.equal(all.total, 6);
  assert.equal(all.productos[0].precio_compra, undefined);
  laptop = all.productos.find((p) => p.sku === 'LAP-001'); monitor = all.productos.find((p) => p.sku === 'MON-001');
  assert.equal(laptop.precio_final, 3599);
  assert.equal((await api('GET', '/products?q=logitech')).data.total, 1);
  assert.equal((await api('GET', '/products?ofertas=1')).data.total, 3);
  assert.equal((await api('GET', '/products?orden=precio_asc')).data.productos[0].sku, 'ACC-001');
});

test('filtros laterales: opciones por categoría, especificaciones y varias marcas', async () => {
  const db = await getDb();
  const lap = await db.get('product', laptop.id);
  await db.put('product', { ...lap, especificaciones: [{ grupo: 'Rendimiento', nombre: 'Procesador', valor: 'Ryzen 7' }, { grupo: 'Memoria', nombre: 'Memoria RAM', valor: '16 GB' }] });
  const facets = (await api(`GET`, `/products/facets?categoria=${laptop.categoria_id}`)).data;
  assert.equal(facets.total, 2);
  assert.ok(facets.precio.min > 0 && facets.precio.max >= facets.precio.min);
  assert.deepEqual(facets.especificaciones.find((f) => f.nombre === 'Procesador').valores, [{ valor: 'Ryzen 7', count: 1 }]);
  const specs = encodeURIComponent(JSON.stringify({ procesador: ['ryzen 7'] })); // sin distinguir mayúsculas
  assert.equal((await api('GET', `/products?categoria=${laptop.categoria_id}&specs=${specs}`)).data.total, 1);
  assert.equal((await api('GET', `/products?specs=${encodeURIComponent('{"Procesador":["Intel"]}')}`)).data.total, 0);
  assert.equal((await api('GET', '/products?specs=no-es-json')).status, 400);
  const marcas = [laptop.marca_id, monitor.marca_id].join(',');
  assert.equal((await api('GET', `/products?marcas=${marcas}`)).data.total, (await api('GET', '/products')).data.productos.filter((p) => [laptop.marca_id, monitor.marca_id].includes(p.marca_id)).length);
  // "No disponible": solo productos con stock 0
  await db.put('product', { ...lap, stock: 0 });
  const agotados = (await api('GET', '/products?agotados=1')).data;
  assert.ok(agotados.total >= 1 && agotados.productos.every((p) => p.stock === 0));
  assert.ok((await api('GET', '/products?disponibles=1')).data.productos.every((p) => p.stock > 0));
  await db.put('product', lap); // deja la laptop como estaba para las demás pruebas
});

test('usuarios: teléfono de exactamente 9 dígitos, DNI de 8 y documento único', async () => {
  const base = { nombre: 'Prueba Telefono', password: 'ClaveSegura1', rol: 'cliente', tipo_documento: 'DNI', numero_documento: '87654321' };
  assert.equal((await api('POST', '/users', { ...base, email: 't1@test.com', telefono: '98765432' }, admin)).status, 400); // 8 dígitos
  assert.equal((await api('POST', '/users', { ...base, email: 't2@test.com', telefono: '98765432a' }, admin)).status, 400); // letras
  assert.equal((await api('POST', '/users', { ...base, email: 't3@test.com', telefono: '987654321', numero_documento: '1234567' }, admin)).status, 400); // DNI corto
  const ok = await api('POST', '/users', { ...base, email: 't4@test.com', telefono: '987 654 321' }, admin);
  assert.equal(ok.status, 201);
  assert.equal(ok.data.usuario.telefono, '987654321');
  assert.equal((await api('POST', '/users', { ...base, email: 't6@test.com', telefono: '9876543210', numero_documento: '87654329' }, admin)).status, 400); // 10 dígitos
  assert.equal((await api('POST', '/users', { ...base, email: 't7@test.com', telefono: '' }, admin)).status, 409); // DNI repetido
  assert.equal((await api('POST', '/users', { ...base, email: 't5@test.com', telefono: '', numero_documento: '87654322' }, admin)).data.usuario.telefono, null); // opcional
});

test('compra: precios del servidor, stock atómico, correos y notificaciones', async () => {
  addr = (await api('GET', '/addresses', null, cli)).data.direcciones[0];
  // direcciones: alias/distrito/provincia/departamento solo letras (máx. 120) y teléfono de 9 dígitos
  const nueva = { alias: 'Oficina', destinatario: 'Cliente Demo', direccion_linea1: 'Av. Arequipa 456', distrito: 'San Isidro', provincia: 'Lima', departamento: 'Lima', codigo_postal: '15073' };
  assert.equal((await api('POST', '/addresses', { ...nueva, codigo_postal: '' }, cli)).status, 400); // HU-008: código postal obligatorio
  assert.equal((await api('POST', '/addresses', { ...nueva, codigo_postal: '1507' }, cli)).status, 400);
  assert.equal((await api('POST', '/addresses', { ...nueva, distrito: 'Lima 1' }, cli)).status, 400);
  assert.equal((await api('POST', '/addresses', { ...nueva, alias: 'Casa2' }, cli)).status, 400);
  assert.equal((await api('POST', '/addresses', { ...nueva, provincia: 'a'.repeat(121) }, cli)).status, 400);
  assert.equal((await api('POST', '/addresses', { ...nueva, telefono_contacto: '98765432' }, cli)).status, 400);
  assert.equal((await api('POST', '/addresses', { ...nueva, telefono_contacto: '9876543210' }, cli)).status, 400);
  const okAddr = await api('POST', '/addresses', { ...nueva, telefono_contacto: '987654321' }, cli);
  assert.equal(okAddr.status, 201);
  await api('DELETE', `/addresses/${okAddr.data.direccion.id}`, null, cli);
  // intenta manipular precio desde el cliente
  const r = await api('POST', '/sales', { items: [{ id: laptop.id, cantidad: 2, precio: 1 }], ...CARD, tipo_despacho: 'envio', direccion_envio_id: addr.id }, cli);
  assert.equal(r.status, 201);
  assert.equal(r.data.venta.subtotal, 7198);
  assert.ok(r.data.venta.items[0].categoria); // el comprobante muestra la categoría de cada producto
  // ventas antiguas sin categoría en la línea: se completa con la del producto al consultarlas
  const db = await getDb();
  const vieja = await db.put('sale', { ...r.data.venta, id: undefined, codigo: 'NT-OLD', items: r.data.venta.items.map(({ categoria, ...i }) => i) });
  assert.equal((await api('GET', `/sales/${vieja.id}`, null, cli)).data.venta.items[0].categoria, r.data.venta.items[0].categoria);
  await db.remove('sale', vieja.id);
  assert.equal(r.data.venta.costo_envio, 0); // envío gratis desde S/ 500
  assert.equal(r.data.venta.estado, 'pendiente');
  assert.equal((await api('GET', `/products/${laptop.id}`)).data.producto.stock, 6);
  // RF-36: el correo de la compra lleva el comprobante PDF adjunto
  assert.ok(mails().some((m) => m.includes(r.data.venta.codigo) && m.includes('To: cliente@novatech.com') && m.includes(`Adjuntos: comprobante-${r.data.venta.codigo}.pdf`)));
  const pdf = readdirSync(process.env.OUTBOX_DIR).find((f) => f.endsWith(`-comprobante-${r.data.venta.codigo}.pdf`));
  assert.equal(readFileSync(join(process.env.OUTBOX_DIR, pdf)).subarray(0, 5).toString(), '%PDF-');
  assert.ok(mails().some((m) => m.includes('To: owner@novatech.test') && m.includes('Nueva venta')));
  // sin stock suficiente → 409 y no descuenta nada
  const over = await api('POST', '/sales', { items: [{ id: monitor.id, cantidad: 1 }, { id: laptop.id, cantidad: 50 }], ...CARD, tipo_despacho: 'envio', direccion_envio_id: addr.id }, cli);
  assert.equal(over.status, 409);
  assert.equal((await api('GET', `/products/${monitor.id}`)).data.producto.stock, 2);
  // yape exige referencia
  assert.equal((await api('POST', '/sales', { items: [{ id: monitor.id, cantidad: 1 }], metodo_pago: 'yape', tipo_despacho: 'envio', direccion_envio_id: addr.id }, cli)).status, 400);
  // dirección ajena
  assert.equal((await api('POST', '/sales', { items: [{ id: monitor.id, cantidad: 1 }], ...CARD, tipo_despacho: 'envio', direccion_envio_id: 'x' }, cli)).status, 400);
  // sin datos de contacto en el pedido se usan los de la cuenta
  assert.equal(r.data.venta.cliente.email, 'cliente@novatech.com');
  // solo envío a domicilio: recojo en tienda rechazado, y sin dirección tampoco se puede comprar
  const envio = { items: [{ id: monitor.id, cantidad: 1 }], ...CARD, tipo_despacho: 'envio', direccion_envio_id: addr.id };
  assert.equal((await api('POST', '/sales', { ...envio, tipo_despacho: 'retiro' }, cli)).status, 400);
  assert.equal((await api('POST', '/sales', { ...envio, direccion_envio_id: undefined }, cli)).status, 400);
  assert.equal((await api('GET', '/stores')).status, 404);
  // checkout: datos de contacto (DNI de 8 dígitos, teléfono obligatorio)
  const contacto = { nombre: 'Ana Pérez', documento: '12345678', telefono: '987654321' };
  assert.equal((await api('POST', '/sales', { ...envio, cliente: { ...contacto, documento: '123' } }, cli)).status, 400);
  assert.equal((await api('POST', '/sales', { ...envio, cliente: { ...contacto, telefono: '' } }, cli)).status, 400);
  assert.equal((await api('GET', `/products/${monitor.id}`)).data.producto.stock, 2); // los rechazos no descuentan stock
});

test('compras simultáneas no dejan el stock negativo', async () => {
  const results = await Promise.all(Array.from({ length: 5 }, () =>
    api('POST', '/sales', { items: [{ id: monitor.id, cantidad: 1 }], ...CARD, tipo_despacho: 'envio', direccion_envio_id: addr.id }, cli)));
  assert.equal(results.filter((x) => x.status === 201).length, 2);
  assert.equal((await api('GET', `/products/${monitor.id}`)).data.producto.stock, 0);
});

test('alerta de stock bajo solo al cruzar el mínimo (notificación + correo al admin)', async () => {
  const cel = (await api('GET', '/products?q=galaxy')).data.productos[0]; // stock 15, mínimo 5
  await api('POST', '/sales', { items: [{ id: cel.id, cantidad: 5 }], ...CARD, tipo_despacho: 'envio', direccion_envio_id: addr.id }, cli); // 10: sin alerta
  assert.ok(!mails().some((m) => m.includes('Subject: Stock bajo') && m.includes('Galaxy')));
  await api('POST', '/sales', { items: [{ id: cel.id, cantidad: 6 }], ...CARD, tipo_despacho: 'envio', direccion_envio_id: addr.id }, cli); // 4: cruza el mínimo
  await api('POST', '/sales', { items: [{ id: cel.id, cantidad: 1 }], ...CARD, tipo_despacho: 'envio', direccion_envio_id: addr.id }, cli); // 3: no repite
  assert.equal(mails().filter((m) => m.includes('Subject: Stock bajo') && m.includes('Galaxy')).length, 1);
  const n = (await api('GET', '/notifications', null, admin)).data.notificaciones;
  assert.ok(n.some((x) => x.tipo === 'stock' && x.titulo.includes('Galaxy')));
});

test('estados: transiciones válidas, correo al cliente y devolución de stock', async () => {
  const sale = (await api('GET', '/admin/sales', null, admin)).data.ventas.find((s) => s.items[0].producto_id === laptop.id);
  assert.equal((await api('PUT', `/sales/${sale.id}/status`, { estado: 'entregado' }, admin)).status, 400);
  assert.equal((await api('PUT', `/sales/${sale.id}/confirm-payment`, {}, admin)).data.venta.pago_estado, 'confirmado');
  assert.ok(mails().some((m) => m.includes('Subject: Tu pedido') && m.includes('pagado')));
  assert.equal((await api('PUT', `/sales/${sale.id}/status`, { estado: 'cancelado' }, admin)).status, 200);
  assert.equal((await api('GET', `/products/${laptop.id}`)).data.producto.stock, 8); // se repuso
  assert.equal((await api('PUT', `/sales/${sale.id}/status`, { estado: 'pagado' }, admin)).status, 400); // cancelado es final
  const mov = (await api('GET', `/products/${laptop.id}/movements`, null, admin)).data.movimientos;
  assert.deepEqual([...new Set(mov.map((m) => m.tipo))].sort(), ['DEVOLUCION', 'ENTRADA', 'VENTA']);
});

test('un cliente no ve compras ajenas; mis compras', async () => {
  const mine = (await api('GET', '/sales/mine', null, cli)).data.ventas;
  assert.ok(mine.length >= 3);
  const ana = (await api('POST', '/auth/login', { email: 'ana@test.com', password: 'NuevaClave123' })).data.token;
  assert.equal((await api('GET', `/sales/${mine[0].id}`, null, ana)).status, 403);
  assert.equal((await api('GET', '/sales/mine', null, ana)).data.ventas.length, 0);
});

test('admin: productos, ajuste de stock y usuarios protegidos', async () => {
  const bad = await api('POST', '/products', { nombre: 'Item', precio: 100, precio_oferta: 150 }, admin);
  assert.equal(bad.status, 400);
  const created = await api('POST', '/products', { nombre: 'Teclado Mecánico', precio: 250, stock: 5, stock_minimo: 2, sku: 'ACC-9' }, admin);
  assert.equal(created.status, 201);
  const id = created.data.producto.id;
  assert.equal((await api('PUT', `/products/${id}/stock`, { tipo: 'SALIDA', cantidad: 9, motivo: 'x' }, admin)).status, 409);
  assert.equal((await api('PUT', `/products/${id}/stock`, { tipo: 'AJUSTE', cantidad: 12, motivo: 'Conteo físico' }, admin)).data.producto.stock, 12);
  assert.equal((await api('POST', '/products', { nombre: 'Hack', precio: 1 }, cli)).status, 403);
  const me = (await api('GET', '/auth/me', null, admin)).data.user;
  assert.equal((await api('PATCH', `/users/${me.id}/active`, { activo: false }, admin)).status, 400);
  assert.equal((await api('PUT', `/users/${me.id}`, { rol: 'cliente' }, admin)).status, 400); // último admin
  const cat = (await api('GET', '/admin/catalog', null, admin)).data.categorias[0];
  assert.equal((await api('DELETE', `/categories/${cat.id}`, null, admin)).status, 409); // tiene productos
});

test('dashboard calcula KPIs', async () => {
  const d = (await api('GET', '/admin/dashboard', null, admin)).data;
  assert.equal(d.serie_30_dias.length, 30);
  assert.ok(d.kpis.pedidos_total >= 3);
  assert.ok(d.stock_bajo.some((p) => p.nombre.includes('Monitor')));
  // Vista por período: los pedidos de hoy entran en hoy, semana y mes.
  assert.equal(d.periodo, 'mes');
  const hoy = (await api('GET', '/admin/dashboard?periodo=hoy', null, admin)).data;
  assert.equal(hoy.periodo, 'hoy');
  assert.equal(hoy.resumen.pedidos, d.resumen.pedidos);
  assert.equal(Object.values(hoy.estados_periodo).reduce((a, b) => a + b, 0), hoy.resumen.pedidos);
  assert.equal(d.resumen.stock_total, (await api('GET', '/products?limit=100')).data.productos.reduce((t, p) => t + p.stock, 0));
  assert.ok(d.riesgo_inventario.length <= 8 && d.riesgo_inventario.every((p, i, a) => i === 0 || a[i - 1].stock <= p.stock));
  assert.equal(d.por_categoria.reduce((t, c) => t + c.productos, 0), d.resumen.productos);
  assert.ok(d.ultimos_pedidos.length >= 1 && d.ultimos_pedidos.length <= 5 && d.ultimos_pedidos[0].codigo);
  assert.ok(d.alerta_stock.items.every((p) => p.stock <= Math.max(d.alerta_stock.umbral, p.stock_minimo)));
});

test('RF-08: el backoffice exige "Acceso empresa" (modo elevado)', async () => {
  const { signToken } = await import('../src/lib/auth.js');
  const adminUser = (await api('GET', '/auth/me', null, admin)).data;
  assert.equal(adminUser.elev, true);
  // un administrador no entra por el login de clientes, y un cliente no entra por el de empresa
  assert.equal((await api('POST', '/auth/login', { email: 'admin@novatech.com', password: 'NovaTech123!' })).status, 403);
  assert.equal((await api('POST', '/auth/login', { email: 'cliente@novatech.com', password: 'NovaTech123!', modo: 'empresa' })).status, 403);
  // un token de admin sin modo elevado no abre el panel
  const plain = signToken({ sub: adminUser.user.id, rol: 'admin' });
  assert.equal((await api('GET', '/admin/dashboard', null, plain)).status, 403);
});

test('RNF-03: una cuenta antigua con hash pasa a Cognito al iniciar sesión y el hash se borra', async () => {
  const { scryptSync, randomBytes } = await import('node:crypto');
  const db = await getDb();
  const salt = randomBytes(16);
  const legacy = `scrypt$${salt.toString('hex')}$${scryptSync('ClaveVieja123', salt, 64).toString('hex')}`;
  const u = await db.put('user', { nombre: 'Usuario Antiguo', email: 'viejo@test.com', passHash: legacy, rol: 'cliente', tipo_documento: 'DNI', numero_documento: '44445555', activo: true });
  assert.equal((await api('POST', '/auth/login', { email: 'viejo@test.com', password: 'ClaveVieja123' })).status, 200);
  const after = await db.get('user', u.id);
  assert.equal(after.passHash, undefined);
  assert.equal(after.cognito, true);
  assert.ok(getIdp().has(u.id));
  assert.equal((await api('POST', '/auth/login', { email: 'viejo@test.com', password: 'ClaveVieja123' })).status, 200);
  assert.equal((await api('POST', '/auth/login', { email: 'viejo@test.com', password: 'OtraClave123' })).status, 401);
});

test('RF-06: perfil — correo editable, teléfono de 9 dígitos y documento bloqueado', async () => {
  const ana = await login('ana@test.com').catch(() => null) || (await api('POST', '/auth/login', { email: 'ana@test.com', password: 'NuevaClave123' })).data.token;
  assert.equal((await api('PUT', '/auth/profile', { telefono: '98765432' }, ana)).status, 400);
  assert.equal((await api('PUT', '/auth/profile', { numero_documento: '11112222' }, ana)).status, 400); // ya tiene DNI
  assert.equal((await api('PUT', '/auth/profile', { email: 'cliente@novatech.com' }, ana)).status, 409);
  const r = await api('PUT', '/auth/profile', { email: 'ana.nueva@test.com', telefono: '912345678' }, ana);
  assert.equal(r.status, 200);
  assert.equal(r.data.user.email, 'ana.nueva@test.com');
  assert.equal(r.data.user.numero_documento, '12345678');
  // cuenta sin documento (Google): puede registrarlo una sola vez
  const db = await getDb();
  const g = await db.put('user', { nombre: 'Usuario Google', email: 'g@test.com', passHash: '!google', rol: 'cliente', tipo_documento: 'DNI', numero_documento: '00000000', activo: true });
  const { signToken } = await import('../src/lib/auth.js');
  const gt = signToken({ sub: g.id, rol: 'cliente' });
  assert.equal((await api('PUT', '/auth/profile', { tipo_documento: 'DNI', numero_documento: '12345678' }, gt)).status, 409); // de Ana
  assert.equal((await api('PUT', '/auth/profile', { tipo_documento: 'DNI', numero_documento: '55556666' }, gt)).status, 200);
  assert.equal((await api('PUT', '/auth/profile', { tipo_documento: 'DNI', numero_documento: '55556667' }, gt)).status, 400);
  // RF-05: cambiar la contraseña exige la actual
  assert.equal((await api('POST', '/auth/change-password', { actual: 'mala', nueva: 'OtraClave123' }, ana)).status, 400);
});

test('RF-40: la oferta solo vale dentro de sus fechas', async () => {
  const day = (n) => new Date(Date.now() - 5 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
  assert.equal((await api('POST', '/products', { nombre: 'Oferta mala', precio: 100, precio_oferta: 80, oferta_inicio: day(2), oferta_fin: day(1) }, admin)).status, 400);
  const vencida = (await api('POST', '/products', { nombre: 'Mouse Vencido', precio: 100, precio_oferta: 80, oferta_inicio: day(-10), oferta_fin: day(-1), stock: 3 }, admin)).data.producto;
  const vigente = (await api('POST', '/products', { nombre: 'Mouse Vigente', precio: 100, precio_oferta: 80, oferta_inicio: day(0), oferta_fin: day(3), stock: 3 }, admin)).data.producto;
  const pv = (await api('GET', `/products/${vencida.id}`)).data.producto;
  assert.equal(pv.precio_final, 100); assert.equal(pv.en_oferta, false);
  const pg = (await api('GET', `/products/${vigente.id}`)).data.producto;
  assert.equal(pg.precio_final, 80); assert.equal(pg.en_oferta, true);
  const ofertas = (await api('GET', '/products?ofertas=1&limit=100')).data.productos.map((p) => p.id);
  assert.ok(ofertas.includes(vigente.id) && !ofertas.includes(vencida.id));
  // el checkout cobra el precio vigente
  const s = await api('POST', '/sales', { items: [{ id: vencida.id, cantidad: 1 }, { id: vigente.id, cantidad: 1 }], ...CARD, direccion_envio_id: addr.id }, cli);
  assert.equal(s.data.venta.subtotal, 180);
});

test('RF-32: envío según la zona de la dirección', async () => {
  const { shippingZone, shippingCost } = await import('../src/lib/shipping.js');
  assert.equal(shippingZone({ provincia: 'Lima', departamento: 'Lima' }).id, 'lima');
  assert.equal(shippingZone({ provincia: 'Callao' }).id, 'callao');
  assert.equal(shippingZone({ provincia: 'Huaral', departamento: 'Lima' }).id, 'lima-prov');
  assert.equal(shippingZone({ provincia: 'Trujillo', departamento: 'La Libertad' }).id, 'costa');
  assert.equal(shippingZone({ provincia: 'Cusco', departamento: 'Cusco' }).id, 'nacional');
  assert.ok(shippingCost(100, { provincia: 'Cusco', departamento: 'Cusco' }) > shippingCost(100, { provincia: 'Lima' }));
  assert.equal(shippingCost(600, { provincia: 'Cusco' }), 0); // envío gratis desde S/ 500
  const z = (await api('GET', '/shipping/zones')).data;
  assert.equal(z.zonas.length, 5);
});

test('RF-47 / RF-38: auditoría de acciones del admin y contador de notificaciones', async () => {
  const log = (await api('GET', '/admin/audit', null, admin)).data.registros;
  for (const accion of ['LOGIN_EMPRESA', 'CAMBIO_ESTADO_PEDIDO', 'PAGO_CONFIRMADO', 'AJUSTE_STOCK', 'USUARIO_CREADO', 'PRODUCTO_CREADO'])
    assert.ok(log.some((a) => a.accion === accion), `falta ${accion}`);
  const ajuste = log.find((a) => a.accion === 'AJUSTE_STOCK');
  assert.ok(ajuste.usuario_email === 'admin@novatech.com' && ajuste.createdAt && ajuste.despues.motivo);
  assert.equal((await api('GET', '/admin/audit', null, cli)).status, 403);
  const n = (await api('GET', '/notifications/unread-count', null, admin)).data.no_leidas;
  assert.ok(n > 0);
  await api('PUT', '/notifications/read-all', null, admin);
  assert.equal((await api('GET', '/notifications/unread-count', null, admin)).data.no_leidas, 0);
});

test('RF-26: el tema elegido se guarda en las preferencias de la cuenta', async () => {
  assert.equal((await api('GET', '/prefs', null, cli)).data.tema, 'clasico');
  assert.equal((await api('PUT', '/prefs', { tema: 'neon' }, cli)).status, 400);
  assert.equal((await api('PUT', '/prefs', { tema: 'oceano' }, cli)).data.tema, 'oceano');
  assert.equal((await api('GET', '/prefs', null, cli)).data.tema, 'oceano');
  assert.equal((await api('PUT', '/prefs', { comparador: ['a', 'b', 'c', 'd'] }, cli)).data.comparador.length, 3);
});

test('RF-34: pago con tarjeta, Yape / Plin o transferencia (sin datos sensibles de la tarjeta)', async () => {
  const base = { items: [{ id: laptop.id, cantidad: 1 }], direccion_envio_id: addr.id };
  assert.equal((await api('POST', '/sales', { ...base, metodo_pago: 'contraentrega' }, cli)).status, 400); // ya no existe
  assert.equal((await api('POST', '/sales', { ...base, metodo_pago: 'tarjeta' }, cli)).status, 400); // sin datos de tarjeta
  assert.equal((await api('POST', '/sales', { ...base, metodo_pago: 'tarjeta', tarjeta: { titular: 'Ana 123', ultimos4: '4242' } }, cli)).status, 400);
  const t = await api('POST', '/sales', { ...base, metodo_pago: 'tarjeta', tarjeta: { titular: 'Ana Pérez', ultimos4: '4242', marca: 'Visa', numero: '4242424242424242', cvv: '123' } }, cli);
  assert.equal(t.status, 201);
  assert.deepEqual(t.data.venta.pago_detalle, { titular: 'Ana Pérez', ultimos4: '4242', marca: 'Visa' }); // nunca el número completo ni el CVV
  assert.ok(!JSON.stringify(t.data.venta).includes('4242424242424242'));
  assert.equal((await api('POST', '/sales', { ...base, metodo_pago: 'yape', referencia_pago: '092738', telefono_pago: '812345678' }, cli)).status, 400); // no empieza con 9
  assert.equal((await api('POST', '/sales', { ...base, metodo_pago: 'yape', referencia_pago: '09273', telefono_pago: '987654321' }, cli)).status, 400); // 5 dígitos
  assert.equal((await api('POST', '/sales', { ...base, metodo_pago: 'yape', referencia_pago: 'AB2738', telefono_pago: '987654321' }, cli)).status, 400); // letras
  const y = await api('POST', '/sales', { ...base, metodo_pago: 'yape', referencia_pago: '092738', telefono_pago: '987654321' }, cli);
  assert.equal(y.status, 201); assert.equal(y.data.venta.pago_detalle.telefono, '987654321');
  assert.equal((await api('POST', '/sales', { ...base, metodo_pago: 'transferencia', referencia_pago: '009128' }, cli)).status, 400); // falta banco
  const tr = await api('POST', '/sales', { ...base, metodo_pago: 'transferencia', referencia_pago: '009128', banco: 'BCP' }, cli);
  assert.equal(tr.status, 201); assert.equal(tr.data.venta.pago_detalle.banco, 'BCP');
});
test('Nova: catálogo real, «de esos», guías y temas sin datos (sin IA)', async () => {
  delete process.env.OPENAI_API_KEY;
  const ask = (mensaje, contexto) => api('POST', '/nova/chat', { mensaje, contexto });
  const all = (await api('GET', '/products?limit=100')).data.productos;
  const r = await ask('laptops de menos de 4000 soles');
  assert.equal(r.status, 200);
  assert.equal(r.data.fuente, 'reglas');
  assert.ok(r.data.productos.length >= 1 && r.data.productos.every((p) => p.precio_final <= 4000));
  // precios y stock salen del catálogo, no inventados
  for (const p of r.data.productos) assert.equal(p.precio_final, all.find((x) => x.id === p.id).precio_final);
  const cheap = await ask('¿cuál de esos cuesta menos?', { ultimos: r.data.ultimos });
  const min = Math.min(...r.data.productos.map((p) => p.precio_final));
  assert.equal(cheap.data.productos[0].precio_final, min);
  assert.match((await ask('¿Cómo pago mi pedido?')).data.respuesta, /Yape/);
  assert.match((await ask('¿cuánto cuesta el envío?')).data.respuesta, /Lima Metropolitana/);
  assert.match((await ask('¿aceptan devoluciones?')).data.respuesta, /No tengo ese dato/);
  assert.equal((await ask('x'.repeat(1001))).status, 400);
  assert.equal((await ask('')).status, 400);
});

test('Nova con IA: valida lo que devuelve, oculta datos personales y cae a reglas si falla', async () => {
  process.env.OPENAI_API_KEY = 'sk-test';
  const realFetch = globalThis.fetch;
  let sent = null;
  try {
    // 1) La IA inventa una marca que no existe → se descarta y no se inventan productos.
    globalThis.fetch = async (url, opt) => { sent = JSON.parse(opt.body); return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ intencion: 'buscar', marca: 'MarcaFalsa', categoria: 'Laptops', palabras: '', orden: 'precio_asc' }) } }] }) }; };
    const r = await api('POST', '/nova/chat', { mensaje: 'laptop barata, mi correo es ana@test.com y mi dni 12345678' });
    assert.equal(r.data.fuente, 'ia');
    assert.ok(r.data.productos.every((p) => p.categoria === 'Laptops'));
    const userMsg = sent.messages.at(-1).content;
    assert.ok(!userMsg.includes('ana@test.com') && !userMsg.includes('12345678'), 'datos personales ocultos');
    // 2) Concepto: la explicación nunca incluye precios.
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ intencion: 'concepto', explicacion: 'Un SSD guarda datos en memoria flash y es más rápido que un disco duro. Cuesta unos 200 soles.' }) } }] }) });
    const c = await api('POST', '/nova/chat', { mensaje: '¿qué es un SSD?' });
    assert.match(c.data.respuesta, /memoria flash/); assert.ok(!/soles/.test(c.data.respuesta));
    // 3) OpenAI falla → reglas propias.
    globalThis.fetch = async () => { throw new Error('caído'); };
    const f = await api('POST', '/nova/chat', { mensaje: 'monitores' });
    assert.equal(f.status, 200); assert.equal(f.data.fuente, 'reglas');
  } finally { globalThis.fetch = realFetch; delete process.env.OPENAI_API_KEY; }
});
test('Nova: preguntas sobre ofertas (regresión: offerActive usado en .filter)', async () => {
  delete process.env.OPENAI_API_KEY;
  const r = await api('POST', '/nova/chat', { mensaje: '¿Qué productos están en oferta?' });
  assert.equal(r.status, 200);
  assert.ok(r.data.productos.length >= 1 && r.data.productos.every((p) => p.en_oferta));
  const prev = await api('POST', '/nova/chat', { mensaje: '¿cuál de esos está en oferta?', contexto: { ultimos: r.data.ultimos } });
  assert.equal(prev.status, 200);
  assert.ok(prev.data.productos.every((p) => p.en_oferta));
  assert.equal((await api('POST', '/nova/chat', { mensaje: 'laptops en oferta de menos de 5000 soles' })).status, 200);
});
test('Nova: «agregar al carrito» por nombre, cantidad, «este», «el primero» y ambigüedad', async () => {
  delete process.env.OPENAI_API_KEY;
  const ask = (mensaje, contexto) => api('POST', '/nova/chat', { mensaje, contexto });
  const all = (await api('GET', '/products?limit=100')).data.productos.filter((p) => p.stock > 0);
  const p = all[0];
  // por nombre exacto (con comillas, como lo escribe el cliente)
  const r = await ask(`Agregar al carrito "${p.nombre}"`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.carrito, { id: p.id, cantidad: 1 });
  assert.match(r.data.respuesta, /Agregué 1 ×/);
  // con cantidad en palabras
  assert.equal((await ask(`agrega dos ${p.nombre} al carrito`)).data.carrito.cantidad, Math.min(2, p.stock));
  // «agrégalo» en la ficha del producto
  assert.equal((await ask('agrégalo al carrito', { producto_id: p.id })).data.carrito.id, p.id);
  // «agrega el segundo» después de una búsqueda
  const busq = await ask('laptops');
  if (busq.data.ultimos.length > 1) assert.equal((await ask('agrega el segundo', { ultimos: busq.data.ultimos })).data.carrito.id, busq.data.ultimos[1]);
  // ambiguo → pregunta cuál, sin agregar nada
  const amb = await ask('agrega al carrito laptop');
  if (!amb.data.carrito) { assert.ok(amb.data.productos.length > 1); assert.ok(amb.data.acciones.every((a) => a.accion === 'agregar')); }
  // no existe → lo dice, sin agregar
  const no = await ask('agrega al carrito televisor marciano 3000');
  assert.equal(no.data.carrito, undefined); assert.match(no.data.respuesta, /No encontré/);
  // preguntar cómo funciona el carrito NO agrega nada
  assert.equal((await ask('¿cómo funciona el carrito?')).data.carrito, undefined);
});
test('Cognito: ninguna contraseña en la base, registros pendientes y cuentas del panel', async () => {
  const db = await getDb(), idp = getIdp();
  // 1) registro pendiente: la cuenta existe en Cognito pero deshabilitada; al repetir el registro
  //    (pasado el minuto de espera) la anterior se borra y no quedan cuentas huérfanas
  const datos = { nombre: 'Rosa Diaz', email: 'rosa@test.com', password: 'ClaveRosa123', tipo_documento: 'DNI', numero_documento: '70707070' };
  assert.equal((await api('POST', '/auth/register', datos)).status, 202);
  const p1 = await db.get('otp', 'reg:rosa@test.com');
  assert.equal(p1.passHash, undefined);
  assert.deepEqual(await idp.findByEmail('rosa@test.com'), [{ id: p1.userId, enabled: false }]);
  await db.put('otp', { ...p1, sentAt: new Date(Date.now() - 120000).toISOString() });
  assert.equal((await api('POST', '/auth/register', datos)).status, 202);
  const p2 = await db.get('otp', 'reg:rosa@test.com');
  assert.notEqual(p2.userId, p1.userId);
  assert.deepEqual(await idp.findByEmail('rosa@test.com'), [{ id: p2.userId, enabled: false }]);
  // 2) cuenta creada desde el panel: entra con su contraseña, la cambia el admin y se borra de Cognito al eliminarla
  const admin2 = await login('admin@novatech.com', 'empresa');
  const nuevo = await api('POST', '/users', { nombre: 'Pedro Soto', email: 'pedro@test.com', password: 'ClavePedro1', rol: 'cliente', tipo_documento: 'DNI', numero_documento: '80808080' }, admin2);
  assert.equal(nuevo.status, 201);
  assert.equal(nuevo.data.usuario.cognito, undefined); // no se expone
  assert.equal((await api('POST', '/auth/login', { email: 'pedro@test.com', password: 'ClavePedro1' })).status, 200);
  assert.equal((await api('PUT', `/users/${nuevo.data.usuario.id}`, { password: 'ClavePedro2' }, admin2)).status, 200);
  assert.equal((await api('POST', '/auth/login', { email: 'pedro@test.com', password: 'ClavePedro1' })).status, 401);
  assert.equal((await api('POST', '/auth/login', { email: 'pedro@test.com', password: 'ClavePedro2' })).status, 200);
  assert.equal((await api('DELETE', `/users/${nuevo.data.usuario.id}`, null, admin2)).status, 200);
  assert.equal(idp.has(nuevo.data.usuario.id), false);
  // 3) ningún usuario guarda hash (salvo los marcadores de cuentas de Google)
  assert.ok((await db.list('user')).every((u) => !u.passHash || u.passHash === '!google'));
});

test('Nova sin IA: preguntas comunes de la tienda (regresión «¿qué monitores tiene?»)', async () => {
  const { interpretWithRules } = await import('../src/lib/nova/engine.js');
  const cat = { categorias: [{ nombre: 'Monitores' }, { nombre: 'Laptops' }], subcategorias: [], marcas: [{ nombre: 'LG' }, { nombre: 'Lenovo' }] };
  const ask = (q) => interpretWithRules(q, { ultimos: [] }, cat);
  // los verbos de la pregunta no son palabras de búsqueda
  assert.deepEqual([ask('¿Qué monitores tiene?').categoria, ask('¿Qué monitores tiene?').palabras], ['Monitores', '']);
  assert.equal(ask('¿venden laptops?').palabras, '');
  // errores de tipeo y marcas cortas como palabra completa («LG» no está dentro de «algo»)
  assert.equal(ask('monitres baratos').categoria, 'Monitores');
  assert.equal(ask('laptops lenvo').marca, 'Lenovo');
  assert.equal(ask('algo barato').marca, null);
  // catálogo y guías
  assert.equal(ask('¿Qué categorías tienen?').intencion, 'catalogo');
  assert.deepEqual([ask('¿Qué marcas de laptops tienen?').tipo, ask('¿Qué marcas de laptops tienen?').categoria], ['marcas', 'Laptops']);
  const tema = (q) => ask(q).tema;
  assert.equal(tema('¿es seguro comprar aquí?'), 'seguridad');
  assert.equal(tema('¿cómo cancelo mi pedido?'), 'cancelar');
  assert.equal(tema('¿los precios incluyen IGV?'), 'igv');
  assert.equal(tema('¿cómo cambio mi correo?'), 'perfil');
  assert.equal(tema('¿qué puedes hacer?'), 'ayuda');
  assert.equal(tema('¿cómo funciona para personas ciegas?'), 'accesibilidad');
  assert.equal(ask('laptop con tarjeta de video').intencion, 'buscar'); // no es la guía de pago
});

test('Nova: categorías y subcategorías nuevas sin tocar el código (sinónimos, vacías, nombres repetidos)', async () => {
  const { answer } = await import('../src/lib/nova/engine.js');
  const C = [['c1', 'Auriculares'], ['c2', 'Laptops'], ['c3', 'Accesorios'], ['c5', 'Celulares']].map(([id, nombre]) => ({ id, nombre, slug: nombre.toLowerCase(), activo: true }));
  const S = [['s1', 'c1', 'Inalambrico'], ['s3', 'c2', 'Gamer'], ['s4', 'c2', 'Oficina'], ['s5', 'c3', 'Camara Web'], ['s6', 'c3', 'Mouse'], ['s7', 'c3', 'Teclados'], ['s8', 'c3', 'Gamer']].map(([id, categoria_id, nombre]) => ({ id, categoria_id, nombre, activo: true }));
  const P = (id, nombre, categoria, subcategoria, marca) => ({ id, nombre, categoria, subcategoria, marca, precio: 100, stock: 3, activo: true, especificaciones: [] });
  const data = { category: C, subcategory: S, brand: [{ id: 'b1', nombre: 'Logitech', activo: true }],
    product: [P('p1', 'Audífonos Sony', 'Auriculares', 'Inalambrico', 'Sony'), P('p2', 'Laptop Lenovo LOQ', 'Laptops', 'Gamer', 'Lenovo'), P('p3', 'Laptop HP 250', 'Laptops', 'Oficina', 'HP'), P('p5', 'Teclado Logitech K380', 'Accesorios', 'Teclados', 'Logitech')] };
  const db = { list: async (e) => data[e] || [] };
  const ask = (m) => answer(db, { mensaje: m });
  assert.deepEqual((await ask('audífonos bluetooth')).productos.map((p) => p.id), ['p1']); // sinónimos en la pregunta y en el nombre
  assert.deepEqual((await ask('laptop para trabajo')).productos.map((p) => p.id), ['p3']);
  assert.match((await ask('¿tienen webcam?')).respuesta, /Todavía no tenemos productos en Camara Web/);
  assert.match((await ask('ratón inalámbrico')).respuesta, /Todavía no tenemos productos en Mouse/); // el producto se nombra primero
  assert.match((await ask('¿tienen celulares?')).respuesta, /Todavía no tenemos productos en Celulares/);
  assert.match((await ask('¿Qué tipos de accesorios tienen?')).respuesta, /Teclados \(1\).*Próximamente: Camara Web, Mouse, Gamer/);
  assert.match((await ask('¿qué categorías tienen?')).respuesta, /Próximamente: Celulares/);
  const tec = await ask('teclado logitech');
  assert.deepEqual(tec.productos.map((p) => p.id), ['p5']);
  assert.equal(tec.acciones[0].href, '/categoria/?c=accesorios&sub=s7&marca=b1'); // la página de la categoría con los filtros
  assert.equal((await ask('¿qué tipos de pago aceptan?')).respuesta.startsWith('Para pagar'), true);
});

test('Nova: pedidos del propio cliente, preguntas sin respuesta y características', async () => {
  // Cada pregunta con otra IP: el límite de 20 preguntas por minuto ya lo gastaron las pruebas anteriores.
  let ip = 0;
  const chat = async (mensaje, token, contexto) => { const r = await handleRequest({ method: 'POST', path: '/nova/chat', query: {}, headers: { 'x-client-ip': `10.0.0.${++ip}`, ...(token ? { authorization: `Bearer ${token}` } : {}) }, rawBody: JSON.stringify({ mensaje, contexto }) }); return { status: r.status, data: r.body }; };
  // 1) pedidos: sin sesión pide iniciar sesión; con sesión responde solo con los suyos
  const anon = await chat('¿Dónde está mi pedido?');
  assert.equal(anon.status, 200);
  assert.equal(anon.data.acciones[0].accion, 'iniciar-sesion');
  const cliTok = await login('cliente@novatech.com');
  const mine = (await api('GET', '/sales/mine', null, cliTok)).data.ventas;
  assert.ok(mine.length > 0);
  const r1 = await chat('¿Dónde está mi pedido?', cliTok);
  assert.match(r1.data.respuesta, new RegExp(`Tu último pedido ${mine[0].codigo}`));
  const r2 = await chat(`¿en qué estado está el pedido ${mine.at(-1).codigo}?`, cliTok);
  assert.match(r2.data.respuesta, new RegExp(mine.at(-1).codigo));
  assert.match((await chat('¿Ya confirmaron mi pago?', cliTok)).data.respuesta, /pago/);
  assert.match((await chat('¿Cuánto he gastado?', cliTok)).data.respuesta, /Llevas \d+ pedido/);
  // un código que no es suyo no se muestra (otro cliente)
  const ana = (await api('POST', '/auth/login', { email: 'ana.nueva@test.com', password: 'OtraClave123' })).data.token
    || (await api('POST', '/auth/login', { email: 'ana.nueva@test.com', password: 'NuevaClave123' })).data.token;
  if (ana) assert.match((await chat(`estado de mi pedido ${mine[0].codigo}`, ana)).data.respuesta, /No encontré el pedido|Todavía no tienes pedidos/);
  // «¿cómo pago mi pedido?» sigue siendo la guía de pago, no la lista de pedidos
  assert.match((await chat('¿Cómo pago mi pedido?', cliTok)).data.respuesta, /^Para pagar/);
  // 2) preguntas sin respuesta: se agrupan, se cuentan y no guardan datos personales
  await chat('¿Venden refrigeradoras?'); await chat('venden refrigeradoras');
  await chat('mi correo es pepe@mail.com y mi número 987654321, ¿tienen drones?');
  const adminTok = await login('admin@novatech.com', 'empresa');
  assert.equal((await api('GET', '/admin/nova/preguntas', null, cliTok)).status, 403);
  const qs = (await api('GET', '/admin/nova/preguntas', null, adminTok)).data.preguntas;
  const refri = qs.find((x) => /refrigeradoras/i.test(x.texto));
  assert.equal(refri.veces, 2);
  const dron = qs.find((x) => /drones/.test(x.texto));
  assert.ok(dron && !/pepe@mail\.com|987654321/.test(dron.texto) && /\[correo\]/.test(dron.texto) && /\[número\]/.test(dron.texto));
  assert.equal((await api('PATCH', `/admin/nova/preguntas/${refri.id}`, { resuelta: true }, adminTok)).status, 200);
  assert.equal((await api('GET', '/admin/nova/preguntas', null, adminTok)).data.preguntas.find((x) => x.id === refri.id).resuelta, true);
  assert.equal((await api('DELETE', `/admin/nova/preguntas/${dron.id}`, null, adminTok)).status, 200);
  // 3) características (funciones puras del motor)
  const { specValue, interpretWithRules } = await import('../src/lib/nova/engine.js');
  const S = (n, v) => ({ especificaciones: [{ nombre: n, valor: v }] });
  assert.equal(specValue(S('Memoria RAM', '16 GB DDR5'), 'ram').n, 16);
  assert.equal(specValue(S('Almacenamiento', '1 TB SSD'), 'almacenamiento').n, 1024);
  assert.ok(specValue(S('Procesador', 'AMD Ryzen 7 7735HS'), 'procesador').n > specValue(S('Procesador', 'Intel Core i5-1235U'), 'procesador').n);
  assert.ok(specValue(S('Gráficos', 'NVIDIA GeForce RTX 3050'), 'graficos').n > specValue(S('Gráficos', 'Intel Iris X Graphics'), 'graficos').n);
  assert.equal(specValue(S('Pantalla (Pulgadas)', '27'), 'pantalla').n, 27);
  assert.equal(specValue(S('Tasa de refresco', '144Hz Overclock'), 'refresco').n, 144);
  const cat = { categorias: [{ id: 'c1', nombre: 'Laptops' }], subcategorias: [], marcas: [] };
  const ask = (q, ctx = {}) => interpretWithRules(q, { ultimos: [], ...ctx }, cat);
  assert.deepEqual([ask('¿Qué laptop tiene más RAM?').intencion, ask('¿Qué laptop tiene más RAM?').spec], ['spec', 'ram']);
  assert.equal(ask('la laptop con menos batería').dir, 'min');
  assert.deepEqual(ask('laptop con 16 GB de RAM').spec_min, { key: 'ram', n: 16 });
  assert.equal(ask('laptops hasta 512 GB').precio_max, null); // 512 GB no es un precio
  assert.equal(ask('laptops hasta 2000 soles').precio_max, 2000);
  assert.equal(ask('¿cuánta RAM tiene?', { producto_id: 'x' }).intencion, 'producto_actual');
  assert.equal(ask('¿cuál de esos tiene mejor procesador?', { ultimos: ['a', 'b'] }).usa_previos, true);
});
