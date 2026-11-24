// Copia al bucket S3 la imagen PRINCIPAL de los productos que apunta a una web externa y actualiza su URL.
// Las imágenes de la galería no se tocan: se quedan con el enlace que tengan.
// Uso: node scripts/migrate-images-to-s3.js [--dry]
// Las que ya están en el bucket o son locales (/...) se saltan, así que se puede ejecutar varias veces.
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

process.loadEnvFile(new URL('../.env', import.meta.url));
const DRY = process.argv.includes('--dry');
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_BYTES = 5 * 1024 * 1024;
const bucket = process.env.S3_BUCKET;
const pub = (process.env.S3_PUBLIC_BASE_URL || '').replace(/\/$/, '');
if (!bucket || !pub) throw new Error('Falta S3_BUCKET o S3_PUBLIC_BASE_URL en .env');

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
await client.connect();
const products = client.db(process.env.MONGODB_DB).collection('productos');

const needsCopy = (u) => typeof u === 'string' && /^https?:\/\//i.test(u) && !u.startsWith(pub);
const copied = new Map(); // misma URL externa → misma copia
let ok = 0, fail = 0;

async function copy(url) {
  if (copied.has(url)) return copied.get(url);
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 NovaTech-image-migration' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const ext = TYPES[type];
  if (!ext) throw new Error(`tipo no permitido: ${type || 'desconocido'}`);
  const body = Buffer.from(await res.arrayBuffer());
  if (!body.length || body.length > MAX_BYTES) throw new Error(`tamaño no válido: ${body.length} bytes`);
  const key = `images/${randomUUID().replace(/-/g, '')}.${ext}`;
  if (!DRY) await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: type, CacheControl: 'public, max-age=31536000, immutable' }));
  const out = `${pub}/${key}`;
  copied.set(url, out);
  return out;
}

async function migrate(url, label) {
  if (!needsCopy(url)) return url;
  try {
    const out = await copy(url);
    ok++;
    console.log(`  ✓ ${label} → ${out.replace(pub, '<bucket>')}`);
    return out;
  } catch (e) {
    fail++;
    console.log(`  ✗ ${label}: ${e.message} (se deja el enlace original)`);
    return url;
  }
}

for (const p of await products.find({}, { projection: { nombre: 1, imagen: 1 } }).toArray()) {
  if (!needsCopy(p.imagen)) continue;
  console.log(p.nombre);
  const imagen = await migrate(p.imagen, 'principal');
  if (!DRY && imagen !== p.imagen) await products.updateOne({ _id: p._id }, { $set: { imagen } });
}

console.log(`\n${DRY ? '[simulación] ' : ''}copiadas: ${ok} · fallidas: ${fail}`);
await client.close();
