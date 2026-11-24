// Imágenes de productos en S3:
//  - importExternalImage: copia al bucket una imagen pegada como enlace externo.
//  - deleteImageIfUnused: borra del bucket una imagen propia que ya no usa ningún registro.
// Solo se borran imágenes propias (S3_PUBLIC_BASE_URL/images/...); enlaces externos o locales no se tocan.
import { randomUUID } from 'node:crypto';

/** Clave S3 ("images/abc.jpg") de una URL de nuestro bucket, o null si no es nuestra. */
export function bucketKey(url) {
  const base = (process.env.S3_PUBLIC_BASE_URL || '').replace(/\/$/, '');
  if (!base || !process.env.S3_BUCKET || typeof url !== 'string' || !url.startsWith(`${base}/`)) return null;
  const key = url.slice(base.length + 1).split(/[?#]/)[0];
  return /^images\/[A-Za-z0-9_-]+\.(?:jpe?g|png|webp)$/.test(key) ? key : null;
}

/** ¿Algún producto, banner o venta sigue usando esta clave? Las ventas guardan la imagen del producto. */
async function inUse(db, key) {
  for (const entity of ['product', 'banner', 'sale']) {
    for (const item of await db.list(entity)) if (JSON.stringify(item).includes(key)) return true;
  }
  return false;
}

let client;
async function s3() {
  const sdk = await import('@aws-sdk/client-s3');
  client ||= new sdk.S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {}),
  });
  return { client, sdk };
}

const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_BYTES = 5 * 1024 * 1024;
const s3Ready = () => !!(process.env.S3_BUCKET && process.env.S3_PUBLIC_BASE_URL);

// El servidor descarga una URL que escribe el admin: se impide que apunte a la red interna
// (localhost, IPs privadas o el servicio de metadatos de la nube).
function privateIp(ip) {
  if (ip.includes(':')) {
    const v6 = ip.toLowerCase();
    if (v6.startsWith('::ffff:')) return privateIp(v6.slice(7));
    return v6 === '::1' || v6 === '::' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
async function assertPublicUrl(u) {
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('el enlace debe empezar por http:// o https://');
  const { lookup } = await import('node:dns/promises');
  const addrs = await lookup(u.hostname.replace(/^\[|\]$/g, ''), { all: true }).catch(() => { throw new Error('no se encontró la web del enlace'); });
  if (addrs.some((a) => privateIp(a.address))) throw new Error('el enlace apunta a una dirección no permitida');
}

/** Descarga una imagen externa (siguiendo hasta 3 redirecciones) y devuelve { body, type }. */
async function download(url) {
  let u = new URL(url);
  for (let hop = 0; hop < 4; hop++) {
    await assertPublicUrl(u);
    const res = await fetch(u, {
      redirect: 'manual', signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NovaTech/1.0)', Accept: 'image/webp,image/jpeg,image/png,image/*;q=0.8' },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { u = new URL(res.headers.get('location'), u); continue; }
    if (!res.ok) throw new Error(`la web respondió ${res.status}`);
    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!TYPES[type]) throw new Error(`no es una imagen JPG, PNG o WebP (${type || 'tipo desconocido'})`);
    if (Number(res.headers.get('content-length')) > MAX_BYTES) throw new Error('la imagen pesa más de 5 MB');
    const body = Buffer.from(await res.arrayBuffer());
    if (!body.length || body.length > MAX_BYTES) throw new Error('la imagen está vacía o pesa más de 5 MB');
    return { body, type };
  }
  throw new Error('demasiadas redirecciones');
}

/**
 * Si `url` es un enlace externo, copia la imagen al bucket y devuelve { url: <url del bucket> }.
 * Si ya es del bucket, es local (/...) o S3 no está configurado, la devuelve tal cual.
 * Si no se puede copiar, devuelve { url: <la original>, error } para no impedir guardar el producto.
 */
export async function importExternalImage(url) {
  if (!s3Ready() || typeof url !== 'string' || !/^https?:\/\//i.test(url) || bucketKey(url)) return { url };
  const base = process.env.S3_PUBLIC_BASE_URL.replace(/\/$/, '');
  if (url.startsWith(`${base}/`)) return { url };
  try {
    const { body, type } = await download(url);
    const key = `images/${randomUUID().replace(/-/g, '')}.${TYPES[type]}`;
    const { client: c, sdk } = await s3();
    await c.send(new sdk.PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: body, ContentType: type, CacheControl: 'public, max-age=31536000, immutable' }));
    console.log(`[s3] imagen importada: ${new URL(url).host} -> ${key}`);
    return { url: `${base}/${key}` };
  } catch (e) {
    const error = e.name === 'TimeoutError' ? 'la web tardó demasiado en responder' : e.message;
    console.warn(`[s3] no se pudo importar ${url}: ${error}`);
    return { url, error };
  }
}

/** Borra la imagen del bucket si es nuestra y nadie la usa. Nunca lanza error: solo avisa en consola. */
export async function deleteImageIfUnused(db, url) {
  const key = bucketKey(url);
  if (!key) return false;
  try {
    if (await inUse(db, key)) return false;
    const { client: c, sdk } = await s3();
    await c.send(new sdk.DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    console.log(`[s3] imagen anterior borrada: ${key}`);
    return true;
  } catch (e) {
    console.warn(`[s3] no se pudo borrar ${key}: ${e.name || e.message}`);
    return false;
  }
}
