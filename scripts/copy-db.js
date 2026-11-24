// Copia los datos de la tienda de una base MongoDB a otra (por defecto: novatech → novatech_db).
// No toca las colecciones que ya existan en el destino (p. ej. las del proyecto Angular) y no borra el origen.
//   node --env-file=.env scripts/copy-db.js [origen] [destino]
import { MongoClient } from 'mongodb';

const [from = 'novatech', to = 'novatech_db'] = process.argv.slice(2);
// colección en origen → colección en destino (ver COLLECTIONS en src/lib/db/mongo.js)
const MAP = {
  users: 'users', products: 'products', categories: 'categories', subcategories: 'subcategories', brands: 'brands',
  banners: 'store_banners', addresses: 'addresses', sales: 'sales', movements: 'movements',
  notifications: 'notifications', prefs: 'prefs',
};

const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
await client.connect();
try {
  const src = client.db(from);
  const dst = client.db(to);
  const existing = new Set((await dst.listCollections().toArray()).map((c) => c.name));
  const conflicts = Object.values(MAP).filter((name) => existing.has(name));
  if (conflicts.length) {
    console.error(`El destino "${to}" ya tiene: ${conflicts.join(', ')}. No se copió nada para no mezclar datos.`);
    process.exitCode = 1;
  } else {
    for (const [a, b] of Object.entries(MAP)) {
      const docs = await src.collection(a).find().toArray();
      if (docs.length) await dst.collection(b).insertMany(docs, { ordered: true });
      console.log(`${a} → ${to}.${b}: ${docs.length}`);
    }
    console.log(`Listo. La base "${from}" queda intacta como respaldo.`);
  }
} finally {
  await client.close();
}
