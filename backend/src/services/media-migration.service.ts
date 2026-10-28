import { createHash } from 'node:crypto';
import { IMAGE_TABLES, MediaMigrationRepository } from '../repositories/media-migration.repository';
import { ImageObject, storeImage } from '../repositories/media.repository';
import { imageExtension, MAX_IMAGE_BYTES } from './media.service';

const SOURCE_HOSTS = new Set(['picsum.photos', 'fastly.picsum.photos', 'images.unsplash.com']);

export function isAllowedImageSource(source: string): boolean {
  try {
    const url = new URL(source);
    return url.protocol === 'https:' && SOURCE_HOSTS.has(url.hostname)
      && !url.username && !url.password && (!url.port || url.port === '443');
  } catch { return false; }
}

export async function downloadSeedImage(source: string, request: typeof fetch = fetch) {
  let url = source;
  const signal = AbortSignal.timeout(20000);
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (!isAllowedImageSource(url)) throw new Error('Origen de imagen no permitido');
    const response = await request(url, {
      redirect: 'manual', signal, headers: { Accept: 'image/jpeg,image/png,image/webp' },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirección sin destino');
      url = new URL(location, url).href;
      continue;
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error('No se pudo descargar la imagen');
    }
    if (Number(response.headers.get('content-length') || 0) > MAX_IMAGE_BYTES) {
      await response.body.cancel();
      throw new Error('Imagen demasiado grande');
    }
    const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let length = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > MAX_IMAGE_BYTES) throw new Error('Imagen demasiado grande');
        chunks.push(Buffer.from(value));
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    const content = Buffer.concat(chunks);
    const extension = imageExtension(content, contentType);
    return { content, contentType, extension };
  }
  throw new Error('Demasiadas redirecciones');
}

export async function migrateMedia(repository: MediaMigrationRepository, options: {
  apply: boolean;
  download?: typeof downloadSeedImage;
  save?: (input: ImageObject) => Promise<string>;
  log?: (message: string) => void;
}) {
  const download = options.download || downloadSeedImage;
  const save = options.save || storeImage;
  const log = options.log || console.log;
  const summary = { candidates: 0, migrated: 0, skipped: 0, conflicts: 0, failed: 0, missingTables: 0 };
  for (const table of IMAGE_TABLES) {
    if (!(await repository.hasImageColumn(table))) {
      summary.missingTables++;
      log(`${table}: falta la columna imagen; ejecuta el bootstrap primero.`);
      continue;
    }
    let afterId = 0;
    while (true) {
      const images = await repository.list(table, afterId);
      if (!images.length) break;
      for (const image of images) {
        afterId = image.id;
        // Conserva exactamente el fallback que ya muestra tienda.ts para cada categoría.
        const source = image.imagen === null && table === 'categorias' && image.nombre
          ? `https://picsum.photos/seed/${image.nombre}/200/200` : image.imagen;
        if (!source || !isAllowedImageSource(source)) { summary.skipped++; continue; }
        summary.candidates++;
        if (!options.apply) continue;
        try {
          const { content, contentType, extension } = await download(source);
          // Clave estable por contenido: repetir tras un fallo no crea duplicados.
          const digest = createHash('sha256').update(content).digest('hex');
          const url = await save({ key: `images/imported-${digest}.${extension}`, content, contentType });
          if (await repository.replace(table, image, url)) summary.migrated++;
          else { summary.conflicts++; log(`${table} #${image.id}: la imagen cambió; se conservó la edición.`); }
        } catch {
          summary.failed++;
          log(`${table} #${image.id}: no se migró; se conserva su imagen anterior.`);
        }
      }
    }
  }
  return summary;
}
