import { Request, Response } from 'express';
import { listMarcas, createMarca, updateMarca, deleteMarca } from '../../business/services/marcas.service';

export async function getMarcas(req: Request, res: Response) {
  try {
    const rows = await listMarcas();
    return res.json(rows);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
}

export async function postMarca(req: Request, res: Response) {
  const { nombre, activo } = req.body;
  if (!nombre) return res.status(400).json({ message: 'El nombre es obligatorio' });
  try {
    const result = await createMarca({ nombre, activo }) as any;
    return res.status(201).json({ message: 'Marca creada', id: result.insertId });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
}

export async function putMarca(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  try {
    await updateMarca(id, req.body);
    return res.json({ message: 'Marca actualizada' });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
}

export async function deleteMarcaCtrl(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  try {
    await deleteMarca(id);
    return res.json({ message: 'Marca eliminada' });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
}
