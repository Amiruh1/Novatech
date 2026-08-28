import db from '../src/config/db';

async function migrate() {
    try {
        console.log('Migrando tabla usuarios...');
        await db.query(`
            ALTER TABLE usuarios 
            ADD COLUMN tipo_documento VARCHAR(20) DEFAULT NULL,
            ADD COLUMN numero_documento VARCHAR(50) DEFAULT NULL,
            ADD UNIQUE INDEX idx_num_doc (numero_documento);
        `);
        console.log('Migración completada con éxito.');
    } catch (error: any) {
        if (error.code === 'ER_DUP_FIELDNAME') {
            console.log('Las columnas ya existen, saltando migración.');
        } else {
            console.error('Error durante migración:', error);
        }
    } finally {
        process.exit();
    }
}

migrate();
