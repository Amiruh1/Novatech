import db from '../config/db';

export async function probeDatabase(): Promise<void> {
  await db.query({ sql: 'SELECT 1 FROM productos LIMIT 1', timeout: 3000 });
}
