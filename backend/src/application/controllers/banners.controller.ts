import { Request, Response } from 'express';
import { listBanners, createBanner, updateBanner, deleteBanner, BannerInput } from '../../business/services/banners.service';

export async function getBanners(req: Request, res: Response) {
  try {
    const activeOnly = req.query.activos === 'true';
    const rows = await listBanners(activeOnly);
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}

export async function postBanner(req: Request, res: Response) {
  const { imagen, titulo, subtitulo, link, activo, orden } = req.body as BannerInput;

  if (!imagen || !titulo) {
    return res.status(400).json({ message: 'Imagen y titulo son obligatorios' });
  }

  try {
    const result = await createBanner({ imagen, titulo, subtitulo, link, activo, orden }) as any;
    return res.json({ message: 'Banner creado exitosamente', id: result.insertId });
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}

export async function putBanner(req: Request, res: Response) {
  const id = Number(req.params.id || 0);
  const { imagen, titulo, subtitulo, link, activo, orden } = req.body as BannerInput;

  if (!id || !imagen || !titulo) {
    return res.status(400).json({ message: 'Datos incompletos para actualizar (se requiere ID, imagen, titulo)' });
  }

  try {
    await updateBanner(id, { imagen, titulo, subtitulo, link, activo, orden });
    return res.json({ message: 'Banner actualizado correctamente' });
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}

export async function removeBanner(req: Request, res: Response) {
  const id = Number(req.params.id || 0);

  if (!id) {
    return res.status(400).json({ message: 'ID inválido' });
  }

  try {
    await deleteBanner(id);
    return res.json({ message: 'Banner eliminado correctamente' });
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}
