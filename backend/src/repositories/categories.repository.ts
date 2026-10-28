import db from '../config/db';

export async function updateCategory(
  id: number,
  cat: { nombre?: string; slug?: string; descripcion?: string; imagen?: string; activo?: number; orden?: number }
) {
  const allowed = ['nombre', 'slug', 'descripcion', 'imagen', 'activo', 'orden'];
  const keys = Object.keys(cat).filter(key => allowed.includes(key));
  const values: unknown[] = keys.map(key => cat[key as keyof typeof cat]);
  if (keys.length === 0) return;

  const setString = keys.map(k => `${k} = ?`).join(', ');
  values.push(id);
  await db.query(`UPDATE categorias SET ${setString} WHERE id = ?`, values);
}

export async function findCategories() {
  const [result] = await db.query(
    'SELECT * FROM categorias ORDER BY orden ASC, id ASC'
  );
  return result;
}

export async function insertCategory(
  name: string,
  slug: string,
  description: string | null,
  image: string | null,
  active: number,
  position: number
) {
  const [result] = await db.query(
    'INSERT INTO categorias (nombre, slug, descripcion, imagen, activo, orden) VALUES (?, ?, ?, ?, ?, ?)',
    [name, slug, description, image, active, position]
  );
  return result;
}

export async function deleteCategory(id: number) {
  const [result] = await db.query(
    'DELETE FROM categorias WHERE id = ?',
    [id]
  );
  return result;
}
