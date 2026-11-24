// Solo lectura: lista las colecciones de la base, cuántos documentos tienen y qué campos y tipos usan.
// No muestra valores (ni correos, ni hashes).   node --env-file=.env scripts/inspect-db.js
import { MongoClient } from 'mongodb';

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : v instanceof Date ? 'date' : v?._bsontype ? v._bsontype : typeof v);
const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
await client.connect();
try {
  const dbs = (await client.db().admin().listDatabases()).databases.map((d) => d.name).filter((n) => !['admin', 'local', 'config'].includes(n));
  console.log('Bases:', dbs.join(', '), '| en uso (MONGODB_DB):', process.env.MONGODB_DB || 'novatech');
  const db = client.db(process.env.MONGODB_DB || 'novatech');
  const solo = process.argv.slice(2); // nombres de colecciones a mostrar (vacío = todas)
  for (const { name } of (await db.listCollections().toArray()).sort((a, b) => a.name.localeCompare(b.name))) {
    if (solo.length && !solo.includes(name)) continue;
    const col = db.collection(name);
    const fields = {};
    for (const d of await col.find().limit(300).toArray()) for (const [k, v] of Object.entries(d)) (fields[k] ||= new Set()).add(typeOf(v));
    console.log(`\n${name} (${await col.countDocuments()})`);
    console.log('  ' + Object.entries(fields).map(([k, t]) => `${k}:${[...t].join('|')}`).join(', '));
  }
} finally { await client.close(); }
