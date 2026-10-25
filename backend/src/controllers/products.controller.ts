import { Request, Response } from 'express';
import {
  createProduct,
  deleteProduct,
  listCategoryNames,
  listProducts,
  listSubcategories,
  listBrands,
  updateProduct,
  updateProductStock
} from '../services/products.service';
import db from '../config/db';

const PUBLIC_PRODUCT_COLUMNS = `
  id, sku, nombre, slug, descripcion, categoria_id, subcategoria_id, marca_id,
  categoria, marca, precio, precio_oferta, stock, imagen, galeria_json,
  activo, destacado, creado_en, actualizado_en
`;

function parsePrice(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 99999999.99) {
    return null;
  }

  return Number(parsed.toFixed(2));
}

function parseStock(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed) || parsed > 2147483647) {
    return null;
  }

  return parsed;
}

export async function getProductById(req: Request, res: Response) {
  const id = Number(req.params['id']);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: 'ID de producto inválido.' });
  }
  try {
    const [rows]: any = await db.query(`SELECT ${PUBLIC_PRODUCT_COLUMNS} FROM productos WHERE id = ?`, [id]);
    const producto = Array.isArray(rows) ? rows[0] : null;
    if (!producto) {
      return res.status(404).json({ message: 'Producto no encontrado.' });
    }
    return res.json({ producto });
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}

export async function getProducts(req: Request, res: Response) {
  try {
    const q = req.query.q as string | undefined;
    const limitParams = req.query.limit ? Number(req.query.limit) : undefined;
    const pageParams = req.query.page ? Number(req.query.page) : undefined;
    const categoria = req.query.categoria as string | undefined;
    const subcategoria = req.query.subcategoria as string | undefined;
    const marca = req.query.marca as string | undefined;
    const orden = req.query.orden as string | undefined;
    const soloDisponibles = req.query.soloDisponibles === 'true';
    const destacados = req.query.destacados === 'true';
    const conOferta = req.query.conOferta === 'true';
    const precioMin = req.query.precioMin ? Number(req.query.precioMin) : undefined;
    const precioMax = req.query.precioMax ? Number(req.query.precioMax) : undefined;

    let options: any = { categoria, subcategoria, marca, orden, soloDisponibles, destacados, conOferta, precioMin, precioMax };
    if (q) options.query = q;
    
    if (limitParams && pageParams) {
      options.limit = limitParams;
      options.offset = (pageParams - 1) * limitParams;
    } else if (limitParams) {
      options.limit = limitParams;
      options.offset = 0;
    }

    const rows = await listProducts(options);
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}

export async function getSubcategories(req: Request, res: Response) {
  try {
    const rows = await listSubcategories();
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}

export async function getBrands(req: Request, res: Response) {
  try {
    const rows = await listBrands();
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}

export async function getCategories(req: Request, res: Response) {
  try {
    const rows = await listCategoryNames();
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}

export async function postProduct(req: Request, res: Response) {
  const { nombre, descripcion, precio, precio_compra, precio_oferta, stock, stock_minimo, categoria, marca, imagen, sku, destacado, categoria_id, subcategoria_id, marca_id } = req.body;
  const precioParsed        = parsePrice(precio);
  const precioCompraParsed  = precio_compra != null ? parsePrice(precio_compra) : null;
  const precioOfertaParsed  = precio_oferta ? parsePrice(precio_oferta) : null;
  const stockParsed         = parseStock(stock ?? 0);

  if (!nombre || precio === undefined) {
    return res.status(400).json({ message: 'Nombre y precio son obligatorios' });
  }

  if (precioParsed === null || stockParsed === null) {
    return res.status(400).json({ message: 'Precio/stock invalidos' });
  }

  try {
    const result = (await createProduct({
      nombre,
      descripcion,
      precio: precioParsed,
      precio_compra: precioCompraParsed,
      precio_oferta: precioOfertaParsed,
      stock: stockParsed,
      stock_minimo: Number(stock_minimo || 0),
      categoria,
      marca,
      imagen,
      sku,
      destacado: !!destacado,
      categoria_id: categoria_id || null,
      subcategoria_id: subcategoria_id || null,
      marca_id: marca_id || null
    })) as { insertId: number };

    return res.json({ message: 'Producto creado', id: result.insertId });
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}

export async function putProduct(req: Request, res: Response) {
  const id = Number(req.params.id || 0);
  const { nombre, descripcion, precio, precio_compra, precio_oferta, stock, stock_minimo, categoria, marca, imagen, sku, destacado, categoria_id, subcategoria_id, marca_id } = req.body;
  const precioParsed        = parsePrice(precio);
  const precioCompraParsed  = precio_compra != null ? parsePrice(precio_compra) : null;
  const precioOfertaParsed  = precio_oferta ? parsePrice(precio_oferta) : null;
  const stockParsed         = parseStock(stock ?? 0);

  if (!id || !nombre || precio === undefined) {
    return res.status(400).json({ message: 'Datos invalidos para actualizar producto' });
  }

  if (precioParsed === null || stockParsed === null) {
    return res.status(400).json({ message: 'Precio/stock invalidos' });
  }

  try {
    await updateProduct(id, {
      nombre,
      descripcion,
      precio: precioParsed,
      precio_compra: precioCompraParsed,
      precio_oferta: precioOfertaParsed,
      stock: stockParsed,
      stock_minimo: Number(stock_minimo || 0),
      categoria,
      marca,
      imagen,
      sku,
      destacado: !!destacado,
      categoria_id: categoria_id || null,
      subcategoria_id: subcategoria_id || null,
      marca_id: marca_id || null
    });

    return res.json({ message: 'Producto actualizado' });
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}

export async function adjustStock(req: Request, res: Response) {
  const id = Number(req.params.id || 0);
  const { stock, motivo } = req.body;
  const userId = (req as any).user?.id || null;
  const stockParsed = parseStock(stock);

  if (!id || stock === undefined) {
    return res.status(400).json({ message: 'ID y stock son obligatorios' });
  }

  if (stockParsed === null) {
    return res.status(400).json({ message: 'Stock invalido. Debe ser entero no negativo' });
  }

  if (!motivo || typeof motivo !== 'string' || motivo.trim().length < 3) {
    return res.status(400).json({ message: 'El motivo del ajuste es obligatorio (min 3 caracteres)' });
  }

  try {
    const [current] = await db.query('SELECT stock FROM productos WHERE id = ?', [id]);
    const stockAnterior = (current as any[])[0]?.stock ?? 0;

    await updateProductStock(id, stockParsed);

    await db.query(
      `INSERT INTO inventario_movimientos (producto_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, usuario_id)
       VALUES (?, 'AJUSTE', ?, ?, ?, ?, ?)`,
      [id, Math.abs(stockParsed - stockAnterior), stockAnterior, stockParsed, motivo.trim(), userId]
    );

    return res.json({ message: 'Stock ajustado', stock_anterior: stockAnterior, stock_nuevo: stockParsed });
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}

export async function putProductStock(req: Request, res: Response) {
  const id = Number(req.params.id || 0);
  const { stock } = req.body;
  const stockParsed = parseStock(stock);

  if (!id || stock === undefined) {
    return res.status(400).json({ message: 'ID y stock son obligatorios' });
  }

  if (stockParsed === null) {
    return res.status(400).json({ message: 'Stock invalido. Debe ser entero no negativo' });
  }

  try {
    await updateProductStock(id, stockParsed);
    return res.json({ message: 'Stock actualizado' });
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}

export async function removeProduct(req: Request, res: Response) {
  const id = Number(req.params.id || 0);

  if (!id) {
    return res.status(400).json({ message: 'ID invalido' });
  }

  try {
    await deleteProduct(id);
    return res.json({ message: 'Producto eliminado' });
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}

export async function getProductMovements(req: Request, res: Response) {
  const id = Number(req.params.id || 0);

  if (!id) {
    return res.status(400).json({ message: 'ID de producto invalido' });
  }

  try {
    const [rows] = await db.query(
      `SELECT m.*, u.nombre as usuario_nombre
       FROM inventario_movimientos m
       LEFT JOIN usuarios u ON m.usuario_id = u.id
       WHERE m.producto_id = ?
       ORDER BY m.creado_en DESC`,
      [id]
    );

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}
