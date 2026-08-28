import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import db from '../config/db';

dotenv.config();

interface UserPasswordRow {
  id: number;
  email: string;
  password: string;
}

const BCRYPT_RE = /^\$2[aby]\$\d{2}\$/;

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    verbose: args.includes('--verbose') || args.includes('-v')
  };
}

async function main() {
  const { dryRun, verbose } = parseArgs();

  const [rows] = await db.query('SELECT id, email, password FROM usuarios ORDER BY id ASC');
  const users = rows as UserPasswordRow[];

  const legacyUsers = users.filter((user) => !BCRYPT_RE.test(String(user.password || '')));

  if (!legacyUsers.length) {
    console.log('No se encontraron passwords legacy en texto plano.');
    return;
  }

  console.log(`Usuarios detectados para migracion: ${legacyUsers.length}`);

  if (dryRun) {
    const preview = legacyUsers.slice(0, 20).map((user) => `${user.id} | ${user.email}`);
    console.log('DRY RUN: no se aplicaron cambios.');
    if (preview.length) {
      console.log('Primeros usuarios detectados:');
      preview.forEach((line) => console.log(`- ${line}`));
    }
    return;
  }

  let migrated = 0;

  for (const user of legacyUsers) {
    const rawPassword = String(user.password || '');
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    await db.query(
      'UPDATE usuarios SET password = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?',
      [hashedPassword, user.id]
    );

    migrated += 1;

    if (verbose) {
      console.log(`Migrado usuario ${user.id} (${user.email})`);
    }
  }

  console.log(`Migracion completada. Usuarios migrados: ${migrated}`);
}

main()
  .catch((error) => {
    console.error('Error ejecutando migracion de passwords:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
