import db from '../src/access-data/config/db';

async function migrate() {
    try {
        console.log('Añadiendo columnas de reseteo de password...');
        await db.query(`
            ALTER TABLE usuarios 
            ADD COLUMN reset_token VARCHAR(255) DEFAULT NULL,
            ADD COLUMN reset_token_expires DATETIME DEFAULT NULL;
        `);
        console.log('Migración completada.');
    } catch (error: any) {
        if (error.code === 'ER_DUP_FIELDNAME') {
            console.log('Las columnas ya existen, saltando.');
        } else {
            console.error('Error:', error);
        }
    } finally {
        process.exit();
    }
}

migrate();
