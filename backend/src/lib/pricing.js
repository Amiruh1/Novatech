// RF-40: precio de oferta temporal. La oferta solo vale entre oferta_inicio y oferta_fin (fechas
// AAAA-MM-DD, ambas opcionales e inclusivas, hora de Perú). Sin fechas, la oferta está siempre activa.
const limaDay = (d = new Date()) => new Date(d.getTime() - 5 * 3600e3).toISOString().slice(0, 10);

export function offerActive(p, now) {
  // Si se usa como callback de .filter/.map, el 2.º argumento es el índice: solo se acepta una fecha real.
  if (!(now instanceof Date)) now = new Date();
  if (p?.precio_oferta == null || !(p.precio_oferta < p.precio)) return false;
  const today = limaDay(now);
  if (p.oferta_inicio && today < p.oferta_inicio) return false;
  if (p.oferta_fin && today > p.oferta_fin) return false;
  return true;
}
export const effectivePrice = (p) => (offerActive(p) ? p.precio_oferta : p.precio);
