import db from '../config/db';

export async function updateBrand(id: number, changes: { nombre?: string; slug?: string; activo?: number }) {
  const keys = (['nombre', 'slug', 'activo'] as const).filter(key => changes[key] !== undefined);
  if (!keys.length) return;
  const fields = keys.map(key => `${key} = ?`).join(', ');
  const values = keys.map(key => changes[key]);
  await db.query(`UPDATE marcas SET ${fields} WHERE id = ?`, [...values, id]);
}

export async function findBrands() {
  const [result] = await db.query(
    'SELECT id, nombre, slug, activo FROM marcas ORDER BY nombre ASC'
  );
  return result;
}

export async function insertBrand(name: string, slug: string, active: number) {
  const [result] = await db.query(
    'INSERT INTO marcas (nombre, slug, activo) VALUES (?, ?, ?)',
    [name, slug, active]
  );
  return result;
}

export async function deleteBrand(id: number) {
  const [result] = await db.query(
    'DELETE FROM marcas WHERE id = ?',
    [id]
  );
  return result;
}
