import { route, requireAdmin } from '../lib/router.js';
import { ok, bad, notFound, conflict } from '../lib/http.js';
import * as v from '../lib/validate.js';
import { audit } from '../lib/audit.js';

const slug = (s) => v.str(s, 120).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const byOrder = (a, b) => (a.orden ?? 0) - (b.orden ?? 0) || String(a.nombre).localeCompare(String(b.nombre), 'es');
const imgUrl = (u) => {
  const s = v.str(u, 500);
  if (s && !/^(https?:\/\/|\/)/i.test(s)) throw bad('La imagen debe ser una URL http(s) o una ruta relativa.');
  return s || null;
};

// Todo el catálogo de filtros en una sola llamada (menos viajes = menos costo en Lambda).
route('GET', '/catalog', async ({ db }) => {
  const [cats, subs, brands] = await Promise.all([db.list('category'), db.list('subcategory'), db.list('brand')]);
  const act = (x) => x.activo !== false;
  return ok({
    categorias: cats.filter(act).sort(byOrder).map((c) => ({ ...c, subcategorias: subs.filter((s) => s.categoria_id === c.id && act(s)).sort(byOrder) })),
    marcas: brands.filter(act).sort(byOrder),
  });
});
route('GET', '/admin/catalog', requireAdmin, async ({ db }) => {
  const [categorias, subcategorias, marcas] = await Promise.all([db.list('category'), db.list('subcategory'), db.list('brand')]);
  return ok({ categorias: categorias.sort(byOrder), subcategorias: subcategorias.sort(byOrder), marcas: marcas.sort(byOrder) });
});

async function inUse(db, field, id) {
  return (await db.list('product')).some((p) => p[field] === id);
}

const LABEL = { category: 'categoría', subcategory: 'subcategoría', brand: 'marca', banner: 'banner' };
function crud(base, entity, build, { usedBy, cascade } = {}) {
  const name = (x) => x?.nombre || x?.titulo || x?.id;
  route('POST', base, requireAdmin, async ({ db, body, user }) => {
    const item = await db.put(entity, await build(body, db));
    await audit(db, user, 'CATALOGO_CREADO', `Creó la ${LABEL[entity] || entity} \"${name(item)}\"`, { entidad: entity, entidad_id: item.id });
    return ok({ item }, 201);
  });
  route('PUT', `${base}/:id`, requireAdmin, async ({ db, body, params, user }) => {
    const cur = await db.get(entity, params.id);
    if (!cur) throw notFound();
    const next = await build({ ...cur, ...body }, db);
    const item = await db.put(entity, { ...cur, ...next });
    await audit(db, user, 'CATALOGO_EDITADO', `Editó la ${LABEL[entity] || entity} \"${name(item)}\"`, { entidad: entity, entidad_id: item.id });
    return ok({ item });
  });
  route('DELETE', `${base}/:id`, requireAdmin, async ({ db, params, user }) => {
    if (usedBy && (await usedBy(db, params.id))) throw conflict('No se puede eliminar: hay productos asociados. Desactívalo en su lugar.');
    const cur = await db.get(entity, params.id);
    if (!(await db.remove(entity, params.id))) throw notFound();
    if (cascade) await cascade(db, params.id);
    await audit(db, user, 'CATALOGO_ELIMINADO', `Eliminó la ${LABEL[entity] || entity} \"${name(cur)}\"`, { entidad: entity, entidad_id: params.id });
    return ok({ ok: true });
  });
}
const nameReq = (b) => { const n = v.str(b.nombre, 100); if (n.length < 2) throw bad('El nombre es obligatorio (mínimo 2 caracteres).'); return n; };

crud('/categories', 'category', (b) => ({ nombre: nameReq(b), slug: slug(b.nombre), descripcion: v.str(b.descripcion, 300), orden: Math.trunc(v.num(b.orden)), activo: b.activo !== false }),
  {
    usedBy: (db, id) => inUse(db, 'categoria_id', id),
    // Sus subcategorías se van con ella (no tienen productos: usedBy ya lo comprobó para toda la categoría).
    cascade: async (db, id) => { for (const s of (await db.list('subcategory')).filter((s) => s.categoria_id === id)) await db.remove('subcategory', s.id); },
  });
crud('/subcategories', 'subcategory', async (b, db) => {
  if (!(await db.get('category', b.categoria_id))) throw bad('Categoría inválida.');
  return { categoria_id: b.categoria_id, nombre: nameReq(b), slug: slug(b.nombre), orden: Math.trunc(v.num(b.orden)), activo: b.activo !== false };
}, { usedBy: (db, id) => inUse(db, 'subcategoria_id', id) });
crud('/brands', 'brand', (b) => ({ nombre: nameReq(b), slug: slug(b.nombre), orden: Math.trunc(v.num(b.orden)), activo: b.activo !== false }),
  { usedBy: (db, id) => inUse(db, 'marca_id', id) });

route('GET', '/banners', async ({ db }) => ok({ banners: (await db.list('banner')).filter((b) => b.activo !== false).sort(byOrder) }));
route('GET', '/admin/banners', requireAdmin, async ({ db }) => ok({ banners: (await db.list('banner')).sort(byOrder) }));
crud('/banners', 'banner', (b) => {
  const titulo = v.str(b.titulo, 120);
  if (titulo.length < 2) throw bad('El título es obligatorio.');
  return { titulo, subtitulo: v.str(b.subtitulo, 200), imagen: imgUrl(b.imagen), enlace: v.str(b.enlace, 300) || null, orden: Math.trunc(v.num(b.orden)), activo: b.activo !== false };
});
