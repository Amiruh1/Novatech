import * as categoriesRepository from '../../access-data/repositories/categories.repository';

export interface CategoriaReq {
  nombre: string;
  slug: string;
  descripcion?: string;
  imagen?: string;
  activo?: number;
  orden?: number;
}

export async function listCategoriasFull() {
  const rows = await categoriesRepository.findCategories();
  return rows;
}

export async function createCategoria(cat: CategoriaReq) {
  const result = await categoriesRepository.insertCategory(cat.nombre, cat.slug, cat.descripcion || null, cat.imagen || null, cat.activo ?? 1, cat.orden ?? 0);
  return result;
}

export async function updateCategoria(id: number, cat: Partial<CategoriaReq>) {
  return categoriesRepository.updateCategory(id, cat);
}

export async function deleteCategoria(id: number) {
  await categoriesRepository.deleteCategory(id);
}
