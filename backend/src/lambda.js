// Entrada para AWS Lambda (Function URL). Hace lo mismo que server.js con Express: CORS, cabeceras de
// seguridad, límites de peticiones y de tamaño, y entrega la petición a la misma aplicación (app.js).
//
// Límites de peticiones: se cuentan en memoria, por cada copia de la función. Con poco tráfico hay una
// sola copia y funcionan igual que en el servidor; con mucho tráfico Lambda abre más copias y el límite
// real es más alto. El tope de gasto se fija con la «concurrencia reservada» de la función.
import { handleRequest } from './app.js';

const origins = (process.env.FRONTEND_ORIGINS || 'http://localhost:3000').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
const MAX_BODY = 100 * 1024;
const SECURITY = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};

// ---- Límite de peticiones por IP (ventana fija) ----
const buckets = new Map(); // `${regla}:${ip}` → { n, reset }
function limited(rule, ip, limit, windowMs) {
  const now = Date.now();
  if (buckets.size > 5000) for (const [k, b] of buckets) if (b.reset <= now) buckets.delete(k);
  const key = `${rule}:${ip}`;
  let b = buckets.get(key);
  if (!b || b.reset <= now) { b = { n: 0, reset: now + windowMs }; buckets.set(key, b); }
  b.n += 1;
  return b.n > limit ? Math.ceil((b.reset - now) / 1000) : 0;
}

// ?a=1&a=2 → { a: ['1', '2'] } (igual que Express)
function parseQuery(raw) {
  const q = {};
  for (const [k, v] of new URLSearchParams(raw || '')) q[k] = k in q ? [].concat(q[k], v) : v;
  return q;
}

export async function handler(event) {
  const http = event.requestContext?.http || {};
  const method = (http.method || 'GET').toUpperCase();
  const path = event.rawPath || http.path || '/';
  const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  const ip = http.sourceIp || 'desconocida';
  const origin = (headers.origin || '').replace(/\/$/, '');
  const cors = origins.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : { Vary: 'Origin' };
  const reply = (status, body, extra = {}) => ({ statusCode: status, headers: { ...SECURITY, ...cors, ...extra }, body: JSON.stringify(body ?? {}) });

  // Petición previa del navegador (CORS)
  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '3600' }, body: '' };
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error('JWT_SECRET debe tener al menos 32 caracteres (variable de entorno de la función).');
    return reply(500, { message: 'Error interno del servidor.' });
  }

  // Mismos límites que server.js
  let wait = limited('todo', ip, 240, 60_000);
  if (wait) return reply(429, { message: 'Demasiadas solicitudes. Intenta en un minuto.' }, { 'Retry-After': String(wait) });
  if (path.startsWith('/auth') && method !== 'GET' && (wait = limited('auth', ip, 40, 15 * 60_000))) return reply(429, { message: 'Demasiados intentos. Intenta más tarde.' }, { 'Retry-After': String(wait) });
  if (path.startsWith('/nova/chat') && (wait = limited('nova', ip, 20, 60_000))) return reply(429, { message: 'Hiciste muchas preguntas seguidas. Espera un minuto, por favor.' }, { 'Retry-After': String(wait) });

  const rawBody = event.body ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body) : '';
  if (Buffer.byteLength(rawBody) > MAX_BODY) return reply(413, { message: 'La solicitud es demasiado grande.' });

  const out = await handleRequest({ method, path, query: parseQuery(event.rawQueryString), headers: { ...headers, 'x-client-ip': ip }, rawBody });
  return reply(out.status, out.body);
}
