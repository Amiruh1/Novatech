import * as usersRepository from '../repositories/users.repository';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export interface UserInput {
  nombre: string;
  email: string;
  password?: string;
  rol?: 'admin' | 'cliente';
}

export async function listUsers() {
  const rows = await usersRepository.findUsers();
  return rows;
}

export async function createUser(input: UserInput) {
  const rol = input.rol || 'cliente';
  if (!input.password || input.password.trim().length < 8) {
    throw new Error('La contraseña es obligatoria y debe tener al menos 8 caracteres');
  }
  const hash = await bcrypt.hash(input.password.trim(), 10);

  const result = await usersRepository.insertUser(input.nombre, input.email, hash, rol);

  return result;
}

export async function updateUser(id: number, input: UserInput) {
  if (input.password && input.password.trim().length >= 8) {
    const hash = await bcrypt.hash(input.password.trim(), 10);
    await usersRepository.updateUserWithPassword(input.nombre, input.email, input.rol || 'cliente', hash, id);
  } else {
    await usersRepository.updateUser(input.nombre, input.email, input.rol || 'cliente', id);
  }
}

export async function deactivateUser(id: number) {
  await usersRepository.deactivateUser(id);
}

export async function setUserActivo(id: number, activo: boolean) {
  await usersRepository.setActive(activo ? 1 : 0, id);
}

export async function issueAccountSetupToken(userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  await usersRepository.saveAccountSetupToken(tokenHash, expiresAt, userId);
  return token;
}
