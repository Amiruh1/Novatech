// Capa de datos sobre MongoDB. Cada entidad es una colección (nombres y forma en ./schema.js).
// Las rutas usan un contrato simple ({ id, activo, createdAt… }, ids en texto); aquí se traduce a la
// forma guardada: _id ObjectId, estado 1/0/3, fechas Date y campos de auditoría.
import { MongoClient } from 'mongodb';
import { INDEXES, idxValue } from './indexes.js';
import { HttpError } from '../http.js';
import { getActor } from './context.js';
import { COLLECTIONS, ESTADO, toDoc, fromDoc, toOid, dbField, isRef, newObjectId, loadMaestros } from './schema.js';

const VIVO = { estado: { $ne: ESTADO.ELIMINADO } };

export async function createMongoDb(uri = process.env.MONGODB_URI, dbName = process.env.MONGODB_DB || 'novatech') {
  if (!uri) throw new Error('MONGODB_URI no configurado');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const mdb = client.db(dbName);
  const col = (entity) => {
    if (!COLLECTIONS[entity]) throw new Error(`Entidad desconocida: ${entity}`);
    return mdb.collection(COLLECTIONS[entity]);
  };
  const maestros = await loadMaestros(mdb); // datos maestros (tipos de documento): se crean si faltan

  // Índices (idempotentes): se crean al arrancar.
  await Promise.all([
    col('user').createIndex({ correo: 1 }, { unique: true, partialFilterExpression: { estado: { $lt: ESTADO.ELIMINADO } } }),
    col('sale').createIndex({ id_usuario: 1, fecha: -1 }),
    col('sale').createIndex({ estado_pedido: 1, fecha: -1 }),
    col('address').createIndex({ usuario_id: 1 }),
    col('movement').createIndex({ producto_id: 1, fecha_hora_creacion: -1 }),
    col('product').createIndex({ estado: 1, destacado: 1 }),
    col('notification').createIndex({ fecha_hora_creacion: -1 }),
    col('audit').createIndex({ fecha_hora_creacion: -1 }),
    col('otp').createIndex({ fecha_caducidad: 1 }, { expireAfterSeconds: 0 }), // borra los códigos vencidos solo
  ]);

  // Auditoría de la modificación en curso: quién (sesión de la petición) y cuándo.
  const quien = () => { const a = getActor(); return { id: a ? toOid(a.id) : null, nombre: a?.nombre || 'sistema' }; };

  return {
    kind: 'mongo',
    async get(entity, id) {
      return fromDoc(entity, await col(entity).findOne({ _id: toOid(String(id)), ...VIVO }), maestros);
    },
    async put(entity, item) {
      const now = new Date().toISOString();
      const esNuevo = item.id == null || item.createdAt == null;
      const full = { ...item, id: item.id ?? newObjectId().toHexString(), createdAt: item.createdAt ?? now, updatedAt: now, deleted: false };
      const doc = toDoc(entity, full, maestros);
      const a = quien();
      // Creación: se fija una sola vez y se conserva en cada edición. Modificación: siempre la actual.
      if (esNuevo || doc.nombre_usuario_creacion === undefined) { doc.id_usuario_creacion = doc.id_usuario_creacion ?? a.id; doc.nombre_usuario_creacion = doc.nombre_usuario_creacion ?? a.nombre; }
      doc.id_usuario_modificacion = a.id; doc.nombre_usuario_modificacion = a.nombre;
      if (entity === 'otp' && full.ttl) doc.fecha_caducidad = new Date(full.ttl * 1000);
      try { await col(entity).replaceOne({ _id: doc._id }, doc, { upsert: true }); }
      catch (e) {
        if (e.code === 11000) throw new HttpError(409, 'Ya existe un registro con esos datos únicos (por ejemplo, el correo).');
        throw e;
      }
      return fromDoc(entity, doc, maestros);
    },
    async list(entity) {
      return (await col(entity).find(VIVO).toArray()).map((d) => fromDoc(entity, d, maestros));
    },
    async listBy(entity, field, value) {
      if (INDEXES[entity] !== field) throw new Error(`Búsqueda no soportada: ${entity}.${field}`);
      const v = isRef(entity, field) ? toOid(String(value)) : idxValue(entity, value);
      return (await col(entity).find({ [dbField(entity, field)]: v, ...VIVO }).toArray()).map((d) => fromDoc(entity, d, maestros));
    },
    // Borrado real: el documento desaparece de la colección (el rastro queda en la colección de auditoría).
    async remove(entity, id) {
      const r = await col(entity).deleteOne({ _id: toOid(String(id)) });
      return r.deletedCount > 0;
    },
    // Suma atómica con piso mínimo. Una sola operación en el servidor: dos compras
    // simultáneas del último producto no pueden dejar el stock en negativo.
    async incr(entity, id, field, delta, { min = 0 } = {}) {
      const _id = toOid(String(id));
      const a = quien();
      const doc = await col(entity).findOneAndUpdate(
        { _id, ...VIVO, [field]: { $gte: min - delta } },
        { $inc: { [field]: delta }, $set: { fecha_hora_modificacion: new Date(), id_usuario_modificacion: a.id, nombre_usuario_modificacion: a.nombre } },
        { returnDocument: 'after' },
      );
      if (doc) return fromDoc(entity, doc, maestros);
      if (!(await col(entity).findOne({ _id, ...VIVO }))) return null;
      const err = new Error('CONFLICT'); err.code = 'CONFLICT'; throw err;
    },
    async drop() { await mdb.dropDatabase(); },
    async close() { await client.close(); },
  };
}
