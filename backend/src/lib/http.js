export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
export const bad = (m, extra) => new HttpError(400, m, extra);
export const unauthorized = (m = 'No autenticado.') => new HttpError(401, m);
export const forbidden = (m = 'No tienes permisos.') => new HttpError(403, m);
export const notFound = (m = 'No encontrado.') => new HttpError(404, m);
export const conflict = (m) => new HttpError(409, m);

export const ok = (body, status = 200) => ({ status, body });

export function toLambdaResponse({ status = 200, body, headers = {} }) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
    body: body === undefined ? '' : JSON.stringify(body),
  };
}
