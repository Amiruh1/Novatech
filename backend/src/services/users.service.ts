import db from '../config/db';
import bcrypt from 'bcryptjs';

export interface UserInput {
  nombre: string;
  email: string;
  password?: string;
  rol?: 'admin' | 'cliente';
}

export async function listUsers() {
  const [rows] = await db.query(
    'SELECT id, nombre, email, rol, activo, creado_en, actualizado_en FROM usuarios ORDER BY id DESC'
  );
  return rows;
}

export async function createUser(input: UserInput) {
  const rol = input.rol || 'cliente';
  if (!input.password || input.password.trim().length < 8) {
    throw new Error('La contraseña es obligatoria y debe tener al menos 8 caracteres');
  }
  const hash = await bcrypt.hash(input.password.trim(), 10);

  const [result] = await db.query(
    'INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)',
    [input.nombre, input.email, hash, rol]
  );

  return result;
}

export async function updateUser(id: number, input: UserInput) {
  if (input.password && input.password.trim().length >= 8) {
    const hash = await bcrypt.hash(input.password.trim(), 10);
    await db.query(
      'UPDATE usuarios SET nombre = ?, email = ?, rol = ?, password = ? WHERE id = ?',
      [input.nombre, input.email, input.rol || 'cliente', hash, id]
    );
  } else {
    await db.query(
      'UPDATE usuarios SET nombre = ?, email = ?, rol = ? WHERE id = ?',
      [input.nombre, input.email, input.rol || 'cliente', id]
    );
  }
}

export async function deactivateUser(id: number) {
  await db.query(
    'UPDATE usuarios SET activo = 0, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?',
    [id]
  );
}

export async function setUserActivo(id: number, activo: boolean) {
  await db.query(
    'UPDATE usuarios SET activo = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?',
    [activo ? 1 : 0, id]
  );
}
