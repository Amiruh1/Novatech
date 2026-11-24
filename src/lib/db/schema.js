// Esquema de almacenamiento en MongoDB (novatech_db), en español y con buenas prácticas:
//   · _id y referencias como ObjectId                · fechas como Date (no texto)
//   · estado: 1 activo · 0 inactivo · 3 eliminado    (en lugar de activo / deleted booleanos)
//   · auditoría en cada documento: id_usuario_creacion, nombre_usuario_creacion, fecha_hora_creacion,
//     id_usuario_modificacion, nombre_usuario_modificacion, fecha_hora_modificacion
//   · tipo de documento como referencia (id_tipo_documento) a la colección de datos maestros
//
// Las rutas siguen usando su contrato de siempre ({ id, activo, createdAt, email… } con ids en texto):
// este archivo traduce en los dos sentidos, así que es el ÚNICO lugar que conoce la forma guardada.
import { ObjectId } from 'mongodb';

export const ESTADO = { INACTIVO: 0, ACTIVO: 1, ELIMINADO: 3 };

/** entidad → colección */
export const COLLECTIONS = {
  user: 'usuarios', product: 'productos', category: 'categorias', subcategory: 'subcategorias', brand: 'marcas',
  banner: 'banners_tienda', address: 'direcciones', sale: 'ventas', movement: 'movimientos_stock',
  notification: 'notificaciones', prefs: 'preferencias', otp: 'codigos_otp', audit: 'auditoria',
  novaq: 'preguntas_nova', // preguntas que Nova no supo responder (para mejorar sus respuestas)
};
export const MASTER_COLLECTION = 'datos_maestros';

/** Campos que cambian de nombre al guardarse (contrato de las rutas → base de datos). */
const RENAMES = {
  user: { email: 'correo', passHash: 'hash_contrasena', failedLogins: 'intentos_fallidos', lockedUntil: 'bloqueado_hasta', email_verificado: 'correo_verificado', avatar_url: 'url_avatar', cognito: 'en_cognito' },
  // En ventas «estado» es el del pedido (pendiente, pagado…): se guarda como estado_pedido para dejar
  // «estado» (1 / 0 / 3) con el mismo significado en todas las colecciones.
  sale: { estado: 'estado_pedido', email_usuario: 'correo_usuario' },
  audit: { usuario_email: 'usuario_correo' },
  otp: { email: 'correo', passHash: 'hash_contrasena', userId: 'id_usuario_pendiente', attempts: 'intentos', expires: 'fecha_expiracion', sentAt: 'fecha_envio' },
};
/** Referencias a otros documentos: se guardan como ObjectId. */
const REFS = {
  address: ['usuario_id'], sale: ['id_usuario'], movement: ['producto_id', 'usuario_id'],
  product: ['categoria_id', 'subcategoria_id', 'marca_id'], subcategory: ['categoria_id'], audit: ['usuario_id', 'entidad_id'],
};
/** Referencias dentro de listas: [campo de la lista, campo del elemento (null = el elemento es el id)]. */
const NESTED_REFS = {
  sale: [['items', 'producto_id']],
  prefs: [['favoritos', null], ['comparador', null], ['carrito', 'id']],
};
/** Fechas con hora que llegan como texto ISO: se guardan como Date. */
const DATES = {
  user: ['ultimo_acceso', 'lockedUntil'], sale: ['fecha'], otp: ['expires', 'sentAt'], novaq: ['ultima_vez'],
};
/** Entidades que tienen «activo» (activar / desactivar). Las demás solo usan estado 1 o 3. */
const HAS_ACTIVO = new Set(['user', 'product', 'category', 'subcategory', 'brand', 'banner']);
const AUDIT_IDS = ['id_usuario_creacion', 'id_usuario_modificacion'];

const HEX24 = /^[0-9a-f]{24}$/i;
/** Texto → ObjectId (los ids que no son ObjectId, p. ej. las claves de los códigos OTP, quedan en texto). */
export const toOid = (v) => (typeof v === 'string' && HEX24.test(v) ? new ObjectId(v) : v ?? null);
const fromOid = (v) => (v instanceof ObjectId ? v.toHexString() : v);
const toDate = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString() === v ? new Date(v) : v);
export const newObjectId = () => new ObjectId();

/** Nombre del campo en la base para un campo del contrato (lo usa listBy). */
export const dbField = (entity, field) => RENAMES[entity]?.[field] || field;
export const isRef = (entity, field) => (REFS[entity] || []).includes(field);
/**
 * Documento del contrato → documento a guardar.
 * maestros: { idPorCodigo: Map('DNI' → ObjectId) } para el tipo de documento.
 */
export function toDoc(entity, item, maestros) {
  const { id, createdAt, updatedAt, deleted, activo, ...rest } = item;
  const doc = { _id: toOid(String(id)) };
  for (const f of DATES[entity] || []) if (f in rest) rest[f] = toDate(rest[f]);
  for (const f of REFS[entity] || []) if (f in rest) rest[f] = toOid(rest[f]);
  for (const [list, key] of NESTED_REFS[entity] || []) {
    if (Array.isArray(rest[list])) rest[list] = rest[list].map((x) => (key === null ? toOid(x) : x && typeof x === 'object' ? { ...x, [key]: toOid(x[key]) } : x));
  }
  if (entity === 'user' && 'tipo_documento' in rest) {
    const code = String(rest.tipo_documento || 'DNI').toUpperCase();
    rest.id_tipo_documento = maestros?.idPorCodigo.get(code) ?? null;
    delete rest.tipo_documento;
  }
  for (const f of AUDIT_IDS) if (f in rest) rest[f] = toOid(rest[f]);
  const ren = RENAMES[entity] || {};
  for (const [k, v] of Object.entries(rest)) doc[ren[k] || k] = v;
  doc.estado = deleted ? ESTADO.ELIMINADO : HAS_ACTIVO.has(entity) && activo === false ? ESTADO.INACTIVO : ESTADO.ACTIVO;
  doc.fecha_hora_creacion = createdAt ? new Date(createdAt) : new Date();
  doc.fecha_hora_modificacion = updatedAt ? new Date(updatedAt) : new Date();
  return doc;
}

/** Documento guardado → documento del contrato de las rutas. */
export function fromDoc(entity, d, maestros) {
  if (!d) return null;
  const { _id, estado, fecha_hora_creacion, fecha_hora_modificacion, fecha_caducidad, ...rest } = d;
  const back = Object.fromEntries(Object.entries(RENAMES[entity] || {}).map(([a, b]) => [b, a]));
  const out = { id: fromOid(_id) };
  for (const [k, v] of Object.entries(rest)) out[back[k] || k] = v instanceof Date ? v.toISOString() : fromOid(v);
  for (const [list, key] of NESTED_REFS[entity] || []) {
    if (Array.isArray(out[list])) out[list] = out[list].map((x) => (key === null ? fromOid(x) : x && typeof x === 'object' ? { ...x, [key]: fromOid(x[key]) } : x));
  }
  if (entity === 'user') {
    out.tipo_documento = maestros?.codigoPorId.get(String(out.id_tipo_documento)) || 'DNI';
    delete out.id_tipo_documento;
  }
  if (HAS_ACTIVO.has(entity)) out.activo = estado !== ESTADO.INACTIVO;
  out.createdAt = fecha_hora_creacion instanceof Date ? fecha_hora_creacion.toISOString() : fecha_hora_creacion;
  out.updatedAt = fecha_hora_modificacion instanceof Date ? fecha_hora_modificacion.toISOString() : fecha_hora_modificacion;
  out.deleted = estado === ESTADO.ELIMINADO;
  return out;
}

/** Datos maestros: catálogos pequeños que otras colecciones referencian por id. */
export const MAESTROS_INICIALES = [
  {
    codigo: 'TIPO_DOCUMENTO', nombre: 'Tipos de documento de identidad',
    valores: [
      { codigo: 'DNI', nombre: 'DNI', descripcion: 'Documento Nacional de Identidad', longitud_minima: 8, longitud_maxima: 8, solo_numeros: true, orden: 1 },
      { codigo: 'RUC', nombre: 'RUC', descripcion: 'Registro Único de Contribuyentes', longitud_minima: 11, longitud_maxima: 11, solo_numeros: true, orden: 2 },
      { codigo: 'CE', nombre: 'Carné de extranjería', descripcion: 'Carné de extranjería', longitud_minima: 8, longitud_maxima: 12, solo_numeros: false, orden: 3 },
      { codigo: 'PASAPORTE', nombre: 'Pasaporte', descripcion: 'Pasaporte', longitud_minima: 6, longitud_maxima: 12, solo_numeros: false, orden: 4 },
    ],
  },
];

/** Crea los datos maestros que falten y devuelve los mapas código ↔ id del tipo de documento. */
export async function loadMaestros(mdb) {
  const col = mdb.collection(MASTER_COLLECTION);
  await col.createIndex({ codigo: 1 }, { unique: true });
  const now = new Date();
  for (const m of MAESTROS_INICIALES) {
    const cur = await col.findOne({ codigo: m.codigo });
    if (!cur) {
      await col.insertOne({
        _id: new ObjectId(), codigo: m.codigo, nombre: m.nombre,
        valores: m.valores.map((v) => ({ _id: new ObjectId(), ...v, estado: ESTADO.ACTIVO })),
        estado: ESTADO.ACTIVO,
        id_usuario_creacion: null, nombre_usuario_creacion: 'sistema', fecha_hora_creacion: now,
        id_usuario_modificacion: null, nombre_usuario_modificacion: 'sistema', fecha_hora_modificacion: now,
      });
    } else {
      // Valores nuevos del catálogo (si se agregan en el código) sin tocar los ya existentes ni sus ids.
      const faltan = m.valores.filter((v) => !cur.valores.some((x) => x.codigo === v.codigo));
      if (faltan.length) await col.updateOne({ _id: cur._id }, { $push: { valores: { $each: faltan.map((v) => ({ _id: new ObjectId(), ...v, estado: ESTADO.ACTIVO })) } }, $set: { fecha_hora_modificacion: now } });
    }
  }
  const tipos = (await col.findOne({ codigo: 'TIPO_DOCUMENTO' })).valores;
  return {
    idPorCodigo: new Map(tipos.map((t) => [t.codigo, t._id])),
    codigoPorId: new Map(tipos.map((t) => [String(t._id), t.codigo])),
  };
}
