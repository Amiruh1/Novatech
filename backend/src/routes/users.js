import { route, requireAdmin } from '../lib/router.js';
import { ok, bad, notFound, conflict } from '../lib/http.js';
import * as v from '../lib/validate.js';
import { getIdp } from '../lib/idp.js';
import { newId } from '../lib/id.js';
import { audit } from '../lib/audit.js';
import { findByDocument, setUserPassword } from './auth.js';

const ROLES = ['admin', 'cliente'];
const adminsLeft = async (db, exceptId) => (await db.list('user')).filter((u) => u.rol === 'admin' && u.activo !== false && u.id !== exceptId).length;

route('GET', '/users', requireAdmin, async ({ db }) =>
  ok({ usuarios: (await db.list('user')).map(v.publicUser).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }));

route('POST', '/users', requireAdmin, async ({ db, body, user }) => {
  const email = v.email(body.email);
  if ((await db.listBy('user', 'email', email)).length) throw conflict('Ya existe un usuario con ese correo.');
  const rol = ROLES.includes(body.rol) ? body.rol : 'cliente';
  const doc = v.documento(body.tipo_documento, body.numero_documento);
  if (await findByDocument(db, doc.tipo_documento, doc.numero_documento)) throw conflict('Ya existe un usuario con ese documento.');
  const nombre = v.nombre(body.nombre), telefono = v.telefono(body.telefono), password = v.password(body.password);
  // La contraseña va a Cognito; la base solo guarda los datos de la cuenta.
  const id = newId();
  await getIdp().create(id, email, password);
  let u;
  try {
    u = await db.put('user', { id, nombre, email, cognito: true, rol, ...doc, telefono, avatar_url: null, activo: true });
  } catch (e) { await getIdp().remove(id); throw e; }
  await audit(db, user, 'USUARIO_CREADO', `Creó la cuenta ${u.email} con rol ${rol}`, { entidad: 'user', entidad_id: u.id, despues: { rol } });
  return ok({ usuario: v.publicUser(u) }, 201);
});

route('PUT', '/users/:id', requireAdmin, async ({ db, body, params, user }) => {
  const cur = await db.get('user', params.id);
  if (!cur) throw notFound('Usuario no encontrado.');
  let upd = { ...cur };
  if (body.nombre !== undefined) upd.nombre = v.nombre(body.nombre);
  if (body.email !== undefined && v.email(body.email) !== cur.email) {
    const email = v.email(body.email);
    if ((await db.listBy('user', 'email', email)).length) throw conflict('Ya existe un usuario con ese correo.');
    upd.email = email;
  }
  if (body.rol !== undefined) {
    if (!ROLES.includes(body.rol)) throw bad('Rol inválido.');
    if (cur.rol === 'admin' && body.rol !== 'admin' && !(await adminsLeft(db, cur.id))) throw bad('Debe quedar al menos un administrador activo.');
    upd.rol = body.rol;
  }
  if (body.telefono !== undefined) upd.telefono = v.telefono(body.telefono);
  if (body.tipo_documento !== undefined || body.numero_documento !== undefined)
    Object.assign(upd, v.documento(body.tipo_documento ?? cur.tipo_documento, body.numero_documento ?? cur.numero_documento));
  if (body.password) upd = await setUserPassword(upd, v.password(body.password));
  const saved = await db.put('user', upd);
  if (saved.cognito && saved.email !== cur.email) await getIdp().setEmail(saved.id, saved.email).catch((e) => console.error('[cognito:email]', e.message));
  await audit(db, user, 'USUARIO_EDITADO', `Editó la cuenta ${saved.email}${cur.rol !== saved.rol ? ` (rol ${cur.rol} → ${saved.rol})` : ''}${body.password ? ' y cambió su contraseña' : ''}`,
    { entidad: 'user', entidad_id: saved.id, antes: { rol: cur.rol, email: cur.email }, despues: { rol: saved.rol, email: saved.email } });
  return ok({ usuario: v.publicUser(saved) });
});

route('PATCH', '/users/:id/active', requireAdmin, async ({ db, body, params, user }) => {
  const cur = await db.get('user', params.id);
  if (!cur) throw notFound('Usuario no encontrado.');
  const activo = !!body.activo;
  if (!activo && cur.id === user.id) throw bad('No puedes desactivar tu propia cuenta.');
  if (!activo && cur.rol === 'admin' && !(await adminsLeft(db, cur.id))) throw bad('Debe quedar al menos un administrador activo.');
  const saved = await db.put('user', { ...cur, activo });
  await audit(db, user, activo ? 'USUARIO_ACTIVADO' : 'USUARIO_BLOQUEADO', ` la cuenta ${cur.email}`, { entidad: 'user', entidad_id: cur.id, antes: { activo: cur.activo !== false }, despues: { activo } });
  return ok({ usuario: v.publicUser(saved) });
});

route('DELETE', '/users/:id', requireAdmin, async ({ db, params, user }) => {
  const cur = await db.get('user', params.id);
  if (!cur) throw notFound('Usuario no encontrado.');
  if (cur.id === user.id) throw bad('No puedes eliminar tu propia cuenta.');
  if (cur.rol === 'admin' && !(await adminsLeft(db, cur.id))) throw bad('Debe quedar al menos un administrador activo.');
  const sales = await db.listBy('sale', 'id_usuario', cur.id);
  if (sales.length) throw conflict('El usuario tiene compras registradas: desactívalo en lugar de eliminarlo.');
  await db.remove('user', cur.id);
  for (const a of await db.listBy('address', 'usuario_id', cur.id)) await db.remove('address', a.id);
  await db.remove('prefs', cur.id);
  if (cur.cognito) await getIdp().remove(cur.id).catch((e) => console.error('[cognito:remove]', e.message));
  await audit(db, user, 'USUARIO_ELIMINADO', `Eliminó la cuenta ${cur.email}`, { entidad: 'user', entidad_id: cur.id, antes: { rol: cur.rol } });
  return ok({ ok: true });
});
