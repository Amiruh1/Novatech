// Base de datos LOCAL (SQLite) con el mismo contrato que DynamoDB.
// Cada registro es un documento JSON: records(entity, id, data, updated_at, deleted).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { newId } from '../../src/lib/id.js';
import { INDEXES, idxValue } from '../../src/lib/db/indexes.js';

export function createSqliteDb(file = process.env.SQLITE_FILE || './.data/novatech.db') {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const sql = new DatabaseSync(file);
  sql.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS records (
      entity TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,
      updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (entity, id)
    );
    CREATE INDEX IF NOT EXISTS idx_records_updated ON records(updated_at);
    CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
  `);

  const q = {
    get: sql.prepare('SELECT data FROM records WHERE entity=? AND id=?'),
    list: sql.prepare('SELECT data FROM records WHERE entity=? AND deleted=0'),
    listAll: sql.prepare('SELECT data FROM records WHERE entity=?'),
    upsert: sql.prepare(`INSERT INTO records(entity,id,data,updated_at,deleted) VALUES(?,?,?,?,?)
      ON CONFLICT(entity,id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at, deleted=excluded.deleted`),
    del: sql.prepare('DELETE FROM records WHERE entity=? AND id=?'),
    since: sql.prepare('SELECT entity, data FROM records WHERE updated_at > ?'),
    getMeta: sql.prepare('SELECT v FROM meta WHERE k=?'),
    setMeta: sql.prepare('INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v'),
  };
  const parse = (r) => (r ? JSON.parse(r.data) : null);
  const write = (entity, item) =>
    q.upsert.run(entity, item.id, JSON.stringify(item), item.updatedAt, item.deleted ? 1 : 0);

  return {
    kind: 'sqlite',
    async get(entity, id) {
      const it = parse(q.get.get(entity, String(id)));
      return it && !it.deleted ? it : null;
    },
    async put(entity, item) {
      const now = new Date().toISOString();
      const full = { ...item, id: item.id ?? newId(), createdAt: item.createdAt ?? now, updatedAt: now, deleted: false };
      write(entity, full);
      return full;
    },
    async list(entity, { includeDeleted = false } = {}) {
      return (includeDeleted ? q.listAll : q.list).all(entity).map(parse);
    },
    // Borrado real, igual que en MongoDB.
    async remove(entity, id) {
      return q.del.run(entity, String(id)).changes > 0;
    },
    // Suma atómica con piso mínimo (stock). BEGIN IMMEDIATE evita carreras.
    async incr(entity, id, field, delta, { min = 0 } = {}) {
      sql.exec('BEGIN IMMEDIATE');
      try {
        const it = parse(q.get.get(entity, String(id)));
        if (!it || it.deleted) { sql.exec('ROLLBACK'); return null; }
        const next = Number(it[field] || 0) + delta;
        if (next < min) { sql.exec('ROLLBACK'); const e = new Error('CONFLICT'); e.code = 'CONFLICT'; throw e; }
        const upd = { ...it, [field]: next, updatedAt: new Date().toISOString() };
        write(entity, upd);
        sql.exec('COMMIT');
        return upd;
      } catch (e) { try { sql.exec('ROLLBACK'); } catch {} throw e; }
    },
    async listBy(entity, field, value) {
      if (INDEXES[entity] !== field) throw new Error(`Índice no soportado: ${entity}.${field}`);
      const st = sql.prepare(`SELECT data FROM records WHERE entity=? AND deleted=0 AND lower(CAST(json_extract(data,'$.${field}') AS TEXT))=?`);
      return st.all(entity, idxValue(entity, value)).map(parse);
    },
    // --- sincronización ---
    async changedSince(iso) {
      return q.since.all(iso).map((r) => ({ entity: r.entity, item: JSON.parse(r.data) }));
    },
    async putRaw(entity, item) {
      const cur = parse(q.get.get(entity, item.id));
      if (cur && cur.updatedAt >= item.updatedAt) return false; // gana el más reciente
      write(entity, item);
      return true;
    },
    getMeta: (k) => q.getMeta.get(k)?.v ?? null,
    setMeta: (k, v) => q.setMeta.run(k, String(v)),
    close: () => sql.close(),
  };
}
