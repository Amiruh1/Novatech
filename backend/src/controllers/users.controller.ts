import { Request, Response } from 'express';
import crypto from 'crypto';
import { createUser, deactivateUser, listUsers, updateUser, setUserActivo } from '../services/users.service';
import { sendEmail, buildWelcomeEmail } from '../utils/email.utils';
import db from '../config/db';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function getUsers(_req: Request, res: Response) {
  try {
    const rows = await listUsers();
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}

export async function postUser(req: Request, res: Response) {
  const { nombre, email, password, rol } = req.body as {
    nombre?: string;
    email?: string;
    password?: string;
    rol?: string;
  };

  if (!nombre || !email || !password) {
    return res.status(400).json({ message: 'Nombre, email y contraseña son obligatorios' });
  }

  if (!EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ message: 'Formato de email inválido' });
  }

  if (password.length < 8) {
    return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres' });
  }

  try {
    const result = (await createUser({ nombre, email, password, rol: rol as any })) as { insertId: number };

    const setupToken = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 72 * 60 * 60 * 1000);
    await db.query(
      'UPDATE usuarios SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
      [setupToken, expiry, result.insertId]
    );

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
    const setupLink = `${frontendUrl}/reset-password?token=${setupToken}`;
    const rolFinal = rol || 'cliente';
    const html = buildWelcomeEmail(nombre, email, rolFinal, setupLink);
    sendEmail(email, '🎉 Bienvenido a NovaTech Commerce — Activa tu cuenta', html).catch((err) => {
      console.error('[Email Bienvenida] Error al enviar:', err?.message);
    });

    return res.json({ message: 'Usuario creado exitosamente', id: result.insertId });
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}

export async function putUser(req: Request, res: Response) {
  const id = Number(req.params.id || 0);
  const { nombre, email, rol, password } = req.body;

  if (!id || !nombre || !email) {
    return res.status(400).json({ message: 'Datos inválidos para actualizar' });
  }

  if (!EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ message: 'Formato de email inválido' });
  }

  try {
    await updateUser(id, { nombre, email, rol, password });
    return res.json({ message: 'Usuario actualizado correctamente' });
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}

export async function removeUser(req: Request, res: Response) {
  const id = Number(req.params.id || 0);

  if (!id) {
    return res.status(400).json({ message: 'ID inválido' });
  }

  try {
    await deactivateUser(id);
    return res.json({ message: 'Usuario desactivado correctamente' });
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}

export async function patchUserActivo(req: Request, res: Response) {
  const id = Number(req.params.id || 0);
  const { activo } = req.body as { activo?: boolean };

  if (!id) return res.status(400).json({ message: 'ID inválido' });
  if (activo === undefined || activo === null) {
    return res.status(400).json({ message: 'El campo activo es obligatorio' });
  }

  try {
    await setUserActivo(id, Boolean(activo));
    return res.json({ message: activo ? 'Usuario reactivado' : 'Usuario desactivado' });
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}
