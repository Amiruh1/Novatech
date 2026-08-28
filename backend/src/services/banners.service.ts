import db from '../config/db';

export interface BannerInput {
  imagen: string;
  titulo: string;
  subtitulo?: string;
  link?: string;
  activo?: number;
  orden?: number;
}

export async function listBanners(activeOnly: boolean = false) {
  let query = 'SELECT id, imagen, titulo, subtitulo, link, activo, orden, creado_en FROM banners';
  
  if (activeOnly) {
    query += ' WHERE activo = 1';
  }
  
  query += ' ORDER BY orden ASC, id DESC';
  
  const [rows] = await db.query(query);
  return rows;
}

export async function createBanner(input: BannerInput) {
  const activo = input.activo !== undefined ? input.activo : 1;
  const orden = input.orden || 0;

  const [result] = await db.query(
    'INSERT INTO banners (imagen, titulo, subtitulo, link, activo, orden) VALUES (?, ?, ?, ?, ?, ?)',
    [input.imagen, input.titulo, input.subtitulo || null, input.link || null, activo, orden]
  );
  return result;
}

export async function updateBanner(id: number, input: BannerInput) {
  const activo = input.activo !== undefined ? input.activo : 1;
  const orden = input.orden || 0;

  await db.query(
    'UPDATE banners SET imagen = ?, titulo = ?, subtitulo = ?, link = ?, activo = ?, orden = ? WHERE id = ?',
    [input.imagen, input.titulo, input.subtitulo || null, input.link || null, activo, orden, id]
  );
}

export async function deleteBanner(id: number) {
  await db.query('DELETE FROM banners WHERE id = ?', [id]);
}
