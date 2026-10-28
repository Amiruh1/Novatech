import type { Pool, RowDataPacket } from 'mysql2/promise';

export async function ensureProductionSchema(pool: Pool) {
  const [columns] = await pool.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categorias' AND COLUMN_NAME = 'imagen'`
  );
  if (!columns.length) await pool.query('ALTER TABLE categorias ADD COLUMN imagen VARCHAR(500) NULL');

  const [tables] = await pool.query<RowDataPacket[]>(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'banners'`
  );
  if (tables.length) return;

  await pool.query(`CREATE TABLE banners (
    id INT AUTO_INCREMENT PRIMARY KEY,
    imagen VARCHAR(1000) NOT NULL,
    titulo VARCHAR(255) NOT NULL,
    subtitulo VARCHAR(500) NULL,
    link VARCHAR(255) NULL,
    activo TINYINT(1) DEFAULT 1,
    orden INT DEFAULT 0,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);
  await pool.query(`INSERT INTO banners (imagen, titulo, subtitulo, link, orden, activo) VALUES
    (?, ?, ?, ?, 1, 1), (?, ?, ?, ?, 2, 1)`, [
    'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?q=80&w=2071&auto=format&fit=crop',
    'Descubre lo último en Tecnología',
    'Aprovecha nuestras ofertas exclusivas en laptops de última generación.', '/tienda?categoria=Computo',
    'https://images.unsplash.com/photo-1542393545-10f5cde2c810?q=80&w=1965&auto=format&fit=crop',
    'Periféricos Gamer Premium',
    'Eleva tu nivel de juego con accesorios de alta precisión.', '/tienda?categoria=Perifericos',
  ]);
}
