import db from '../config/db';

export async function findUsers() {
  const [result] = await db.query(
    'SELECT id, nombre, email, rol, activo, creado_en, actualizado_en FROM usuarios ORDER BY id DESC'
  );
  return result;
}

export async function insertUser(name: string, email: string, passwordHash: string, role: string) {
  const [result] = await db.query(
    'INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)',
    [name, email, passwordHash, role]
  );
  return result;
}

export async function updateUserWithPassword(name: string, email: string, role: string, passwordHash: string, id: number) {
  const [result] = await db.query(
    'UPDATE usuarios SET nombre = ?, email = ?, rol = ?, password = ? WHERE id = ?',
    [name, email, role, passwordHash, id]
  );
  return result;
}

export async function updateUser(name: string, email: string, role: string, id: number) {
  const [result] = await db.query(
    'UPDATE usuarios SET nombre = ?, email = ?, rol = ? WHERE id = ?',
    [name, email, role, id]
  );
  return result;
}

export async function deactivateUser(id: number) {
  const [result] = await db.query(
    'UPDATE usuarios SET activo = 0, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?',
    [id]
  );
  return result;
}

export async function setActive(active: number, id: number) {
  const [result] = await db.query(
    'UPDATE usuarios SET activo = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?',
    [active, id]
  );
  return result;
}

export async function saveAccountSetupToken(token: string, expiresAt: Date, userId: number) {
  const [result] = await db.query(
    'UPDATE usuarios SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
    [token, expiresAt, userId]
  );
  return result;
}
