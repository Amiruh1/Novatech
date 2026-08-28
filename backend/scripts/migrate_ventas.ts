import db from '../src/config/db';

async function migrate() {
  try {
    console.log('Aplicando migracion a ventas...');

    await db.query(`
      ALTER TABLE ventas
      ADD COLUMN tipo_comprobante ENUM('boleta', 'factura') NOT NULL DEFAULT 'boleta',
      ADD COLUMN documento_fiscal VARCHAR(20) NULL,
      ADD COLUMN razon_social VARCHAR(150) NULL;
    `);

    console.log('Migracion exitosa.');
  } catch (err: any) {
    if (err.code === 'ER_DUP_FIELDNAME') {
      console.log('Columnas ya existen. Saltando...');
    } else {
      console.error('Error durante migracion:', err);
    }
  } finally {
    process.exit();
  }
}

migrate();
