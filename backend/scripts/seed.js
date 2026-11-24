// Carga datos de ejemplo en MongoDB.  npm run seed   |   npm run seed:reset (borra TODO antes)
import { getDb } from '../src/lib/db/index.js';
import { getIdp } from '../src/lib/idp.js';
import { seed } from './seed-data.js';

const db = await getDb();
if (process.argv.includes('--reset')) { await db.drop(); console.log('Base de datos borrada.'); await db.close();
  process.exit(0); }
await seed(db, (id, email, password) => getIdp().create(id, email, password));
console.log('Datos de ejemplo cargados.\n  admin@novatech.com / NovaTech123!\n  cliente@novatech.com / NovaTech123!');
await db.close();
