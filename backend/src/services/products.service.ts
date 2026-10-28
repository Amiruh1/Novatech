import * as productsRepository from '../repositories/products.repository';

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

export async function listProducts(options: Parameters<typeof productsRepository.searchProducts>[0] = {}) {
  return productsRepository.searchProducts(options);
}

export async function listProductsByIds(ids: number[]) {
  if (!ids.length) return [];
  const rows = await productsRepository.findCatalogProductsByIds(ids);
  return rows as any[];
}

export async function listSubcategories() {
  const rows = await productsRepository.findSubcategories();
  return rows;
}

export async function listBrands() {
  const rows = await productsRepository.findBrands();
  return rows;
}

export async function listCategoryNames() {
  const rows = await productsRepository.findCategoryNames();

  return (rows as Array<{ nombre: string }>).map((row) => row.nombre);
}

export async function createProduct(input: ProductInput) {
  const result = await productsRepository.insertProduct(
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
  );

  return result;
}

export async function updateProduct(id: number, input: ProductInput) {
  await productsRepository.updateProduct(
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
  );
}

export async function updateProductStock(id: number, stock: number) {
  await productsRepository.updateStock(Number(stock || 0), id);
}

export async function deleteProduct(id: number) {
  await productsRepository.deleteProduct(id);
}

export async function findProductDetails(id: number) {
  return productsRepository.findProductDetails(id);
}

export async function adjustStockWithMovement(id: number, stock: number, reason: string, userId: number | null) {
  const current = await productsRepository.findProductStock(id);
  const previousStock = (current as Array<{ stock: number }>)[0]?.stock ?? 0;
  await updateProductStock(id, stock);
  await productsRepository.insertStockAdjustment(
    id, Math.abs(stock - previousStock), previousStock, stock, reason.trim(), userId
  );
  return previousStock;
}

export async function findProductMovements(id: number) {
  return productsRepository.findProductMovements(id);
}
