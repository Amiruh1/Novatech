import db from '../config/db';

export async function findAddresses(userId: number) {
  const [result] = await db.query(
    `SELECT
       id,
       usuario_id AS id_usuario,
       alias,
       destinatario,
       direccion_linea1 AS direccion_detallada,
       direccion_linea2,
       distrito,
       provincia,
       departamento,
       codigo_postal,
       referencia AS referencias,
       predeterminada
     FROM direcciones_usuario
     WHERE usuario_id = ? AND activo = 1
     ORDER BY predeterminada DESC, creado_en DESC`,
    [userId]
  );
  return result;
}

export async function clearDefaultAddress(userId: number) {
  const [result] = await db.query(
    'UPDATE direcciones_usuario SET predeterminada = 0 WHERE usuario_id = ?',
    [userId]
  );
  return result;
}

export async function insertAddress(
  userId: number,
  alias: string,
  recipient: string,
  address: string,
  district: string,
  province: string,
  postalCode: string | null,
  reference: string | null,
  isDefault: number
) {
  const [result] = await db.query(
    `INSERT INTO direcciones_usuario
       (usuario_id, alias, destinatario, direccion_linea1, distrito, provincia, codigo_postal, referencia, predeterminada)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, alias, recipient, address, district, province, postalCode, reference, isDefault]
  );
  return result;
}

export async function updateAddress(
  alias: string,
  recipient: string,
  address: string,
  district: string,
  province: string,
  postalCode: string | null,
  reference: string | null,
  isDefault: number,
  id: number,
  userId: number
) {
  const [result] = await db.query(
    `UPDATE direcciones_usuario
     SET alias = ?, destinatario = ?, direccion_linea1 = ?, distrito = ?,
         provincia = ?, codigo_postal = ?, referencia = ?, predeterminada = ?
     WHERE id = ? AND usuario_id = ?`,
    [alias, recipient, address, district, province, postalCode, reference, isDefault, id, userId]
  );
  return result;
}

export async function deactivateAddress(id: number, userId: number) {
  const [result] = await db.query(
    'UPDATE direcciones_usuario SET activo = 0 WHERE id = ? AND usuario_id = ?',
    [id, userId]
  );
  return result;
}
