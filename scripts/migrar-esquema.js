// Migra los datos de las colecciones anteriores (users, products…) al esquema nuevo en español
// (usuarios, productos…): _id y referencias ObjectId, estado 1/0/3, fechas Date, auditoría y
// tipo de documento desde datos_maestros. Ver src/lib/db/schema.js.
//
// NO borra ni modifica las colecciones anteriores: quedan intactas como respaldo.
//   node --env-file=.env scripts/migrar-esquema.js --simular   (solo muestra lo que haría)
//   node --env-file=.env scripts/migrar-esquema.js             (migra; se niega si el destino ya tiene datos)
//   node --env-file=.env scripts/migrar-esquema.js --reemplazar (vacía las colecciones nuevas y migra otra vez)
import { randomBytes } from 'node:crypto';
import { MongoClient, ObjectId } from 'mongodb';
import { COLLECTIONS, OLD_COLLECTIONS, toDoc, loadMaestros, refFields } from '../src/lib/db/schema.js';

const SIMULAR = process.argv.includes('--simular');
const REEMPLAZAR = process.argv.includes('--reemplazar');
// El orden importa: «prefs» reutiliza el id del usuario.
const ORDEN = ['user', 'category', 'subcategory', 'brand', 'product', 'banner', 'address', 'sale', 'movement', 'notification', 'audit', 'prefs'];

// ObjectId que conserva la fecha de creación del documento (así siguen ordenados por antigüedad).
const oidAt = (iso) => {
  const b = Buffer.alloc(12);
  b.writeUInt32BE(Math.floor((Date.parse(iso) || Date.now()) / 1000), 0);
  randomBytes(8).copy(b, 4);
  return new ObjectId(b);
};

const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
await client.connect();
try {
  const db = client.db(process.env.MONGODB_DB || 'novatech');
  const existentes = new Set((await db.listCollections().toArray()).map((c) => c.name));

  // 1) Leer lo anterior y asignar un ObjectId nuevo a cada documento.
  const viejos = {};
  const idNuevo = new Map(); // id anterior (texto) → ObjectId nuevo (hex)
  for (const e of ORDEN) {
    viejos[e] = existentes.has(OLD_COLLECTIONS[e]) ? (await db.collection(OLD_COLLECTIONS[e]).find().toArray()).filter((d) => d.deleted !== true) : [];
    if (e !== 'prefs') for (const d of viejos[e]) idNuevo.set(String(d._id), oidAt(d.createdAt).toHexString());
  }
  // Cualquier texto que sea exactamente un id anterior se cambia por el nuevo (referencias, listas, auditoría…).
  const reemplazar = (v) => (typeof v === 'string' ? idNuevo.get(v) ?? v
    : Array.isArray(v) ? v.map(reemplazar)
      : v && typeof v === 'object' && !(v instanceof Date) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, reemplazar(x)])) : v);

  // 2) El destino no debe tener datos (salvo --reemplazar).
  const ocupadas = [];
  for (const e of ORDEN) if (existentes.has(COLLECTIONS[e]) && await db.collection(COLLECTIONS[e]).countDocuments()) ocupadas.push(COLLECTIONS[e]);
  if (ocupadas.length && !REEMPLAZAR && !SIMULAR) {
    console.error(`Las colecciones nuevas ya tienen datos: ${ocupadas.join(', ')}.\nNo se migró nada. Usa --reemplazar para vaciarlas y migrar de nuevo.`);
    process.exitCode = 1;
  } else {
    const maestros = SIMULAR ? { idPorCodigo: new Map(), codigoPorId: new Map() } : await loadMaestros(db);
    const ahora = new Date();
    for (const e of ORDEN) {
      const docs = [];
      let huerfanos = 0;
      for (const d of viejos[e]) {
        const { _id, expireAt, ...rest } = d;
        const id = idNuevo.get(String(_id));
        if (!id) { huerfanos++; continue; } // preferencias de un usuario que ya no existe
        const item = { ...reemplazar(rest), id };
        // Referencias a documentos que ya no existen (usuario o registro borrado): quedan en null.
        for (const f of refFields(e)) if (typeof item[f] === 'string' && !/^[0-9a-f]{24}$/.test(item[f])) item[f] = null;
        if (e === 'address' && !item.usuario_id) { huerfanos++; continue; } // dirección de un usuario borrado
        const doc = toDoc(e, item, maestros);
        doc.id_usuario_creacion = null; doc.nombre_usuario_creacion = 'migracion';
        doc.id_usuario_modificacion = null; doc.nombre_usuario_modificacion = 'migracion';
        if (!d.updatedAt) doc.fecha_hora_modificacion = ahora;
        docs.push(doc);
      }
      if (!SIMULAR) {
        if (REEMPLAZAR) await db.collection(COLLECTIONS[e]).deleteMany({});
        if (docs.length) await db.collection(COLLECTIONS[e]).insertMany(docs, { ordered: true });
      }
      console.log(`${(OLD_COLLECTIONS[e] + ' → ' + COLLECTIONS[e]).padEnd(36)} ${String(docs.length).padStart(4)} documentos${huerfanos ? ` (${huerfanos} sin dueño, omitidos)` : ''}`);
    }
    console.log(SIMULAR ? '\nSimulación: no se escribió nada.'
      : '\nListo. Las colecciones anteriores (en inglés) siguen intactas como respaldo.\nLas sesiones abiertas dejan de valer (los ids cambiaron): hay que iniciar sesión de nuevo.');
  }
} finally { await client.close(); }
