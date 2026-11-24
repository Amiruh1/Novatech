import { HttpError, unauthorized, forbidden, bad } from './http.js';
import { verifyToken } from './auth.js';
import { setActor } from './db/context.js';

const routes = [];
export function route(method, pattern, ...fns) {
  const keys = [];
  const rx = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ method, rx, keys, fns });
}
// Middlewares
export const requireAuth = async (ctx) => {
  const h = ctx.headers.authorization || '';
  const payload = verifyToken(h.startsWith('Bearer ') ? h.slice(7) : '');
  if (!payload) throw unauthorized('Sesión inválida o expirada.');
  const user = await ctx.db.get('user', payload.sub);
  if (!user || user.activo === false) throw unauthorized('Usuario inactivo o inexistente.');
  ctx.user = user;
  ctx.token = payload;
  setActor(user); // auditoría: quién crea o modifica documentos en esta petición
};
/** Sesión opcional: si el token es válido deja ctx.user; si no hay o no vale, sigue sin usuario (ctx.user = null). */
export const optionalAuth = async (ctx) => {
  try { await requireAuth(ctx); } catch { ctx.user = null; ctx.token = null; }
};
// RF-08: el backoffice exige rol administrador Y una sesión abierta en "modo empresa" (token elevado).
export const requireAdmin = async (ctx) => {
  await requireAuth(ctx);
  if (ctx.user.rol !== 'admin') throw forbidden('Se requiere rol administrador.');
  if (!ctx.token.elev) throw forbidden('Ingresa desde "Acceso empresa" para usar el panel administrativo.');
};

export async function dispatch(ctx) {
  let pathMatched = false;
  for (const r of routes) {
    const m = r.rx.exec(ctx.path);
    if (!m) continue;
    pathMatched = true;
    if (r.method !== ctx.method) continue;
    ctx.params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    let result;
    for (const fn of r.fns) result = await fn(ctx);
    return result;
  }
  throw new HttpError(pathMatched ? 405 : 404, pathMatched ? 'Método no permitido.' : 'Ruta no encontrada.');
}

export function parseJson(raw) {
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch { throw bad('JSON inválido.'); }
}
