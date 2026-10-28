import db from '../config/db';

export async function findBanners(activeOnly: boolean = false) {
  let query = 'SELECT id, imagen, titulo, subtitulo, link, activo, orden, creado_en FROM banners';

  if (activeOnly) {
    query += ' WHERE activo = 1';
  }

  query += ' ORDER BY orden ASC, id DESC';

  const [rows] = await db.query(query);
  return rows;
}

export async function insertBanner(
  image: string,
  title: string,
  subtitle: string | null,
  link: string | null,
  active: number,
  position: number
) {
  const [result] = await db.query(
    'INSERT INTO banners (imagen, titulo, subtitulo, link, activo, orden) VALUES (?, ?, ?, ?, ?, ?)',
    [image, title, subtitle, link, active, position]
  );
  return result;
}

export async function updateBanner(
  image: string,
  title: string,
  subtitle: string | null,
  link: string | null,
  active: number,
  position: number,
  id: number
) {
  const [result] = await db.query(
    'UPDATE banners SET imagen = ?, titulo = ?, subtitulo = ?, link = ?, activo = ?, orden = ? WHERE id = ?',
    [image, title, subtitle, link, active, position, id]
  );
  return result;
}

export async function deleteBanner(id: number) {
  const [result] = await db.query(
    'DELETE FROM banners WHERE id = ?',
    [id]
  );
  return result;
}
