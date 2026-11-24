// Borra de verdad los documentos que quedaron con borrado lógico (deleted: true) de versiones anteriores,
// junto con lo que dependía de ellos (movimientos de productos, subcategorías de categorías,
// direcciones y preferencias de usuarios).
// Uso: node scripts/purge-deleted.js [--dry]
import { MongoClient } from 'mongodb';

process.loadEnvFile(new URL('../.env', import.meta.url));
const DRY = process.argv.includes('--dry');
const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
await client.connect();
const db = client.db(process.env.MONGODB_DB);

// colección marcada → [colección dependiente, campo que la referencia]
const DEPENDENTS = {
  products: [['movements', 'producto_id']],
  categories: [['subcategories', 'categoria_id']],
  users: [['addresses', 'usuario_id'], ['prefs', '_id']],
};

let total = 0;
for (const { name } of await db.listCollections().toArray()) {
  const docs = await db.collection(name).find({ deleted: true }).toArray();
  if (!docs.length) continue;
  const ids = docs.map((d) => d._id);
  for (const d of docs) console.log(`  ${name}: ${d.nombre || d.titulo || d.email || d.codigo || d._id}`);
  for (const [dep, field] of DEPENDENTS[name] || []) {
    const n = await db.collection(dep).countDocuments({ [field]: { $in: ids } });
    if (n) console.log(`    + ${n} en ${dep} que dependen de ellos`);
    if (n && !DRY) await db.collection(dep).deleteMany({ [field]: { $in: ids } });
    total += n;
  }
  if (!DRY) await db.collection(name).deleteMany({ _id: { $in: ids }, deleted: true });
  total += docs.length;
}

console.log(total ? `\n${DRY ? '[simulación] se borrarían' : 'Borrados'}: ${total} documentos.` : 'No hay documentos eliminados pendientes.');
await client.close();
