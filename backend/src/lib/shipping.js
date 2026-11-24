// RF-32: costo de envío según la ubicación de la dirección (matriz tarifaria del courier).
// La misma tabla está en frontend/src/lib/format.js (SHIPPING_ZONES) para mostrar el costo antes de pagar;
// el backend es quien decide el monto final.
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const SHIPPING_ZONES = [
  { id: 'lima', nombre: 'Lima Metropolitana', costo: 10 },
  { id: 'callao', nombre: 'Callao', costo: 12 },
  { id: 'lima-prov', nombre: 'Lima provincias', costo: 18 },
  { id: 'costa', nombre: 'Costa (Arequipa, La Libertad, Piura, Ica…)', costo: 22 },
  { id: 'nacional', nombre: 'Resto del país', costo: 28 },
];
const COSTA = ['arequipa', 'la libertad', 'lambayeque', 'piura', 'ica', 'ancash', 'tacna', 'moquegua', 'tumbes'];

export function shippingZone(dir) {
  const prov = norm(dir?.provincia);
  const dep = norm(dir?.departamento) || prov;
  if (prov === 'callao' || dep === 'callao') return SHIPPING_ZONES[1];
  if (prov === 'lima' || prov === 'lima metropolitana') return SHIPPING_ZONES[0];
  if (dep === 'lima') return SHIPPING_ZONES[2];
  if (COSTA.includes(dep)) return SHIPPING_ZONES[3];
  return SHIPPING_ZONES[4];
}

/** Envío gratis desde FREE_SHIPPING_FROM (promoción); si no, la tarifa de la zona. */
export function shippingCost(subtotal, dir) {
  const free = Number(process.env.FREE_SHIPPING_FROM ?? 500);
  if (free > 0 && subtotal >= free) return 0;
  return shippingZone(dir).costo;
}
