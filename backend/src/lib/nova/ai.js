// IA opcional para Nova (OpenAI). Solo se usa para ENTENDER preguntas libres y explicar conceptos
// generales de tecnología. Nunca da precios, stock ni políticas: eso sale del catálogo y de las guías.
// Sin OPENAI_API_KEY, o si OpenAI falla o tarda más de 12 s, Nova usa sus reglas propias.
const TIMEOUT_MS = 12_000;
export const aiEnabled = () => !!process.env.OPENAI_API_KEY;

/** Privacidad: se ocultan correos y números largos (teléfonos, documentos, tarjetas) antes de enviar. */
export const redact = (s) => String(s ?? '')
  .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[correo]')
  .replace(/\b\d[\d\s-]{6,}\d\b/g, '[número]')
  .slice(0, 1000);

const SCHEMA = `Responde SOLO un objeto JSON con estas claves:
{"intencion": "buscar" | "agregar" | "previos" | "producto_actual" | "guia" | "concepto" | "saludo" | "gracias" | "desconocido",
 "categoria": string|null, "subcategoria": string|null, "marca": string|null,
 "precio_min": number|null, "precio_max": number|null, "solo_ofertas": boolean,
 "palabras": string, "orden": "relevancia" | "precio_asc" | "precio_desc",
 "criterio_previos": "mas_barato" | "mas_caro" | "con_stock" | "en_oferta" | null,
 "tema": string|null, "explicacion": string|null,
 "cantidad": number|null, "posicion": number|null, "este": boolean, "mas_barato": boolean}`;

export async function interpretWithAI(mensaje, historial, cat, temas, ctx) {
  const system = `Eres el intérprete de consultas de Nova, asistente de la tienda peruana de tecnología NovaTech (precios en soles).
Tu tarea es CLASIFICAR la pregunta, no responderla. ${SCHEMA}
Reglas:
- "buscar": el cliente busca productos. Usa SOLO estas categorías: ${cat.categorias.map((c) => c.nombre).join(', ') || '(ninguna)'}; subcategorías: ${cat.subcategorias.map((c) => c.nombre).join(', ') || '(ninguna)'}; marcas: ${cat.marcas.map((c) => c.nombre).join(', ') || '(ninguna)'}. Si no encaja, deja null y pon términos clave en "palabras" (por ejemplo "16 gb ram", "rtx").
- "agregar": el cliente PIDE agregar algo al carrito. "palabras" = nombre del producto tal como lo dijo; "cantidad" si dice cuántos; "posicion" 1, 2, 3… si dice "el primero/segundo" (-1 = el último); "este": true si dice "agrégalo/este"; "mas_barato": true si dice "el más barato". No uses "agregar" si solo pregunta cómo funciona el carrito.
- "previos": pregunta sobre los productos de la respuesta anterior (${ctx.ultimos.length ? 'hay productos anteriores' : 'no hay productos anteriores'}), p. ej. "¿cuál de esos cuesta menos?".
- "producto_actual": pregunta sobre el producto que el cliente está viendo (${ctx.producto_id ? 'está viendo un producto' : 'no está viendo ninguno'}).
- "guia": dudas de uso de la tienda. "tema" debe ser uno de: ${temas.join(', ')}.
- "concepto": pregunta general de tecnología (qué es SSD, diferencia entre i5 e i7…). En "explicacion" da 2 a 4 frases claras en español, SIN precios, SIN mencionar envíos, garantías ni políticas de la tienda.
- "desconocido": temas de la tienda que no estén en la lista de guías (devoluciones, cuotas, horarios…). No inventes.
- Precios: "menos de 1500" → precio_max 1500; "más de 2000" → precio_min 2000.`;
  const msgs = [{ role: 'system', content: system }];
  for (const h of (Array.isArray(historial) ? historial : []).slice(-6)) {
    if (!h?.texto) continue;
    msgs.push({ role: h.rol === 'user' ? 'user' : 'assistant', content: redact(h.texto).slice(0, 600) });
  }
  msgs.push({ role: 'user', content: redact(mensaje) });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', temperature: 0.1, max_tokens: 400, response_format: { type: 'json_object' }, messages: msgs }),
    });
    if (!r.ok) { console.error('[nova:ia]', r.status); return null; }
    const data = await r.json();
    const out = JSON.parse(data.choices?.[0]?.message?.content || 'null');
    return out && typeof out === 'object' && typeof out.intencion === 'string' ? out : null;
  } catch (e) {
    console.error('[nova:ia]', e.name === 'AbortError' ? 'tiempo agotado (12 s)' : e.message);
    return null;
  } finally { clearTimeout(timer); }
}
