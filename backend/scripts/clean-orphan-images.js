// Borra del bucket S3 las imágenes de images/ que ya no usa ningún registro de la base de datos
// (por ejemplo, de productos eliminados o imágenes reemplazadas).
// Uso: node scripts/clean-orphan-images.js [--dry] [--min-age-hours=24]
//   --dry               solo muestra lo que borraría, sin borrar nada.
//   --min-age-hours=N   no toca imágenes subidas hace menos de N horas (por defecto 24), para no borrar
//                       una imagen recién subida desde el admin cuyo producto aún no se ha guardado.
import { MongoClient } from 'mongodb';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';

process.loadEnvFile(new URL('../.env', import.meta.url));
const DRY = process.argv.includes('--dry');
const ageArg = process.argv.find((a) => a.startsWith('--min-age-hours='));
const MIN_AGE_HOURS = ageArg ? Number(ageArg.split('=')[1]) : 24;
if (!Number.isFinite(MIN_AGE_HOURS) || MIN_AGE_HOURS < 0) throw new Error('--min-age-hours debe ser un número ≥ 0');
const PREFIX = 'images/';
const bucket = process.env.S3_BUCKET;
if (!bucket) throw new Error('Falta S3_BUCKET en .env');

// 1. Claves que usa la base de datos: se buscan en TODAS las colecciones (productos, banners, pedidos…).
//    Los registros eliminados (borrado lógico, deleted: true) no cuentan: su imagen ya no se muestra.
const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
await client.connect();
const db = client.db(process.env.MONGODB_DB);
const used = new Set();
const keyRe = /images\/[A-Za-z0-9_-]+\.(?:jpe?g|png|webp)/g;
for (const { name } of await db.listCollections().toArray()) {
  // estado 3 = eliminado (esquema nuevo); deleted: true = borrado lógico de las colecciones anteriores.
  for await (const doc of db.collection(name).find({ deleted: { $ne: true }, estado: { $ne: 3 } })) {
    for (const k of JSON.stringify(doc).match(keyRe) || []) used.add(k);
  }
}
await client.close();

// 2. Objetos del bucket bajo images/.
const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const objects = [];
let token;
do {
  const r = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX, ContinuationToken: token }));
  objects.push(...(r.Contents || []));
  token = r.IsTruncated ? r.NextContinuationToken : undefined;
} while (token);

const cutoff = Date.now() - MIN_AGE_HOURS * 3600 * 1000;
const orphans = objects.filter((o) => !used.has(o.Key) && o.LastModified.getTime() < cutoff);
const recent = objects.filter((o) => !used.has(o.Key) && o.LastModified.getTime() >= cutoff);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

console.log(`En el bucket: ${objects.length} · en uso: ${objects.length - orphans.length - recent.length} · sin uso: ${orphans.length + recent.length}`);
if (recent.length) console.log(`Se respetan ${recent.length} sin uso por ser de las últimas ${MIN_AGE_HOURS} h.`);
for (const o of orphans) console.log(`  ${DRY ? '·' : '✗'} ${o.Key}  (${kb(o.Size)}, ${o.LastModified.toISOString().slice(0, 10)})`);

if (!orphans.length) { console.log('No hay nada que borrar.'); process.exit(0); }
if (DRY) { console.log(`\n[simulación] se borrarían ${orphans.length} imágenes (${kb(orphans.reduce((t, o) => t + o.Size, 0))}). Ejecuta sin --dry para borrarlas.`); process.exit(0); }

// 3. Borrado en lotes de hasta 1000 (límite de S3).
let deleted = 0;
for (let i = 0; i < orphans.length; i += 1000) {
  const r = await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: orphans.slice(i, i + 1000).map((o) => ({ Key: o.Key })), Quiet: true } }));
  for (const e of r.Errors || []) console.log(`  ! no se pudo borrar ${e.Key}: ${e.Code}`);
  deleted += Math.min(1000, orphans.length - i) - (r.Errors || []).length;
}
console.log(`\nBorradas: ${deleted} de ${orphans.length}.`);
