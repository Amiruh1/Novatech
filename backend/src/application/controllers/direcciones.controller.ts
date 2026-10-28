import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { getDirecciones, createDireccion, updateDireccion, deleteDireccion } from '../../business/services/direcciones.service';

const CP_PATTERN = /^\d{5}$/;

function validateDireccion(body: Record<string, unknown>): string | null {
  const alias            = String(body.alias            ?? '').trim();
  const destinatario     = String(body.destinatario     ?? '').trim();
  const direccion        = String(body.direccion_detallada ?? '').trim();
  const distrito         = String(body.distrito         ?? '').trim();
  const provincia        = String(body.provincia        ?? '').trim();
  const codigoPostal     = body.codigo_postal !== undefined && body.codigo_postal !== null
                             ? String(body.codigo_postal).trim()
                             : '';

  if (!alias)                    return 'El alias es obligatorio';
  if (alias.length > 80)         return 'El alias no puede superar 80 caracteres';

  if (!destinatario)             return 'El destinatario es obligatorio';
  if (destinatario.length > 120) return 'El destinatario no puede superar 120 caracteres';

  if (!direccion)                return 'La dirección detallada es obligatoria';
  if (direccion.length > 220)    return 'La dirección no puede superar 220 caracteres';

  if (!distrito)                 return 'El distrito es obligatorio';
  if (distrito.length > 80)      return 'El distrito no puede superar 80 caracteres';

  if (!provincia)                return 'La provincia es obligatoria';
  if (provincia.length > 80)     return 'La provincia no puede superar 80 caracteres';

  if (codigoPostal && !CP_PATTERN.test(codigoPostal)) {
    return 'El código postal debe contener exactamente 5 dígitos numéricos';
  }

  return null;
}

export async function listarDirecciones(req: AuthRequest, res: Response) {
  const userId = Number(req.user?.id || 0);
  if (!userId) return res.status(401).json({ message: 'No autenticado' });

  try {
    const data = await getDirecciones(userId);
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
}

export async function agregarDireccion(req: AuthRequest, res: Response) {
  const userId = Number(req.user?.id || 0);
  if (!userId) return res.status(401).json({ message: 'No autenticado' });

  const error = validateDireccion(req.body as Record<string, unknown>);
  if (error) return res.status(400).json({ message: error });

  try {
    await createDireccion(userId, req.body);
    return res.status(201).json({ message: 'Direccion creada' });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
}

export async function editarDireccion(req: AuthRequest, res: Response) {
  const userId = Number(req.user?.id || 0);
  if (!userId) return res.status(401).json({ message: 'No autenticado' });

  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'Id invalido' });

  const error = validateDireccion(req.body as Record<string, unknown>);
  if (error) return res.status(400).json({ message: error });

  try {
    await updateDireccion(id, userId, req.body);
    return res.json({ message: 'Direccion actualizada' });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
}

export async function eliminarDireccion(req: AuthRequest, res: Response) {
  const userId = Number(req.user?.id || 0);
  if (!userId) return res.status(401).json({ message: 'No autenticado' });

  const id = Number(req.params.id);

  try {
    await deleteDireccion(id, userId);
    return res.json({ message: 'Direccion eliminada' });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
}
