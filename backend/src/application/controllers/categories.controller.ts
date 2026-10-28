import { Request, Response } from 'express';
import { listCategoriasFull, createCategoria, updateCategoria, deleteCategoria } from '../../business/services/categories.service';

function generateSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}

export async function getCategoriesFull(req: Request, res: Response) {
  try {
    const rows = await listCategoriasFull();
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}

export async function postCategory(req: Request, res: Response) {
  const { nombre, descripcion, imagen, activo, orden } = req.body;
  if (!nombre) {
    return res.status(400).json({ message: 'El nombre es obligatorio' });
  }
  
  try {
    const result = await createCategoria({
      nombre,
      slug: generateSlug(nombre),
      descripcion,
      imagen,
      activo,
      orden
    });
    return res.json({ message: 'Categoría creada exitosamente', id: (result as any).insertId });
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}

export async function putCategory(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID Inválido' });

  const { nombre, descripcion, imagen, activo, orden } = req.body;
  
  try {
    const payload: any = { descripcion, imagen, activo, orden };
    if (nombre) {
      payload.nombre = nombre;
      payload.slug = generateSlug(nombre);
    }
    
    Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

    await updateCategoria(id, payload);
    return res.json({ message: 'Categoría actualizada exitosamente' });
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}

export async function removeCategory(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID Inválido' });

  try {
    await deleteCategoria(id);
    return res.json({ message: 'Categoría eliminada exitosamente' });
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}
