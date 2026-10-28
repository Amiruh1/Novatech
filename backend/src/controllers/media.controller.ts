import type { Request, Response } from 'express';
import { pipeline } from 'node:stream/promises';
import { getImage, imageSizeGuard, InvalidImageError, uploadImage } from '../services/media.service';

export async function getPublicImage(req: Request, res: Response) {
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  try {
    const image = await getImage(String(req.params.filename || ''));
    if (!image) return res.status(404).json({ message: 'Imagen no encontrada.' });
    res.set({ 'Content-Type': image.contentType, 'Content-Length': String(image.contentLength),
      'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
    if (image.etag && /^"[a-f0-9-]+"$/i.test(image.etag)) res.set('ETag', image.etag);
    if (image.etag && req.get('if-none-match') === image.etag) {
      image.body.destroy();
      return res.status(304).end();
    }
    if (req.method === 'HEAD') { image.body.destroy(); return res.end(); }
    await pipeline(image.body, imageSizeGuard(image.contentLength), res);
    return;
  } catch {
    if (res.headersSent || res.destroyed) { res.destroy(); return; }
    res.removeHeader('Content-Length');
    res.removeHeader('Cache-Control');
    return res.status(503).json({ message: 'La imagen no está disponible en este momento.' });
  }
}

export async function postImage(req: Request, res: Response) {
  if (!Buffer.isBuffer(req.body)) {
    return res.status(415).json({ message: 'Selecciona una imagen JPEG, PNG o WebP.' });
  }
  const contentType = (req.get('content-type') || '').split(';')[0].trim().toLowerCase();
  try {
    const image = await uploadImage(req.body, contentType);
    return res.status(201).json(image);
  } catch (error) {
    if (error instanceof InvalidImageError) return res.status(400).json({ message: error.message });
    // Los errores del SDK pueden contener detalles de infraestructura o credenciales.
    console.error('No se pudo guardar la imagen en el almacenamiento.');
    return res.status(503).json({ message: 'No se pudo subir la imagen. Inténtalo de nuevo en unos momentos.' });
  }
}
