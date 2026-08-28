import db from '../config/db';

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

let tableReady = false;
let carritoColumnReady = false;

async function ensurePreferencesTable() {
  if (tableReady) {
    return;
  }

  await db.query(
    `CREATE TABLE IF NOT EXISTS preferencias_usuario (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      usuario_id INT UNSIGNED NOT NULL,
      favoritos_json JSON NOT NULL,
      comparador_json JSON NOT NULL,
      creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT uq_preferencias_usuario UNIQUE (usuario_id),
      CONSTRAINT fk_preferencias_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
    ) ENGINE=InnoDB`
  );

  tableReady = true;
}

async function ensureCarritoColumn() {
  if (carritoColumnReady) return;
  try {
    await db.query('SELECT carrito_json FROM preferencias_usuario LIMIT 0');
  } catch {
    await db.query('ALTER TABLE preferencias_usuario ADD COLUMN carrito_json JSON NULL');
  }
  carritoColumnReady = true;
}

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

  const [rows] = await db.query(
    'SELECT id FROM productos WHERE id IN (?) AND activo = 1',
    [ids]
  );

  const validIds = (rows as Array<{ id: number }>).map((row) => Number(row.id));
  const validSet = new Set(validIds);

  return ids.filter((id) => validSet.has(id));
}

export async function getPreferences(usuarioId: number): Promise<UserPreferences> {
  await ensurePreferencesTable();

  const [rows] = await db.query(
    'SELECT favoritos_json, comparador_json FROM preferencias_usuario WHERE usuario_id = ? LIMIT 1',
    [usuarioId]
  );

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
  await ensurePreferencesTable();

  const favoritos = await filterExistingProducts(sanitizeIds(favoritosRaw, 50));

  const current = await getPreferences(usuarioId);

  await db.query(
    `INSERT INTO preferencias_usuario (usuario_id, favoritos_json, comparador_json)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       favoritos_json = VALUES(favoritos_json),
       comparador_json = VALUES(comparador_json),
       actualizado_en = CURRENT_TIMESTAMP`,
    [usuarioId, JSON.stringify(favoritos), JSON.stringify(current.comparador)]
  );

  return { favoritos, comparador: current.comparador };
}

export async function saveComparador(usuarioId: number, comparadorRaw: unknown): Promise<UserPreferences> {
  await ensurePreferencesTable();

  const comparador = await filterExistingProducts(sanitizeIds(comparadorRaw, 3));

  const current = await getPreferences(usuarioId);

  await db.query(
    `INSERT INTO preferencias_usuario (usuario_id, favoritos_json, comparador_json)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       favoritos_json = VALUES(favoritos_json),
       comparador_json = VALUES(comparador_json),
       actualizado_en = CURRENT_TIMESTAMP`,
    [usuarioId, JSON.stringify(current.favoritos), JSON.stringify(comparador)]
  );

  return { favoritos: current.favoritos, comparador };
}

export async function getCarrito(usuarioId: number): Promise<CartItemSerialized[]> {
  await ensurePreferencesTable();
  await ensureCarritoColumn();

  const [rows] = await db.query(
    'SELECT carrito_json FROM preferencias_usuario WHERE usuario_id = ? LIMIT 1',
    [usuarioId]
  );

  const row = (rows as any[])[0];
  if (!row || row.carrito_json === null || row.carrito_json === undefined) return [];

  try {
    const raw = typeof row.carrito_json === 'string' ? JSON.parse(row.carrito_json) : row.carrito_json;
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

export async function saveCarrito(usuarioId: number, items: CartItemSerialized[]): Promise<void> {
  await ensurePreferencesTable();
  await ensureCarritoColumn();

  const sanitized = items
    .filter(i => Number(i.id) > 0 && Number(i.cantidad) > 0)
    .slice(0, 50);

  await db.query(
    `INSERT INTO preferencias_usuario (usuario_id, favoritos_json, comparador_json, carrito_json)
     VALUES (?, '[]', '[]', ?)
     ON DUPLICATE KEY UPDATE carrito_json = VALUES(carrito_json), actualizado_en = CURRENT_TIMESTAMP`,
    [usuarioId, JSON.stringify(sanitized)]
  );
}
