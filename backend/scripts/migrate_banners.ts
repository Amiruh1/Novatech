import db from '../src/access-data/config/db';

async function up() {
  console.log('[Migración] Iniciando migración de Banners Promocionales...');

  try {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS banners (
        id INT AUTO_INCREMENT PRIMARY KEY,
        imagen VARCHAR(1000) NOT NULL,
        titulo VARCHAR(255) NOT NULL,
        subtitulo VARCHAR(500) NULL,
        link VARCHAR(255) NULL,
        activo TINYINT(1) DEFAULT 1,
        orden INT DEFAULT 0,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `;

    await db.query(createTableQuery);
    console.log('[Migración] Tabla "banners" creada o ya existe.');

    const [rows]: any = await db.query('SELECT COUNT(*) as cuenta FROM banners');
    if (rows[0].cuenta === 0) {
      console.log('[Migración] Insertando banners iniciales...');
      await db.query(`
        INSERT INTO banners (imagen, titulo, subtitulo, link, orden, activo) VALUES
        ('https://images.unsplash.com/photo-1496181133206-80ce9b88a853?q=80&w=2071&auto=format&fit=crop', 'Descubre lo último en Tecnología', 'Aprovecha nuestras ofertas exclusivas en laptops de última generación.', '/tienda?categoria=Computo', 1, 1),
        ('https://images.unsplash.com/photo-1542393545-10f5cde2c810?q=80&w=1965&auto=format&fit=crop', 'Periféricos Gamer Premium', 'Eleva tu nivel de juego con accesorios de alta precisión.', '/tienda?categoria=Perifericos', 2, 1)
      `);
      console.log('[Migración] Banners default insertados exitosamente.');
    } else {
      console.log('[Migración] La tabla banners ya contiene datos. Saltando inserción o seed.');
    }

    console.log('[Migración] Completada con exito.');
    process.exit(0);
  } catch (error) {
    console.error('[Migración] Error ejecutando la migración:', error);
    process.exit(1);
  }
}

up();
