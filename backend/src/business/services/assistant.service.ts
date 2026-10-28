import { randomUUID } from 'crypto';
import { listBrands, listCategoryNames, listProducts, listProductsByIds, listSubcategories } from './products.service';
import {
  ACTION_LABELS,
  AssistantActionId,
  CLARIFY_ANSWER,
  FALLBACK_ANSWER,
  GeneralActionId,
  HELP_TOPICS,
  HelpTopic
} from '../data/assistant-help';
import { interpretMessage, ModelInterpretation, modelConfigured } from './ai-model.service';

export interface AssistantTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface AssistantQuery {
  message: string;
  route: string;
  productIds: number[];
  history: AssistantTurn[];
}

export interface PublicProduct {
  id: number;
  nombre: string;
  marca: string | null;
  categoria: string | null;
  precio: number;
  precioFinal: number;
  enOferta: boolean;
  disponible: boolean;
  imagen: string | null;
}

export interface AssistantAction {
  id: AssistantActionId;
  label: string;
  productId?: number;
}

export interface AssistantReply {
  requestId: string;
  answer: string;
  speechText: string;
  products: PublicProduct[];
  actions: AssistantAction[];
  source: 'ayuda' | 'catalogo' | 'ia' | 'sin-datos';
}

interface CatalogMeta {
  categories: { name: string; key: string }[];
  subcategories: { name: string; key: string; category: string }[];
  brands: { name: string; key: string }[];
}

interface CatalogFilters {
  categoria?: string;
  subcategoria?: string;
  marca?: string;
  precioMin?: number;
  precioMax?: number;
  orden?: 'asc' | 'desc';
  conOferta: boolean;
  soloDisponibles: boolean;
  generic: boolean;
  terms: string[];
}

const MAX_RESULTS = 5;
const MAX_GENERAL_ANSWER = 600;
const OUT_OF_SCOPE = 'Solo puedo ayudarte con la tienda NovaTech: buscar productos, el carrito, la compra y las ayudas de accesibilidad.';
const META_TTL = 60_000;
const STORE_BRAND = 'novatech';

const STOPWORDS = new Set([
  'a', 'al', 'algo', 'alguno', 'alguna', 'algunos', 'algunas', 'ante', 'asi', 'aqui', 'bien', 'bueno', 'buena', 'buen', 'cada',
  'como', 'con', 'cual', 'cuales', 'cuando', 'dame', 'de', 'del', 'desde', 'donde', 'el', 'ella', 'ellas', 'ellos', 'en', 'entre',
  'es', 'esa', 'esas', 'ese', 'eso', 'esos', 'esta', 'estas', 'este', 'esto', 'estos', 'estoy', 'favor', 'gracias', 'gustaria',
  'hola', 'la', 'las', 'le', 'les', 'lo', 'los', 'mas', 'me', 'mejor', 'menos', 'mi', 'mis', 'mostrar', 'mucho', 'muy', 'nada',
  'ni', 'no', 'nos', 'novatech', 'o', 'opcion', 'otra', 'otro', 'otras', 'otros', 'para', 'pero', 'poco', 'por', 'porfa',
  'porfavor', 'puede', 'puedes', 'puedo', 'que', 'quien', 'se', 'ser', 'si', 'sin', 'sobre', 'sol', 'soles', 'solo', 'son', 'su',
  'sus', 'tal', 'tambien', 'tan', 'te', 'tengo', 'ti', 'tienda', 'todo', 'todos', 'toda', 'todas', 'tu', 'tus', 'un', 'una',
  'uno', 'unos', 'unas', 'usted', 'ver', 'y', 'ya', 'yo', 'producto', 'productos', 'articulo', 'articulos', 'cosa', 'cosas',
  'modelo', 'modelos', 'marca', 'marcas', 'categoria', 'categorias', 'tipo', 'tipos', 'nuevo', 'nueva', 'lista', 'primero',
  'primera', 'segundo', 'segunda', 'tercero', 'tercera', 'cuarto', 'quinto', 'sexto', 'septimo', 'octavo', 'ultimo', 'ultima'
]);

const SHOPPING_WORDS = [
  'busco', 'buscar', 'busca', 'buscando', 'quiero', 'quisiera', 'necesito', 'comprar', 'compro', 'recomienda', 'recomiendas',
  'recomiendame', 'muestrame', 'muestra', 'ensename', 'tienes', 'tienen', 'tiene', 'venden', 'vendes', 'cuesta', 'cuestan',
  'cuanto', 'vale', 'valen', 'barato', 'barata', 'baratos', 'baratas', 'economico', 'economica', 'economicos', 'caro', 'cara',
  'caros', 'oferta', 'ofertas', 'descuento', 'descuentos', 'precio', 'precios', 'disponible', 'disponibles', 'stock', 'hay'
];

const GENERIC_PHRASES = ['productos', 'catalogo', 'que venden', 'que tienen', 'que hay', 'novedades', 'destacados', 'recomiendame',
  'recomienda', 'recomiendas', 'recomendacion', 'recomendaciones', 'opciones'];

const CATEGORY_HINTS: Record<string, string[]> = {
  computo: ['laptop', 'laptops', 'notebook', 'notebooks', 'computadora', 'computadoras', 'computador', 'pc', 'ordenador',
    'portatil', 'portatiles', 'desktop', 'cpu'],
  pantallas: ['monitor', 'monitores', 'pantalla', 'pantallas', 'display', 'televisor'],
  almacenamiento: ['ssd', 'disco', 'discos', 'hdd', 'nvme', 'usb', 'memoria', 'memorias', 'pendrive'],
  perifericos: ['teclado', 'teclados', 'mouse', 'raton', 'audifonos', 'auriculares', 'headset', 'parlante', 'parlantes', 'webcam',
    'camara', 'periferico']
};

const ASC_PHRASES = ['mas barato', 'mas barata', 'mas baratos', 'mas baratas', 'mas economico', 'mas economica', 'mas economicos',
  'menor precio', 'cuesta menos', 'cuestan menos', 'barato', 'barata', 'baratos', 'baratas', 'economico', 'economica', 'economicos'];
const DESC_PHRASES = ['mas caro', 'mas cara', 'mas caros', 'mas caras', 'mayor precio', 'cuesta mas', 'cuestan mas', 'gama alta', 'premium'];
const OFFER_WORDS = ['oferta', 'ofertas', 'descuento', 'descuentos', 'rebaja', 'rebajas', 'promocion', 'promociones', 'promo', 'liquidacion'];
const AVAILABLE_PHRASES = ['disponible', 'disponibles', 'en stock', 'con stock', 'hay stock'];

const HOW_TO = /\b(como|donde|puedo|se puede|para que sirve|que significa)\b/;
const ORDINAL_NAMES = '(primer|primero|primera|segundo|segunda|tercer|tercero|tercera|cuarto|cuarta|quinto|quinta|sexto|sexta|septimo|septima|octavo|octava|ultimo|ultima)';
const ORDINALS: Record<string, number> = {
  primer: 0, primero: 0, primera: 0, segundo: 1, segunda: 1, tercer: 2, tercero: 2, tercera: 2,
  cuarto: 3, cuarta: 3, quinto: 4, quinta: 4, sexto: 5, sexta: 5, septimo: 6, septima: 6, octavo: 7, octava: 7,
  ultimo: -1, ultima: -1
};
const ORDINAL_LABELS = ['primero', 'segundo', 'tercero', 'cuarto', 'quinto'];
const CHEAPEST = /\b(cuesta menos|cuestan menos|mas barat[oa]s?|mas economic[oa]s?|menor precio)\b/;
const PRICIEST = /\b(cuesta mas|cuestan mas|mas car[oa]s?|mayor precio)\b/;
const REFERS_TO_LIST = /\b(esos|esas|estos|estas|ellos|ellas|de la lista|los anteriores|entre ellos)\b/;
const PRODUCT_FACTS = /\b(precio|cuesta|cuanto|vale|stock|disponible|hay|quedan|oferta|descuento)\b/;

const AMOUNT = String.raw`(?:s\/\.?\s*)?(\d{1,3}(?:[.,\s]\d{3})+|\d+(?:[.,]\d{1,2})?)\s*(mil|k)?\b`;
const NUMBER = String.raw`(\d{1,3}(?:[.,\s]\d{3})+|\d+(?:[.,]\d{1,2})?)`;
const BETWEEN = new RegExp(String.raw`entre\s+${AMOUNT}\s*(?:soles\s*)?(?:y|a|-)\s*${AMOUNT}`);
const AT_MOST = new RegExp(String.raw`(?:menos de|menor a|menor que|hasta|maximo|no mas de|por debajo de|que no pase de|que no supere|tope de|presupuesto de|presupuesto|no mayor a)\s+${AMOUNT}`);
const AT_LEAST = new RegExp(String.raw`(?:mas de|mayor a|mayor que|desde|minimo|por encima de|arriba de|superior a)\s+${AMOUNT}`);
const BARE_PRICE = new RegExp(String.raw`s\/\.?\s*${NUMBER}|${NUMBER}\s*(mil|k)?\s*(?:soles|sol)\b`);

let metaCache: { value: CatalogMeta; expires: number } | null = null;

function normalizeText(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function toWords(text: string): string {
  return normalizeText(text).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function hasPhrase(text: string, phrase: string): boolean {
  return ` ${text} `.includes(` ${phrase} `);
}

function variants(word: string): string[] {
  const forms = [word, `${word}s`, `${word}es`];
  if (word.endsWith('es') && word.length > 4) forms.push(word.slice(0, -2));
  if (word.endsWith('s') && word.length > 3) forms.push(word.slice(0, -1));
  return forms;
}

function matchHelp(text: string): HelpTopic | null {
  let best: HelpTopic | null = null;
  let bestScore = 0;
  for (const topic of HELP_TOPICS) {
    const score = topic.keywords.reduce((sum, keyword) => hasPhrase(text, keyword) ? sum + keyword.split(' ').length : sum, 0);
    const weighted = topic.priority === 'generic' ? score / 2 : score;
    if (weighted > bestScore) {
      best = topic;
      bestScore = weighted;
    }
  }
  return best;
}

function toAmount(raw: string | undefined, unit?: string): number | undefined {
  if (!raw) return undefined;
  const grouped = /^\d{1,3}(?:[.,\s]\d{3})+$/.test(raw);
  let value = grouped ? Number(raw.replace(/[.,\s]/g, '')) : Number(raw.replace(',', '.'));
  if (unit) value *= 1000;
  return Number.isFinite(value) && value >= 1 ? Math.round(value * 100) / 100 : undefined;
}

function parsePriceRange(text: string): { min?: number; max?: number; rest: string } {
  let rest = text;
  const between = rest.match(BETWEEN);
  if (between) {
    const first = toAmount(between[1], between[2]);
    const second = toAmount(between[3], between[4]);
    rest = rest.replace(between[0], ' ');
    if (first !== undefined && second !== undefined) {
      return { min: Math.min(first, second), max: Math.max(first, second), rest };
    }
  }
  let min: number | undefined;
  let max: number | undefined;
  const atMost = rest.match(AT_MOST);
  if (atMost) {
    max = toAmount(atMost[1], atMost[2]);
    rest = rest.replace(atMost[0], ' ');
  }
  const atLeast = rest.match(AT_LEAST);
  if (atLeast) {
    min = toAmount(atLeast[1], atLeast[2]);
    rest = rest.replace(atLeast[0], ' ');
  }
  if (min === undefined && max === undefined) {
    const bare = rest.match(BARE_PRICE);
    if (bare) {
      max = bare[1] ? toAmount(bare[1]) : toAmount(bare[2], bare[3]);
      rest = rest.replace(bare[0], ' ');
    }
  }
  return { min, max, rest };
}

async function loadCatalogMeta(): Promise<CatalogMeta> {
  if (metaCache && metaCache.expires > Date.now()) return metaCache.value;
  const [categories, subcategories, brands] = await Promise.all([listCategoryNames(), listSubcategories(), listBrands()]);
  const value: CatalogMeta = {
    categories: categories.map(name => ({ name, key: toWords(name) })).filter(item => item.key),
    subcategories: (subcategories as any[])
      .map(row => ({ name: String(row.nombre), key: toWords(String(row.nombre)), category: String(row.categoria_nombre) }))
      .filter(item => item.key),
    brands: (brands as any[])
      .map(row => ({ name: String(row.nombre), key: toWords(String(row.nombre)) }))
      .filter(item => item.key)
  };
  metaCache = { value, expires: Date.now() + META_TTL };
  return value;
}

function extractFilters(message: string, meta: CatalogMeta): CatalogFilters {
  const price = parsePriceRange(normalizeText(message));
  const text = toWords(price.rest);
  const used = new Set<string>();
  const mark = (phrase: string) => phrase.split(' ').forEach(word => used.add(word));
  const filters: CatalogFilters = {
    precioMin: price.min,
    precioMax: price.max,
    conOferta: false,
    soloDisponibles: false,
    generic: false,
    terms: []
  };

  const asc = ASC_PHRASES.find(phrase => hasPhrase(text, phrase));
  const desc = DESC_PHRASES.find(phrase => hasPhrase(text, phrase));
  if (asc) { filters.orden = 'asc'; mark(asc); }
  else if (desc) { filters.orden = 'desc'; mark(desc); }

  const offer = OFFER_WORDS.find(word => hasPhrase(text, word));
  if (offer) { filters.conOferta = true; mark(offer); }

  const available = AVAILABLE_PHRASES.find(phrase => hasPhrase(text, phrase));
  if (available) { filters.soloDisponibles = true; mark(available); }

  const generic = GENERIC_PHRASES.find(phrase => hasPhrase(text, phrase));
  if (generic) { filters.generic = true; mark(generic); }

  for (const sub of meta.subcategories) {
    const hit = variants(sub.key).find(form => hasPhrase(text, form));
    if (hit) {
      filters.subcategoria = sub.name;
      filters.categoria = sub.category;
      mark(hit);
      break;
    }
  }

  if (!filters.categoria) {
    for (const category of meta.categories) {
      const hit = [category.key, ...(CATEGORY_HINTS[category.key] || [])].flatMap(variants).find(form => hasPhrase(text, form));
      if (hit) {
        filters.categoria = category.name;
        mark(hit);
        break;
      }
    }
  }

  for (const brand of meta.brands) {
    if (brand.key === STORE_BRAND && !hasPhrase(text, 'marca')) continue;
    if (hasPhrase(text, brand.key)) {
      filters.marca = brand.name;
      mark(brand.key);
      break;
    }
  }

  filters.terms = text.split(' ').filter(word => word.length >= 3 && !used.has(word) && !STOPWORDS.has(word)
    && !SHOPPING_WORDS.includes(word) && !/^\d+$/.test(word));
  return filters;
}

function toPublic(row: any): PublicProduct {
  const precio = Number(row.precio) || 0;
  const oferta = Number(row.precio_oferta);
  const enOferta = Number.isFinite(oferta) && oferta > 0 && oferta < precio;
  return {
    id: Number(row.id),
    nombre: String(row.nombre ?? ''),
    marca: row.marca ? String(row.marca) : null,
    categoria: row.categoria ? String(row.categoria) : null,
    precio,
    precioFinal: enOferta ? oferta : precio,
    enOferta,
    disponible: Number(row.stock) > 0,
    imagen: typeof row.imagen === 'string' && row.imagen ? row.imagen : null
  };
}

function termScore(row: any, terms: string[]): number {
  const haystack = toWords(`${row.nombre ?? ''} ${row.descripcion ?? ''} ${row.marca ?? ''} ${row.categoria ?? ''} ${row.subcategoria ?? ''}`);
  return terms.filter(term => variants(term).some(form => hasPhrase(haystack, form)) || (term.length >= 5 && haystack.includes(term))).length;
}

function formatPrice(value: number): string {
  return `S/ ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function speakPrice(value: number): string {
  const soles = Math.floor(value);
  const cents = Math.round((value - soles) * 100);
  return cents ? `${soles} soles con ${cents} céntimos` : `${soles} soles`;
}

function describeProduct(product: PublicProduct): string {
  const brand = product.marca ? ` (${product.marca})` : '';
  const offer = product.enOferta ? `, antes ${formatPrice(product.precio)}` : '';
  const stock = product.disponible ? 'disponible' : 'sin stock por ahora';
  return `${product.nombre}${brand}: ${formatPrice(product.precioFinal)}${offer}, ${stock}`;
}

function describeCriteria(filters: CatalogFilters, withPrice: boolean): string {
  const parts: string[] = [];
  if (filters.subcategoria || filters.categoria) parts.push(`de ${filters.subcategoria || filters.categoria}`);
  if (filters.marca) parts.push(`de la marca ${filters.marca}`);
  if (filters.conOferta) parts.push('en oferta');
  if (filters.soloDisponibles) parts.push('disponibles');
  if (withPrice && filters.precioMin !== undefined && filters.precioMax !== undefined) {
    parts.push(`entre ${formatPrice(filters.precioMin)} y ${formatPrice(filters.precioMax)}`);
  } else if (withPrice && filters.precioMax !== undefined) {
    parts.push(`de hasta ${formatPrice(filters.precioMax)}`);
  } else if (withPrice && filters.precioMin !== undefined) {
    parts.push(`desde ${formatPrice(filters.precioMin)}`);
  }
  return parts.length ? ` ${parts.join(', ')}` : '';
}

function generalActions(ids: GeneralActionId[]): AssistantAction[] {
  return ids.map(id => ({ id, label: ACTION_LABELS[id] }));
}

function buildReply(answer: string, source: AssistantReply['source'], products: PublicProduct[],
  actions: AssistantAction[], speech?: string): AssistantReply {
  return {
    requestId: randomUUID(),
    answer,
    speechText: (speech ?? answer)
      .replace(/S\/\s?(\d{1,3}(?:,\d{3})*)\.(\d{2})/g, (_, soles: string, cents: string) => speakPrice(Number(`${soles.replace(/,/g, '')}.${cents}`)))
      .replace(/[«»]/g, '').replace(/\s*\n+\s*/g, ' ').trim(),
    products,
    actions,
    source
  };
}

function productReply(product: PublicProduct, lead: string): AssistantReply {
  const answer = `${lead} ${describeProduct(product)}.`;
  const speech = `${lead} ${product.nombre}, ${speakPrice(product.precioFinal)}, ${product.disponible ? 'disponible' : 'sin stock por ahora'}.`;
  return buildReply(answer, 'catalogo', [product], [], speech);
}

async function contextProducts(ids: number[]): Promise<PublicProduct[]> {
  if (!ids.length) return [];
  const rows = await listProductsByIds(ids);
  const byId = new Map(rows.map(row => [Number(row.id), toPublic(row)]));
  return ids.map(id => byId.get(id)).filter((product): product is PublicProduct => !!product);
}

function ordinalIndex(text: string): number | null {
  const named = text.match(new RegExp(String.raw`\b(?:el|la|del|al|de la)\s+${ORDINAL_NAMES}\b`))
    || text.match(new RegExp(String.raw`^${ORDINAL_NAMES}$`))
    || text.match(new RegExp(String.raw`\b${ORDINAL_NAMES}\s+(?:producto|opcion|resultado)\b`));
  if (named) return ORDINALS[named[1]];
  const numbered = text.match(/\b(?:opcion|numero|nro|producto|el|la)\s+([1-5])\b/);
  return numbered ? Number(numbered[1]) - 1 : null;
}

async function searchCatalog(filters: CatalogFilters) {
  const { data } = await listProducts({
    categoria: filters.categoria,
    subcategoria: filters.subcategoria,
    marca: filters.marca,
    conOferta: filters.conOferta,
    soloDisponibles: filters.soloDisponibles,
    limit: 200,
    offset: 0
  });
  const rows = data as any[];
  let matches = rows;
  let relaxed = false;
  if (filters.terms.length) {
    const scored = rows.map(row => ({ row, score: termScore(row, filters.terms) }))
      .filter(item => item.score > 0)
      .sort((first, second) => second.score - first.score);
    if (scored.length) matches = scored.map(item => item.row);
    else if (filters.categoria || filters.marca) relaxed = true;
    else matches = [];
  }

  const products = matches.map(toPublic);
  const { precioMin: min, precioMax: max } = filters;
  const inRange = (product: PublicProduct) => (min === undefined || product.precioFinal >= min)
    && (max === undefined || product.precioFinal <= max);
  let selected = products.filter(inRange);
  let outOfRange = false;
  if (!selected.length && products.length && (min !== undefined || max !== undefined)) {
    outOfRange = true;
    const distance = (product: PublicProduct) => max !== undefined && product.precioFinal > max ? product.precioFinal - max
      : min !== undefined && product.precioFinal < min ? min - product.precioFinal : 0;
    selected = [...products].sort((first, second) => distance(first) - distance(second)).slice(0, 3);
  }
  if (filters.orden === 'asc') selected.sort((first, second) => first.precioFinal - second.precioFinal);
  if (filters.orden === 'desc') selected.sort((first, second) => second.precioFinal - first.precioFinal);
  return { products: selected.slice(0, MAX_RESULTS), total: selected.length, relaxed, outOfRange };
}

async function catalogReply(filters: CatalogFilters): Promise<AssistantReply> {
  const result = await searchCatalog(filters);
  if (!result.products.length) {
    const answer = filters.terms.length
      ? `No encontré productos${describeCriteria(filters, true)} con esa descripción. Prueba con otra palabra o revisa el catálogo.`
      : `Por ahora no hay productos${describeCriteria(filters, true)}. Puedes revisar el catálogo completo.`;
    return buildReply(answer, 'sin-datos', [], generalActions(['focus_catalog_search', 'open_catalog']));
  }
  const order = filters.orden === 'asc' ? ', del más económico al más caro'
    : filters.orden === 'desc' ? ', del más caro al más económico' : '';
  const count = result.total === 1 ? '1 producto' : `${result.total} productos`;
  const more = result.total > MAX_RESULTS ? `; te muestro los ${MAX_RESULTS} primeros` : '';
  const intro = result.outOfRange ? `No encontré productos${describeCriteria(filters, false)} en ese rango de precio. Los más cercanos son`
    : result.relaxed ? `Estos productos${describeCriteria(filters, true)} podrían servirte`
    : `Encontré ${count}${describeCriteria(filters, true)}${order}${more}`;
  const lines = result.products.map((product, index) => `${index + 1}. ${describeProduct(product)}.`);
  const spoken = result.products.slice(0, 3)
    .map(product => `${product.nombre}, ${speakPrice(product.precioFinal)}`).join('; ');
  const actions = result.total > MAX_RESULTS ? generalActions(['open_catalog']) : [];
  return buildReply([`${intro}:`, ...lines].join('\n'), 'catalogo', result.products, actions, `${intro}. ${spoken}.`);
}

function helpReply(topic: HelpTopic): AssistantReply {
  return buildReply(topic.answer, 'ayuda', [], generalActions(topic.actions));
}

function pickProduct(context: PublicProduct[], position: number): AssistantReply {
  const index = position < 0 ? context.length - 1 : position;
  const product = context[index];
  if (!product) {
    return buildReply(`En la lista anterior hay ${context.length === 1 ? '1 producto' : `${context.length} productos`}. ¿Cuál quieres ver?`,
      'sin-datos', [], []);
  }
  return productReply(product, `El ${position < 0 ? 'último' : ORDINAL_LABELS[index] ?? `número ${index + 1}`} es`);
}

function pickByPrice(context: PublicProduct[], mode: 'min' | 'max'): AssistantReply {
  const pick = [...context].sort((first, second) => mode === 'min'
    ? first.precioFinal - second.precioFinal : second.precioFinal - first.precioFinal)[0];
  return productReply(pick, `De esos, el más ${mode === 'min' ? 'económico' : 'caro'} es`);
}

function cleanGeneralAnswer(value: string | null): string | null {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!text || /s\/\s*\d|\d\s*soles|\bstock\b/i.test(text)) return null;
  if (text.length <= MAX_GENERAL_ANSWER) return text;
  const cut = text.slice(0, MAX_GENERAL_ANSWER);
  const end = cut.lastIndexOf('. ');
  return end > 0 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
}

function filtersFromModel(ai: ModelInterpretation, meta: CatalogMeta, rules: CatalogFilters): CatalogFilters {
  const keyOf = (value: string | null) => value ? toWords(value) : '';
  const sub = meta.subcategories.find(item => item.key === keyOf(ai.categoria));
  const category = sub ? meta.categories.find(item => item.name === sub.category) : meta.categories.find(item => item.key === keyOf(ai.categoria));
  const brand = meta.brands.find(item => item.key === keyOf(ai.marca));
  const categoria = sub?.category ?? category?.name ?? rules.categoria;
  const subcategoria = sub?.name ?? (categoria === rules.categoria ? rules.subcategoria : undefined);
  const marca = brand?.name ?? rules.marca;
  const price = (value: number | null) => value !== null && Number.isFinite(value) && value > 0 && value < 10_000_000 ? value : undefined;
  const catalogWords = new Set([sub?.key, category?.key, brand?.key, ...(category ? CATEGORY_HINTS[category.key] ?? [] : [])]
    .filter((word): word is string => !!word).flatMap(variants));
  const terms = toWords(ai.texto ?? '').split(' ').filter(word => word.length >= 3 && !STOPWORDS.has(word)
    && !SHOPPING_WORDS.includes(word) && !/^\d+$/.test(word) && !catalogWords.has(word)).slice(0, 6);
  const filters: CatalogFilters = {
    categoria,
    subcategoria,
    marca,
    precioMin: price(ai.precioMin) ?? rules.precioMin,
    precioMax: price(ai.precioMax) ?? rules.precioMax,
    orden: ai.orden ?? rules.orden,
    conOferta: ai.soloOferta || rules.conOferta,
    soloDisponibles: ai.soloDisponibles || rules.soloDisponibles,
    generic: false,
    terms
  };
  filters.generic = !filters.categoria && !filters.marca && !filters.terms.length;
  return filters;
}

async function replyFromModel(query: AssistantQuery, meta: CatalogMeta, rules: CatalogFilters, help: HelpTopic | null,
  contextIds: number[], signal?: AbortSignal): Promise<AssistantReply | null> {
  const context = await contextProducts(contextIds);
  const ai = await interpretMessage({
    message: query.message,
    history: query.history,
    topics: HELP_TOPICS.map(topic => ({ id: topic.id, summary: topic.summary })),
    categories: meta.categories.map(item => item.name),
    subcategories: meta.subcategories.map(item => item.name),
    brands: meta.brands.map(item => item.name),
    list: context.map(product => `${product.nombre}${product.marca ? ` (${product.marca})` : ''}`)
  }, signal);
  if (!ai) return null;

  switch (ai.intent) {
    case 'ayuda': {
      const topic = HELP_TOPICS.find(item => item.id === ai.topic);
      return topic ? helpReply(topic) : null;
    }
    case 'catalogo':
      return catalogReply(filtersFromModel(ai, meta, rules));
    case 'lista':
      if (!context.length) return buildReply(CLARIFY_ANSWER, 'sin-datos', [], generalActions(['open_catalog']));
      if (ai.comparacion) return pickByPrice(context, ai.comparacion);
      if (ai.referencia !== null && Number.isInteger(ai.referencia) && ai.referencia !== 0 && Math.abs(ai.referencia) <= 10) {
        return pickProduct(context, ai.referencia < 0 ? -1 : ai.referencia - 1);
      }
      return null;
    case 'general': {
      const answer = cleanGeneralAnswer(ai.respuesta);
      return answer ? buildReply(answer, 'ia', [], []) : null;
    }
    case 'fuera':
      return help?.priority === 'strong' ? helpReply(help) : buildReply(OUT_OF_SCOPE, 'sin-datos', [], generalActions(['open_catalog']));
  }
}

export async function answerQuery(query: AssistantQuery, signal?: AbortSignal): Promise<AssistantReply> {
  const text = toWords(query.message);
  const meta = await loadCatalogMeta();
  const filters = extractFilters(query.message, meta);
  const help = matchHelp(text);
  const newCriteria = !!(filters.categoria || filters.marca || filters.terms.length);
  const hasCriteria = newCriteria || filters.generic || filters.conOferta || filters.soloDisponibles || !!filters.orden
    || filters.precioMin !== undefined || filters.precioMax !== undefined;
  const shopping = SHOPPING_WORDS.some(word => hasPhrase(text, word)) || filters.precioMin !== undefined
    || filters.precioMax !== undefined || filters.conOferta || !!filters.orden;

  const routeProduct = query.route.match(/^\/producto\/(\d+)$/);
  const onProductPage = routeProduct ? Number(routeProduct[1]) : null;
  const contextIds = query.productIds.length ? query.productIds
    : onProductPage && PRODUCT_FACTS.test(text) && !newCriteria ? [onProductPage] : [];

  const ordinal = ordinalIndex(text);
  if (ordinal !== null && !newCriteria) {
    const context = await contextProducts(contextIds);
    if (!context.length) return buildReply(CLARIFY_ANSWER, 'sin-datos', [], generalActions(['open_catalog']));
    return pickProduct(context, ordinal);
  }

  const comparative = CHEAPEST.test(text) ? 'min' : PRICIEST.test(text) ? 'max' : null;
  if (comparative && query.productIds.length && !newCriteria && (REFERS_TO_LIST.test(text) || text.split(' ').length <= 7)) {
    const context = await contextProducts(query.productIds);
    if (context.length) return pickByPrice(context, comparative);
  }

  if (!query.productIds.length && contextIds.length === 1 && !comparative) {
    const [product] = await contextProducts(contextIds);
    if (product) return productReply(product, 'Este producto es');
  }

  if (help?.priority === 'strong') return helpReply(help);

  if (modelConfigured()) {
    const reply = await replyFromModel(query, meta, filters, help, query.productIds, signal);
    if (reply) return reply;
  }

  if (help && HOW_TO.test(text)) return helpReply(help);
  if (shopping && hasCriteria) return catalogReply(filters);
  if (help) return helpReply(help);
  if (hasCriteria) return catalogReply(filters);
  return buildReply(FALLBACK_ANSWER, 'sin-datos', [], generalActions(['open_catalog']));
}
