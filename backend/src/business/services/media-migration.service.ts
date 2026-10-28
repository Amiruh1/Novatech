import { createHash } from 'node:crypto';
import { IMAGE_TABLES, MediaMigrationRepository } from '../../access-data/repositories/media-migration.repository';
import { ImageObject, storeImage } from '../../access-data/repositories/media.repository';
import { imageExtension, MAX_IMAGE_BYTES } from './media.service';

import { isAllowedImageSource, readSeedImageBytes } from '../../access-data/integrations/seed-image.gateway';

export { isAllowedImageSource };

export async function downloadSeedImage(source: string, request?: typeof fetch) {
  const { content, contentType } = await readSeedImageBytes(source, MAX_IMAGE_BYTES, request);
  const extension = imageExtension(content, contentType);
  return { content, contentType, extension };
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
