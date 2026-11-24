import { sendMailSafe } from './mailer.js';
import { lowStockEmail, newOrderAdminEmail } from './emails.js';

export async function addNotification(db, { tipo = 'sistema', titulo, descripcion, metadata }) {
  return db.put('notification', { tipo, titulo: titulo.slice(0, 120), descripcion: descripcion.slice(0, 300), metadata, leido: false });
}

// Alerta SOLO cuando el stock cruza el mínimo (evita enviar un correo por cada venta).
export async function checkLowStock(db, product, previousStock) {
  const min = Number(product.stock_minimo || 0);
  if (!(product.stock <= min && previousStock > min)) return;
  await addNotification(db, {
    tipo: 'stock', titulo: `Stock bajo: ${product.nombre}`,
    descripcion: `Quedan ${product.stock} unidades (mínimo ${min}).`, metadata: { producto_id: product.id },
  });
  if (process.env.ADMIN_EMAIL) await sendMailSafe({ to: process.env.ADMIN_EMAIL, ...lowStockEmail(product) });
}

export async function notifyNewSale(db, sale) {
  await addNotification(db, {
    tipo: 'ventas', titulo: `Nueva venta ${sale.codigo}`,
    descripcion: `${sale.nombre_usuario} · S/ ${sale.total.toFixed(2)} · ${sale.metodo_pago}`, metadata: { venta_id: sale.id },
  });
  if (process.env.ADMIN_EMAIL) await sendMailSafe({ to: process.env.ADMIN_EMAIL, ...newOrderAdminEmail(sale) });
}
