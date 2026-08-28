import db from '../config/db';

export interface DireccionInput {
  alias: string;
  destinatario: string;
  direccion_detallada: string;
  distrito: string;
  provincia: string;
  codigo_postal?: string;
  referencias?: string;
  predeterminada?: boolean;
}

export async function getDirecciones(idUsuario: number) {
  const [rows] = await db.query(
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
    [idUsuario]
  );
  return rows;
}

export async function createDireccion(idUsuario: number, input: DireccionInput) {
  if (input.predeterminada) {
    await db.query(
      'UPDATE direcciones_usuario SET predeterminada = 0 WHERE usuario_id = ?',
      [idUsuario]
    );
  }

  const [result] = await db.query(
    `INSERT INTO direcciones_usuario
       (usuario_id, alias, destinatario, direccion_linea1, distrito, provincia, codigo_postal, referencia, predeterminada)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      idUsuario,
      input.alias,
      input.destinatario,
      input.direccion_detallada,
      input.distrito,
      input.provincia,
      input.codigo_postal || null,
      input.referencias || null,
      input.predeterminada ? 1 : 0
    ]
  );
  return result;
}

export async function updateDireccion(id: number, idUsuario: number, input: DireccionInput) {
  if (input.predeterminada) {
    await db.query(
      'UPDATE direcciones_usuario SET predeterminada = 0 WHERE usuario_id = ?',
      [idUsuario]
    );
  }

  await db.query(
    `UPDATE direcciones_usuario
     SET alias = ?, destinatario = ?, direccion_linea1 = ?, distrito = ?,
         provincia = ?, codigo_postal = ?, referencia = ?, predeterminada = ?
     WHERE id = ? AND usuario_id = ?`,
    [
      input.alias,
      input.destinatario,
      input.direccion_detallada,
      input.distrito,
      input.provincia,
      input.codigo_postal || null,
      input.referencias || null,
      input.predeterminada ? 1 : 0,
      id,
      idUsuario
    ]
  );
}

export async function deleteDireccion(id: number, idUsuario: number) {
  await db.query(
    'UPDATE direcciones_usuario SET activo = 0 WHERE id = ? AND usuario_id = ?',
    [id, idUsuario]
  );
}
