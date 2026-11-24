// POST /nova/chat — asistente Nova. No requiere sesión, no guarda la conversación y no modifica datos
// (no compra, no vacía el carrito). Límite: 1000 caracteres por pregunta y 20 preguntas por minuto por equipo.
// Con sesión iniciada, Nova puede responder sobre los pedidos de ESA persona (nunca de otra).
// Las preguntas que no supo responder se guardan, sin datos personales, para que el equipo vea qué falta.
import { route, optionalAuth, requireAdmin } from '../lib/router.js';
import { ok, bad, notFound, HttpError } from '../lib/http.js';
import { answer, plain } from '../lib/nova/engine.js';
import { aiEnabled } from '../lib/nova/ai.js';
import { sha256 } from '../lib/auth.js';

// Límite por equipo también aquí (además del de server.js), para que aplique en cualquier despliegue.
const hits = new Map();
function rateLimit(key) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < 60_000);
  if (list.length >= 20) throw new HttpError(429, 'Hiciste muchas preguntas seguidas. Espera un minuto, por favor.');
  list.push(now); hits.set(key, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < 60_000)) hits.delete(k);
}

// ---- Preguntas sin respuesta ----
// Se ocultan correos, teléfonos, documentos y códigos (cualquier número de 6+ cifras) y no se guarda quién preguntó.
// Las preguntas iguales (sin tildes, mayúsculas ni signos) se agrupan y se cuentan.
export const MOTIVOS = { no_entendido: 'No la entendió', sin_resultados: 'Sin resultados', categoria_vacia: 'Categoría sin productos', no_encontrado: 'Producto no encontrado', sin_dato: 'Sin ese dato' };
export const maskPersonal = (s) => String(s).replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[correo]').replace(/\+?\d[\d\s-]{5,}\d/g, '[número]').slice(0, 300);
export async function logUnanswered(db, mensaje, motivo) {
  const texto = maskPersonal(mensaje.trim());
  const normalizado = plain(texto).replace(/[^a-z0-9ñ[\] ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (normalizado.length < 2) return;
  const id = `q-${sha256(normalizado).slice(0, 24)}`;
  const prev = await db.get('novaq', id);
  await db.put('novaq', {
    ...(prev || { id, texto, normalizado, veces: 0 }),
    veces: (prev?.veces || 0) + 1, ultima_vez: new Date().toISOString(),
    motivo: MOTIVOS[motivo] ? motivo : 'no_entendido', resuelta: false, // si vuelve a preguntarse, se reabre
  });
}

route('GET', '/nova/status', async () => ok({ ia: aiEnabled() }));

route('POST', '/nova/chat', optionalAuth, async ({ db, body, headers, user }) => {
  const mensaje = String(body.mensaje ?? '').trim();
  if (!mensaje) throw bad('Escribe una pregunta.');
  if (mensaje.length > 1000) throw bad('La pregunta puede tener hasta 1000 caracteres.');
  rateLimit(String(headers['x-client-ip'] || headers['x-forwarded-for'] || 'local').split(',')[0].trim());
  const historial = (Array.isArray(body.historial) ? body.historial : []).slice(-6)
    .map((h) => ({ rol: h?.rol === 'user' ? 'user' : 'nova', texto: String(h?.texto || '').slice(0, 1000) }));
  const contexto = body.contexto && typeof body.contexto === 'object' ? body.contexto : {};
  const { sinRespuesta, ...r } = await answer(db, { mensaje, historial, contexto, user: user || null });
  if (sinRespuesta) await logUnanswered(db, mensaje, sinRespuesta).catch((e) => console.error('[nova:preguntas]', e.message));
  return ok(r);
});

// ---- Panel de empresa: «Preguntas a Nova» ----
route('GET', '/admin/nova/preguntas', requireAdmin, async ({ db }) => {
  const list = (await db.list('novaq')).sort((a, b) => (a.resuelta === b.resuelta ? 0 : a.resuelta ? 1 : -1) || b.veces - a.veces || String(b.ultima_vez).localeCompare(String(a.ultima_vez)));
  return ok({ preguntas: list.map(({ id, texto, veces, ultima_vez, motivo, resuelta }) => ({ id, texto, veces, ultima_vez, motivo, motivo_texto: MOTIVOS[motivo] || motivo, resuelta: !!resuelta })) });
});
route('PATCH', '/admin/nova/preguntas/:id', requireAdmin, async ({ db, params, body }) => {
  const cur = await db.get('novaq', params.id);
  if (!cur) throw notFound('Pregunta no encontrada.');
  const saved = await db.put('novaq', { ...cur, resuelta: !!body.resuelta });
  return ok({ pregunta: { id: saved.id, resuelta: !!saved.resuelta } });
});
route('DELETE', '/admin/nova/preguntas/:id', requireAdmin, async ({ db, params }) => {
  if (!(await db.get('novaq', params.id))) throw notFound('Pregunta no encontrada.');
  await db.remove('novaq', params.id);
  return ok({ ok: true });
});
