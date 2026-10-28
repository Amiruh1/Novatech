const assert = require('node:assert/strict');
const { downloadSeedImage, isAllowedImageSource, migrateMedia } = require('../dist/src/services/media-migration.service');
const { createMediaMigrationRepository } = require('../dist/src/repositories/media-migration.repository');
const { MAX_IMAGE_BYTES } = require('../dist/src/services/media.service');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII=', 'base64');
const downloaded = { content: png, contentType: 'image/png', extension: 'png' };

async function testDownload() {
  assert.ok(isAllowedImageSource('https://picsum.photos/seed/example/200/200'));
  for (const url of ['http://picsum.photos/test', 'https://picsum.photos.evil.test/test',
    'https://picsum.photos@127.0.0.1/test', 'https://picsum.photos:8080/test', 'file:///image.png']) {
    assert.equal(isAllowedImageSource(url), false);
  }
  const requests = [];
  const image = await downloadSeedImage('https://picsum.photos/seed/example/200/200', async url => {
    requests.push(url);
    return requests.length === 1
      ? new Response(null, { status: 302, headers: { location: 'https://fastly.picsum.photos/id/1/200/200.jpg' } })
      : new Response(png, { headers: { 'Content-Type': 'image/png' } });
  });
  assert.equal(requests.length, 2); assert.equal(image.extension, 'png'); assert.deepEqual(image.content, png);
  let calls = 0;
  await assert.rejects(downloadSeedImage('https://picsum.photos/test', async () => {
    calls++; return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } });
  }), /no permitido/);
  assert.equal(calls, 1);
  await assert.rejects(downloadSeedImage('https://picsum.photos/test', async () =>
    new Response(Buffer.alloc(MAX_IMAGE_BYTES + 1), { headers: { 'Content-Type': 'image/png' } })), /grande/);
  await assert.rejects(downloadSeedImage('https://picsum.photos/test', async () =>
    new Response('<script>bad</script>', { headers: { 'Content-Type': 'image/png' } })), /válida/);
  console.log('OK: descargas validan host, protocolo, redirects, tamaño y firma de imagen.');
}

async function testMigrationDatabase(pool) {
  const repository = createMediaMigrationRepository(pool);
  const [categories] = await pool.query('SELECT COUNT(*) AS total FROM categorias WHERE imagen IS NULL');
  const expected = 7 + categories[0].total;
  const before = await migrateMedia(repository, { apply: false });
  assert.equal(before.candidates, expected); assert.equal(before.migrated, 0);
  let saved = 0;
  const options = { apply: true, download: async () => downloaded,
    save: async image => { saved++; return `https://media.example.test/${image.key}`; } };
  const first = await migrateMedia(repository, options);
  assert.equal(first.migrated, expected); assert.equal(first.failed, 0); assert.equal(saved, expected);
  const repeated = await migrateMedia(repository, options);
  assert.equal(repeated.candidates, 0); assert.equal(saved, expected);

  const source = 'https://picsum.photos/seed/retained/200/200';
  await pool.query('UPDATE categorias SET imagen = ? WHERE id = 1', [source]);
  const failed = await migrateMedia(repository, { ...options, save: async () => { throw new Error('Storage unavailable'); }, log: () => {} });
  assert.equal(failed.failed, 1);
  const [unchanged] = await pool.query('SELECT imagen FROM categorias WHERE id = 1');
  assert.equal(unchanged[0].imagen, source);
  const conflict = await migrateMedia(repository, { ...options, download: async () => {
    await pool.query('UPDATE categorias SET imagen = ? WHERE id = 1', ['https://media.example.test/edited.png']);
    return downloaded;
  }, log: () => {} });
  assert.equal(conflict.conflicts, 1); assert.equal(conflict.migrated, 0);
  const [changed] = await pool.query('SELECT imagen FROM categorias WHERE id = 1');
  assert.equal(changed[0].imagen, 'https://media.example.test/edited.png');
  console.log('OK: migración real en MySQL es idempotente y conserva imagen ante fallos o edición concurrente.');
}

module.exports = { testMigrationDatabase };
if (require.main === module) testDownload().catch(error => { console.error(error.message); process.exitCode = 1; });
