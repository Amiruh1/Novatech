import db from '../config/db';

export interface CategoriaReq {
  nombre: string;
  slug: string;
  descripcion?: string;
  imagen?: string;
  activo?: number;
  orden?: number;
}

export async function listCategoriasFull() {
  const [rows] = await db.query('SELECT * FROM categorias ORDER BY orden ASC, id ASC');
  return rows;
}

export async function createCategoria(cat: CategoriaReq) {
  const [result] = await db.query(
    'INSERT INTO categorias (nombre, slug, descripcion, imagen, activo, orden) VALUES (?, ?, ?, ?, ?, ?)',
    [cat.nombre, cat.slug, cat.descripcion || null, cat.imagen || null, cat.activo ?? 1, cat.orden ?? 0]
  );
  return result;
}

export async function updateCategoria(id: number, cat: Partial<CategoriaReq>) {
  const keys = Object.keys(cat);
  const values = Object.values(cat);
  if (keys.length === 0) return;
  
  const setString = keys.map(k => `${k} = ?`).join(', ');
  values.push(id);
  await db.query(`UPDATE categorias SET ${setString} WHERE id = ?`, values);
}

export async function deleteCategoria(id: number) {
  await db.query('DELETE FROM categorias WHERE id = ?', [id]);
}
