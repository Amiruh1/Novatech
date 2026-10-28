import db from '../config/db';

let tableReady = false;

let carritoColumnReady = false;

export async function ensurePreferencesTable() {
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

export async function ensureCarritoColumn() {
  if (carritoColumnReady) return;
  try {
    await db.query('SELECT carrito_json FROM preferencias_usuario LIMIT 0');
  } catch {
    await db.query('ALTER TABLE preferencias_usuario ADD COLUMN carrito_json JSON NULL');
  }
  carritoColumnReady = true;
}

export async function findActiveProductIds(ids: number[]) {
  const [result] = await db.query(
    'SELECT id FROM productos WHERE id IN (?) AND activo = 1',
    [ids]
  );
  return result;
}

export async function findPreferences(userId: number) {
  const [result] = await db.query(
    'SELECT favoritos_json, comparador_json FROM preferencias_usuario WHERE usuario_id = ? LIMIT 1',
    [userId]
  );
  return result;
}

export async function upsertPreferences(userId: number, favorites: string, comparison: string) {
  const [result] = await db.query(
    `INSERT INTO preferencias_usuario (usuario_id, favoritos_json, comparador_json)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       favoritos_json = VALUES(favoritos_json),
       comparador_json = VALUES(comparador_json),
       actualizado_en = CURRENT_TIMESTAMP`,
    [userId, favorites, comparison]
  );
  return result;
}

export async function findCart(userId: number) {
  const [result] = await db.query(
    'SELECT carrito_json FROM preferencias_usuario WHERE usuario_id = ? LIMIT 1',
    [userId]
  );
  return result;
}

export async function upsertCart(userId: number, cart: string) {
  const [result] = await db.query(
    `INSERT INTO preferencias_usuario (usuario_id, favoritos_json, comparador_json, carrito_json)
     VALUES (?, '[]', '[]', ?)
     ON DUPLICATE KEY UPDATE carrito_json = VALUES(carrito_json), actualizado_en = CURRENT_TIMESTAMP`,
    [userId, cart]
  );
  return result;
}
