import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { getCarrito, getPreferences, saveCarrito, saveComparador, saveFavoritos } from '../../business/services/preferences.service';

export async function getMyPreferences(req: AuthRequest, res: Response) {
  const userId = Number(req.user?.id || 0);

  if (!userId) {
    return res.status(401).json({ message: 'No autenticado' });
  }

  try {
    const data = await getPreferences(userId);
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}

export async function putFavoritos(req: AuthRequest, res: Response) {
  const userId = Number(req.user?.id || 0);
  const { favoritos } = req.body as { favoritos?: unknown };

  if (!userId) {
    return res.status(401).json({ message: 'No autenticado' });
  }

  if (!Array.isArray(favoritos)) {
    return res.status(400).json({ message: 'Favoritos debe ser una lista' });
  }

  try {
    const data = await saveFavoritos(userId, favoritos);
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}

export async function putComparador(req: AuthRequest, res: Response) {
  const userId = Number(req.user?.id || 0);
  const { comparador } = req.body as { comparador?: unknown };

  if (!userId) {
    return res.status(401).json({ message: 'No autenticado' });
  }

  if (!Array.isArray(comparador)) {
    return res.status(400).json({ message: 'Comparador debe ser una lista' });
  }

  try {
    const data = await saveComparador(userId, comparador);
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}

export async function getMyCarrito(req: AuthRequest, res: Response) {
  const userId = Number(req.user?.id || 0);
  if (!userId) return res.status(401).json({ message: 'No autenticado' });

  try {
    const items = await getCarrito(userId);
    return res.json({ carrito: items });
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}

export async function putMyCarrito(req: AuthRequest, res: Response) {
  const userId = Number(req.user?.id || 0);
  if (!userId) return res.status(401).json({ message: 'No autenticado' });

  const { carrito } = req.body as { carrito?: unknown };
  if (!Array.isArray(carrito)) {
    return res.status(400).json({ message: 'Carrito debe ser una lista' });
  }

  try {
    await saveCarrito(userId, carrito);
    return res.json({ message: 'Carrito guardado' });
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}
