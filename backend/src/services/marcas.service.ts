import db from '../config/db';

export interface MarcaModel {
  id?: number;
  nombre: string;
  slug?: string;
  activo?: number | boolean;
}

function toSlug(text: string): string {
  return text.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function listMarcas() {
  const [rows] = await db.query('SELECT id, nombre, slug, activo FROM marcas ORDER BY nombre ASC');
  return rows;
}

export async function createMarca(input: MarcaModel) {
  const nombre = input.nombre.trim();
  const slug = toSlug(nombre);
  const activo = input.activo !== undefined ? (input.activo ? 1 : 0) : 1;
  const [result] = await db.query(
    'INSERT INTO marcas (nombre, slug, activo) VALUES (?, ?, ?)',
    [nombre, slug, activo]
  );
  return result;
}

export async function updateMarca(id: number, input: Partial<MarcaModel>) {
  const fields: string[] = [];
  const params: any[] = [];

  if (input.nombre !== undefined) {
    fields.push('nombre = ?', 'slug = ?');
    params.push(input.nombre.trim(), toSlug(input.nombre.trim()));
  }
  if (input.activo !== undefined) {
    fields.push('activo = ?');
    params.push(input.activo ? 1 : 0);
  }

  if (!fields.length) return;
  params.push(id);
  await db.query(`UPDATE marcas SET ${fields.join(', ')} WHERE id = ?`, params);
}

export async function deleteMarca(id: number) {
  await db.query('DELETE FROM marcas WHERE id = ?', [id]);
}
