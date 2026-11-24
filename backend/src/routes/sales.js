import { route, requireAuth, requireAdmin } from '../lib/router.js';
import { ok, bad, notFound, conflict, forbidden } from '../lib/http.js';
import * as v from '../lib/validate.js';
import { saleCode } from '../lib/id.js';
import { sendMailSafe } from '../lib/mailer.js';
import { orderEmail, statusEmail } from '../lib/emails.js';
import { checkLowStock, notifyNewSale, addNotification } from '../lib/notify.js';
import { effectivePrice } from '../lib/pricing.js';
import { shippingCost, shippingZone, SHIPPING_ZONES } from '../lib/shipping.js';
import { receiptPdf } from '../lib/receiptPdf.js';
import { audit } from '../lib/audit.js';

const IGV = 1.18; // los precios ya incluyen IGV (igual que el sistema original)
// Comprobante PDF como adjunto del correo (RF-36). Si falla la generación, el correo sale igual sin adjunto.
const receiptAttachment = (sale) => {
  try { return [{ filename: `comprobante-${sale.codigo}.pdf`, content: receiptPdf(sale), contentType: 'application/pdf' }]; }
  catch (e) { console.error('[pdf:error]', e.message); return []; }
};
// RF-34: tarjeta de crédito/débito, billeteras digitales (Yape / Plin) y transferencia bancaria.
// true = exige número de operación.
const METODOS = { tarjeta: false, yape: true, transferencia: true };
const MARCAS = ['Visa', 'Mastercard', 'American Express', 'Diners Club', 'Tarjeta'];
const TITULAR = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]{3,80}$/; // solo letras y espacios
// Detalle del pago. De la tarjeta SOLO se guardan titular, marca y últimos 4 dígitos: el número
// completo y el CVV nunca llegan al servidor (los manejaría la pasarela de pagos).
function payDetail(metodo, body) {
  if (metodo === 'tarjeta') {
    const t = body.tarjeta || {};
    const titular = v.str(t.titular, 80);
    if (!TITULAR.test(titular)) throw bad('Indica el titular de la tarjeta (solo letras).');
    if (!/^\d{4}$/.test(String(t.ultimos4 || ''))) throw bad('Datos de tarjeta inválidos.');
    return { titular, ultimos4: String(t.ultimos4), marca: MARCAS.includes(t.marca) ? t.marca : 'Tarjeta' };
  }
  if (metodo === 'yape') {
    const telefono = String(body.telefono_pago || '').replace(/\D/g, '');
    if (!/^9\d{8}$/.test(telefono)) throw bad('El teléfono de Yape / Plin debe tener 9 dígitos y empezar con 9.');
    return { telefono };
  }
  const banco = v.str(body.banco, 60);
  if (banco.length < 2) throw bad('Indica el banco desde el que transferiste.');
  return { banco };
}
export const TRANSICIONES = {
  pendiente: ['pagado', 'cancelado'], pagado: ['preparando', 'cancelado', 'reembolsado'],
  preparando: ['en camino', 'cancelado'], 'en camino': ['entregado'], entregado: ['reembolsado'],
  cancelado: [], reembolsado: [],
};
const r2 = (n) => Math.round(n * 100) / 100;

// RF-32: tarifas de envío por zona (para mostrarlas en el checkout).
route('GET', '/shipping/zones', async () => ok({ zonas: SHIPPING_ZONES, envio_gratis_desde: Number(process.env.FREE_SHIPPING_FROM ?? 500) }));

route('POST', '/sales', requireAuth, async ({ db, user, body }) => {
  const raw = Array.isArray(body.items) ? body.items : [];
  if (!raw.length || raw.length > 50) throw bad('El carrito está vacío o excede 50 productos.');
  const merged = new Map();
  for (const it of raw) {
    const qty = Number(it.cantidad);
    if (!it.id || !Number.isInteger(qty) || qty < 1 || qty > 99) throw bad('Cantidad inválida en el carrito.');
    merged.set(String(it.id), (merged.get(String(it.id)) || 0) + qty);
  }
  const metodo = String(body.metodo_pago || '');
  if (!(metodo in METODOS)) throw bad('Método de pago inválido.');
  const referencia = v.str(body.referencia_pago, 120);
  if (METODOS[metodo] && !/^\d{6}$/.test(referencia)) throw bad('El número de operación debe tener 6 dígitos.');
  const pago_detalle = payDetail(metodo, body);
  // La tienda solo realiza envíos a domicilio (no hay recojo en tienda).
  if (body.tipo_despacho !== undefined && body.tipo_despacho !== 'envio') throw bad('Solo realizamos envíos a domicilio.');
  const despacho = 'envio';
  // Datos de contacto del pedido (checkout): nombre, DNI y teléfono. Si no llegan, se usan los de la cuenta.
  let cliente = { nombre: user.nombre, documento: user.numero_documento || null, telefono: user.telefono || null, email: user.email };
  if (body.cliente && typeof body.cliente === 'object') {
    cliente = {
      nombre: v.nombre(body.cliente.nombre),
      documento: v.documento('DNI', body.cliente.documento).numero_documento,
      telefono: v.telefono(body.cliente.telefono),
      email: user.email,
    };
    if (!cliente.telefono) throw bad('Indica un teléfono de contacto.');
  }
  const direccion = body.direccion_envio_id ? await db.get('address', body.direccion_envio_id) : null;
  if (!direccion || direccion.usuario_id !== user.id) throw bad('Selecciona una dirección de envío válida.');
  const comprobante = body.tipo_comprobante === 'factura' ? 'factura' : 'boleta';
  if (comprobante === 'factura') {
    if (!/^\d{11}$/.test(v.str(body.documento_fiscal, 20))) throw bad('Para factura ingresa un RUC de 11 dígitos.');
    if (v.str(body.razon_social, 150).length < 3) throw bad('Para factura ingresa la razón social.');
  }

  // Precios y nombres SIEMPRE desde la base de datos, nunca del navegador.
  const lines = [];
  for (const [id, cantidad] of merged) {
    const p = await db.get('product', id);
    if (!p || p.activo === false) throw bad('Un producto de tu carrito ya no está disponible.');
    const precio = effectivePrice(p); // la oferta solo vale dentro de sus fechas (RF-40)
    lines.push({ p, cantidad, precio });
  }

  // Descuento atómico de stock con compensación si algo falla.
  const done = [];
  try {
    for (const l of lines) {
      try { l.after = await db.incr('product', l.p.id, 'stock', -l.cantidad, { min: 0 }); }
      catch (e) { if (e.code === 'CONFLICT') throw conflict(`Stock insuficiente para "${l.p.nombre}".`); throw e; }
      if (!l.after) throw bad('Un producto de tu carrito ya no está disponible.');
      done.push(l);
    }
  } catch (e) {
    for (const l of done) await db.incr('product', l.p.id, 'stock', l.cantidad, { min: 0 });
    throw e;
  }

  const items = lines.map((l) => ({
    producto_id: l.p.id, sku_producto: l.p.sku, nombre_producto: l.p.nombre, categoria: l.p.categoria || null, imagen: l.p.imagen,
    cantidad: l.cantidad, precio_unitario: l.precio, subtotal: r2(l.precio * l.cantidad),
  }));
  const subtotal = r2(items.reduce((s, i) => s + i.subtotal, 0));
  const costo_envio = shippingCost(subtotal, direccion);
  const sale = await db.put('sale', {
    codigo: saleCode(), id_usuario: user.id, nombre_usuario: user.nombre, email_usuario: user.email, fecha: new Date().toISOString(),
    items, subtotal, impuesto: r2(subtotal - subtotal / IGV), descuento: 0, costo_envio, total: r2(subtotal + costo_envio),
    estado: 'pendiente', canal_venta: 'WEB', metodo_pago: metodo, referencia_pago: (METODOS[metodo] && referencia) || null, pago_detalle, pago_estado: 'pendiente',
    tipo_despacho: despacho, zona_envio: shippingZone(direccion).nombre, direccion, cliente, tipo_comprobante: comprobante,
    documento_fiscal: comprobante === 'factura' ? v.str(body.documento_fiscal, 20) : null,
    razon_social: comprobante === 'factura' ? v.str(body.razon_social, 150) : null,
    observaciones: v.str(body.observaciones, 500) || null,
  });
  for (const l of lines) {
    await db.put('movement', { producto_id: l.p.id, tipo: 'VENTA', cantidad: l.cantidad, stock_anterior: l.after.stock + l.cantidad, stock_nuevo: l.after.stock, motivo: `Venta ${sale.codigo}`, referencia: sale.id, usuario_id: user.id });
    await checkLowStock(db, l.after, l.after.stock + l.cantidad);
  }
  await notifyNewSale(db, sale);
  await sendMailSafe({ to: user.email, ...orderEmail(sale, user), attachments: receiptAttachment(sale) });
  return ok({ venta: sale }, 201);
});

// Ventas anteriores a que se guardara la categoría en cada línea: se completa con la del producto
// (si el producto aún existe). No modifica lo guardado; solo la respuesta.
async function withCategories(db, sales) {
  const missing = new Set(sales.flatMap((s) => (s.items || []).filter((i) => !i.categoria && i.producto_id).map((i) => i.producto_id)));
  if (!missing.size) return sales;
  const cats = new Map((await db.list('product')).filter((p) => missing.has(p.id)).map((p) => [p.id, p.categoria || null]));
  return sales.map((s) => ({ ...s, items: (s.items || []).map((i) => (i.categoria ? i : { ...i, categoria: cats.get(i.producto_id) ?? null })) }));
}

route('GET', '/sales/mine', requireAuth, async ({ db, user }) => {
  const s = await db.listBy('sale', 'id_usuario', user.id);
  return ok({ ventas: await withCategories(db, s.sort((a, b) => b.fecha.localeCompare(a.fecha))) });
});
route('GET', '/sales/:id', requireAuth, async ({ db, user, params }) => {
  const s = await db.get('sale', params.id);
  if (!s) throw notFound('Venta no encontrada.');
  if (s.id_usuario !== user.id && user.rol !== 'admin') throw forbidden();
  return ok({ venta: (await withCategories(db, [s]))[0] });
});
route('GET', '/admin/sales', requireAdmin, async ({ db, query }) => {
  let s = await db.list('sale');
  if (query.estado) s = s.filter((x) => x.estado === query.estado);
  return ok({ ventas: await withCategories(db, s.sort((a, b) => b.fecha.localeCompare(a.fecha))) });
});

async function changeStatus(ctx, estado) {
  const { db, user, params } = ctx;
  if (!(estado in TRANSICIONES)) throw bad('Estado inválido.');
  const sale = await db.get('sale', params.id);
  if (!sale) throw notFound('Venta no encontrada.');
  if (!(TRANSICIONES[sale.estado] || []).includes(estado))
    throw bad(`Transición no permitida: ${sale.estado} → ${estado}.`, { allowed: TRANSICIONES[sale.estado] });
  if (estado === 'cancelado' || estado === 'reembolsado') {
    for (const it of sale.items) {
      const after = await db.incr('product', it.producto_id, 'stock', it.cantidad, { min: 0 }).catch(() => null);
      if (after) await db.put('movement', { producto_id: it.producto_id, tipo: 'DEVOLUCION', cantidad: it.cantidad, stock_anterior: after.stock - it.cantidad, stock_nuevo: after.stock, motivo: `${estado} de ${sale.codigo}`, referencia: sale.id, usuario_id: user.id });
    }
  }
  const upd = await db.put('sale', { ...sale, estado, pago_estado: estado === 'pagado' ? 'confirmado' : sale.pago_estado });
  const customer = await db.get('user', sale.id_usuario);
  // Al confirmar el pago se reenvía el comprobante, ya con el pago "Completado" (RF-22).
  if (customer) await sendMailSafe({ to: customer.email, ...statusEmail(upd, customer), attachments: estado === 'pagado' ? receiptAttachment(upd) : [] });
  await addNotification(db, { tipo: 'ventas', titulo: `Venta ${sale.codigo}: ${estado}`, descripcion: `Cambió de "${sale.estado}" a "${estado}".`, metadata: { venta_id: sale.id } });
  await audit(db, user, estado === 'pagado' ? 'PAGO_CONFIRMADO' : 'CAMBIO_ESTADO_PEDIDO',
    `Pedido ${sale.codigo}: ${sale.estado} → ${estado}${['cancelado', 'reembolsado'].includes(estado) ? ' (stock repuesto)' : ''}`,
    { entidad: 'sale', entidad_id: sale.id, antes: { estado: sale.estado }, despues: { estado } });
  return ok({ venta: upd });
}
route('PUT', '/sales/:id/status', requireAdmin, (ctx) => changeStatus(ctx, String(ctx.body.estado || '')));
route('PUT', '/sales/:id/confirm-payment', requireAdmin, (ctx) => changeStatus(ctx, 'pagado'));
