// Comprobante de compra en PDF generado en el servidor (RF-36: se adjunta al correo de la compra).
// Mismo formato que frontend/src/lib/receiptPdf.js (la descarga desde "Mis pedidos").
import { readFileSync } from 'node:fs';
import jspdfPkg from 'jspdf';
const { jsPDF } = jspdfPkg;

const EMPRESA = () => ({
  nombre: process.env.EMPRESA_NOMBRE || 'NovaTech Commerce',
  ruc: process.env.EMPRESA_RUC || '',
  direccion: process.env.EMPRESA_DIRECCION || 'Plataforma de comercio electrónico · Lima, Perú',
  telefono: process.env.EMPRESA_TELEFONO || '',
  web: process.env.EMPRESA_WEB || '',
});
const PAGO = { tarjeta: 'Tarjeta de crédito / débito', yape: 'Yape / Plin', transferencia: 'Transferencia bancaria', contraentrega: 'Contra entrega' };
// Referencia del pago para el comprobante (de la tarjeta solo se muestran los últimos 4 dígitos).
export function refPago(v) {
  const d = v.pago_detalle || {};
  if (v.metodo_pago === 'tarjeta' && d.ultimos4) return `${d.marca || 'Tarjeta'} **** ${d.ultimos4}`;
  if (v.metodo_pago === 'yape') return [v.referencia_pago && `Op. ${v.referencia_pago}`, d.telefono && `Tel. ${d.telefono}`].filter(Boolean).join(' · ') || '—';
  if (v.metodo_pago === 'transferencia') return [d.banco, v.referencia_pago && `Op. ${v.referencia_pago}`].filter(Boolean).join(' · ') || '—';
  return v.referencia_pago || '—';
}

const STATUS_LABEL = { pendiente: 'Pendiente', pagado: 'Pagado', preparando: 'Preparando', 'en camino': 'En camino', entregado: 'Entregado', cancelado: 'Cancelado', reembolsado: 'Reembolsado' };
// El pago figura como completado solo cuando el administrador lo confirmó (RF-22 / RF-43).
export function estadoPago(v) {
  if (v.estado === 'reembolsado') return 'Reembolsado';
  if (v.estado === 'cancelado') return 'Anulado';
  if (v.pago_estado === 'rechazado') return 'Rechazado';
  if (['pagado', 'preparando', 'en camino', 'entregado'].includes(v.estado) || v.pago_estado === 'confirmado') return 'Completado';
  return 'Pendiente de confirmación';
}

// ---------- Importe en letras ----------
const UNI = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE',
  'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO',
  'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
const DEC = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CEN = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
function hasta999(n) {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100), r = n % 100;
  const resto = r < 30 ? UNI[r] : `${DEC[Math.floor(r / 10)]}${r % 10 ? ` Y ${UNI[r % 10]}` : ''}`;
  return [CEN[c], resto].filter(Boolean).join(' ');
}
const apocope = (s) => s.replace(/VEINTIUNO$/, 'VEINTIÚN').replace(/UNO$/, 'UN');
function enteroEnLetras(n) {
  if (n === 0) return 'CERO';
  const mill = Math.floor(n / 1e6), miles = Math.floor((n % 1e6) / 1000), resto = n % 1000;
  const partes = [];
  if (mill) partes.push(mill === 1 ? 'UN MILLÓN' : `${apocope(hasta999(mill))} MILLONES`);
  if (miles) partes.push(miles === 1 ? 'MIL' : `${apocope(hasta999(miles))} MIL`);
  if (resto) partes.push(hasta999(resto));
  return partes.join(' ');
}
export function montoEnLetras(monto) {
  const cent = Math.round(Number(monto || 0) * 100);
  return `${enteroEnLetras(Math.floor(cent / 100))} Y ${String(cent % 100).padStart(2, '0')}/100 SOLES`;
}

const TZ = 'America/Lima';
const n2 = (n) => Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ }) : '—');
const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '');

let logos;
function loadLogos() {
  if (logos !== undefined) return logos;
  try {
    const read = (f) => new Uint8Array(readFileSync(new URL(`../../assets/${f}`, import.meta.url)));
    logos = { small: read('logo-receipt.png'), mark: read('logo-watermark.png') };
  } catch { logos = null; }
  return logos;
}

/** Devuelve el comprobante de la venta como Buffer PDF. */
export function receiptPdf(v) {
  const E = EMPRESA();
  const d = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 10, R = 200, W = R - L;
  const line = (x1, y1, x2, y2) => d.line(x1, y1, x2, y2);
  const font = (size, style = 'normal') => { d.setFont('helvetica', style); d.setFontSize(size); };
  d.setDrawColor(40); d.setLineWidth(0.25); d.setTextColor(20);
  const lg = loadLogos();

  if (lg) {
    const p = d.getImageProperties(lg.small);
    const w = 38, h = Math.min(18, (w * p.height) / p.width);
    d.addImage(lg.small, 'PNG', L, 12, (h * p.width) / p.height, h, 'logo');
  } else { font(16, 'bold'); d.text('NOVATECH', L, 22); }

  const cx = 97;
  font(13, 'bold'); d.text(E.nombre.toUpperCase(), cx, 15, { align: 'center' });
  font(8);
  let hy = 20;
  for (const t of [E.direccion, E.telefono && `TELF: ${E.telefono}`, E.web].filter(Boolean)) {
    for (const ln of d.splitTextToSize(t, 80)) { d.text(ln, cx, hy, { align: 'center' }); hy += 4; }
  }

  const bx = 140, bw = R - bx;
  d.setLineWidth(0.5); d.rect(bx, 9, bw, 29); d.setLineWidth(0.25);
  font(E.ruc ? 11.5 : 10, 'bold');
  d.text(E.ruc ? `R.U.C. ${E.ruc}` : 'COMPROBANTE DE COMPRA', bx + bw / 2, 17, { align: 'center' });
  font(13, 'bold');
  d.text(v.tipo_comprobante === 'factura' ? 'FACTURA' : 'BOLETA DE VENTA', bx + bw / 2, 25.5, { align: 'center' });
  font(11.5, 'bold'); d.text(`N° ${v.codigo}`, bx + bw / 2, 33.5, { align: 'center' });

  const factura = v.tipo_comprobante === 'factura';
  const dir = v.direccion || {};
  const left = [
    ['SEÑOR(ES):', factura ? v.razon_social : (v.cliente?.nombre || v.nombre_usuario)],
    [factura ? 'R.U.C.:' : 'DNI / OTROS:', factura ? v.documento_fiscal : (v.cliente?.documento || '—')],
    ['CORREO:', v.cliente?.email || v.email_usuario],
    ['TELÉFONO:', v.cliente?.telefono || dir.telefono_contacto || '—'],
    ['DIRECCIÓN DESTINO:', dir.direccion_linea1 || '—'],
    ['LOCALIDAD:', [dir.departamento, dir.provincia, dir.distrito].filter(Boolean).join(' - ') || '—'],
  ];
  if (dir.referencia) left.push(['REFERENCIA:', dir.referencia]);
  const right = [
    ['F. EMISIÓN:', `${fecha(v.fecha)} ${hora(v.fecha)}`],
    ['TIPO DE MONEDA:', 'SOLES'],
    ['MÉTODO DE PAGO:', PAGO[v.metodo_pago] || v.metodo_pago],
    ['REF. DE PAGO:', refPago(v)],
    ['ESTADO:', (STATUS_LABEL[v.estado] || v.estado || '').toUpperCase()],
    ['ESTADO DEL PAGO:', estadoPago(v)],
  ];
  let ly = 46;
  for (const [k, val] of left) {
    font(8, 'bold'); d.text(k, L, ly);
    font(8); const ls = d.splitTextToSize(String(val ?? '—'), 82); d.text(ls, L + 33, ly);
    ly += 4.6 * ls.length;
  }
  let ry = 46;
  for (const [k, val] of right) {
    font(8, 'bold'); d.text(k, 132, ry);
    font(8); d.text(String(val ?? '—'), 162, ry);
    ry += 4.6;
  }

  const cols = [
    { t: 'COD.', w: 22, a: 'center' }, { t: 'PRODUCTO', w: 76, a: 'left' }, { t: 'CATEGORÍA', w: 30, a: 'left' },
    { t: 'CANT.', w: 15, a: 'center' }, { t: 'P. UNIT. (C/IGV)', w: 25, a: 'right' }, { t: 'SUBTOTAL', w: W - 168, a: 'right' },
  ];
  const xs = cols.reduce((acc, c) => [...acc, acc[acc.length - 1] + c.w], [L]);
  const BODY_END = 205;
  const head = (y) => {
    d.setFillColor(238, 240, 245); d.rect(L, y, W, 6.5, 'FD');
    font(7.5, 'bold');
    cols.forEach((c, i) => {
      const x = c.a === 'center' ? (xs[i] + xs[i + 1]) / 2 : c.a === 'right' ? xs[i + 1] - 2 : xs[i] + 2;
      d.text(c.t, x, y + 4.4, { align: c.a });
    });
    return y + 6.5;
  };
  const closeBody = (top, bottom) => { d.rect(L, top, W, bottom - top); for (let i = 1; i < cols.length; i++) line(xs[i], top, xs[i], bottom); };

  let y = head(Math.max(ly, ry) + 3);
  let bodyTop = y;
  y += 1.5;
  font(8);
  for (const it of v.items || []) {
    const name = d.splitTextToSize(String(it.nombre_producto || ''), cols[1].w - 4);
    const cat = d.splitTextToSize(String(it.categoria || '-'), cols[2].w - 4);
    const h = Math.max(name.length, cat.length) * 3.6 + 1.6;
    if (y + h > 272) { closeBody(bodyTop, y + 1); d.addPage(); y = head(15); bodyTop = y; y += 1.5; font(8); }
    const ty = y + 3.2;
    d.text(String(it.sku_producto || '-'), (xs[0] + xs[1]) / 2, ty, { align: 'center' });
    d.text(name, xs[1] + 2, ty);
    d.text(cat, xs[2] + 2, ty);
    d.text(n2(it.cantidad), (xs[3] + xs[4]) / 2, ty, { align: 'center' });
    d.text(n2(it.precio_unitario), xs[5] - 2, ty, { align: 'right' });
    d.text(n2(it.subtotal), xs[6] - 2, ty, { align: 'right' });
    y += h;
  }
  if (y > BODY_END) { closeBody(bodyTop, y + 1); d.addPage(); y = head(15); bodyTop = y; }
  closeBody(bodyTop, BODY_END);

  d.rect(L, BODY_END, W, 6.5);
  font(8.5, 'bold'); d.text(`SON: ${montoEnLetras(v.total)}`, L + 2, BODY_END + 4.4);

  const fy = BODY_END + 11;
  font(7.5);
  const notas = [
    'Representación impresa del comprobante de compra de NovaTech.',
    ...(E.ruc ? [] : ['Este documento no reemplaza al comprobante electrónico emitido ante SUNAT.']),
    `Despacho: envío a domicilio${dir.direccion_linea1 ? ` — ${[dir.direccion_linea1, dir.distrito].filter(Boolean).join(', ')}` : ''}.`,
    ...(v.observaciones ? [`Comentario: ${v.observaciones}`] : []),
  ];
  let ny = fy;
  for (const t of notas) { const ls = d.splitTextToSize(t, 100); d.text(ls, L, ny); ny += 3.6 * ls.length + 0.8; }
  font(8, 'bold'); d.text('¡Gracias por tu compra!', L, ny + 2);

  const gravada = Number(v.subtotal || 0) - Number(v.impuesto || 0);
  const totals = [
    ['SUBTOTAL (SIN IGV)', gravada], ['I.G.V. (18%)', v.impuesto], ['COSTO DE ENVÍO', v.costo_envio],
    ...(Number(v.descuento) > 0 ? [['DESCUENTO', -v.descuento]] : []), ['TOTAL', v.total],
  ];
  const tx = 118, tl = 168, ts = 176, rowH = 6;
  totals.forEach(([k, val], i) => {
    const ty = fy - 4 + i * rowH;
    const last = i === totals.length - 1;
    if (last) { d.setFillColor(17, 26, 46); d.rect(tx, ty, R - tx, rowH, 'F'); d.setTextColor(255); }
    else { d.rect(tx, ty, tl - tx, rowH); d.rect(tl, ty, ts - tl, rowH); d.rect(ts, ty, R - ts, rowH); }
    font(8, 'bold'); d.text(k, tl - 2, ty + 4.1, { align: 'right' });
    font(8, last ? 'bold' : 'normal'); d.text('S/', tl + 2, ty + 4.1);
    d.text(n2(val), R - 2, ty + 4.1, { align: 'right' });
    d.setTextColor(20);
  });

  const pages = d.getNumberOfPages();
  const props = lg && d.getImageProperties(lg.mark);
  for (let p = 1; p <= pages; p++) {
    d.setPage(p);
    if (lg) {
      const mw = 150, mh = (mw * props.height) / props.width;
      d.setGState(new d.GState({ opacity: 0.07 }));
      d.addImage(lg.mark, 'PNG', (210 - mw) / 2, (297 - mh) / 2 + 10, mw, mh, 'watermark', 'FAST', 0);
      d.setGState(new d.GState({ opacity: 1 }));
    }
    font(6.5); d.setTextColor(120);
    d.text(`${E.nombre} · Comprobante ${v.codigo} · Página ${p} de ${pages}`, L, 290);
    d.setTextColor(20);
  }
  return Buffer.from(d.output('arraybuffer'));
}
