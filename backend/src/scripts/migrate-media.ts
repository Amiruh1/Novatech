import db from '../config/db';
import { createMediaMigrationRepository } from '../repositories/media-migration.repository';
import { migrateMedia } from '../services/media-migration.service';

async function main() {
  try {
    const args = process.argv.slice(2);
    if (process.env.NODE_ENV !== 'production' || args.some(arg => !['--apply', '--dry-run'].includes(arg))
      || (args.includes('--apply') && args.includes('--dry-run'))) {
      console.error('Usa NODE_ENV=production y --dry-run (revisión) o --apply (migración).');
      process.exitCode = 1;
      return;
    }
    const apply = args.includes('--apply');
    if (apply && (!process.env.MEDIA_BUCKET || !process.env.MEDIA_BASE_URL || !process.env.AWS_REGION)) {
      console.error('Falta configurar el almacenamiento de imágenes del ambiente.');
      process.exitCode = 1;
      return;
    }
    const result = await migrateMedia(createMediaMigrationRepository(db), { apply });
    console.log(`${apply ? 'Migración' : 'Revisión sin cambios'}: ${JSON.stringify(result)}`);
    if (result.failed || result.missingTables) process.exitCode = 1;
  } catch {
    console.error('No se pudo migrar imágenes. Revisa conexión, esquema y permisos del ambiente.');
    process.exitCode = 1;
  } finally { await db.end(); }
}

if (require.main === module) void main();
