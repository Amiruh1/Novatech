// Plantillas de correo de NovaTech (colores de la tienda: azul noche y dorado).
// - Todo dato del usuario se escapa para evitar inyección de HTML.
// - El logo y los iconos van incrustados en el correo (CID), así se ven en Gmail/Outlook sin depender
//   de que el sitio esté publicado. Cada plantilla adjunta solo las imágenes que usa (campo `inline`).
// - Maquetación con tablas y estilos en línea: es lo que soportan todos los clientes de correo.
import { readFileSync } from 'node:fs';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pen = (n) => `S/ ${Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const FRONT = () => (process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].replace(/\/$/, '');
const fecha = (iso) => new Date(iso).toLocaleString('es-PE', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Lima' });

const C = { navy: '#111a2e', navy2: '#22305a', gold: '#b08a3e', goldInk: '#8a6a24', goldLight: '#e9cf96', goldSoft: '#f6eedc', page: '#f4f2ec', ink: '#1c2333', muted: '#6b7385', line: '#ece8de' };
const FONT = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// ---- Imágenes incrustadas ----
const ASSETS = new URL('../../assets/', import.meta.url);
const cache = new Map();
const file = (path) => { if (!cache.has(path)) { try { cache.set(path, readFileSync(new URL(path, ASSETS))); } catch { cache.set(path, null); } } return cache.get(path); };
/** Colector de imágenes usadas por una plantilla: img('hero-mail') devuelve el src "cid:" y la registra. */
function images() {
  const used = new Map();
  const add = (key, path) => { if (file(path)) used.set(key, path); return file(path) ? `cid:${key}@novatech` : null; };
  return {
    logo: () => add('logo', 'logo-receipt.png'),
    icon: (kind, name) => add(`${kind}-${name}`, `mail/${kind}-${name}.png`),
    list: () => [...used].map(([key, path]) => ({ filename: `${key}.png`, content: file(path), contentType: 'image/png', cid: `${key}@novatech` })),
  };
}

// ---- Piezas ----
const btn = (href, label) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px auto 4px"><tr>
  <td style="border-radius:12px;background:${C.navy}"><a href="${esc(href)}" style="display:inline-block;padding:14px 30px;font-family:${FONT};font-size:15px;font-weight:700;color:${C.goldLight};text-decoration:none;border-radius:12px">${esc(label)} &rarr;</a></td>
</tr></table>`;

const iconImg = (src, size, alt = '') => (src ? `<img src="${src}" width="${size}" height="${size}" alt="${esc(alt)}" style="display:block;border:0;width:${size}px;height:${size}px">` : '');

/** Fila con icono pequeño + título + texto (para listas de beneficios o datos). */
const infoRow = (im, icon, title, text) => `<tr>
  <td width="44" valign="top" style="padding:8px 12px 8px 0">${iconImg(im.icon('mini', icon), 32)}</td>
  <td valign="top" style="padding:8px 0;font-family:${FONT}"><div style="font-size:14px;font-weight:700;color:${C.ink}">${title}</div>${text ? `<div style="font-size:13px;color:${C.muted};line-height:1.5">${text}</div>` : ''}</td>
</tr>`;
const infoTable = (rows) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0">${rows.join('')}</table>`;

const box = (inner, tone = 'soft') => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;border-radius:14px;${tone === 'soft' ? `background:${C.goldSoft};border:1px solid #e6d6b2` : `background:#f7f8fb;border:1px solid ${C.line}`}"><tr><td style="padding:18px 20px;font-family:${FONT}">${inner}</td></tr></table>`;

/** Código OTP grande y monoespaciado (RF-03). */
const codeBox = (code, minutos) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px auto 8px"><tr>
  <td align="center" style="padding:18px 28px;border-radius:16px;background:${C.navy};border:2px solid ${C.gold}">
    <div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:3px;color:${C.goldLight};text-transform:uppercase;margin-bottom:6px">Tu código</div>
    <div style="font-family:Consolas,'Courier New',monospace;font-size:36px;font-weight:700;letter-spacing:10px;color:#ffffff;padding-left:10px">${esc(code)}</div>
  </td></tr></table>
  <p style="margin:0;text-align:center;font-family:${FONT};font-size:13px;color:${C.muted}">Válido por <b>${minutos} minutos</b> · úsalo una sola vez</p>`;

function layout(im, { preheader = '', heroIcon, eyebrow, title, intro, body = '', cta, note }) {
  const logo = im.logo();
  const foot = (icon, label) => `<td align="center" valign="top" width="33%" style="padding:0 6px">
    ${iconImg(im.icon('mini', icon), 32, '').replace('display:block', 'display:block;margin:0 auto 6px')}
    <div style="font-family:${FONT};font-size:12px;font-weight:600;color:${C.ink}">${label}</div></td>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${C.page}">
<span style="display:none!important;opacity:0;color:transparent;max-height:0;max-width:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px">
  <!-- Logo -->
  <tr><td align="center" style="padding:6px 0 18px">${logo ? `<a href="${esc(FRONT())}"><img src="${logo}" width="190" alt="NovaTech" style="display:block;border:0;width:190px;height:auto"></a>` : `<span style="font-family:Georgia,serif;font-size:26px;letter-spacing:6px;color:${C.navy}">NOVA<b style="color:${C.gold}">TECH</b></span>`}</td></tr>
  <!-- Tarjeta -->
  <tr><td style="background:#ffffff;border-radius:20px;border:1px solid ${C.line};overflow:hidden">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="height:6px;background:${C.navy};background-image:linear-gradient(90deg,${C.navy},${C.navy2} 60%,${C.gold});font-size:0;line-height:0">&nbsp;</td></tr>
      <tr><td align="center" style="padding:34px 32px 6px">
        ${heroIcon ? iconImg(im.icon('hero', heroIcon), 64, '').replace('display:block', 'display:block;margin:0 auto 16px') : ''}
        ${eyebrow ? `<div style="font-family:${FONT};font-size:11px;font-weight:800;letter-spacing:3px;color:${C.goldInk};text-transform:uppercase;margin-bottom:8px">${esc(eyebrow)}</div>` : ''}
        <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;font-weight:600;color:${C.navy}">${esc(title)}</h1>
        ${intro ? `<p style="margin:12px 0 0;font-family:${FONT};font-size:15px;line-height:1.6;color:#4b5263">${intro}</p>` : ''}
      </td></tr>
      <tr><td style="padding:10px 32px 30px;font-family:${FONT};font-size:14.5px;line-height:1.6;color:${C.ink}">
        ${body}
        ${cta ? btn(cta.href, cta.label) : ''}
        ${note ? `<p style="margin:22px 0 0;padding-top:16px;border-top:1px solid ${C.line};font-size:12.5px;line-height:1.55;color:${C.muted}">${note}</p>` : ''}
      </td></tr>
    </table>
  </td></tr>
  <!-- Beneficios -->
  <tr><td style="padding:22px 8px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    ${foot('truck', 'Envíos a todo el Perú')}${foot('shield', 'Compra segura')}${foot('support', 'Atención personalizada')}
  </tr></table></td></tr>
  <!-- Pie -->
  <tr><td align="center" style="padding:18px 16px 4px;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.muted}">
    <a href="${esc(FRONT())}/tienda/" style="color:${C.goldInk};font-weight:700;text-decoration:none">Tienda</a> &nbsp;·&nbsp;
    <a href="${esc(FRONT())}/mis-compras/" style="color:${C.goldInk};font-weight:700;text-decoration:none">Mis pedidos</a> &nbsp;·&nbsp;
    <a href="${esc(FRONT())}/configuracion/" style="color:${C.goldInk};font-weight:700;text-decoration:none">Mi cuenta</a><br>
    Este es un mensaje automático de NovaTech; no respondas a este correo.<br>© ${new Date().getFullYear()} NovaTech · Tecnología con carácter.
  </td></tr>
</table></td></tr></table></body></html>`;
}
const build = (fn) => { const im = images(); const { subject, text, ...rest } = fn(im); return { subject, html: layout(im, rest), text, inline: im.list() }; };

// ---- Cuenta ----
export const welcomeEmail = (u) => build((im) => ({
  subject: '¡Bienvenido a NovaTech!',
  preheader: 'Tu cuenta está lista. Descubre lo que tenemos para ti.',
  heroIcon: 'sparkle', eyebrow: 'Cuenta creada',
  title: `¡Bienvenido a NovaTech, ${u.nombre.split(' ')[0]}!`,
  intro: 'Tu cuenta fue creada correctamente. Ya puedes comprar tecnología con seguimiento de cada pedido.',
  body: infoTable([
    infoRow(im, 'cart', 'Compra en minutos', 'Tu carrito se guarda entre sesiones y dispositivos.'),
    infoRow(im, 'package', 'Sigue tus pedidos', 'Mira el estado de cada compra y descarga tu comprobante.'),
    infoRow(im, 'pin', 'Guarda tus direcciones', 'Elige una principal y el checkout la usará por ti.'),
  ]),
  cta: { href: `${FRONT()}/tienda/`, label: 'Ir a la tienda' },
  text: `Hola ${u.nombre}, tu cuenta en NovaTech fue creada. Visita ${FRONT()}/tienda/`,
}));

export const registerOtpEmail = (nombre, code, minutos) => build(() => ({
  subject: `${code} es tu código de verificación de NovaTech`,
  preheader: `Tu código de verificación es ${code}.`,
  heroIcon: 'mail', eyebrow: 'Verifica tu correo',
  title: 'Confirma tu cuenta',
  intro: `Hola ${esc(nombre)}, para terminar de crear tu cuenta escribe este código en la ventana de registro.`,
  body: codeBox(code, minutos),
  note: 'Si no intentaste registrarte en NovaTech, ignora este mensaje: no se creará ninguna cuenta.',
  text: `Tu código de verificación de NovaTech es ${code} (válido por ${minutos} minutos).`,
}));

export const otpEmail = (u, code) => build(() => ({
  subject: 'Código para restablecer tu contraseña',
  preheader: `Tu código de recuperación es ${code}.`,
  heroIcon: 'lock', eyebrow: 'Recuperar contraseña',
  title: 'Restablece tu contraseña',
  intro: `Hola ${esc(u.nombre)}, recibimos una solicitud para cambiar la contraseña de tu cuenta.`,
  body: codeBox(code, 15),
  cta: { href: `${FRONT()}/reset-password/?email=${encodeURIComponent(u.email)}&code=${encodeURIComponent(code)}`, label: 'Crear nueva contraseña' },
  note: 'Si no solicitaste el cambio, ignora este mensaje: tu contraseña sigue siendo la misma. Nunca compartas este código.',
  text: `Tu código de recuperación es ${code} (válido por 15 minutos).`,
}));

// ---- Pedidos ----
const PAGO = { tarjeta: 'Tarjeta de crédito / débito', yape: 'Yape / Plin', transferencia: 'Transferencia bancaria' };
const pagoTxt = (s) => {
  const d = s.pago_detalle || {};
  const extra = d.ultimos4 ? ` · ${d.marca || 'Tarjeta'} **** ${d.ultimos4}` : d.banco ? ` · ${d.banco}` : '';
  return `${PAGO[s.metodo_pago] || s.metodo_pago}${extra}${s.referencia_pago ? ` · Op. ${s.referencia_pago}` : ''}`;
};
const isUrl = (u) => /^https:\/\//i.test(String(u || ''));

function itemsTable(im, sale) {
  const rows = (sale.items || []).map((i) => `<tr>
    <td width="60" style="padding:12px 12px 12px 0;border-bottom:1px solid ${C.line}">
      ${isUrl(i.imagen) ? `<img src="${esc(i.imagen)}" width="52" height="52" alt="" style="display:block;width:52px;height:52px;object-fit:contain;border:1px solid ${C.line};border-radius:10px;background:#fff">` : `<table role="presentation" width="52" height="52" cellpadding="0" cellspacing="0" style="border-radius:10px;background:${C.goldSoft}"><tr><td align="center" valign="middle">${iconImg(im.icon('mini', 'package'), 32)}</td></tr></table>`}
    </td>
    <td style="padding:12px 0;border-bottom:1px solid ${C.line};font-family:${FONT}">
      <div style="font-size:14px;font-weight:700;color:${C.ink}">${esc(i.nombre_producto)}</div>
      <div style="font-size:12.5px;color:${C.muted}">${i.cantidad} × ${pen(i.precio_unitario ?? i.subtotal / i.cantidad)}${i.categoria ? ` · ${esc(i.categoria)}` : ''}</div>
    </td>
    <td align="right" style="padding:12px 0;border-bottom:1px solid ${C.line};font-family:${FONT};font-size:14px;font-weight:700;color:${C.ink};white-space:nowrap">${pen(i.subtotal)}</td>
  </tr>`).join('');
  const line = (k, val, strong) => `<tr><td colspan="2" style="padding:5px 0;font-family:${FONT};font-size:${strong ? 16 : 13.5}px;${strong ? `font-weight:800;color:${C.navy}` : `color:${C.muted}`}">${k}</td>
    <td align="right" style="padding:5px 0;font-family:${FONT};font-size:${strong ? 18 : 13.5}px;font-weight:${strong ? 800 : 600};color:${strong ? C.goldInk : C.ink};white-space:nowrap">${val}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 4px">${rows}
    <tr><td colspan="3" style="height:8px"></td></tr>
    ${line('Subtotal (sin IGV)', pen(Number(sale.subtotal || 0) - Number(sale.impuesto || 0)))}
    ${line('IGV (18 %)', pen(sale.impuesto))}
    ${line(`Envío${sale.zona_envio ? ` · ${esc(sale.zona_envio)}` : ''}`, Number(sale.costo_envio) ? pen(sale.costo_envio) : '<span style="color:#1f7a52">Gratis</span>')}
    <tr><td colspan="3" style="padding-top:6px;border-bottom:1px solid ${C.line}"></td></tr>
    ${line('Total', pen(sale.total), true)}
  </table>`;
}
const orderFacts = (im, sale) => infoTable([
  infoRow(im, 'file', `Pedido ${esc(sale.codigo)}`, esc(fecha(sale.fecha))),
  infoRow(im, 'card', 'Método de pago', esc(pagoTxt(sale))),
  infoRow(im, 'pin', 'Envío a domicilio', sale.direccion ? esc([sale.direccion.direccion_linea1, sale.direccion.distrito, sale.direccion.provincia].filter(Boolean).join(', ')) : ''),
]);

// Línea de tiempo del pedido (RF-23): Pendiente → Pagado → Preparando → En camino → Entregado.
const STEPS = [['pendiente', 'Pendiente'], ['pagado', 'Pagado'], ['preparando', 'Preparando'], ['en camino', 'En camino'], ['entregado', 'Entregado']];
function tracker(estado) {
  if (['cancelado', 'reembolsado'].includes(estado)) return '';
  const cur = STEPS.findIndex(([k]) => k === estado);
  const cells = STEPS.map(([, label], i) => {
    const done = i <= cur;
    return `<td align="center" valign="top" width="20%" style="padding:0 2px;font-family:${FONT}">
      <div style="width:28px;height:28px;margin:0 auto 6px;border-radius:50%;line-height:28px;font-size:13px;font-weight:800;${done ? `background:${C.navy};color:${C.goldLight}` : `background:#eef0f4;color:#9aa1b0`}">${done ? '&#10003;' : i + 1}</div>
      <div style="font-size:11.5px;font-weight:${i === cur ? 800 : 600};color:${i === cur ? C.goldInk : done ? C.ink : '#9aa1b0'}">${label}</div></td>`;
  }).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 6px"><tr>${cells}</tr></table>`;
}

export const orderEmail = (sale, user) => build((im) => ({
  subject: `Pedido ${sale.codigo} recibido`,
  preheader: `Recibimos tu pedido por ${pen(sale.total)}. Adjuntamos tu comprobante.`,
  heroIcon: 'cart', eyebrow: '¡Gracias por tu compra!',
  title: `Recibimos tu pedido, ${user.nombre.split(' ')[0]}`,
  intro: `Tu pedido <b>${esc(sale.codigo)}</b> está registrado. Te avisaremos por correo cada vez que cambie de estado.`,
  body: tracker(sale.estado) + orderFacts(im, sale) + box(itemsTable(im, sale), 'plain')
    + box(`<table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="44" valign="top">${iconImg(im.icon('mini', 'file'), 32)}</td>
      <td style="font-family:${FONT};font-size:13.5px;color:${C.ink}"><b>Tu comprobante va adjunto en PDF.</b><br><span style="color:${C.muted}">También puedes descargarlo desde "Mis pedidos" cuando se confirme el pago.</span></td></tr></table>`),
  cta: { href: `${FRONT()}/mis-compras/`, label: 'Ver mi pedido' },
  text: `Pedido ${sale.codigo} recibido. Total ${pen(sale.total)}. Método de pago: ${pagoTxt(sale)}.`,
}));

const STATUS = {
  pagado: { icon: 'card', eyebrow: 'Pago confirmado', title: 'Confirmamos tu pago', msg: 'Ya estamos preparando todo para enviar tu pedido. Adjuntamos tu comprobante actualizado.' },
  preparando: { icon: 'package', eyebrow: 'En preparación', title: 'Estamos preparando tu pedido', msg: 'Nuestro equipo está empacando tus productos con cuidado.' },
  'en camino': { icon: 'truck', eyebrow: 'En camino', title: '¡Tu pedido va en camino!', msg: 'El courier ya tiene tu pedido. Mantente atento al teléfono de contacto.' },
  entregado: { icon: 'check', eyebrow: 'Entregado', title: '¡Tu pedido fue entregado!', msg: 'Esperamos que disfrutes tu compra. ¡Gracias por confiar en NovaTech!' },
  cancelado: { icon: 'x', eyebrow: 'Pedido cancelado', title: 'Tu pedido fue cancelado', msg: 'Si ya realizaste un pago, nos comunicaremos contigo para la devolución. Ante cualquier duda, contáctanos.' },
  reembolsado: { icon: 'refresh', eyebrow: 'Reembolso', title: 'Tu pedido fue reembolsado', msg: 'Procesamos la devolución del importe. Puede tardar unos días hábiles en reflejarse según tu medio de pago.' },
};
export const statusEmail = (sale, user) => build((im) => {
  const s = STATUS[sale.estado] || { icon: 'bell', eyebrow: 'Actualización', title: 'Tu pedido cambió de estado', msg: '' };
  return {
    subject: `Tu pedido ${sale.codigo}: ${sale.estado}`,
    preheader: `${s.title}. Pedido ${sale.codigo}.`,
    heroIcon: s.icon === 'bell' ? 'alert' : s.icon, eyebrow: s.eyebrow, title: s.title,
    intro: `Hola ${esc(user.nombre.split(' ')[0])}, ${s.msg.charAt(0).toLowerCase()}${s.msg.slice(1)}`,
    body: tracker(sale.estado) + box(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-family:${FONT};font-size:13px;color:${C.muted}">Pedido</td><td align="right" style="font-family:${FONT};font-size:14px;font-weight:700;color:${C.ink}">${esc(sale.codigo)}</td></tr>
      <tr><td style="font-family:${FONT};font-size:13px;color:${C.muted};padding-top:6px">Estado</td><td align="right" style="padding-top:6px"><span style="display:inline-block;padding:3px 12px;border-radius:99px;background:${C.navy};color:${C.goldLight};font-family:${FONT};font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1px">${esc(sale.estado)}</span></td></tr>
      <tr><td style="font-family:${FONT};font-size:13px;color:${C.muted};padding-top:6px">Total</td><td align="right" style="font-family:${FONT};font-size:14px;font-weight:700;color:${C.ink};padding-top:6px">${pen(sale.total)}</td></tr></table>`),
    cta: { href: `${FRONT()}/mis-compras/`, label: 'Ver el detalle' },
    text: `Tu pedido ${sale.codigo} ahora está: ${sale.estado}.`,
  };
});

// ---- Avisos al administrador ----
export const lowStockEmail = (product) => build((im) => ({
  subject: `Stock bajo: ${product.nombre}`,
  preheader: `Quedan ${product.stock} unidades de ${product.nombre}.`,
  heroIcon: 'alert', eyebrow: 'Alerta de inventario',
  title: 'Stock bajo en un producto',
  intro: `<b>${esc(product.nombre)}</b> llegó a su stock mínimo. Repón el inventario para no perder ventas.`,
  body: infoTable([
    infoRow(im, 'package', 'Stock actual', `<b style="color:#b3261e;font-size:15px">${product.stock} unidades</b> · mínimo configurado: ${product.stock_minimo}`),
    infoRow(im, 'file', 'SKU', esc(product.sku || '—')),
  ]),
  cta: { href: `${FRONT()}/empresa/productos/`, label: 'Gestionar inventario' },
  text: `Stock bajo en ${product.nombre}: ${product.stock} (mínimo ${product.stock_minimo}).`,
}));

export const newOrderAdminEmail = (sale) => build((im) => ({
  subject: `Nueva venta ${sale.codigo} — ${pen(sale.total)}`,
  preheader: `${sale.nombre_usuario} compró por ${pen(sale.total)}.`,
  heroIcon: 'shield', eyebrow: 'Nueva venta',
  title: `Nueva venta por ${pen(sale.total)}`,
  intro: `<b>${esc(sale.nombre_usuario)}</b> realizó el pedido <b>${esc(sale.codigo)}</b>.`,
  body: infoTable([
    infoRow(im, 'user', 'Cliente', `${esc(sale.nombre_usuario)} · ${esc(sale.email_usuario)}`),
    infoRow(im, 'card', 'Pago', esc(pagoTxt(sale)) + (sale.metodo_pago !== 'tarjeta' ? ' — <b>revisa y confirma la operación</b>' : '')),
    infoRow(im, 'package', 'Productos', esc((sale.items || []).map((i) => `${i.cantidad} × ${i.nombre_producto}`).join(', '))),
  ]),
  cta: { href: `${FRONT()}/empresa/ventas/`, label: 'Ver ventas' },
  text: `Nueva venta ${sale.codigo}: ${pen(sale.total)}.`,
}));
