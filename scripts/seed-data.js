// Datos de ejemplo (reutilizado por seed.js y las pruebas)
import { newId } from '../src/lib/id.js';

/** createLogin(id, email, password): crea la cuenta en el proveedor de identidad (Cognito o, en pruebas, memoria). */
export async function seed(db, createLogin) {
  if ((await db.listBy('user', 'email', 'admin@novatech.com')).length) { console.log('(ya existían datos; no se duplican)'); return; }
  const adminId = newId(), cliId = newId();
  await createLogin(adminId, 'admin@novatech.com', 'NovaTech123!');
  await createLogin(cliId, 'cliente@novatech.com', 'NovaTech123!');
  const base = { tipo_documento: 'DNI', telefono: null, avatar_url: null, activo: true, cognito: true };
  await db.put('user', { ...base, id: adminId, nombre: 'Administrador NovaTech', email: 'admin@novatech.com', rol: 'admin', numero_documento: '11111111' });
  const cli = await db.put('user', { ...base, id: cliId, nombre: 'Cliente Demo', email: 'cliente@novatech.com', rol: 'cliente', numero_documento: '22222222' });
  await db.put('address', { usuario_id: cli.id, alias: 'Casa', destinatario: 'Cliente Demo', direccion_linea1: 'Av. Larco 123', distrito: 'Miraflores', provincia: 'Lima', departamento: 'Lima', pais: 'PE', predeterminada: true });

  const cats = {};
  for (const [i, n] of ['Laptops', 'Celulares', 'Accesorios', 'Monitores'].entries())
    cats[n] = await db.put('category', { nombre: n, slug: n.toLowerCase(), descripcion: '', orden: i, activo: true });
  const subs = {};
  for (const [c, n] of [['Laptops', 'Gamer'], ['Laptops', 'Oficina'], ['Accesorios', 'Audio'], ['Accesorios', 'Periféricos']])
    subs[n] = await db.put('subcategory', { categoria_id: cats[c].id, nombre: n, slug: n.toLowerCase(), orden: 0, activo: true });
  const brands = {};
  for (const n of ['Lenovo', 'HP', 'Samsung', 'Logitech', 'Sony', 'LG'])
    brands[n] = await db.put('brand', { nombre: n, slug: n.toLowerCase(), orden: 0, activo: true });

  const P = (nombre, sku, cat, sub, marca, precio, oferta, stock, min, destacado, desc) => ({
    sku, nombre, descripcion: desc, categoria_id: cats[cat].id, categoria: cat, subcategoria_id: sub ? subs[sub].id : null, subcategoria: sub || null,
    marca_id: brands[marca].id, marca, precio, precio_oferta: oferta, precio_compra: Math.round(precio * 0.75), stock, stock_minimo: min,
    imagen: null, destacado, activo: true,
  });
  const list = [
    P('Laptop Lenovo LOQ 15" RTX 4050', 'LAP-001', 'Laptops', 'Gamer', 'Lenovo', 3899, 3599, 8, 3, true, 'Ryzen 7, 16GB RAM, 512GB SSD, RTX 4050.'),
    P('Laptop HP 250 G9 Core i5', 'LAP-002', 'Laptops', 'Oficina', 'HP', 2299, null, 12, 4, false, 'Intel Core i5, 8GB RAM, 256GB SSD.'),
    P('Samsung Galaxy S24 128GB', 'CEL-001', 'Celulares', null, 'Samsung', 3299, 2999, 15, 5, true, 'Pantalla AMOLED 6.2", 8GB RAM.'),
    P('Mouse Logitech MX Master 3S', 'ACC-001', 'Accesorios', 'Periféricos', 'Logitech', 399, null, 25, 8, false, 'Inalámbrico, 8000 DPI.'),
    P('Audífonos Sony WH-1000XM5', 'ACC-002', 'Accesorios', 'Audio', 'Sony', 1199, 999, 6, 3, true, 'Cancelación de ruido líder.'),
    P('Monitor LG UltraGear 27" 144Hz', 'MON-001', 'Monitores', null, 'LG', 1099, null, 2, 3, false, 'IPS QHD, 1ms.'),
  ];
  for (const p of list) {
    const saved = await db.put('product', p);
    await db.put('movement', { producto_id: saved.id, tipo: 'ENTRADA', cantidad: p.stock, stock_anterior: 0, stock_nuevo: p.stock, motivo: 'Stock inicial', usuario_id: null });
  }
  await db.put('banner', { titulo: 'Ofertas de tecnología', subtitulo: 'Hasta 15% de descuento en laptops y audio', imagen: '/brand/banner-ofertas.jpg', enlace: '/ofertas/', orden: 0, activo: true });
}
