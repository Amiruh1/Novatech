import { route, requireAdmin, requireAuth } from '../lib/router.js';
import { ok, bad, notFound, conflict } from '../lib/http.js';
import * as v from '../lib/validate.js';
import { checkLowStock } from '../lib/notify.js';
import { verifyToken } from '../lib/auth.js';
import { deleteImageIfUnused, importExternalImage } from '../lib/s3images.js';
import { offerActive, effectivePrice as effective } from '../lib/pricing.js';
import { audit } from '../lib/audit.js';

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// en_oferta: la oferta está vigente hoy (RF-40). Fuera de sus fechas el producto se vende a precio regular.
const publicProduct = (p) => { const { precio_compra, stock_minimo, ...r } = p; return { ...r, precio_final: effective(p), en_oferta: offerActive(p) }; };

function isAdminReq(ctx) {
  const h = ctx.headers.authorization || '';
  const p = verifyToken(h.startsWith('Bearer ') ? h.slice(7) : '');
  return p?.rol === 'admin' && !!p.elev;
}
const isoDay = (s, label) => {
  const d = v.str(s, 10);
  if (!d) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d))) throw bad(`${label}: fecha inválida.`);
  return d;
};

// Alcance de la búsqueda (categoría, oferta, texto…). Los filtros del panel lateral se aplican aparte.
async function scoped(db, query) {
  let items = (await db.list('product')).filter((p) => p.activo !== false);
  const q = norm(query.q);
  if (q) items = items.filter((p) => [p.nombre, p.sku, p.marca, p.categoria, p.subcategoria].some((f) => norm(f).includes(q)));
  if (query.categoria) items = items.filter((p) => p.categoria_id === query.categoria || norm(p.categoria) === norm(query.categoria));
  if (query.destacados === '1') items = items.filter((p) => p.destacado);
  if (query.ofertas === '1') items = items.filter((p) => offerActive(p));
  return items;
}

const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
function parseSpecs(raw) {
  if (!raw) return {};
  try {
    const sel = JSON.parse(raw);
    if (!sel || typeof sel !== 'object' || Array.isArray(sel)) throw new Error();
    return sel;
  } catch { throw bad('Filtro de especificaciones inválido.'); }
}

// Filtros del panel lateral: subcategoría, marca(s), especificaciones, precio y stock.
function refine(items, query) {
  if (query.subcategoria) items = items.filter((p) => p.subcategoria_id === query.subcategoria || norm(p.subcategoria) === norm(query.subcategoria));
  if (query.marca) items = items.filter((p) => p.marca_id === query.marca || norm(p.marca) === norm(query.marca));
  const marcas = new Set(list(query.marcas));
  if (marcas.size) items = items.filter((p) => marcas.has(p.marca_id));
  // specs={"Procesador":["Intel Core i5","Ryzen 7"],"Memoria RAM":["16 GB"]}: OR dentro de cada característica, AND entre ellas.
  for (const [name, vals] of Object.entries(parseSpecs(query.specs))) {
    if (!Array.isArray(vals) || !vals.length) continue;
    const nn = norm(name);
    const wanted = new Set(vals.map(norm));
    items = items.filter((p) => (p.especificaciones || []).some((s) => norm(s.nombre) === nn && wanted.has(norm(s.valor))));
  }
  if (query.disponibles === '1') items = items.filter((p) => p.stock > 0);
  if (query.agotados === '1') items = items.filter((p) => p.stock === 0); // "No disponible"
  const min = query.min !== undefined ? Number(query.min) : null;
  const max = query.max !== undefined ? Number(query.max) : null;
  if (Number.isFinite(min)) items = items.filter((p) => effective(p) >= min);
  if (Number.isFinite(max)) items = items.filter((p) => effective(p) <= max);
  return items;
}

/**
 * Opciones del panel de filtros para el alcance pedido (p. ej. una categoría):
 * precio mínimo/máximo, marcas, subcategorías y las especificaciones de sus productos con cuántos hay de cada valor.
 */
route('GET', '/products/facets', async ({ db, query }) => {
  const items = await scoped(db, query);
  const count = (key, label) => {
    const m = new Map();
    for (const p of items) if (p[key]) { const e = m.get(p[key]) || { id: p[key], nombre: p[label], count: 0 }; e.count += 1; m.set(p[key], e); }
    return [...m.values()].sort((a, b) => b.count - a.count || a.nombre.localeCompare(b.nombre, 'es'));
  };
  const specs = new Map();
  for (const p of items) {
    const seen = new Set();
    for (const s of p.especificaciones || []) {
      const key = norm(s.nombre);
      const f = specs.get(key) || { nombre: s.nombre, grupo: s.grupo, products: 0, values: new Map() };
      if (!seen.has(key)) { f.products += 1; seen.add(key); }
      const vk = norm(s.valor);
      const val = f.values.get(vk) || { valor: s.valor, count: 0 };
      val.count += 1; f.values.set(vk, val);
      specs.set(key, f);
    }
  }
  const especificaciones = [...specs.values()]
    // Se omiten las que no sirven para filtrar: un valor distinto por producto (p. ej. "Modelo").
    .filter((f) => !(f.values.size === f.products && f.products > 4))
    .sort((a, b) => b.products - a.products)
    .slice(0, 10)
    .map((f) => ({ nombre: f.nombre, grupo: f.grupo, valores: [...f.values.values()].sort((a, b) => b.count - a.count || a.valor.localeCompare(b.valor, 'es', { numeric: true })) }));
  const prices = items.map(effective);

  // Categorías y subcategorías: salen del catálogo del panel (aunque aún no tengan productos), en el orden
  // definido allí y con cuántos productos tiene cada una. Si hay búsqueda u ofertas, solo las que tienen resultados.
  const browsing = !norm(query.q) && query.ofertas !== '1';
  const active = (x) => x.activo !== false;
  const byOrder = (a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.nombre.localeCompare(b.nombre, 'es');
  const withCounts = (all, counted) => {
    const n = new Map(counted.map((c) => [c.id, c.count]));
    return all.sort(byOrder).map((x) => ({ id: x.id, nombre: x.nombre, count: n.get(x.id) || 0 })).filter((x) => browsing || x.count > 0);
  };
  const allCats = (await db.list('category')).filter(active);
  const cat = query.categoria ? allCats.find((c) => c.id === query.categoria || c.slug === query.categoria || norm(c.nombre) === norm(query.categoria)) : null;
  const allSubs = (await db.list('subcategory')).filter((s) => active(s) && (!cat || s.categoria_id === cat.id));

  return ok({
    total: items.length,
    precio: { min: prices.length ? Math.floor(Math.min(...prices)) : 0, max: prices.length ? Math.ceil(Math.max(...prices)) : 0 },
    marcas: count('marca_id', 'marca'),
    subcategorias: cat ? withCounts(allSubs, count('subcategoria_id', 'subcategoria')) : count('subcategoria_id', 'subcategoria'),
    categorias: withCounts(allCats, count('categoria_id', 'categoria')),
    especificaciones,
  });
});

route('GET', '/products', async (ctx) => {
  const { db, query } = ctx;
  let items = refine(await scoped(db, query), query);
  const sorters = {
    precio_asc: (a, b) => effective(a) - effective(b), precio_desc: (a, b) => effective(b) - effective(a),
    nombre: (a, b) => a.nombre.localeCompare(b.nombre, 'es'), recientes: (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
  };
  items.sort(sorters[query.orden] || sorters.recientes);
  const total = items.length;
  const limit = Math.min(Math.max(parseInt(query.limit) || 24, 1), 100);
  const offset = Math.max(parseInt(query.offset) || 0, 0);
  return ok({ total, productos: items.slice(offset, offset + limit).map(publicProduct) });
});

route('GET', '/products/:id', async (ctx) => {
  const p = await ctx.db.get('product', ctx.params.id);
  if (!p || (p.activo === false && !isAdminReq(ctx))) throw notFound('Producto no encontrado.');
  return ok({ producto: isAdminReq(ctx) ? { ...p, precio_final: effective(p) } : publicProduct(p) });
});

route('GET', '/admin/products', requireAdmin, async ({ db }) => ok({ productos: (await db.list('product')).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((p) => ({ ...p, precio_final: effective(p), en_oferta: offerActive(p) })) }));

async function build(b, db, cur = {}) {
  const nombre = v.str(b.nombre, 180);
  if (nombre.length < 3) throw bad('El nombre del producto debe tener al menos 3 caracteres.');
  const precio = v.money(b.precio);
  if (!(precio > 0) || precio > 99999999.99) throw bad('Precio inválido.');
  const stock = Number(b.stock ?? cur.stock ?? 0);
  if (!Number.isInteger(stock) || stock < 0) throw bad('Stock inválido (entero ≥ 0).');
  const stock_minimo = Number(b.stock_minimo ?? 0);
  if (!Number.isInteger(stock_minimo) || stock_minimo < 0) throw bad('Stock mínimo inválido.');
  const oferta = b.precio_oferta === null || b.precio_oferta === '' || b.precio_oferta === undefined ? null : v.money(b.precio_oferta);
  if (oferta !== null && (oferta <= 0 || oferta >= precio)) throw bad('El precio de oferta debe ser mayor que 0 y menor al precio normal.');
  const oferta_inicio = oferta === null ? null : isoDay(b.oferta_inicio, 'Inicio de la oferta');
  const oferta_fin = oferta === null ? null : isoDay(b.oferta_fin, 'Fin de la oferta');
  if (oferta_inicio && oferta_fin && oferta_fin < oferta_inicio) throw bad('La oferta no puede terminar antes de empezar.');
  const compra = b.precio_compra === null || b.precio_compra === '' || b.precio_compra === undefined ? null : v.money(b.precio_compra);
  const isUrl = (s) => /^(https?:\/\/|\/)/i.test(s);
  const imagen = v.str(b.imagen, 500);
  if (imagen && !isUrl(imagen)) throw bad('La imagen debe ser una URL http(s) o una ruta relativa.');
  // Galería: fotos adicionales a la principal.
  const imagenes = (Array.isArray(b.imagenes) ? b.imagenes : cur.imagenes || []).map((s) => v.str(s, 500)).filter(Boolean);
  if (imagenes.length > 8) throw bad('Máximo 8 fotos adicionales.');
  if (imagenes.some((s) => !isUrl(s))) throw bad('Cada foto debe ser una URL http(s) o una ruta relativa.');
  // Especificaciones agrupadas: [{ grupo, nombre, valor }]
  const especificaciones = (Array.isArray(b.especificaciones) ? b.especificaciones : cur.especificaciones || [])
    .map((s) => ({ grupo: v.str(s?.grupo, 60) || 'General', nombre: v.str(s?.nombre, 60), valor: v.str(s?.valor, 200) }))
    .filter((s) => s.nombre && s.valor);
  if (especificaciones.length > 40) throw bad('Máximo 40 especificaciones.');
  const cat = b.categoria_id ? await db.get('category', b.categoria_id) : null;
  const sub = b.subcategoria_id ? await db.get('subcategory', b.subcategoria_id) : null;
  const marca = b.marca_id ? await db.get('brand', b.marca_id) : null;
  if (b.categoria_id && !cat) throw bad('Categoría inválida.');
  if (b.subcategoria_id && !sub) throw bad('Subcategoría inválida.');
  if (b.marca_id && !marca) throw bad('Marca inválida.');
  if (sub && cat && sub.categoria_id !== cat.id) throw bad('La subcategoría no pertenece a la categoría elegida.');
  return {
    sku: v.str(b.sku, 50) || null, nombre, descripcion: v.str(b.descripcion, 4000),
    categoria_id: cat?.id ?? null, subcategoria_id: sub?.id ?? null, marca_id: marca?.id ?? null,
    categoria: cat?.nombre ?? null, subcategoria: sub?.nombre ?? null, marca: marca?.nombre ?? null,
    precio, precio_oferta: oferta, oferta_inicio, oferta_fin, precio_compra: compra, stock, stock_minimo,
    imagen: imagen || null, imagenes, especificaciones, garantia: v.str(b.garantia, 300) || null,
    destacado: !!b.destacado, activo: b.activo !== false,
  };
}

async function movement(db, p, tipo, cantidad, anterior, nuevo, motivo, userId, ref) {
  return db.put('movement', { producto_id: p.id, tipo, cantidad, stock_anterior: anterior, stock_nuevo: nuevo, motivo, referencia: ref || null, usuario_id: userId });
}

// Imagen principal pegada como enlace externo → se copia al bucket. Si no se puede, se guarda el
// enlace tal cual y se devuelve un aviso para el admin (el producto se guarda igual).
async function withBucketImage(data) {
  const { url, error } = await importExternalImage(data.imagen);
  return { data: { ...data, imagen: url }, aviso: error ? `Producto guardado, pero la imagen no se pudo copiar al bucket (${error}). Se usará el enlace original.` : undefined };
}

route('POST', '/products', requireAdmin, async ({ db, body, user }) => {
  const { data, aviso } = await withBucketImage(await build(body, db));
  const p = await db.put('product', data);
  if (p.stock > 0) await movement(db, p, 'ENTRADA', p.stock, 0, p.stock, 'Stock inicial', user.id);
  await audit(db, user, 'PRODUCTO_CREADO', `Creó el producto "${p.nombre}"`, { entidad: 'product', entidad_id: p.id, despues: { precio: p.precio, precio_oferta: p.precio_oferta, stock: p.stock } });
  return ok({ producto: p, aviso }, 201);
});

route('PUT', '/products/:id', requireAdmin, async ({ db, body, params, user }) => {
  const cur = await db.get('product', params.id);
  if (!cur) throw notFound();
  // El stock no se edita aquí (evita pisar ventas simultáneas): usar /stock.
  const built = await build({ ...cur, ...body, stock: cur.stock }, db, cur);
  // Solo se importa si la imagen cambió (o si aún es un enlace externo de antes).
  const { data, aviso } = await withBucketImage(built);
  const saved = await db.put('product', { ...cur, ...data, stock: cur.stock });
  // Si cambió la imagen principal, la anterior se borra del bucket (solo si es nuestra y ya nadie la usa).
  if (cur.imagen && cur.imagen !== saved.imagen) await deleteImageIfUnused(db, cur.imagen);
  const pick = (p) => ({ precio: p.precio, precio_oferta: p.precio_oferta, oferta_inicio: p.oferta_inicio ?? null, oferta_fin: p.oferta_fin ?? null, destacado: !!p.destacado, activo: p.activo !== false });
  await audit(db, user, 'PRODUCTO_EDITADO', `Editó el producto "${saved.nombre}"`, { entidad: 'product', entidad_id: saved.id, antes: pick(cur), despues: pick(saved) });
  return ok({ producto: saved, aviso });
});

// Las ventas guardan su propia copia (nombre, precio, imagen), así que borrar el producto no las afecta.
route('DELETE', '/products/:id', requireAdmin, async ({ db, params, user }) => {
  const cur = await db.get('product', params.id);
  if (!cur || !(await db.remove('product', params.id))) throw notFound();
  for (const m of await db.listBy('movement', 'producto_id', params.id)) await db.remove('movement', m.id);
  await audit(db, user, 'PRODUCTO_ELIMINADO', `Eliminó el producto "${cur.nombre}"`, { entidad: 'product', entidad_id: cur.id, antes: { stock: cur.stock, precio: cur.precio } });
  return ok({ ok: true });
});

// ENTRADA suma, SALIDA resta, AJUSTE fija el stock exacto. Siempre atómico y sin negativos.
route('PUT', '/products/:id/stock', requireAdmin, async ({ db, body, params, user }) => {
  const cur = await db.get('product', params.id);
  if (!cur) throw notFound();
  const tipo = String(body.tipo || '').toUpperCase();
  const cant = Number(body.cantidad);
  if (!['ENTRADA', 'SALIDA', 'AJUSTE'].includes(tipo)) throw bad('Tipo de movimiento inválido.');
  if (!Number.isInteger(cant) || cant < 0 || (tipo !== 'AJUSTE' && cant === 0)) throw bad('Cantidad inválida.');
  const motivo = v.str(body.motivo, 255);
  if (!motivo) throw bad('Indica el motivo del movimiento.');
  const delta = tipo === 'ENTRADA' ? cant : tipo === 'SALIDA' ? -cant : cant - cur.stock;
  let upd;
  try { upd = await db.incr('product', cur.id, 'stock', delta, { min: 0 }); }
  catch (e) { if (e.code === 'CONFLICT') throw conflict('Stock insuficiente para esa salida.'); throw e; }
  const anterior = upd.stock - delta;
  await movement(db, upd, tipo, Math.abs(delta), anterior, upd.stock, motivo, user.id);
  // HU-017 CA-3: administrador, fecha/hora, producto, stock anterior, stock nuevo y motivo.
  await audit(db, user, 'AJUSTE_STOCK', `${tipo} de stock en "${upd.nombre}": ${anterior} → ${upd.stock}. Motivo: ${motivo}`, { entidad: 'product', entidad_id: upd.id, antes: { stock: anterior }, despues: { stock: upd.stock, motivo } });
  await checkLowStock(db, upd, anterior);
  return ok({ producto: upd });
});

route('GET', '/products/:id/movements', requireAdmin, async ({ db, params }) => {
  const m = await db.listBy('movement', 'producto_id', params.id);
  return ok({ movimientos: m.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
});
