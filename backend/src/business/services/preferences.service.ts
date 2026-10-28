import * as preferencesRepository from '../../access-data/repositories/preferences.repository';

export interface UserPreferences {
  favoritos: number[];
  comparador: number[];
  carrito?: CartItemSerialized[];
}

export interface CartItemSerialized {
  id: number;
  cantidad: number;
  nombre: string;
  precio: number;
  precio_oferta?: number | null;
  stock: number;
  imagen: string;
  categoria: string;
  marca: string;
  sku?: string;
  destacado?: boolean;
}

const EMPTY_PREFERENCES: UserPreferences = {
  favoritos: [],
  comparador: []
};

function sanitizeIds(input: unknown, max: number): number[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const cleaned = input
    .map((item) => Number(item || 0))
    .filter((id) => Number.isInteger(id) && id > 0);

  return Array.from(new Set(cleaned)).slice(0, max);
}

async function filterExistingProducts(ids: number[]): Promise<number[]> {
  if (!ids.length) {
    return [];
  }

  const rows = await preferencesRepository.findActiveProductIds(ids);

  const validIds = (rows as Array<{ id: number }>).map((row) => Number(row.id));
  const validSet = new Set(validIds);

  return ids.filter((id) => validSet.has(id));
}

export async function getPreferences(usuarioId: number): Promise<UserPreferences> {
  await preferencesRepository.ensurePreferencesTable();

  const rows = await preferencesRepository.findPreferences(usuarioId);

  const data = rows as Array<{ favoritos_json: unknown; comparador_json: unknown }>;
  const row = data[0];

  if (!row) {
    return { ...EMPTY_PREFERENCES };
  }

  const favoritos = await filterExistingProducts(sanitizeIds(row.favoritos_json, 50));
  const comparador = await filterExistingProducts(sanitizeIds(row.comparador_json, 3));

  return { favoritos, comparador };
}

export async function saveFavoritos(usuarioId: number, favoritosRaw: unknown): Promise<UserPreferences> {
  await preferencesRepository.ensurePreferencesTable();

  const favoritos = await filterExistingProducts(sanitizeIds(favoritosRaw, 50));

  const current = await getPreferences(usuarioId);

  await preferencesRepository.upsertPreferences(usuarioId, JSON.stringify(favoritos), JSON.stringify(current.comparador));

  return { favoritos, comparador: current.comparador };
}

export async function saveComparador(usuarioId: number, comparadorRaw: unknown): Promise<UserPreferences> {
  await preferencesRepository.ensurePreferencesTable();

  const comparador = await filterExistingProducts(sanitizeIds(comparadorRaw, 3));

  const current = await getPreferences(usuarioId);

  await preferencesRepository.upsertPreferences(usuarioId, JSON.stringify(current.favoritos), JSON.stringify(comparador));

  return { favoritos: current.favoritos, comparador };
}

export async function getCarrito(usuarioId: number): Promise<CartItemSerialized[]> {
  await preferencesRepository.ensurePreferencesTable();
  await preferencesRepository.ensureCarritoColumn();

  const rows = await preferencesRepository.findCart(usuarioId);

  const row = (rows as any[])[0];
  if (!row || row.carrito_json === null || row.carrito_json === undefined) return [];

  try {
    const raw = typeof row.carrito_json === 'string' ? JSON.parse(row.carrito_json) : row.carrito_json;
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

export async function saveCarrito(usuarioId: number, items: CartItemSerialized[]): Promise<void> {
  await preferencesRepository.ensurePreferencesTable();
  await preferencesRepository.ensureCarritoColumn();

  const sanitized = items
    .filter(i => Number(i.id) > 0 && Number(i.cantidad) > 0)
    .slice(0, 50);

  await preferencesRepository.upsertCart(usuarioId, JSON.stringify(sanitized));
}
