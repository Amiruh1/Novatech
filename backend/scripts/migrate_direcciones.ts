import db from '../src/config/db';

async function migrate() {
    try {
        console.log('Creando tabla de direcciones...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS direcciones (
                id INT AUTO_INCREMENT PRIMARY KEY,
                id_usuario INT UNSIGNED NOT NULL,
                alias VARCHAR(50) NOT NULL,
                destinatario VARCHAR(100) NOT NULL,
                direccion_detallada VARCHAR(255) NOT NULL,
                distrito VARCHAR(100) NOT NULL,
                provincia VARCHAR(100) NOT NULL,
                codigo_postal VARCHAR(20) DEFAULT NULL,
                referencias TEXT,
                predeterminada BOOLEAN DEFAULT FALSE,
                creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
                actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE CASCADE
            );
        `);
        console.log('Migración completada.');
    } catch (error: any) {
        console.error('Error:', error);
    } finally {
        process.exit();
    }
}

migrate();
