const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { bootstrapProduction } = require('../dist/src/scripts/bootstrap-production');

const name = `novatech-bootstrap-test-${randomBytes(4).toString('hex')}`;
const dbPassword = randomBytes(24).toString('hex');
let pool;
let started = false;
let api;
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  try {
    docker('run', '-d', '--name', name, '-p', '127.0.0.1::3306',
      '-e', `MYSQL_ROOT_PASSWORD=${dbPassword}`, '-e', 'MYSQL_ROOT_HOST=%', '-e', 'MYSQL_DATABASE=novatech_bootstrap_test', 'mysql:8.4');
    started = true;
    const port = Number(docker('port', name, '3306/tcp').split(':').pop());
    pool = mysql.createPool({ host: '127.0.0.1', port, user: 'root', password: dbPassword,
      database: 'novatech_bootstrap_test', connectTimeout: 1000 });
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try { await pool.query('SELECT 1'); ready = true; break; } catch { await pause(1000); }
    }
    assert.ok(ready, 'MySQL de prueba no inició');
    const schema = readFileSync(path.join(__dirname, '../sql/novatech_erp_full.sql'), 'utf8');
    execFileSync('docker', ['exec', '-i', '-e', `MYSQL_PWD=${dbPassword}`, name, 'mysql', '-uroot'], {
      input: schema.replaceAll('novatech_db', 'novatech_bootstrap_test'),
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    });
    const config = { NODE_ENV: 'production', BOOTSTRAP_ADMIN_EMAIL: 'owner@example.test',
      BOOTSTRAP_ADMIN_PASSWORD: randomBytes(24).toString('hex') };

    const first = await bootstrapProduction(pool, config);
    assert.deepEqual(first, { disabledDemoAccounts: 2, adminCreated: true });
    const [categories] = await pool.query('SELECT id, imagen FROM categorias');
    const [banners] = await pool.query('SELECT id, imagen FROM banners');
    assert.ok(categories.length > 0); assert.equal(banners.length, 2);
    const [users] = await pool.query('SELECT email, password, rol, activo FROM usuarios ORDER BY id');
    assert.equal(users[0].activo, 0); assert.equal(users[1].activo, 0);
    assert.equal(users[2].rol, 'admin'); assert.equal(users[2].activo, 1);
    assert.ok(await bcrypt.compare(config.BOOTSTRAP_ADMIN_PASSWORD, users[2].password));
    console.log('OK: desactiva cuentas demo y crea administrador con hash.');

    const repeated = await bootstrapProduction(pool, { ...config, BOOTSTRAP_ADMIN_PASSWORD: randomBytes(24).toString('hex') });
    assert.deepEqual(repeated, { disabledDemoAccounts: 0, adminCreated: false });
    const [owner] = await pool.query('SELECT password FROM usuarios WHERE email = ?', [config.BOOTSTRAP_ADMIN_EMAIL]);
    assert.equal(owner[0].password, users[2].password);
    const [repeatedBanners] = await pool.query('SELECT id, imagen FROM banners');
    assert.deepEqual(repeatedBanners, banners);
    console.log('OK: repetir el despliegue no sobrescribe la contraseña del administrador.');

    const changedHash = await bcrypt.hash(randomBytes(24).toString('hex'), 4);
    await pool.query('UPDATE usuarios SET password = ?, activo = 1 WHERE email = ?', [changedHash, 'admin@novatech.com']);
    await bootstrapProduction(pool, config);
    const [changed] = await pool.query('SELECT password, activo FROM usuarios WHERE email = ?', ['admin@novatech.com']);
    assert.equal(changed[0].activo, 1); assert.equal(changed[0].password, changedHash);
    console.log('OK: respeta cuentas demo cuya contraseña ya se cambió.');

    await pool.query("INSERT INTO usuarios (nombre,email,password,rol,activo) VALUES ('Cliente','existing@example.test',?,'cliente',1)", [changedHash]);
    await assert.rejects(bootstrapProduction(pool, { ...config, BOOTSTRAP_ADMIN_EMAIL: 'existing@example.test' }), /no es un administrador activo/);
    const [existing] = await pool.query('SELECT rol, activo, password FROM usuarios WHERE email = ?', ['existing@example.test']);
    assert.equal(existing[0].rol, 'cliente'); assert.equal(existing[0].activo, 1); assert.equal(existing[0].password, changedHash);
    console.log('OK: rechaza conflicto de correo sin elevar permisos ni cambiar datos.');
    await assert.rejects(bootstrapProduction(pool, { ...config, NODE_ENV: 'development' }), /NODE_ENV/);
    await assert.rejects(bootstrapProduction(pool, { ...config, BOOTSTRAP_ADMIN_PASSWORD: 'corta' }), /20 caracteres/);
    await assert.rejects(bootstrapProduction(pool, { ...config, BOOTSTRAP_ADMIN_PASSWORD: 'é'.repeat(40) }), /72 bytes/);
    console.log('OK: rechaza entorno incorrecto y claves inválidas.');

    api = spawn(process.execPath, [path.join(__dirname, '../dist/index.js')], {
      cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'production', PORT: '0',
        DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_USER: 'root', DB_PASSWORD: dbPassword,
        DB_NAME: 'novatech_bootstrap_test', DB_SSL: '', JWT_SECRET: randomBytes(32).toString('hex'),
        TRUST_PROXY: '0', CORS_ORIGINS: 'http://localhost:4200' },
    });
    const apiPort = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('API de prueba no inició')), 15000);
      api.on('exit', () => { clearTimeout(timeout); reject(new Error('API de prueba terminó')); });
      api.stdout.on('data', chunk => {
        const match = chunk.toString().match(/http:\/\/localhost:(\d+)/);
        if (match) { clearTimeout(timeout); resolve(Number(match[1])); }
      });
      api.stderr.resume();
    });
    for (const endpoint of ['/ready', '/api/productos', '/api/catalogos/categorias', '/api/categorias', '/api/banners']) {
      const response = await fetch(`http://127.0.0.1:${apiPort}${endpoint}`);
      assert.equal(response.status, 200, `${endpoint} debe funcionar tras bootstrap`);
      assert.ok(await response.json());
    }
    console.log('OK: MySQL 8.4 con SQL completo, bootstrap, /ready, catálogo, categorías y banners.');

    await require('./test-media-migration.cjs').testMigrationDatabase(pool);
  } finally {
    if (api) { const exited = new Promise(resolve => api.once('exit', resolve)); api.kill(); await exited; }
    if (pool) await pool.end();
    if (started) docker('rm', '-f', '-v', name);
  }
}

main().catch((error) => {
  console.error(error instanceof assert.AssertionError ? error.message : 'Falló la prueba de integración del bootstrap.');
  process.exitCode = 1;
});
