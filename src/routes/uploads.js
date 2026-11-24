// Imágenes en S3: el navegador sube DIRECTO al bucket con un POST prefirmado.
// El backend nunca recibe el archivo; solo autoriza la subida (solo admin) y devuelve la URL pública.
import { route, requireAdmin } from '../lib/router.js';
import { ok, bad, HttpError } from '../lib/http.js';
import { newId } from '../lib/id.js';

const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_BYTES = 5 * 1024 * 1024;

route('POST', '/uploads/presign', requireAdmin, async ({ body }) => {
  const bucket = process.env.S3_BUCKET, publicBase = process.env.S3_PUBLIC_BASE_URL;
  if (!bucket || !publicBase) throw new HttpError(501, 'El almacenamiento de imágenes (S3) no está configurado.');
  const contentType = String(body.contentType || '');
  const ext = TYPES[contentType];
  if (!ext) throw bad('Solo se permiten imágenes JPG, PNG o WebP.');
  const { S3Client } = await import('@aws-sdk/client-s3');
  const { createPresignedPost } = await import('@aws-sdk/s3-presigned-post');
  const client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {}), // MinIO en local
  });
  const key = `images/${newId()}.${ext}`;
  const { url, fields } = await createPresignedPost(client, {
    Bucket: bucket, Key: key, Expires: 300,
    Fields: { 'Content-Type': contentType },
    Conditions: [['content-length-range', 1, MAX_BYTES], ['eq', '$Content-Type', contentType]],
  });
  return ok({ url, fields, key, publicUrl: `${publicBase.replace(/\/$/, '')}/${key}`, maxBytes: MAX_BYTES });
});
