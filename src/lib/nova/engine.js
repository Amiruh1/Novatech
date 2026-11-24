// Motor de Nova. Flujo:
//  1) Se interpreta la pregunta → intención (con OpenAI si hay clave; si no, o si falla, con reglas propias).
//  2) El servidor valida categoría, marca y tema contra la base de datos / las guías.
//  3) La respuesta se arma SIEMPRE con datos del catálogo (precios, stock) o de las guías verificadas.
//     Nova no inventa precios, envíos ni políticas; si no tiene un dato, lo dice.
import { effectivePrice, offerActive } from '../pricing.js';
import { GUIDES, UNKNOWN_TOPICS, UNKNOWN_TEXT } from './guides.js';
import { interpretWithAI, aiEnabled } from './ai.js';

export const plain = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const soles = (n) => `S/ ${Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const singular = (w) => w.replace(/(es|s)$/, '');
/** true si a y b se diferencian en como mucho «max» letras (distancia de edición). */
function near(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (Math.min(...cur) > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

// Sinónimos: cómo dice la gente cada tipo de producto → una forma común. Se aplican a la pregunta Y al
// nombre de la categoría, así «audífonos» encuentra «Auriculares» y al revés, aunque mañana la categoría
// se llame de otra forma. Sirven para categorías que aún no existen (celulares, tablets, parlantes…).
const SYN_GROUPS = [
  ['auricular', 'auriculares', 'audifono', 'audifonos', 'casco', 'cascos', 'headset', 'headsets', 'headphone', 'headphones', 'earbud', 'earbuds'],
  ['mouse', 'mouses', 'raton', 'ratones'],
  ['laptop', 'laptops', 'portatil', 'portatiles', 'notebook', 'notebooks'],
  ['monitor', 'monitores'],
  ['teclado', 'teclados', 'keyboard', 'keyboards'],
  ['camara', 'camaras'],
  ['celular', 'celulares', 'smartphone', 'smartphones', 'movil', 'moviles'],
  ['tablet', 'tablets', 'tableta', 'tabletas', 'ipad'],
  ['impresora', 'impresoras', 'printer', 'printers'],
  ['parlante', 'parlantes', 'altavoz', 'altavoces', 'bocina', 'bocinas', 'speaker', 'speakers'],
  ['computadora', 'computadoras', 'pc', 'pcs', 'desktop', 'desktops', 'ordenador', 'ordenadores', 'cpu'],
  ['almacenamiento', 'disco', 'discos', 'ssd', 'hdd'],
  ['consola', 'consolas', 'videojuego', 'videojuegos'],
  ['smartwatch', 'smartwatches', 'reloj', 'relojes'],
  ['gamer', 'gamers', 'gaming', 'juego', 'juegos', 'jugar'],
  ['inalambrico', 'inalambricos', 'inalambrica', 'inalambricas', 'bluetooth', 'wireless'],
  ['cable', 'cables', 'cableado', 'cableados', 'alambrico', 'alambricos'],
  ['oficina', 'trabajo', 'estudio', 'estudiar', 'estudiante', 'estudiantes', 'universidad'],
  ['microfono', 'microfonos', 'mic'],
  ['router', 'routers', 'wifi', 'redes', 'modem'],
  ['silla', 'sillas'],
  ['accesorio', 'accesorios', 'periferico', 'perifericos'],
];
const SYN = new Map(SYN_GROUPS.flatMap((g) => g.map((w) => [w, g[0]])));
const canon = (w) => SYN.get(w) || SYN.get(singular(w)) || singular(w);
/** Frases de varias palabras que equivalen a otra forma («webcam» = «cámara web», «sin cable» = inalámbrico). */
const expandPhrases = (t) => t
  .replace(/\bwebcams?\b/g, 'camara web').replace(/\bsin cables?\b/g, 'inalambrico')
  .replace(/\breloj(es)? inteligentes?\b/g, 'smartwatch').replace(/\bdisco duro\b/g, 'disco');
const SMALL = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'para', 'con', 'sin', 'a', 'en', 'por']);

/**
 * ¿La pregunta (sus palabras) menciona este nombre del catálogo? → { sc, used } o null.
 * Cada palabra importante del nombre debe aparecer: igual o en plural (3), como sinónimo (2) o con un
 * error de tipeo (1: una letra en palabras de 5+, dos en las de 8+). sc = la peor de esas coincidencias.
 * Las palabras cortas como «LG» o «HP» solo valen completas (así «LG» no aparece dentro de «algo»).
 */
function nameScore(name, words) {
  const parts = plain(name).split(/[^a-z0-9ñ]+/).filter((x) => x && !SMALL.has(x));
  if (!parts.length) return null;
  let sc = 3; const used = [];
  for (const part of parts) {
    let best = 0, bw = null;
    for (const w of words) {
      if (w.length < 2 || (w.length === 2 && w !== part)) continue;
      const s = w === part || singular(w) === singular(part) ? 3
        : canon(w) === canon(part) ? 2
          : part.length >= 5 && w.length >= 4 && !STOP.has(w) && near(singular(w), singular(part), part.length >= 8 ? 2 : 1) ? 1 : 0;
      if (s > best) { best = s; bw = w; }
    }
    if (!best) return null;
    sc = Math.min(sc, best); used.push(bw);
  }
  return { sc: sc + parts.length / 100, used }; // a igual calidad, gana el nombre más largo («Cámara web» > «Cámara»)
}
/** El elemento de la lista cuyo nombre coincide mejor, o null. */
function bestMatch(list, words) {
  let top = null;
  for (const x of list) { const r = nameScore(x.nombre, words); if (r && (!top || r.sc > top.sc)) top = { ...r, x }; }
  return top;
}
const STOP = new Set(('a al algo alguna alguno algun busco buscar busca cual cuales cuanto cuesta de del dame el en es esta este hay la las lo los me mi muestrame mostrar necesito para por que quiero se soles sol s tienes un una unos unas y o con sin mas menos hasta desde entre precio barato barata baratos baratas economico economica caro cara mejor mejores ver tengo algo' +
  // Verbos y muletillas de las preguntas («¿qué monitores tiene?», «¿venden laptops?»): no son productos.
  ' tiene tienen hay venden vende ofrecen ofrece manejan maneja disponible disponibles cuantos cuantas usted ustedes tu su sus puedo puede podria quisiera gustaria recomiendas recomienda recomiendame recomendar ensename enseñame mira muestra muestrame tipo tipos clase clases cosas productos producto articulos articulo favor hola tambien tienda novatech').split(' '));

const pub = (p) => ({ id: p.id, nombre: p.nombre, marca: p.marca || null, categoria: p.categoria || null, imagen: p.imagen || null, precio: p.precio, precio_final: effectivePrice(p), en_oferta: offerActive(p), stock: p.stock, sku: p.sku || null });

// ---- «Agregar al carrito» ----
const ADD_RX = /^(?:por favor\s+)?(?:agrega(?:me|lo|la|los|las)?|agregar|anade(?:me|lo|la)?|anadir|pon(?:me|lo|la)?|poner|mete(?:me|lo|la)?|meter|sumar?|incluye|incluir)\b/;
const NUM_WORDS = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
const ORDINALS = { primero: 1, primer: 1, primera: 1, segundo: 2, segunda: 2, tercero: 3, tercer: 3, tercera: 3, cuarto: 4, cuarta: 4, quinto: 5, quinta: 5, ultimo: -1, ultima: -1 };
/** Devuelve { cantidad, palabras, posicion, este, mas_barato } si la frase pide agregar algo al carrito. */
function parseAdd(t) {
  const pideCarrito = /\b(al|a mi|en el|en mi)\s+carrito\b/.test(t);
  if (!ADD_RX.test(t) && !(pideCarrito && /^(quiero|deseo|me llevo|llevo)\b/.test(t))) return null;
  if (!ADD_RX.test(t) && !pideCarrito) return null;
  let rest = t.replace(ADD_RX, ' ').replace(/^(quiero|deseo|me llevo|llevo)\b/, ' ')
    .replace(/\b(al|a mi|en el|en mi)\s+carrito\b/g, ' ').replace(/\bcarrito\b/g, ' ').replace(/[¿?¡!.,"«»“”]/g, ' ');
  let cantidad = 1;
  const q = rest.match(/^\s*(\d{1,2}|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b(?:\s+unidad(?:es)?(?:\s+de)?)?/);
  if (q && !/^\s*(un|una|uno)\s*$/.test(rest)) { cantidad = Number(q[1]) || NUM_WORDS[q[1]] || 1; rest = rest.slice(q[0].length); }
  rest = rest.replace(/\b(el|la|los|las|un|una|unos|unas|producto|productos|articulo|del|de la|de)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const out = { cantidad: Math.min(Math.max(cantidad, 1), 99), palabras: rest, posicion: null, este: false, mas_barato: false };
  const ord = rest.match(/^(primero|primer|primera|segundo|segunda|tercero|tercer|tercera|cuarto|cuarta|quinto|quinta|ultimo|ultima)\b/);
  if (ord) { out.posicion = ORDINALS[ord[1]]; out.palabras = ''; }
  if (/^(mas barato|mas economico|mas barata|mas economica)$/.test(rest)) { out.mas_barato = true; out.palabras = ''; }
  if (!rest || /^(este|esta|esto|eso|ese|esa|lo|la)$/.test(rest)) { out.este = true; out.palabras = ''; }
  return out;
}
/** Busca el producto por nombre: devuelve { exacto } si hay uno claro, o { candidatos } si es ambiguo. */
function matchProduct(products, palabras) {
  const words = plain(palabras).split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));
  if (!words.length) return { candidatos: [] };
  const active = products.filter((p) => p.activo !== false);
  const full = plain(palabras);
  const exact = active.find((p) => plain(p.nombre) === full || (p.sku && plain(p.sku) === full));
  if (exact) return { exacto: exact };
  const hay = (p) => plain([p.nombre, p.marca, p.sku].join(' '));
  const scored = active.map((p) => ({ p, s: words.filter((w) => hay(p).includes(w) || hay(p).includes(singular(w))).length }))
    .filter((x) => x.s > 0).sort((a, b) => b.s - a.s || (b.p.stock > 0) - (a.p.stock > 0));
  if (!scored.length) return { candidatos: [] };
  const top = scored.filter((x) => x.s === scored[0].s);
  // Uno claro: todas las palabras coinciden y nadie más empata.
  if (top.length === 1 && scored[0].s === words.length) return { exacto: top[0].p };
  return { candidatos: scored.slice(0, 4).map((x) => x.p) };
}

// ---- Características técnicas (especificaciones de cada producto, cargadas en el panel) ----
// Cada una: cómo la nombra el cliente (rx), cómo se llama en la ficha (name) y cómo leer su número
// (parse → { n, unit } o null). Así se puede comparar «¿cuál tiene más RAM?» o filtrar «16 GB de RAM».
const num1 = (s) => Number(String(s).replace(',', '.'));
const toGb = (v) => { const m = plain(v).match(/(\d+(?:[.,]\d+)?)\s*(tb|gb)\b/); return m ? { n: num1(m[1]) * (m[2] === 'tb' ? 1024 : 1), unit: 'GB' } : null; };
/** Gama del procesador: i3 < i5 < i7 < i9 (Intel), Ryzen 3 < 5 < 7 < 9 (AMD), Apple M; luego la generación. */
const cpuScore = (v) => {
  const t = plain(v); let m;
  if ((m = t.match(/\bi([3579])[\s-]*(\d{4,5})?/))) return { n: Number(m[1]) * 1000 + Number((m[2] || '0').slice(0, 2)), unit: 'gama' };
  if ((m = t.match(/\bultra\s*([3579])\b/))) return { n: Number(m[1]) * 1000 + 50, unit: 'gama' };
  if ((m = t.match(/ryzen\s*([3579])\s*(\d{4})?/))) return { n: Number(m[1]) * 1000 + Number((m[2] || '0').slice(0, 1)) * 5, unit: 'gama' };
  if ((m = t.match(/\bm([1-4])\b/))) return { n: 7000 + Number(m[1]) * 100, unit: 'gama' };
  if (/celeron|pentium|athlon|mediatek|snapdragon/.test(t)) return { n: 1000, unit: 'gama' };
  return null;
};
/** Gráficos: dedicados (RTX > GTX / Radeon RX) por encima de los integrados (Iris, UHD, Radeon 610M…). */
const gpuScore = (v) => {
  const t = plain(v); let m;
  if ((m = t.match(/rtx\s*(\d{4})/))) return { n: 5000 + Number(m[1]) / 10, unit: 'gama' };
  if ((m = t.match(/\brx\s*(\d{4})/))) return { n: 4500 + Number(m[1]) / 10, unit: 'gama' };
  if ((m = t.match(/gtx\s*(\d{4})/))) return { n: 4000 + Number(m[1]) / 10, unit: 'gama' };
  if (/iris|uhd|integrad|radeon|graphics|vega/.test(t)) return { n: 1000 + (Number((t.match(/(\d{3})m\b/) || [])[1]) || 0) / 10, unit: 'gama' };
  return null;
};
const SPECS = {
  ram: { f: true, rx: /\b(ram|memoria)\b/, name: /memoria ram|^ram$|^memoria$/, label: 'memoria RAM', parse: toGb },
  almacenamiento: { rx: /\b(almacenamiento|disco|ssd|capacidad|espacio)\b/, name: /almacenamiento|disco|ssd|capacidad/, label: 'almacenamiento', parse: toGb },
  pantalla: { f: true, rx: /\b(pantalla|pulgadas|tamano|grande|grandes|pequen[oa]s?)\b/, name: /pantalla|pulgadas|tamano/, label: 'pantalla', parse: (v) => { const m = plain(v).match(/(\d{2}(?:[.,]\d)?)/); return m && num1(m[1]) >= 5 && num1(m[1]) <= 100 ? { n: num1(m[1]), unit: 'pulgadas' } : null; } },
  procesador: { rx: /\b(procesador|procesadores|cpu|potente|potentes|rapid[oa]s?|rendimiento|veloz)\b/, name: /procesador|cpu|chip/, label: 'procesador', parse: cpuScore },
  graficos: { rx: /\b(grafic\w*|tarjeta de video|gpu|para juegos)\b/, name: /grafic|video|gpu/, label: 'gráficos', parse: gpuScore },
  bateria: { f: true, rx: /\b(bateria|autonomia|dure|duracion)\b/, name: /bateria|autonomia/, label: 'batería', parse: (v) => { const t = plain(v); let m; if ((m = t.match(/(\d+(?:[.,]\d+)?)\s*wh\b/))) return { n: num1(m[1]), unit: 'Wh' }; if ((m = t.match(/(\d+)\s*horas?/))) return { n: Number(m[1]), unit: 'horas' }; if ((m = t.match(/(\d{3,5})\s*mah/))) return { n: Number(m[1]), unit: 'mAh' }; return null; } },
  refresco: { f: true, rx: /\b(hz|hercios|refresco|fluid[oa]s?|fps)\b/, name: /refresco|frecuencia/, label: 'tasa de refresco', parse: (v) => { const m = plain(v).match(/(\d{2,3})\s*hz/); return m ? { n: Number(m[1]), unit: 'Hz' } : null; } },
  resolucion: { f: true, rx: /\b(resolucion|nitidez|4k|2k|full hd|qhd)\b/, name: /resolucion/, label: 'resolución', parse: (v) => { const t = plain(v); const m = t.match(/(\d{3,4})\s*x\s*(\d{3,4})/); if (m) return { n: Number(m[1]) * Number(m[2]), unit: 'px' }; if (/4k|uhd/.test(t)) return { n: 3840 * 2160, unit: 'px' }; return null; } },
};
/** Valor de una característica en un producto → { n, unit, text } o null. */
export function specValue(p, key) {
  const def = SPECS[key];
  for (const s of p.especificaciones || []) {
    if (!def.name.test(plain(String(s.nombre || '').replace(/[:()]/g, ' ')).trim())) continue;
    const v = def.parse(s.valor);
    if (v) return { ...v, text: String(s.valor).trim() };
  }
  return null;
}
const specOf = (tt) => Object.keys(SPECS).find((k) => SPECS[k].rx.test(tt)) || null;

// Preguntas sobre los pedidos del propio cliente (texto ya sin tildes ni signos).
const ORDER_RX = /\b(mis?|el|la) (pedidos?|compras?|ordenes|orden)\b|\bnt \d{8} [a-z0-9]{4}\b|\bultim[oa]s? (pedidos?|compras?|ordenes)\b|\b(ya|cuando) (me )?(llega|llegan|llego|confirmaron|enviaron|despacharon|sale)\b|\bdonde esta mi\b|\bestado de mi\b|\bcuanto (he |llevo )?(gastado|gaste)\b|\bconfirm\w* (mi |el )?pago\b|\bya pague\b/;
const ESTADO_TXT = {
  pendiente: 'Pendiente: estamos esperando confirmar tu pago', pagado: 'Pagado: tu pago está confirmado y pronto lo preparamos',
  preparando: 'Preparando: estamos armando tu pedido', 'en camino': 'En camino: ya salió hacia tu dirección',
  entregado: 'Entregado', cancelado: 'Cancelado', reembolsado: 'Reembolsado',
};
const fecha = (iso) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', timeZone: 'America/Lima' });

/** Interpretación con reglas: precio, categoría, marca, tema de guía, «de esos» y producto actual. */
export function interpretWithRules(text, ctx, cat) {
  const t = plain(text);
  const it = { intencion: 'buscar', categoria: null, marca: null, precio_min: null, precio_max: null, palabras: '', orden: 'relevancia', criterio_previos: null, tema: null };
  if (/^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|que tal)\b/.test(t) && t.split(' ').length <= 4) return { ...it, intencion: 'saludo' };
  if (/^(gracias|muchas gracias|ok|listo|perfecto)\b/.test(t) && t.split(' ').length <= 3) return { ...it, intencion: 'gracias' };
  // «Agregar al carrito …»: solo cuando el cliente lo pide explícitamente.
  const add = parseAdd(t);
  if (add) return { ...it, intencion: 'agregar', ...add };
  const tt = t.replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  // Los pedidos del propio cliente («¿dónde está mi pedido?», «NT-20261112-A1E3», «¿ya confirmaron mi pago?»).
  // Las preguntas de «cómo» (pagar, cancelar, comprobante…) siguen siendo guías.
  if (ORDER_RX.test(tt) && !/\b(como|puedo|formas?|metodos?|medios?)\b.{0,14}\bpag|cancel|anul|factura|boleta|comprobante|devol|seguimiento/.test(tt)) {
    const cm = tt.match(/\bnt (\d{8}) ([a-z0-9]{4})\b/);
    return { ...it, intencion: 'pedidos', codigo: cm ? `NT-${cm[1]}-${cm[2].toUpperCase()}` : null,
      consulta: /\bcuanto (he |llevo )?(gastado|gaste)\b/.test(tt) ? 'gasto' : /confirm\w* (mi |el )?pago|\bya pague\b|pago (fue |esta )?confirmado/.test(tt) ? 'pago' : 'estado' };
  }
  // Características: «¿cuál tiene más RAM?», «la de mejor procesador», «el monitor más grande».
  const specKey = specOf(tt);
  const compar = !!specKey && /\b(mas|mayor|mayores|mejor|mejores|menos|menor|menores|peor|peores|maxim[oa]|minim[oa]|potentes?|grandes?|rapid[oa]s?|fluid[oa]s?|pequen[oa]s?)\b/.test(tt) && !/\b(barat\w*|economic\w*|precio|car[oa]s?)\b/.test(tt);
  const specDir = /\b(menos|menor|menores|peor|peores|minim[oa]|pequen[oa]s?)\b/.test(tt) ? 'min' : 'max';
  // Sobre el producto que está viendo: «¿cuánta RAM tiene?», «¿qué procesador tiene?», «¿de cuántas pulgadas es?».
  if (ctx.producto_id && specKey && !compar && /\b(tiene|trae|cuanta|cuantas|cuanto|cuantos|cual es|que|como es|viene|es|son|dura)\b/.test(tt) && !cat.categorias.some((c) => tt.includes(singular(plain(c.nombre))))) {
    return { ...it, intencion: 'producto_actual', spec: specKey };
  }
  // Preguntas sobre los productos de la respuesta anterior («¿cuál de esos cuesta menos?»).
  if (!compar && ctx.ultimos?.length && /\b(esos|estos|ellos|de ellos|anteriores|cual|cuales|el mas|la mas)\b/.test(t) && !/\b(busca|buscar|quiero|muestrame)\b/.test(t)) {
    if (/(menos|barat|economic|menor precio)/.test(t)) return { ...it, intencion: 'previos', criterio_previos: 'mas_barato' };
    if (/(mas car|mayor precio|mas cuesta|premium)/.test(t)) return { ...it, intencion: 'previos', criterio_previos: 'mas_caro' };
    if (/(stock|disponible|hay|quedan)/.test(t)) return { ...it, intencion: 'previos', criterio_previos: 'con_stock' };
    if (/(oferta|descuento)/.test(t)) return { ...it, intencion: 'previos', criterio_previos: 'en_oferta' };
  }
  // Pregunta sobre el producto que el cliente está viendo.
  if (ctx.producto_id && /\b(este|esta|este producto|lo tienen|tiene stock|hay stock|cuanto cuesta|precio|garantia|caracteristicas|especificaciones)\b/.test(t) && !cat.categorias.some((c) => t.includes(singular(plain(c.nombre))))) {
    return { ...it, intencion: 'producto_actual' };
  }
  // ¿Qué vende la tienda? («¿qué categorías tienen?», «¿qué marcas de laptops venden?», «¿qué hay?»)
  const catalogQ = /\b(que|cuales) (categorias|secciones|tipos|clases|subcategorias|variedades)\b|\bque hay en\b|^(que|y que) (venden|vendes|ofrecen|manejan|tienen|tienes|hay)( ustedes)?$|\bque (productos|cosas|articulos) (venden|vendes|tienen|tienes|hay|ofrecen|manejan)\b|cuantos productos|catalogo completo|\b(que|cuales|con que) marcas\b|\bmarcas (venden|vendes|tienen|tienes|manejan|trabajan|hay)\b/.test(tt)
    && !/\b(pagos?|pagar|envios?|comprobantes?|tarjetas?|metodos?|formas?|medios?|cuentas?|direcciones?)\b/.test(tt); // «¿qué tipos de pago?» es una guía
  // Guías de uso (antes que la búsqueda).
  if (!catalogQ) for (const [id, g] of Object.entries(GUIDES)) if (g.rx.test(t)) return { ...it, intencion: 'guia', tema: id };
  if (UNKNOWN_TOPICS.test(t)) return { ...it, intencion: 'desconocido' };

  // Precios: «menos de 1500», «hasta 2000», «más de 1000», «entre 1000 y 2000», «1500 soles».
  const num = (s) => Number(String(s).replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'));
  let m;
  // Un número seguido de GB, TB, Hz o pulgadas es una característica, no un precio («hasta 512 GB»).
  const NOT_PRICE = String.raw`(?![\d.,]|\s*(?:gb|tb|hz|pulgadas|pulg|wh|mah|"))`;
  if ((m = t.match(new RegExp(String.raw`entre\s*s?\/?\s*([\d.,]+)${NOT_PRICE}\s*(?:soles)?\s*y\s*s?\/?\s*([\d.,]+)${NOT_PRICE}`)))) { it.precio_min = num(m[1]); it.precio_max = num(m[2]); }
  else {
    if ((m = t.match(new RegExp(String.raw`(?:menos de|menor a|menores a|hasta|maximo|max|no mas de|por debajo de|bajo)\s*s?\/?\s*([\d.,]+)${NOT_PRICE}`)))) it.precio_max = num(m[1]);
    if ((m = t.match(new RegExp(String.raw`(?:mas de|mayor a|desde|minimo|por encima de|arriba de)\s*s?\/?\s*([\d.,]+)${NOT_PRICE}`)))) it.precio_min = num(m[1]);
    if (it.precio_max == null && it.precio_min == null && (m = t.match(/(?:de|por|a)\s*s?\/?\s*([\d.,]{3,})\s*soles/))) it.precio_max = num(m[1]);
  }
  if (/(barat|economic|menor precio|mas accesible)/.test(t)) it.orden = 'precio_asc';
  if (/(mas car|mejor gama|premium|gama alta)/.test(t)) it.orden = 'precio_desc';
  if (/(oferta|descuento|rebaja|promocion)/.test(t)) it.solo_ofertas = true;
  // Mínimos por característica: «16 GB de RAM», «1 TB», «512 GB SSD», «27 pulgadas», «144 Hz».
  let sm;
  if ((sm = t.match(/(\d+)\s*gb\s*(?:de\s*)?(?:ram|memoria)\b/) || t.match(/\b(?:ram|memoria)\s*(?:de\s*)?(\d+)\s*gb/))) it.spec_min = { key: 'ram', n: Number(sm[1]) };
  else if ((sm = t.match(/(\d+(?:[.,]\d+)?)\s*(gb|tb)\s*(?:de\s*)?(?:almacenamiento|ssd|disco)/) || t.match(/\b(?:almacenamiento|ssd|disco)\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*(gb|tb)/) || t.match(/(\d+(?:[.,]\d+)?)\s*(tb)\b/))) it.spec_min = { key: 'almacenamiento', n: num1(sm[1]) * (sm[2] === 'tb' ? 1024 : 1) };
  else if ((sm = t.match(/(\d+)\s*gb\b/))) it.spec_min = Number(sm[1]) >= 128 ? { key: 'almacenamiento', n: Number(sm[1]) } : { key: 'ram', n: Number(sm[1]) };
  if ((sm = t.match(/(\d{2}(?:[.,]\d)?)\s*(?:"|”|pulgadas|pulg\b)/))) it.spec_min = { key: 'pantalla', n: num1(sm[1]), aprox: true };
  else if ((sm = t.match(/(\d{2,3})\s*hz\b/))) it.spec_min = { key: 'refresco', n: Number(sm[1]) };

  const words = expandPhrases(t).replace(/s?\/?\s*[\d.,]+/g, ' ').split(/[^a-z0-9ñ]+/).filter(Boolean);
  // Categorías, subcategorías y marcas se reconocen por su nombre en la base, sea cual sea: así una
  // categoría nueva creada desde el panel funciona sin tocar este código. Gana la mejor coincidencia.
  const consumed = new Set();
  const take = (r) => { if (r) for (const w of r.used) consumed.add(w); return r; };
  const cm = take(bestMatch(cat.categorias, words));
  const subs = cat.subcategorias.map((s) => ({ s, r: nameScore(s.nombre, words) })).filter((o) => o.r);
  const inCat = cm ? subs.filter((o) => o.s.categoria_id === cm.x.id) : subs;
  // Sin categoría y con subcategorías de varias categorías («ratón inalámbrico»: Mouse e Inalámbrico),
  // manda la que se nombra primero: en español el producto va antes que su característica.
  let pool = inCat;
  if (!cm && pool.length > 1) {
    const pos = (o) => Math.min(...o.r.used.map((w) => words.indexOf(w)));
    const first = Math.min(...pool.map(pos));
    pool = pool.filter((o) => pos(o) === first);
  }
  const top = pool.length ? Math.max(...pool.map((o) => o.r.sc)) : 0;
  const tops = pool.filter((o) => o.r.sc === top);
  if (tops.length === 1 || (cm && tops.length)) {
    const s = tops[0].s; take(tops[0].r);
    it.subcategoria = s.nombre;
    it.categoria = cat.categorias.find((x) => x.id === s.categoria_id)?.nombre || cm?.x.nombre || null;
  } else if (tops.length > 1) {
    // El mismo nombre en varias categorías («Gamer» en laptops y en mouse): se filtra solo por la subcategoría.
    for (const o of tops) take(o.r);
    it.subcategoria = tops[0].s.nombre;
  } else if (cm) it.categoria = cm.x.nombre;
  const b = take(bestMatch(cat.marcas, words));
  if (b) it.marca = b.x.nombre;
  it.palabras = words.filter((w) => !STOP.has(w) && !consumed.has(w) && w.length > 1 && !/^(oferta|ofertas|descuento|descuentos|marca|marcas|categoria|categorias|subcategoria|subcategorias|tipo|tipos|clase|clases)$/.test(w)
    && !((it.spec_min || compar) && /^(gb|tb|hz|ram|memoria|almacenamiento|ssd|disco|pulgadas|pulg|procesador|procesadores|bateria|autonomia|pantalla|refresco|resolucion|graficos|grafica|graficas|mayor|menor|potente|potentes|grande|grandes|rapido|rapida|fluido|fluida|tiene|tienen|cual|cuales)$/.test(w))).join(' ');
  if (catalogQ) {
    const tipo = /marca/.test(tt) ? 'marcas' : it.categoria && /\b(tipos?|clases?|subcategorias?|variedad|modelos)\b|que hay en/.test(tt) ? 'subcategorias' : 'categorias';
    return { ...it, intencion: 'catalogo', tipo };
  }
  // «¿Cuál tiene más RAM?»: entre los productos que acaba de ver, o en la categoría / marca que nombró.
  if (compar) {
    const previos = !!ctx.ultimos?.length && !it.categoria && !it.subcategoria && !it.marca;
    return { ...it, intencion: 'spec', spec: specKey, dir: specDir, usa_previos: previos };
  }
  return it;
}

/** Valida la intención (venga de la IA o de las reglas) contra la base de datos. */
function validate(it, cat) {
  const find = (list, v) => (v ? list.find((x) => plain(x.nombre) === plain(v) || singular(plain(x.nombre)) === singular(plain(v))) : null);
  const out = { ...it };
  out.categoria = find(cat.categorias, it.categoria)?.nombre || null;
  out.subcategoria = find(cat.subcategorias, it.subcategoria)?.nombre || null;
  out.marca = find(cat.marcas, it.marca)?.nombre || null;
  out.tema = it.tema && GUIDES[it.tema] ? it.tema : null;
  for (const k of ['precio_min', 'precio_max']) { const v = Number(it[k]); out[k] = Number.isFinite(v) && v > 0 && v < 1e7 ? v : null; }
  if (out.intencion === 'guia' && !out.tema) out.intencion = 'desconocido';
  if (out.intencion === 'catalogo') out.tipo = ['marcas', 'subcategorias'].includes(it.tipo) ? it.tipo : 'categorias';
  out.spec = SPECS[it.spec] ? it.spec : null;
  out.dir = it.dir === 'min' ? 'min' : 'max';
  out.spec_min = it.spec_min && SPECS[it.spec_min.key] && Number(it.spec_min.n) > 0 ? { key: it.spec_min.key, n: Number(it.spec_min.n), aprox: !!it.spec_min.aprox } : null;
  if (out.intencion === 'spec' && !out.spec) out.intencion = 'buscar';
  if (out.intencion === 'pedidos') { out.codigo = /^NT-\d{8}-[A-Z0-9]{4}$/.test(String(it.codigo || '')) ? it.codigo : null; out.consulta = ['gasto', 'pago'].includes(it.consulta) ? it.consulta : 'estado'; }
  out.palabras = String(it.palabras || '').slice(0, 80);
  if (out.intencion === 'agregar') {
    out.cantidad = Math.min(Math.max(parseInt(it.cantidad, 10) || 1, 1), 99);
    out.posicion = Number.isInteger(it.posicion) ? it.posicion : null;
    out.este = !!it.este; out.mas_barato = !!it.mas_barato;
  }
  return out;
}

function search(products, it) {
  let list = products.filter((p) => p.activo !== false);
  if (it.categoria) list = list.filter((p) => plain(p.categoria) === plain(it.categoria));
  if (it.subcategoria) list = list.filter((p) => plain(p.subcategoria) === plain(it.subcategoria));
  if (it.marca) list = list.filter((p) => plain(p.marca) === plain(it.marca));
  if (it.solo_ofertas) list = list.filter((p) => offerActive(p));
  if (it.precio_min != null) list = list.filter((p) => effectivePrice(p) >= it.precio_min);
  if (it.precio_max != null) list = list.filter((p) => effectivePrice(p) <= it.precio_max);
  if (it.spec_min) list = list.filter((p) => { const v = specValue(p, it.spec_min.key); return v && (it.spec_min.aprox ? Math.abs(v.n - it.spec_min.n) <= 1 : v.n >= it.spec_min.n); });
  if (it.palabras) {
    const words = it.palabras.split(/\s+/).filter((w) => w.length > 1);
    const hay = (p) => plain([p.nombre, p.marca, p.categoria, p.subcategoria, p.sku, ...(p.especificaciones || []).map((s) => `${s.nombre} ${s.valor}`)].join(' '));
    const scored = list.map((p) => ({ p, s: words.filter((w) => hay(p).includes(w) || hay(p).includes(singular(w))).length })).filter((x) => x.s > 0);
    // Si ninguna palabra coincide pero sí hay filtros (categoría/marca/precio), se ignoran las palabras.
    if (scored.length || !(it.categoria || it.marca || it.precio_max || it.precio_min || it.solo_ofertas)) list = scored.sort((a, b) => b.s - a.s).map((x) => x.p);
  }
  const byPrice = (a, b) => effectivePrice(a) - effectivePrice(b);
  if (it.orden === 'precio_asc') list.sort(byPrice);
  else if (it.orden === 'precio_desc') list.sort((a, b) => byPrice(b, a));
  else if (!it.palabras) list.sort((a, b) => (b.stock > 0) - (a.stock > 0) || byPrice(a, b));
  return list;
}

const describeFilters = (it) => [
  it.subcategoria || it.categoria ? (it.subcategoria || it.categoria).toLowerCase() : 'productos',
  it.marca && `de ${it.marca}`,
  it.solo_ofertas && 'en oferta',
  it.precio_min != null && it.precio_max != null ? `entre ${soles(it.precio_min)} y ${soles(it.precio_max)}`
    : it.precio_max != null ? `de hasta ${soles(it.precio_max)}` : it.precio_min != null ? `desde ${soles(it.precio_min)}` : null,
  it.spec_min && (it.spec_min.aprox ? `de unas ${it.spec_min.n} pulgadas` : `con ${it.spec_min.key === 'refresco' ? `${it.spec_min.n} Hz` : it.spec_min.n >= 1024 ? `${it.spec_min.n / 1024} TB` : `${it.spec_min.n} GB`} o más de ${SPECS[it.spec_min.key].label}`),
  it.palabras && `que coinciden con «${it.palabras}»`,
].filter(Boolean).join(' ');

/** Página de una categoría (y su subcategoría), igual que el menú: /categoria/?c=<slug>&sub=<id>. */
const catUrl = (c, s) => (c?.slug ? `/categoria/?c=${encodeURIComponent(c.slug)}${s?.id ? `&sub=${encodeURIComponent(s.id)}` : ''}` : '/tienda/');
const shopUrl = (it, cat) => {
  if (it.solo_ofertas) return '/ofertas/';
  // Categoría (y subcategoría o marca), sin otras palabras: su página con esos filtros ya puestos.
  const c = it.categoria && cat?.categorias.find((x) => x.nombre === it.categoria);
  if (c && !it.palabras) {
    const m = it.marca && cat.marcas.find((x) => x.nombre === it.marca);
    const url = catUrl(c, it.subcategoria && cat.subcategorias.find((s) => s.nombre === it.subcategoria && s.categoria_id === c.id));
    return m?.id ? `${url}&marca=${encodeURIComponent(m.id)}` : url;
  }
  const q = [it.palabras, it.marca, it.subcategoria || it.categoria].filter(Boolean).join(' ');
  return `/tienda/?q=${encodeURIComponent(q)}`;
};

/** Responde una pregunta. Devuelve { respuesta, productos, acciones, sugerencias, ultimos, fuente }. */
// user: el cliente con sesión iniciada (o null). Solo se usa para responder sobre SUS pedidos.
export async function answer(db, { mensaje, historial = [], contexto = {}, user = null }) {
  const [products, categorias, subcategorias, marcas] = await Promise.all([db.list('product'), db.list('category'), db.list('subcategory'), db.list('brand')]);
  const cat = { categorias: categorias.filter((c) => c.activo !== false), subcategorias: subcategorias.filter((c) => c.activo !== false), marcas: marcas.filter((c) => c.activo !== false) };
  const ctx = { ultimos: Array.isArray(contexto.ultimos) ? contexto.ultimos.map(String).slice(0, 10) : [], producto_id: contexto.producto_id ? String(contexto.producto_id) : null };

  let it = null, fuente = 'reglas', explicacion = null;
  if (aiEnabled()) {
    const ai = await interpretWithAI(mensaje, historial, cat, Object.keys(GUIDES), ctx).catch(() => null);
    if (ai) { it = ai; fuente = 'ia'; explicacion = ai.explicacion || null; }
  }
  if (!it) it = interpretWithRules(mensaje, ctx, cat);
  it = validate(it, cat);
  const base = { productos: [], acciones: [], sugerencias: [], ultimos: [], fuente };

  switch (it.intencion) {
    case 'saludo':
      return { ...base, respuesta: '¡Hola! Soy Nova. Puedo buscar productos por precio, marca o categoría, compararlos y explicarte cómo pagar, envíos o comprobantes. ¿Qué necesitas?', sugerencias: ['Monitor de menos de 1500 soles', '¿Qué productos están en oferta?', '¿Cómo pago mi pedido?'] };
    case 'gracias':
      return { ...base, respuesta: '¡Con gusto! Si necesitas algo más, aquí estoy.', sugerencias: ['¿Qué productos están en oferta?', 'Ver mi carrito'] };
    case 'guia': {
      const g = GUIDES[it.tema];
      return { ...base, respuesta: g.texto(), acciones: g.acciones, sugerencias: g.sugerencias };
    }
    case 'desconocido':
      return { ...base, sinRespuesta: 'sin_dato', respuesta: UNKNOWN_TEXT, sugerencias: ['¿Cómo pago mi pedido?', '¿Cuánto cuesta el envío?'] };
    case 'pedidos': {
      // Solo los pedidos de quien pregunta (sesión verificada por el servidor); nunca los de otra persona.
      if (!user) return { ...base, respuesta: 'Para ver el estado de tus pedidos necesito que inicies sesión. Luego pregúntame, por ejemplo, «¿dónde está mi pedido?».', acciones: [{ label: 'Iniciar sesión', accion: 'iniciar-sesion' }], sugerencias: ['¿Cómo creo mi cuenta?', '¿Cómo pago mi pedido?'] };
      const ventas = (await db.listBy('sale', 'id_usuario', user.id)).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
      if (!ventas.length) return { ...base, respuesta: 'Todavía no tienes pedidos. Cuando compres, aquí te diré en qué estado está cada uno.', acciones: [{ label: 'Ir a la tienda', href: '/tienda/' }], sugerencias: ['¿Qué productos están en oferta?'] };
      const unidades = (v) => (v.items || []).reduce((n, i) => n + (i.cantidad || 0), 0);
      const linea = (v) => `${v.codigo} (${fecha(v.fecha)}, ${soles(v.total)}): ${ESTADO_TXT[v.estado] || v.estado}`;
      if (it.consulta === 'gasto') {
        const validas = ventas.filter((v) => !['cancelado', 'reembolsado'].includes(v.estado));
        return { ...base, respuesta: `Llevas ${validas.length} pedido${validas.length === 1 ? '' : 's'} por un total de ${soles(validas.reduce((n, v) => n + Number(v.total || 0), 0))} (sin contar los cancelados o reembolsados).`, acciones: [{ label: 'Mis pedidos', href: '/mis-compras/' }] };
      }
      const v = it.codigo ? ventas.find((x) => String(x.codigo).toUpperCase() === it.codigo) : ventas[0];
      if (!v) return { ...base, respuesta: `No encontré el pedido ${it.codigo} entre tus compras. Revisa el código en el correo de confirmación o en «Mis pedidos».`, acciones: [{ label: 'Mis pedidos', href: '/mis-compras/' }] };
      if (it.consulta === 'pago') {
        const ok = v.pago_estado === 'confirmado' || !['pendiente', 'cancelado'].includes(v.estado);
        return { ...base, respuesta: ok ? `Sí, el pago de tu pedido ${v.codigo} ya está confirmado. Te enviamos el comprobante por correo y también puedes descargarlo en «Mis pedidos».` : v.estado === 'cancelado' ? `Tu pedido ${v.codigo} fue cancelado.` : `El pago de tu pedido ${v.codigo} todavía está pendiente: el equipo lo confirma después de revisar tu ${v.metodo_pago === 'tarjeta' ? 'tarjeta' : 'operación'}. Te avisaremos por correo.`, acciones: [{ label: 'Mis pedidos', href: '/mis-compras/' }] };
      }
      const otros = it.codigo ? [] : ventas.slice(1, 3);
      return { ...base, respuesta: `${it.codigo ? 'Tu pedido' : 'Tu último pedido'} ${linea(v)}. Tiene ${unidades(v)} producto${unidades(v) === 1 ? '' : 's'}.${otros.length ? ` Antes: ${otros.map(linea).join('; ')}.` : ''} Te avisamos por correo cada vez que cambia de estado.`,
        acciones: [{ label: 'Mis pedidos', href: '/mis-compras/' }],
        sugerencias: ['¿Ya confirmaron mi pago?', '¿Cuánto cuesta el envío?'] };
    }
    case 'spec': {
      // «¿Cuál tiene más RAM?»: entre los de la respuesta anterior o en la categoría / marca nombrada.
      const def = SPECS[it.spec];
      const prev = it.usa_previos ? ctx.ultimos.map((id) => products.find((p) => p.id === id && p.activo !== false)).filter(Boolean) : [];
      const pool = prev.length ? prev : search(products, { ...it, palabras: '', orden: 'relevancia' });
      let vals = pool.map((p) => ({ p, v: specValue(p, it.spec) })).filter((x) => x.v);
      if (!vals.length) return { ...base, sinRespuesta: 'sin_dato', respuesta: `No tengo registrado el dato de ${def.label} de ${prev.length ? 'esos productos' : describeFilters(it)}.`, sugerencias: ['¿Qué categorías tienen?'] };
      // Solo se comparan valores de la misma unidad (la batería de una laptop en Wh no con horas de audífonos).
      const unit = [...vals.reduce((m, x) => m.set(x.v.unit, (m.get(x.v.unit) || 0) + 1), new Map())].sort((a, b) => b[1] - a[1])[0][0];
      vals = vals.filter((x) => x.v.unit === unit).sort((a, b) => (it.dir === 'min' ? a.v.n - b.v.n : b.v.n - a.v.n) || effectivePrice(a.p) - effectivePrice(b.p));
      const best = vals[0], empate = vals.filter((x) => x.v.n === best.v.n);
      const gama = unit === 'gama' ? ' (según la gama del modelo)' : '';
      const cual = (def.f ? 'la ' : 'el ') + (it.dir === 'min' ? 'menor' : 'mayor');
      const lider = it.spec === 'procesador' || it.spec === 'graficos'
        ? `${it.dir === 'min' ? 'El de gama más básica' : 'El más potente'} en ${def.label}${gama} es ${best.p.nombre}: ${best.v.text}.`
        : empate.length > 1 ? `${empate.map((x) => x.p.nombre).join(' y ')} empatan con ${cual} ${def.label}: ${best.v.text}.` : `${best.p.nombre} tiene ${cual} ${def.label}: ${best.v.text}.`;
      const resto = vals.slice(empate.length > 1 && !['procesador', 'graficos'].includes(it.spec) ? empate.length : 1, 5);
      const shown = vals.slice(0, 5).map((x) => x.p);
      return { ...base, productos: shown.map(pub), ultimos: shown.map((p) => p.id),
        respuesta: `${lider}${resto.length ? ` Le siguen: ${resto.map((x) => `${x.p.nombre} (${x.v.text})`).join('; ')}.` : ''}`,
        acciones: [{ label: 'Ver producto', href: `/producto/?id=${best.p.id}` }],
        sugerencias: ['¿Cuál de esos cuesta menos?', it.spec === 'ram' ? '¿Cuál tiene mejor procesador?' : '¿Cuál tiene más RAM?'] };
    }
    case 'concepto': {
      // Explicación general de tecnología (solo con IA). Nunca incluye precios ni políticas de la tienda.
      const txt = String(explicacion || '').split(/(?<=[.!?])\s+/).filter((s) => !/(S\/|\bsoles?\b|\$\s?\d|precio|envio|garantia de novatech)/i.test(s)).join(' ').slice(0, 900);
      if (!txt) return { ...base, sinRespuesta: 'sin_dato', respuesta: 'Puedo explicarte conceptos de tecnología cuando el asistente con IA está activo. Mientras tanto, pregúntame por productos, precios, stock, pagos o envíos.', sugerencias: ['Laptops de menos de 3000 soles'] };
      return { ...base, respuesta: txt, sugerencias: ['Muéstrame laptops', 'Monitores de menos de 1500 soles'] };
    }
    case 'agregar': {
      // Nova no compra: solo agrega al carrito lo que el cliente pidió. El navegador hace el cambio y valida el stock.
      const prev = ctx.ultimos.map((id) => products.find((p) => p.id === id && p.activo !== false)).filter(Boolean);
      let p = null, candidatos = [];
      if (it.posicion && prev.length) p = it.posicion === -1 ? prev.at(-1) : prev[it.posicion - 1] || null;
      else if (it.mas_barato && prev.length) p = [...prev].sort((a, b) => effectivePrice(a) - effectivePrice(b))[0];
      else if (it.este) p = products.find((x) => x.id === ctx.producto_id && x.activo !== false) || (prev.length === 1 ? prev[0] : null);
      else ({ exacto: p = null, candidatos = [] } = matchProduct(products, it.palabras));
      if (!p && candidatos.length) {
        return { ...base, productos: candidatos.map(pub), ultimos: candidatos.map((x) => x.id),
          respuesta: `Encontré varios productos parecidos a «${it.palabras}». ¿Cuál quieres agregar? Pulsa «Agregar» en el que prefieras o dime, por ejemplo, «agrega el primero».`,
          acciones: candidatos.filter((x) => x.stock > 0).slice(0, 3).map((x) => ({ label: `Agregar ${x.nombre}`, accion: 'agregar', id: x.id })),
          sugerencias: ['Agrega el primero', '¿Cuál de esos cuesta menos?'] };
      }
      if (!p) {
        const hint = it.este ? 'No sé a qué producto te refieres. Dime su nombre, por ejemplo «agrega al carrito Monitor LG 27».' : `No encontré «${it.palabras}» en el catálogo. Revisa el nombre o búscalo primero.`;
        return { ...base, sinRespuesta: 'no_encontrado', respuesta: hint, acciones: [{ label: 'Ir al buscador', href: '/tienda/' }], sugerencias: ['¿Qué productos están en oferta?'] };
      }
      if (!p.stock) return { ...base, productos: [pub(p)], ultimos: [p.id], respuesta: `${p.nombre} está agotado, así que no puedo agregarlo al carrito.`, sugerencias: [`Otros productos ${p.categoria ? `de ${p.categoria.toLowerCase()}` : 'similares'}`] };
      const cantidad = Math.min(it.cantidad || 1, p.stock);
      const aviso = cantidad < (it.cantidad || 1) ? ` Solo hay ${p.stock} unidad${p.stock === 1 ? '' : 'es'} disponible${p.stock === 1 ? '' : 's'}.` : '';
      return {
        ...base, productos: [pub(p)], ultimos: [p.id], carrito: { id: p.id, cantidad },
        respuesta: `Agregué ${cantidad} × ${p.nombre} al carrito (${soles(effectivePrice(p))} c/u).${aviso}`,
        acciones: [{ label: 'Ver carrito', href: '/carrito/' }, { label: 'Ir a pagar', href: '/checkout/' }],
        sugerencias: ['¿Cuánto cuesta el envío?', '¿Cómo pago mi pedido?'],
      };
    }
    case 'producto_actual': {
      const p = products.find((x) => x.id === ctx.producto_id && x.activo !== false);
      if (!p) return { ...base, respuesta: 'No encuentro el producto que estás viendo. Prueba buscándolo por su nombre.' };
      if (it.spec) { // «¿cuánta RAM tiene?»: solo ese dato
        const v = specValue(p, it.spec);
        const label = SPECS[it.spec].label;
        return { ...base, productos: [pub(p)], ultimos: [p.id], ...(v ? {} : { sinRespuesta: 'sin_dato' }),
          respuesta: v ? `${p.nombre} tiene ${label === 'pantalla' ? 'una pantalla de' : `${label}:`} ${v.text}${label === 'pantalla' && !/["”]|pulg/.test(v.text) ? ' pulgadas' : ''}.` : `No tengo registrado el dato de ${label} de ${p.nombre}. Revisa la sección «Especificaciones» de su ficha.`,
          sugerencias: ['¿Cuánto cuesta el envío?', '¿Qué garantía tiene?'] };
      }
      const specs = (p.especificaciones || []).slice(0, 4).map((s) => `${s.nombre}: ${s.valor}`).join('; ');
      const precio = offerActive(p) ? `${soles(effectivePrice(p))} (en oferta, antes ${soles(p.precio)})` : soles(p.precio);
      return {
        ...base, productos: [pub(p)], ultimos: [p.id],
        respuesta: `${p.nombre} cuesta ${precio}. ${p.stock === 0 ? 'Ahora está agotado.' : `Hay ${p.stock} unidad${p.stock === 1 ? '' : 'es'} disponible${p.stock === 1 ? '' : 's'}.`} ${p.garantia ? `Garantía: ${p.garantia}.` : 'No tengo registrada su garantía.'}${specs ? ` Características: ${specs}.` : ''}`,
        sugerencias: ['¿Cuánto cuesta el envío?', `Otros productos ${p.categoria ? `de ${p.categoria.toLowerCase()}` : 'similares'}`],
      };
    }
    case 'previos': {
      const prev = ctx.ultimos.map((id) => products.find((p) => p.id === id && p.activo !== false)).filter(Boolean);
      if (!prev.length) return { ...base, respuesta: 'No tengo productos de la respuesta anterior para comparar. ¿Qué te gustaría buscar?' };
      let pick, txt;
      if (it.criterio_previos === 'mas_caro') { pick = [...prev].sort((a, b) => effectivePrice(b) - effectivePrice(a))[0]; txt = `El de mayor precio es ${pick.nombre}, a ${soles(effectivePrice(pick))}.`; }
      else if (it.criterio_previos === 'con_stock') { const s = prev.filter((p) => p.stock > 0); return { ...base, productos: s.map(pub), ultimos: s.map((p) => p.id), respuesta: s.length ? `De esos, ${s.length === prev.length ? 'todos tienen' : `${s.length} tiene${s.length === 1 ? '' : 'n'}`} stock: ${s.map((p) => `${p.nombre} (${p.stock})`).join(', ')}.` : 'Ninguno de esos tiene stock ahora.' }; }
      else if (it.criterio_previos === 'en_oferta') { const s = prev.filter((p) => offerActive(p)); return { ...base, productos: s.map(pub), ultimos: s.map((p) => p.id), respuesta: s.length ? `En oferta: ${s.map((p) => `${p.nombre} a ${soles(effectivePrice(p))}`).join('; ')}.` : 'Ninguno de esos está en oferta ahora.' }; }
      else { pick = [...prev].sort((a, b) => effectivePrice(a) - effectivePrice(b))[0]; txt = `El que cuesta menos es ${pick.nombre}, a ${soles(effectivePrice(pick))}${pick.stock === 0 ? ', aunque ahora está agotado' : ''}.`; }
      return { ...base, productos: [pub(pick)], ultimos: prev.map((p) => p.id), respuesta: txt, acciones: [{ label: 'Ver producto', href: `/producto/?id=${pick.id}` }], sugerencias: ['¿Cuál de esos tiene stock?', '¿Cómo pago mi pedido?'] };
    }
    case 'catalogo': {
      // Lo que vende la tienda, contado desde el catálogo real (solo productos visibles).
      const live = products.filter((p) => p.activo !== false);
      const scope = it.categoria ? live.filter((p) => plain(p.categoria) === plain(it.categoria)) : live;
      const count = (key) => [...scope.reduce((m, p) => (p[key] ? m.set(p[key], (m.get(p[key]) || 0) + 1) : m), new Map())].sort((a, b) => b[1] - a[1]);
      if (it.tipo === 'marcas') {
        const marcas = count('marca');
        if (!marcas.length) return { ...base, respuesta: `No tengo productos ${it.categoria ? `de ${it.categoria.toLowerCase()} ` : ''}con marca registrada ahora.`, sugerencias: ['¿Qué categorías tienen?'] };
        return { ...base, respuesta: `${it.categoria ? `En ${it.categoria.toLowerCase()} tenemos` : 'Trabajamos con'} ${marcas.length} marca${marcas.length === 1 ? '' : 's'}: ${marcas.map(([n, c]) => `${n} (${c})`).join(', ')}.`,
          acciones: [{ label: 'Ir a la tienda', href: it.categoria ? `/tienda/?q=${encodeURIComponent(it.categoria)}` : '/tienda/' }],
          sugerencias: marcas.slice(0, 3).map(([n]) => `${it.categoria || 'Productos'} ${n}`) };
      }
      if (it.tipo === 'subcategorias' && it.categoria) {
        const c = cat.categorias.find((x) => x.nombre === it.categoria);
        const list = cat.subcategorias.filter((s) => s.categoria_id === c?.id).map((s) => [s, scope.filter((p) => plain(p.subcategoria) === plain(s.nombre)).length]);
        if (!list.length) return { ...base, respuesta: `${it.categoria} no tiene subcategorías: tiene ${scope.length} producto${scope.length === 1 ? '' : 's'}.`, acciones: [{ label: `Ver ${it.categoria.toLowerCase()}`, href: catUrl(c) }] };
        const con = list.filter(([, n]) => n), sin = list.filter(([, n]) => !n);
        return { ...base, respuesta: `En ${it.categoria.toLowerCase()} tenemos: ${con.length ? con.map(([s, n]) => `${s.nombre} (${n})`).join(', ') : 'todavía ningún producto'}.${sin.length ? ` Próximamente: ${sin.map(([s]) => s.nombre).join(', ')}.` : ''}`,
          acciones: [{ label: `Ver ${it.categoria.toLowerCase()}`, href: catUrl(c) }],
          sugerencias: con.slice(0, 3).map(([s]) => `${it.categoria} ${s.nombre.toLowerCase()}`) };
      }
      const cats = count('categoria');
      const vacias = cat.categorias.filter((c) => !cats.some(([n]) => plain(n) === plain(c.nombre))).map((c) => c.nombre);
      return { ...base, respuesta: `Tenemos ${live.length} producto${live.length === 1 ? '' : 's'} en ${cats.length} categoría${cats.length === 1 ? '' : 's'}: ${cats.map(([n, c]) => `${n} (${c})`).join(', ')}.${vacias.length ? ` Próximamente: ${vacias.join(', ')}.` : ''}${((o) => (o ? ` ${o} ${o === 1 ? 'está' : 'están'} en oferta ahora.` : ''))(live.filter((p) => offerActive(p)).length)}`,
        acciones: [{ label: 'Ir a la tienda', href: '/tienda/' }, { label: 'Ver ofertas', href: '/ofertas/' }],
        sugerencias: [...cats.slice(0, 2).map(([n]) => `¿Qué tipos de ${n.toLowerCase()} tienen?`), '¿Qué marcas tienen?'] };
    }
    default: {
      const found = search(products, it);
      const shown = found.slice(0, 5);
      // Categoría o subcategoría que existe pero aún no tiene productos: se dice así, con lo que sí hay al lado.
      if (!found.length && (it.categoria || it.subcategoria)) {
        const live = products.filter((p) => p.activo !== false);
        const inSub = it.subcategoria ? live.filter((p) => plain(p.subcategoria) === plain(it.subcategoria)) : null;
        const inCat = it.categoria ? live.filter((p) => plain(p.categoria) === plain(it.categoria)) : null;
        const empty = it.subcategoria ? !inSub.length : !inCat.length;
        if (empty) {
          const name = it.subcategoria ? `${it.subcategoria}${it.categoria ? ` (${it.categoria.toLowerCase()})` : ''}` : it.categoria;
          const c = cat.categorias.find((x) => x.nombre === it.categoria);
          const vecinos = it.subcategoria && c ? cat.subcategorias.filter((s) => s.categoria_id === c.id && s.nombre !== it.subcategoria && inCat.some((p) => plain(p.subcategoria) === plain(s.nombre))) : [];
          const otras = [...new Set(live.map((p) => p.categoria).filter(Boolean))];
          return { ...base, sinRespuesta: 'categoria_vacia', respuesta: `Todavía no tenemos productos en ${name}; pronto agregaremos más.${vecinos.length ? ` En ${it.categoria.toLowerCase()} sí tenemos ${vecinos.map((s) => s.nombre.toLowerCase()).join(', ')}.` : otras.length ? ` Sí tenemos ${otras.join(', ').toLowerCase()}.` : ''}`,
            acciones: c && inCat.length ? [{ label: `Ver ${it.categoria.toLowerCase()}`, href: catUrl(c) }] : [{ label: 'Ir a la tienda', href: '/tienda/' }],
            sugerencias: vecinos.length ? vecinos.slice(0, 2).map((s) => `${it.categoria} ${s.nombre.toLowerCase()}`) : otras.slice(0, 2).map((n) => `Muéstrame ${n.toLowerCase()}`) };
        }
      }
      if (!found.length && !(it.categoria || it.subcategoria || it.marca || it.precio_min || it.precio_max || it.solo_ofertas)) {
        // Nada que se parezca: en vez de un callejón sin salida, se dice qué hay en la tienda.
        const cats = [...new Set(products.filter((p) => p.activo !== false).map((p) => p.categoria).filter(Boolean))];
        return { ...base, sinRespuesta: 'no_entendido', respuesta: `No encontré «${it.palabras || mensaje}» en el catálogo. Vendemos ${cats.length ? cats.join(', ').toLowerCase() : 'tecnología'}. También puedo explicarte pagos, envíos, comprobantes, garantía o tu cuenta.`,
          acciones: [{ label: 'Ir a la tienda', href: '/tienda/' }],
          sugerencias: [...cats.slice(0, 2).map((n) => `Muéstrame ${n.toLowerCase()}`), '¿Qué puedes hacer?'] };
      }
      if (!found.length) {
        return { ...base, sinRespuesta: 'sin_resultados', respuesta: `No encontré ${describeFilters(it)} en el catálogo. Prueba con otro precio u otra marca.`, acciones: [{ label: 'Ir al buscador', href: '/tienda/' }], sugerencias: ['¿Qué productos están en oferta?', 'Muéstrame laptops'] };
      }
      const cheapest = [...found].sort((a, b) => effectivePrice(a) - effectivePrice(b))[0];
      const agotados = shown.filter((p) => p.stock === 0).length;
      const respuesta = `Encontré ${found.length} ${found.length === 1 ? 'resultado' : 'resultados'}: ${describeFilters(it)}.${found.length > 1 ? ` El más económico es ${cheapest.nombre}, a ${soles(effectivePrice(cheapest))}.` : ''}${agotados ? ` ${agotados} de los que te muestro está${agotados === 1 ? '' : 'n'} agotado${agotados === 1 ? '' : 's'}.` : ''}${found.length > 5 ? ' Te muestro los 5 primeros.' : ''}`;
      return {
        ...base, respuesta, productos: shown.map(pub), ultimos: shown.map((p) => p.id),
        acciones: [{ label: found.length > 5 ? `Ver los ${found.length} en la tienda` : 'Ir al buscador', href: shopUrl(it, cat) }],
        sugerencias: ['¿Cuál de esos cuesta menos?', '¿Cuál de esos tiene stock?', '¿Cuánto cuesta el envío?'],
      };
    }
  }
}
