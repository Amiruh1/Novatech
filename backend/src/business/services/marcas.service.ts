import * as marcasRepository from '../../access-data/repositories/marcas.repository';

export interface MarcaModel {
  id?: number;
  nombre: string;
  slug?: string;
  activo?: number | boolean;
}

function toSlug(text: string): string {
  return text.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function listMarcas() {
  const rows = await marcasRepository.findBrands();
  return rows;
}

export async function createMarca(input: MarcaModel) {
  const nombre = input.nombre.trim();
  const slug = toSlug(nombre);
  const activo = input.activo !== undefined ? (input.activo ? 1 : 0) : 1;
  const result = await marcasRepository.insertBrand(nombre, slug, activo);
  return result;
}

export async function updateMarca(id: number, input: Partial<MarcaModel>) {
  const changes: { nombre?: string; slug?: string; activo?: number } = {};
  if (input.nombre !== undefined) {
    changes.nombre = input.nombre.trim();
    changes.slug = toSlug(changes.nombre);
  }
  if (input.activo !== undefined) changes.activo = input.activo ? 1 : 0;
  await marcasRepository.updateBrand(id, changes);
}

export async function deleteMarca(id: number) {
  await marcasRepository.deleteBrand(id);
}
