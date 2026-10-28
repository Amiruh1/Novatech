import db from '../config/db';

export async function probeDatabase(): Promise<void> {
  // Verifica conexión, permisos y la tabla necesaria para servir el catálogo.
  await db.query({ sql: 'SELECT 1 FROM productos LIMIT 1', timeout: 3000 });
}
