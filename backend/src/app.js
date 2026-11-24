// Aplicación: recibe una petición neutra (sin depender de Express) y devuelve {status, body}.
import { getDb } from './lib/db/index.js';
import { dispatch, parseJson } from './lib/router.js';
import { HttpError, ok } from './lib/http.js';
import { runRequest } from './lib/db/context.js';
import './routes/auth.js';
import './routes/catalog.js';
import './routes/products.js';
import './routes/sales.js';
import './routes/users.js';
import './routes/me.js';
import './routes/admin.js';
import './routes/uploads.js';
import './routes/nova.js';
import { route } from './lib/router.js';

route('GET', '/health', async ({ db }) => ok({ status: 'ok', db: db.kind, time: new Date().toISOString() }));

export async function handleRequest({ method, path, query = {}, headers = {}, rawBody }) {
  try {
    const ctx = { db: await getDb(), method, path, query, headers, body: {} };
    if (['POST', 'PUT', 'PATCH'].includes(method)) ctx.body = parseJson(rawBody);
    return await runRequest(() => dispatch(ctx));
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, body: { message: e.message, ...(e.extra || {}) } };
    console.error('[error]', e);
    return { status: 500, body: { message: 'Error interno del servidor.' } };
  }
}
