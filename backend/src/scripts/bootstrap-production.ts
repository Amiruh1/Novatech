import bcrypt from 'bcryptjs';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import db from '../access-data/config/db';
import { ensureProductionSchema } from '../access-data/repositories/production-schema.repository';

// Identifica únicamente las cuentas y el hash publicados en el SQL de ejemplo.
// Si alguien cambió su contraseña, este script no modifica esa cuenta.
const DEMO_EMAILS = ['admin@novatech.com', 'cliente@novatech.com'];
const DEMO_HASH_SHA256 = '9a775f7fd90d9784e5ffd91b3698ef9f431a526e0cdaed39d9643db86e596c29';

class BootstrapConfigError extends Error {}

export async function bootstrapProduction(pool: Pool, env: NodeJS.ProcessEnv) {
  if (env.NODE_ENV !== 'production') {
    throw new BootstrapConfigError('El bootstrap requiere NODE_ENV=production.');
  }

  const email = (env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = env.BOOTSTRAP_ADMIN_PASSWORD || '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 140 || DEMO_EMAILS.includes(email)) {
    throw new BootstrapConfigError('Configura BOOTSTRAP_ADMIN_EMAIL con un correo válido distinto de las cuentas demo.');
  }
  if (password.length < 20 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new BootstrapConfigError('BOOTSTRAP_ADMIN_PASSWORD debe tener al menos 20 caracteres y como máximo 72 bytes.');
  }

  await ensureProductionSchema(pool);

  // Esta desactivación se confirma por separado: un conflicto con el correo
  // del administrador no debe dejar habilitada una contraseña de demostración.
  const [disabled] = await pool.execute<ResultSetHeader>(
    `UPDATE usuarios
     SET activo = 0, reset_token = NULL, reset_token_expires = NULL
     WHERE email IN (?, ?) AND SHA2(password, 256) = ?
       AND (activo <> 0 OR reset_token IS NOT NULL OR reset_token_expires IS NOT NULL)`,
    [...DEMO_EMAILS, DEMO_HASH_SHA256]
  );

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<RowDataPacket[]>(
      'SELECT id, rol, activo FROM usuarios WHERE email = ? FOR UPDATE', [email]
    );
    if (rows.length) {
      if (rows[0].rol !== 'admin' || Number(rows[0].activo) !== 1) {
        throw new BootstrapConfigError('El correo de bootstrap ya pertenece a una cuenta que no es un administrador activo. No se modificó.');
      }
      await connection.commit();
      return { disabledDemoAccounts: disabled.affectedRows, adminCreated: false };
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await connection.execute(
      `INSERT INTO usuarios (nombre, email, password, rol, activo)
       VALUES (?, ?, ?, 'admin', 1)`,
      ['Administrador NovaTech', email, passwordHash]
    );
    await connection.commit();
    return { disabledDemoAccounts: disabled.affectedRows, adminCreated: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function main() {
  try {
    const result = await bootstrapProduction(db, process.env);
    console.log(`Cuentas demo desactivadas: ${result.disabledDemoAccounts}.`);
    console.log(result.adminCreated
      ? 'Administrador inicial creado. Credenciales disponibles en el secreto del ambiente.'
      : 'El administrador ya existe; se conservó su contraseña.');
  } catch (error) {
    // Los errores SQL pueden incluir parámetros: nunca se imprimen completos.
    console.error(error instanceof BootstrapConfigError
      ? error.message
      : 'No se pudo completar el bootstrap. Revisa conexión, esquema y permisos de la base.');
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

if (require.main === module) void main();
