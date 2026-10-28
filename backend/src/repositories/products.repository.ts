import db from '../config/db';

const CATALOG_COLUMNS = `
  id, sku, nombre, descripcion,
  precio, precio_oferta, stock,
  categoria, subcategoria, marca,
  imagen, activo, destacado,
  creado_en, actualizado_en
`;

export async function searchProducts(
  options: { query?: string; categoria?: string; marca?: string; subcategoria?: string; soloDisponibles?: boolean; destacados?: boolean; conOferta?: boolean; precioMin?: number; precioMax?: number; orden?: string; limit?: number; offset?: number } = {}
) {
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

export async function findCatalogProductsByIds(ids: number[]) {
  const [result] = await db.query(
    `SELECT ${CATALOG_COLUMNS} FROM vw_productos_catalogo WHERE activo = 1 AND id IN (?)`,
    [ids]
  );
  return result;
}

export async function findSubcategories() {
  const [result] = await db.query(
    `SELECT sc.id, sc.nombre, sc.slug, c.nombre AS categoria_nombre
     FROM subcategorias sc
     JOIN categorias c ON c.id = sc.categoria_id
     WHERE sc.activo = 1
     ORDER BY c.orden ASC, sc.orden ASC`
  );
  return result;
}

export async function findBrands() {
  const [result] = await db.query(
    `SELECT id, nombre, slug FROM marcas WHERE activo = 1 ORDER BY nombre ASC`
  );
  return result;
}

export async function findCategoryNames() {
  const [result] = await db.query(
    'SELECT DISTINCT nombre FROM categorias WHERE activo = 1 ORDER BY nombre ASC'
  );
  return result;
}

export async function insertProduct(
  sku: string | null,
  name: string,
  description: string | null,
  price: number,
  purchasePrice: number | null,
  offerPrice: number | null,
  stock: number,
  minimumStock: number,
  category: string,
  brand: string,
  image: string | null,
  featured: number,
  categoryId: number | null,
  subcategoryId: number | null,
  brandId: number | null
) {
  const [result] = await db.query(
    `INSERT INTO productos (sku, nombre, descripcion, precio, precio_compra, precio_oferta, stock, stock_minimo, categoria, marca, imagen, destacado, categoria_id, subcategoria_id, marca_id, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      sku,
      name,
      description,
      price,
      purchasePrice,
      offerPrice,
      stock,
      minimumStock,
      category,
      brand,
      image,
      featured,
      categoryId,
      subcategoryId,
      brandId
    ]
  );
  return result;
}

export async function updateProduct(
  sku: string | null,
  name: string,
  description: string | null,
  price: number,
  purchasePrice: number | null,
  offerPrice: number | null,
  stock: number,
  minimumStock: number,
  category: string,
  brand: string,
  image: string | null,
  featured: number,
  categoryId: number | null,
  subcategoryId: number | null,
  brandId: number | null,
  id: number
) {
  const [result] = await db.query(
    `UPDATE productos
     SET sku = ?, nombre = ?, descripcion = ?, precio = ?, precio_compra = ?, precio_oferta = ?, stock = ?, stock_minimo = ?, categoria = ?, marca = ?, imagen = ?, destacado = ?, categoria_id = ?, subcategoria_id = ?, marca_id = ?, actualizado_en = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      sku,
      name,
      description,
      price,
      purchasePrice,
      offerPrice,
      stock,
      minimumStock,
      category,
      brand,
      image,
      featured,
      categoryId,
      subcategoryId,
      brandId,
      id
    ]
  );
  return result;
}

export async function updateStock(stock: number, id: number) {
  const [result] = await db.query(
    'UPDATE productos SET stock = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?',
    [stock, id]
  );
  return result;
}

export async function deleteProduct(id: number) {
  const [result] = await db.query(
    'DELETE FROM productos WHERE id = ?',
    [id]
  );
  return result;
}

const PUBLIC_PRODUCT_COLUMNS = `
  id, sku, nombre, slug, descripcion, categoria_id, subcategoria_id, marca_id,
  categoria, marca, precio, precio_oferta, stock, imagen, galeria_json,
  activo, destacado, creado_en, actualizado_en
`;

export async function findProductDetails(id: number) {
  const [result] = await db.query(
    `SELECT ${PUBLIC_PRODUCT_COLUMNS} FROM productos WHERE id = ?`,
    [id]
  );
  return result;
}

export async function findProductStock(id: number) {
  const [result] = await db.query(
    'SELECT stock FROM productos WHERE id = ?',
    [id]
  );
  return result;
}

export async function insertStockAdjustment(
  id: number,
  quantity: number,
  previousStock: number,
  currentStock: number,
  reason: string,
  userId: number | null
) {
  const [result] = await db.query(
    `INSERT INTO inventario_movimientos (producto_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, usuario_id)
       VALUES (?, 'AJUSTE', ?, ?, ?, ?, ?)`,
    [id, quantity, previousStock, currentStock, reason, userId]
  );
  return result;
}

export async function findProductMovements(id: number) {
  const [result] = await db.query(
    `SELECT m.*, u.nombre as usuario_nombre
       FROM inventario_movimientos m
       LEFT JOIN usuarios u ON m.usuario_id = u.id
       WHERE m.producto_id = ?
       ORDER BY m.creado_en DESC`,
    [id]
  );
  return result;
}
