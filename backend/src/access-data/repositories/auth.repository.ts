import db from '../config/db';

export async function findActiveAccount(userId: number) {
  const [rows] = await db.query(
    'SELECT id FROM usuarios WHERE id = ? AND activo = 1 LIMIT 1',
    [userId]
  );
  return rows as Array<{ id: number }>;
}

export async function findLoginUser(email: string) {
  const [result] = await db.query(
    'SELECT id, nombre, email, rol, password, telefono, tipo_documento, numero_documento FROM usuarios WHERE email = ? AND activo = 1 LIMIT 1',
    [email]
  );
  return result;
}

export async function updatePassword(passwordHash: string, userId: number) {
  const [result] = await db.query(
    'UPDATE usuarios SET password = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?',
    [passwordHash, userId]
  );
  return result;
}

export async function findRegistrationConflicts(email: string, documentNumber: string) {
  const [result] = await db.query(
    'SELECT email, numero_documento FROM usuarios WHERE email = ? OR numero_documento = ?',
    [email, documentNumber]
  );
  return result;
}

export async function insertCustomer(
  name: string,
  email: string,
  passwordHash: string,
  role: string,
  documentType: string,
  documentNumber: string
) {
  const [result] = await db.query(
    'INSERT INTO usuarios (nombre, email, password, rol, activo, tipo_documento, numero_documento) VALUES (?, ?, ?, ?, 1, ?, ?)',
    [name, email, passwordHash, role, documentType, documentNumber]
  );
  return result;
}

export async function findActiveUserId(email: string) {
  const [result] = await db.query(
    'SELECT id FROM usuarios WHERE email = ? AND activo = 1 LIMIT 1',
    [email]
  );
  return result;
}

export async function setResetToken(tokenHash: string, expiresAt: Date, userId: number) {
  const [result] = await db.query(
    'UPDATE usuarios SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
    [tokenHash, expiresAt, userId]
  );
  return result;
}

export async function findResetCodeUser(email: string) {
  const [result] = await db.query(
    'SELECT id, reset_token, reset_token_expires FROM usuarios WHERE email = ? AND activo = 1 LIMIT 1',
    [email]
  );
  return result;
}

export async function replacePasswordAndClearReset(passwordHash: string, userId: number) {
  const [result] = await db.query(
    'UPDATE usuarios SET password = ?, reset_token = NULL, reset_token_expires = NULL, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?',
    [passwordHash, userId]
  );
  return result;
}

export async function findGoogleUser(email: string) {
  const [result] = await db.query(
    'SELECT id, nombre, email, rol, telefono, tipo_documento, numero_documento FROM usuarios WHERE email = ? AND activo = 1 LIMIT 1',
    [email]
  );
  return result;
}

export async function insertGoogleCustomer(name: string, email: string, passwordHash: string, role: string, documentType: string) {
  const [result] = await db.query(
    'INSERT INTO usuarios (nombre, email, password, rol, activo, tipo_documento) VALUES (?, ?, ?, ?, 1, ?)',
    [name, email, passwordHash, role, documentType]
  );
  return result;
}

export async function findResetTokenUser(tokenHash: string) {
  const [result] = await db.query(
    'SELECT id, reset_token_expires FROM usuarios WHERE reset_token = ? AND activo = 1 LIMIT 1',
    [tokenHash]
  );
  return result;
}

export async function findPasswordUser(userId: number) {
  const [result] = await db.query(
    'SELECT password FROM usuarios WHERE id = ? AND activo = 1 LIMIT 1',
    [userId]
  );
  return result;
}

export async function findProfile(userId: number) {
  const [result] = await db.query(
    'SELECT email, numero_documento FROM usuarios WHERE id = ?',
    [userId]
  );
  return result;
}

export async function findEmailConflict(email: string, userId: number) {
  const [result] = await db.query(
    'SELECT id FROM usuarios WHERE email = ? AND id != ?',
    [email, userId]
  );
  return result;
}

export async function updateProfile(
  name: string,
  phone: string | null,
  email: string,
  documentType: string | null,
  documentNumber: string | null,
  userId: number
) {
  const [result] = await db.query(
    `UPDATE usuarios
       SET nombre = ?,
           telefono = ?,
           email = ?,
           tipo_documento = COALESCE(tipo_documento, ?),
           numero_documento = COALESCE(numero_documento, ?),
           actualizado_en = CURRENT_TIMESTAMP
       WHERE id = ?`,
    [name, phone, email, documentType, documentNumber, userId]
  );
  return result;
}
