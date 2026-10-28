import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { isAccountActive } from '../services/auth.service';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    rol: string;
    nombre?: string;
  };
}

export async function verifyToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const jwtSecret = process.env.JWT_SECRET;

  if (!token) {
    return res.status(401).json({ message: 'Token requerido' });
  }

  if (!jwtSecret) {
    return res.status(500).json({ message: 'Configuracion incompleta: JWT_SECRET no definido' });
  }

  let decoded: { id: number; rol: string; nombre?: string };
  try {
    decoded = jwt.verify(token, jwtSecret) as typeof decoded;
  } catch {
    return res.status(401).json({ message: 'Token invalido o expirado' });
  }

  try {
    if (!(await isAccountActive(decoded.id))) {
      return res.status(401).json({ message: 'Cuenta desactivada o inexistente' });
    }
  } catch {
    return res.status(500).json({ message: 'Error de autenticacion' });
  }

  req.user = { id: decoded.id, rol: decoded.rol, nombre: decoded.nombre };
  return next();
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: 'No autenticado' });
  }

  if (req.user.rol !== 'admin') {
    return res.status(403).json({ message: 'Permisos insuficientes' });
  }

  return next();
}
