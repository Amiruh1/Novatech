import { route, requireAuth, requireAdmin } from '../lib/router.js';
import { ok, bad, notFound } from '../lib/http.js';
import * as v from '../lib/validate.js';

// ---- Direcciones ----
// Alias, distrito, provincia y departamento: solo letras (con tildes), espacios, guion y apóstrofo; máximo 120 caracteres.
const WORDS = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]+$/;
const words = (val, label) => {
  const s = String(val ?? '').trim();
  if (!s) return null;
  if (s.length > 120) throw bad(`${label}: máximo 120 caracteres.`);
  if (!WORDS.test(s)) throw bad(`${label}: solo se permiten letras.`);
  return s;
};
// Teléfono de contacto de la dirección: opcional, exactamente 9 dígitos.
const phone9 = (val) => {
  const t = String(val ?? '').replace(/[\s-]/g, '');
  if (!t) return null;
  if (!/^\d{9}$/.test(t)) throw bad('El teléfono de contacto debe tener exactamente 9 dígitos.');
  return t;
};
const addrBuild = (b) => {
  const destinatario = v.str(b.destinatario, 120), linea1 = v.str(b.direccion_linea1, 220);
  if (destinatario.length < 3) throw bad('Indica el destinatario.');
  if (linea1.length < 5) throw bad('Indica la dirección.');
  const distrito = words(b.distrito, 'Distrito'), provincia = words(b.provincia, 'Provincia');
  if (!distrito) throw bad('Indica el distrito.');
  if (!provincia) throw bad('Indica la provincia.');
  // HU-008 CA-1: el código postal es obligatorio (Perú: 5 dígitos).
  const cp = v.str(b.codigo_postal, 20).replace(/\s/g, '');
  if (!/^\d{5}$/.test(cp)) throw bad('El código postal debe tener 5 dígitos.');
  return {
    alias: words(b.alias, 'Alias'), destinatario, telefono_contacto: phone9(b.telefono_contacto),
    direccion_linea1: linea1, direccion_linea2: v.str(b.direccion_linea2, 220) || null,
    distrito, provincia, departamento: words(b.departamento, 'Departamento'),
    pais: v.str(b.pais, 60) || 'PE', codigo_postal: cp, referencia: v.str(b.referencia, 220) || null,
    predeterminada: !!b.predeterminada,
  };
};
async function unsetDefaults(db, userId, exceptId) {
  for (const a of await db.listBy('address', 'usuario_id', userId))
    if (a.predeterminada && a.id !== exceptId) await db.put('address', { ...a, predeterminada: false });
}
route('GET', '/addresses', requireAuth, async ({ db, user }) =>
  ok({ direcciones: (await db.listBy('address', 'usuario_id', user.id)).sort((a, b) => Number(b.predeterminada) - Number(a.predeterminada)) }));
route('POST', '/addresses', requireAuth, async ({ db, user, body }) => {
  const existing = await db.listBy('address', 'usuario_id', user.id);
  if (existing.length >= 10) throw bad('Máximo 10 direcciones.');
  const data = addrBuild(body);
  if (!existing.length) data.predeterminada = true;
  const a = await db.put('address', { ...data, usuario_id: user.id });
  if (a.predeterminada) await unsetDefaults(db, user.id, a.id);
  return ok({ direccion: a }, 201);
});
route('PUT', '/addresses/:id', requireAuth, async ({ db, user, body, params }) => {
  const cur = await db.get('address', params.id);
  if (!cur || cur.usuario_id !== user.id) throw notFound('Dirección no encontrada.');
  const a = await db.put('address', { ...cur, ...addrBuild({ ...cur, ...body }) });
  if (a.predeterminada) await unsetDefaults(db, user.id, a.id);
  return ok({ direccion: a });
});
route('DELETE', '/addresses/:id', requireAuth, async ({ db, user, params }) => {
  const cur = await db.get('address', params.id);
  if (!cur || cur.usuario_id !== user.id) throw notFound('Dirección no encontrada.');
  await db.remove('address', cur.id);
  return ok({ ok: true });
});

// ---- Preferencias: favoritos, comparador y carrito sincronizados entre dispositivos ----
const ids = (a, max) => (Array.isArray(a) ? [...new Set(a.map(String))].slice(0, max) : []);
// tema: apariencia elegida por el usuario (RF-26 / HU-011): 'clasico', 'oceano' o 'atardecer'.
const TEMAS = ['clasico', 'oceano', 'atardecer'];
route('GET', '/prefs', requireAuth, async ({ db, user }) => {
  const p = (await db.get('prefs', user.id)) || { favoritos: [], comparador: [], carrito: [] };
  return ok({ favoritos: p.favoritos || [], comparador: p.comparador || [], carrito: p.carrito || [], tema: p.tema || 'clasico' });
});
route('PUT', '/prefs', requireAuth, async ({ db, user, body }) => {
  const cur = (await db.get('prefs', user.id)) || { id: user.id, favoritos: [], comparador: [], carrito: [] };
  const next = { ...cur, id: user.id };
  if (body.favoritos !== undefined) next.favoritos = ids(body.favoritos, 200);
  if (body.comparador !== undefined) next.comparador = ids(body.comparador, 3); // HU-010: 2 o 3 productos
  if (body.tema !== undefined) {
    if (!TEMAS.includes(body.tema)) throw bad('Tema inválido.');
    next.tema = body.tema;
  }
  if (body.carrito !== undefined)
    next.carrito = (Array.isArray(body.carrito) ? body.carrito : []).slice(0, 50)
      .map((i) => ({ id: String(i.id), cantidad: Math.min(Math.max(parseInt(i.cantidad) || 1, 1), 99) }));
  const saved = await db.put('prefs', next);
  return ok({ favoritos: saved.favoritos, comparador: saved.comparador, carrito: saved.carrito, tema: saved.tema || 'clasico' });
});

// ---- Notificaciones del panel (ventas, stock, sistema) ----
route('GET', '/notifications', requireAdmin, async ({ db }) =>
  ok({ notificaciones: (await db.list('notification')).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200) }));
// RF-38: contador de no leídas para la barra del panel.
route('GET', '/notifications/unread-count', requireAdmin, async ({ db }) =>
  ok({ no_leidas: (await db.list('notification')).filter((n) => !n.leido).length }));

// RF-47: registro de auditoría (más reciente primero). Filtros: accion, usuario (nombre/correo), desde, hasta (AAAA-MM-DD).
route('GET', '/admin/audit', requireAdmin, async ({ db, query }) => {
  let list = await db.list('audit');
  if (query.accion) list = list.filter((a) => a.accion === query.accion);
  if (query.usuario) { const q = String(query.usuario).toLowerCase(); list = list.filter((a) => `${a.usuario_nombre} ${a.usuario_email}`.toLowerCase().includes(q)); }
  if (query.desde) list = list.filter((a) => a.createdAt >= String(query.desde));
  if (query.hasta) list = list.filter((a) => a.createdAt.slice(0, 10) <= String(query.hasta));
  return ok({ registros: list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 500) });
});
route('PUT', '/notifications/read-all', requireAdmin, async ({ db }) => {
  for (const n of await db.list('notification')) if (!n.leido) await db.put('notification', { ...n, leido: true });
  return ok({ ok: true });
});
route('PUT', '/notifications/:id/read', requireAdmin, async ({ db, params }) => {
  const n = await db.get('notification', params.id);
  if (!n) throw notFound();
  return ok({ notificacion: await db.put('notification', { ...n, leido: true }) });
});
