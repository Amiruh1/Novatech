// Prueba de humo del backend contra la base real con el esquema nuevo. No envía correos y no deja datos:
// lo único que escribe es una marca temporal «ZZ Prueba» (la crea, edita y borra) y un +1 / -1 de stock.
//   node --env-file=.env scripts/probar-esquema.js
import { MongoClient } from 'mongodb';
import { handleRequest } from '../src/app.js';
import { getDb } from '../src/lib/db/index.js';
import { signToken } from '../src/lib/auth.js';

const db = await getDb();
let fallos = 0;
const check = (nombre, ok, extra = '') => { if (!ok) fallos++; console.log(`${ok ? 'OK   ' : 'FALLA'} ${nombre}${extra ? ' — ' + extra : ''}`); };
const call = (method, path, token, body) => handleRequest({ method, path: path.split('?')[0], query: Object.fromEntries(new URLSearchParams(path.split('?')[1] || '')), headers: token ? { authorization: `Bearer ${token}` } : {}, rawBody: body ? JSON.stringify(body) : undefined });

const users = await db.list('user');
const admin = users.find((u) => u.rol === 'admin');
const cliente = users.find((u) => u.rol === 'cliente') || admin;
check('usuarios legibles (id en texto, activo, tipo_documento desde datos maestros)', users.length > 0 && users.every((u) => /^[0-9a-f]{24}$/.test(u.id) && typeof u.activo === 'boolean' && ['DNI', 'RUC', 'CE', 'PASAPORTE'].includes(u.tipo_documento) && (u.passHash || u.cognito) && u.email), `${users.length} usuarios`);
check('buscar usuario por correo', (await db.listBy('user', 'email', admin.email)).length === 1);

const tAdmin = signToken({ sub: admin.id, rol: 'admin', elev: true });
const tCli = signToken({ sub: cliente.id, rol: cliente.rol });
for (const [n, r] of [
  ['GET /products', await call('GET', '/products?limit=50')],
  ['GET /catalog', await call('GET', '/catalog')],
  ['GET /banners', await call('GET', '/banners')],
  ['GET /auth/me (cliente)', await call('GET', '/auth/me', tCli)],
  ['GET /addresses (cliente)', await call('GET', '/addresses', tCli)],
  ['GET /sales/mine (cliente)', await call('GET', '/sales/mine', tCli)],
  ['GET /prefs (cliente)', await call('GET', '/prefs', tCli)],
  ['GET /admin/sales', await call('GET', '/admin/sales', tAdmin)],
  ['GET /admin/dashboard', await call('GET', '/admin/dashboard', tAdmin)],
  ['GET /admin/audit', await call('GET', '/admin/audit', tAdmin)],
  ['GET /admin/products', await call('GET', '/admin/products', tAdmin)],
  ['GET /users', await call('GET', '/users', tAdmin)],
  ['GET /notifications', await call('GET', '/notifications', tAdmin)],
]) {
  const b = r.body || {};
  const tam = Object.values(b).find(Array.isArray)?.length;
  check(n, r.status === 200, `status ${r.status}${tam !== undefined ? `, ${tam} elementos` : ''}${r.status !== 200 ? ' ' + JSON.stringify(b) : ''}`);
}
const prods = (await call('GET', '/products?limit=50')).body.productos;
const ventas = (await call('GET', '/admin/sales', tAdmin)).body;
const venta = (ventas.ventas || ventas.items || [])[0];
if (venta) {
  check('venta: estado del pedido en texto y producto de cada ítem existe', typeof venta.estado === 'string' && (venta.items || []).every((i) => /^[0-9a-f]{24}$/.test(i.producto_id)), `estado «${venta.estado}»`);
  check('GET /sales/:id', (await call('GET', `/sales/${venta.id}`, tAdmin)).status === 200);
}
const det = await call('GET', `/products/${prods[0].id}`);
check('GET /products/:id', det.status === 200 && det.body.producto?.categoria_id?.length === 24);

// Escritura (como administrador, con auditoría): marca temporal
const crea = await call('POST', '/brands', tAdmin, { nombre: 'ZZ Prueba', orden: 99, activo: true });
const marca = crea.body && Object.values(crea.body).find((x) => x && x.id);
check('crear marca temporal', (crea.status === 200 || crea.status === 201) && !!marca, `status ${crea.status} ${crea.status > 201 ? JSON.stringify(crea.body) : ''}`);
if (marca) {
  const edit = await call('PUT', `/brands/${marca.id}`, tAdmin, { nombre: 'ZZ Prueba', orden: 98, activo: false });
  check('editar (desactivar) marca', edit.status === 200, `status ${edit.status}`);
  // Cómo quedó guardada de verdad
  const cli = new MongoClient(process.env.MONGODB_URI); await cli.connect();
  const raw = await cli.db(process.env.MONGODB_DB).collection('marcas').findOne({ nombre: 'ZZ Prueba' });
  check('guardada con ObjectId, estado 0, fechas Date y auditoría del administrador',
    raw && raw._id?._bsontype === 'ObjectId' && raw.estado === 0 && raw.fecha_hora_creacion instanceof Date && raw.fecha_hora_modificacion instanceof Date
    && String(raw.id_usuario_creacion) === admin.id && raw.nombre_usuario_creacion === admin.nombre && String(raw.id_usuario_modificacion) === admin.id && !('activo' in raw) && !('deleted' in raw) && !('createdAt' in raw),
    raw ? `campos: ${Object.keys(raw).join(', ')}` : 'no encontrada');
  const del = await call('DELETE', `/brands/${marca.id}`, tAdmin);
  check('borrar marca temporal', del.status === 200, `status ${del.status}`);
  // Los tres registros de auditoría de esta prueba tampoco se dejan.
  await cli.db(process.env.MONGODB_DB).collection('auditoria').deleteMany({ descripcion: /ZZ Prueba/ });
  await cli.close();
}
// Stock atómico: +1 y -1 (queda igual)
const p0 = await db.get('product', prods[0].id);
const mas = await db.incr('product', p0.id, 'stock', 1);
const menos = await db.incr('product', p0.id, 'stock', -1);
check('incremento atómico de stock (+1, -1)', mas.stock === p0.stock + 1 && menos.stock === p0.stock);

console.log(fallos ? `\n${fallos} comprobaciones fallaron.` : '\nTodo correcto.');
await db.close();
process.exit(fallos ? 1 : 0);
