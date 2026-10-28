// Ejecutar después de npm run build. No envía archivos a AWS ni correos reales.
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const { Readable } = require('node:stream');
const { imageExtension, uploadImage, MAX_IMAGE_BYTES } = require('../dist/src/services/media.service');

async function main() {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII=', 'base64');
  assert.equal(imageExtension(png, 'image/png'), 'png');
  assert.equal(imageExtension(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), 'image/jpeg'), 'jpg');
  const webp = Buffer.alloc(16); webp.write('RIFF', 0); webp.write('WEBP', 8); webp.write('VP8X', 12);
  assert.equal(imageExtension(webp, 'image/webp'), 'webp');
  for (const [content, type] of [[png, 'image/jpeg'], [Buffer.from('<svg></svg>'), 'image/png'],
    [Buffer.alloc(0), 'image/png'], [Buffer.alloc(MAX_IMAGE_BYTES + 1), 'image/png']]) {
    assert.throws(() => imageExtension(content, type));
  }
  let uploaded;
  const image = await uploadImage(png, 'image/png', async (input) => {
    uploaded = input; return `https://media.example.test/${input.key}`;
  });
  assert.match(image.key, /^images\/[0-9a-f-]{36}\.png$/);
  assert.equal(uploaded.content, png); assert.equal(uploaded.contentType, 'image/png');
  console.log('OK: formato, tipo real, tamaño máximo y clave única de imágenes.');

  process.env.JWT_SECRET = randomBytes(32).toString('hex');
  delete process.env.MEDIA_BUCKET;
  const router = require('../dist/src/routes/media.routes').default;
  const authService = require('../dist/src/services/auth.service');
  const mediaRepository = require('../dist/src/repositories/media.repository');
  const originalReadImage = mediaRepository.readImage;
  let reads = 0;
  mediaRepository.readImage = async () => {
    reads++; return { body: Readable.from([png]), contentType: 'image/png', contentLength: png.length, etag: '"abc123"' };
  };
  const originalActiveAccount = authService.isAccountActive;
  authService.isAccountActive = async (id) => id === 1 || id === 2;
  delete process.env.MEDIA_BUCKET;
  const app = express(); app.use(helmet()); app.use('/api', router);
  app.use((error, req, res, next) => res.status(error.status || 500).json({ message: 'Solicitud rechazada' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/media/images`;
    const publicUrl = `${url}/${image.key.split('/')[1]}`;
    const publicImage = await fetch(publicUrl);
    assert.equal(publicImage.status, 200);
    assert.equal(publicImage.headers.get('Content-Type'), 'image/png');
    assert.equal(publicImage.headers.get('Cross-Origin-Resource-Policy'), 'cross-origin');
    assert.equal(publicImage.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.match(publicImage.headers.get('Cache-Control'), /immutable/);
    assert.deepEqual(Buffer.from(await publicImage.arrayBuffer()), png);
    const headImage = await fetch(publicUrl, { method: 'HEAD' });
    assert.equal(headImage.status, 200); assert.equal((await headImage.arrayBuffer()).byteLength, 0);
    assert.equal((await fetch(publicUrl, { headers: { 'If-None-Match': '"abc123"' } })).status, 304);
    const beforeInvalid = reads;
    assert.equal((await fetch(`${url}/credentials.json`)).status, 404); assert.equal(reads, beforeInvalid);
    assert.equal((await fetch(`${url}/imported-${'a'.repeat(64)}.png`)).status, 200);
    mediaRepository.readImage = async () => ({ body: Readable.from([png]), contentType: 'image/png', contentLength: MAX_IMAGE_BYTES + 1 });
    assert.equal((await fetch(publicUrl)).status, 404);
    console.log('OK: GET/HEAD público, caché, ETag, CORP para Amplify y rechazo de claves/tamaños inválidos.');
    const send = (body, token) => fetch(url, { method: 'POST', body,
      headers: { 'Content-Type': 'image/png', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    assert.equal((await send(png)).status, 401);
    const customer = jwt.sign({ id: 2, rol: 'cliente' }, process.env.JWT_SECRET);
    assert.equal((await send(png, customer)).status, 403);
    const admin = jwt.sign({ id: 1, rol: 'admin' }, process.env.JWT_SECRET);
    assert.equal((await send(Buffer.from('<html>wrong image</html>'), admin)).status, 400);
    assert.equal((await send(Buffer.alloc(MAX_IMAGE_BYTES + 1), admin)).status, 413);
    assert.equal((await send(png, admin)).status, 503);
    console.log('OK: exige administrador, rechaza archivos inválidos/grandes y falla seguro sin configuración AWS.');
  } finally {
    await new Promise(resolve => server.close(resolve));
    authService.isAccountActive = originalActiveAccount;
    mediaRepository.readImage = originalReadImage;
  }

  const nodemailer = require('nodemailer');
  const composer = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const mail = await composer.sendMail({ from: 'sender@example.test', to: 'receiver@example.test',
    subject: 'Prueba local', html: '<p>Compra de prueba</p>', attachments: [{ filename: 'comprobante.pdf', content: Buffer.from('test') }] });
  assert.ok(Buffer.isBuffer(mail.message));
  assert.match(mail.message.toString(), /comprobante.pdf/);
  const original = nodemailer.createTransport;
  let options;
  nodemailer.createTransport = (config) => { options = config; return { sendMail: async () => ({ messageId: 'local' }) }; };
  process.env.NODE_ENV = 'production'; process.env.SMTP_PORT = '587';
  try {
    const email = require('../dist/src/utils/email.utils');
    await email.sendEmail('receiver@example.test', 'Prueba', '<p>Prueba local</p>');
    assert.equal(options.requireTLS, true); assert.equal(options.tls.rejectUnauthorized, true);
    await email.sendEmailWithAttachment('receiver@example.test', 'Prueba', '<p>Prueba local</p>', []);
    console.log('OK: Nodemailer compone HTML/adjuntos y el envío requiere TLS con certificado válido.');
  } finally { nodemailer.createTransport = original; }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
