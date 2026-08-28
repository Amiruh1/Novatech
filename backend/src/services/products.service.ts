import db from '../config/db';

export interface ProductInput {
  nombre: string;
  descripcion?: string;
  precio: number;
  precio_compra?: number | null;
  precio_oferta?: number | null;
  stock: number;
  stock_minimo?: number;
  categoria?: string;
  marca?: string;
  imagen?: string;
  sku?: string;
  destacado?: boolean;
  categoria_id?: number | null;
  subcategoria_id?: number | null;
  marca_id?: number | null;
}

const CATALOG_COLUMNS = `
  id, sku, nombre, descripcion,
  precio, precio_oferta, stock,
  categoria, subcategoria, marca,
  imagen, activo, destacado,
  creado_en, actualizado_en
`;

export async function listProducts(options: { query?: string; categoria?: string; marca?: string; subcategoria?: string; soloDisponibles?: boolean; destacados?: boolean; conOferta?: boolean; precioMin?: number; precioMax?: number; orden?: string; limit?: number; offset?: number } = {}) {
  let sql = `SELECT ${CATALOG_COLUMNS} FROM vw_productos_catalogo WHERE activo = 1`;
  const params: any[] = [];
  let countSql = `SELECT COUNT(*) as total FROM vw_productos_catalogo WHERE activo = 1`;
  const countParams: any[] = [];

  const addCondition = (cond: string, vals: any[]) => {
    sql += ` AND (${cond})`;
    countSql += ` AND (${cond})`;
    params.push(...vals);
    countParams.push(...vals);
  };

  if (options.query) {
    const q = `%${options.query}%`;
    addCondition(`nombre LIKE ? OR descripcion LIKE ? OR sku LIKE ?`, [q, q, q]);
  }

  if (options.categoria && options.categoria !== 'Todas') {
    addCondition(`categoria = ?`, [options.categoria]);
  }

  if (options.subcategoria) {
    addCondition(`subcategoria = ?`, [options.subcategoria]);
  }

  if (options.marca && options.marca !== 'Todas') {
    addCondition(`marca = ?`, [options.marca]);
  }

  if (options.soloDisponibles) {
    addCondition(`stock > 0`, []);
  }

  if (options.destacados) {
    addCondition(`destacado = 1`, []);
  }

  if (options.conOferta) {
    addCondition(`precio_oferta IS NOT NULL AND precio_oferta > 0 AND precio_oferta < precio`, []);
  }

  if (options.precioMin !== undefined && options.precioMin > 0) {
    addCondition(`COALESCE(precio_oferta, precio) >= ?`, [options.precioMin]);
  }

  if (options.precioMax !== undefined && options.precioMax > 0) {
    addCondition(`COALESCE(precio_oferta, precio) <= ?`, [options.precioMax]);
  }

  if (options.orden === 'precio_asc') {
    sql += ` ORDER BY COALESCE(precio_oferta, precio) ASC`;
  } else if (options.orden === 'precio_desc') {
    sql += ` ORDER BY COALESCE(precio_oferta, precio) DESC`;
  } else if (options.orden === 'az') {
    sql += ` ORDER BY nombre ASC`;
  } else if (options.orden === 'recientes') {
    sql += ` ORDER BY creado_en DESC`;
  } else {
    sql += ` ORDER BY destacado DESC, id DESC`;
  }

  if (options.limit !== undefined && options.offset !== undefined) {
    sql += ` LIMIT ? OFFSET ?`;
    params.push(options.limit, options.offset);
  }

  const [countRows] = await db.query(countSql, countParams);
  const total = (countRows as any[])[0].total;

  const [rows] = await db.query(sql, params);
  
  return { data: rows, total };
}

export async function listSubcategories() {
  const [rows] = await db.query(
    `SELECT sc.id, sc.nombre, sc.slug, c.nombre AS categoria_nombre
     FROM subcategorias sc
     JOIN categorias c ON c.id = sc.categoria_id
     WHERE sc.activo = 1
     ORDER BY c.orden ASC, sc.orden ASC`
  );
  return rows;
}

export async function listBrands() {
  const [rows] = await db.query(
    `SELECT id, nombre, slug FROM marcas WHERE activo = 1 ORDER BY nombre ASC`
  );
  return rows;
}

export async function listCategoryNames() {
  const [rows] = await db.query(
    'SELECT DISTINCT nombre FROM categorias WHERE activo = 1 ORDER BY nombre ASC'
  );

  return (rows as Array<{ nombre: string }>).map((row) => row.nombre);
}

export async function createProduct(input: ProductInput) {
  const [result] = await db.query(
    `INSERT INTO productos (sku, nombre, descripcion, precio, precio_compra, precio_oferta, stock, stock_minimo, categoria, marca, imagen, destacado, categoria_id, subcategoria_id, marca_id, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      input.sku || null,
      input.nombre,
      input.descripcion || null,
      Number(input.precio || 0),
      input.precio_compra != null ? Number(input.precio_compra) : null,
      input.precio_oferta != null ? Number(input.precio_oferta) : null,
      Number(input.stock || 0),
      Number(input.stock_minimo || 0),
      input.categoria || 'General',
      input.marca || 'NovaTech',
      input.imagen || null,
      input.destacado ? 1 : 0,
      input.categoria_id || null,
      input.subcategoria_id || null,
      input.marca_id || null
    ]
  );

  return result;
}

export async function updateProduct(id: number, input: ProductInput) {
  await db.query(
    `UPDATE productos
     SET sku = ?, nombre = ?, descripcion = ?, precio = ?, precio_compra = ?, precio_oferta = ?, stock = ?, stock_minimo = ?, categoria = ?, marca = ?, imagen = ?, destacado = ?, categoria_id = ?, subcategoria_id = ?, marca_id = ?, actualizado_en = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      input.sku || null,
      input.nombre,
      input.descripcion || null,
      Number(input.precio || 0),
      input.precio_compra != null ? Number(input.precio_compra) : null,
      input.precio_oferta != null ? Number(input.precio_oferta) : null,
      Number(input.stock || 0),
      Number(input.stock_minimo || 0),
      input.categoria || 'General',
      input.marca || 'NovaTech',
      input.imagen || null,
      input.destacado ? 1 : 0,
      input.categoria_id || null,
      input.subcategoria_id || null,
      input.marca_id || null,
      id
    ]
  );
}

export async function updateProductStock(id: number, stock: number) {
  await db.query(
    'UPDATE productos SET stock = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?',
    [Number(stock || 0), id]
  );
}

export async function deleteProduct(id: number) {
  await db.query('DELETE FROM productos WHERE id = ?', [id]);
}
