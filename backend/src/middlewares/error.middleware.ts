import { NextFunction, Request, Response } from 'express';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ message: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) {
    return next(err);
  }

  const status = (err as { status?: number })?.status || 500;
  const message = (err as { message?: string })?.message || 'Error interno del servidor';

  return res.status(status).json({ message });
}
