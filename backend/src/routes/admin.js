import { route, requireAdmin } from '../lib/router.js';
import { ok } from '../lib/http.js';

const PAID = new Set(['pagado', 'preparando', 'en camino', 'entregado']);
const day = (iso) => iso.slice(0, 10);

const LOW_STOCK = 8; // "stock bajo": hasta 8 unidades o por debajo del mínimo del producto
// Inicio del período elegido en el dashboard (hoy, últimos 7 días o mes en curso).
function periodStart(periodo) {
  const now = new Date();
  if (periodo === 'hoy') return day(now.toISOString());
  if (periodo === 'semana') return day(new Date(Date.now() - 6 * 86400000).toISOString());
  return now.toISOString().slice(0, 7); // mes: AAAA-MM (comparación por prefijo de fecha)
}

route('GET', '/admin/dashboard', requireAdmin, async ({ db, query }) => {
  const [sales, products, users] = await Promise.all([db.list('sale'), db.list('product'), db.list('user')]);
  const periodo = ['hoy', 'semana', 'mes'].includes(query.periodo) ? query.periodo : 'mes';
  const desde = periodStart(periodo);
  const inPeriod = (s) => (periodo === 'mes' ? s.fecha.startsWith(desde) : day(s.fecha) >= desde);
  const today = day(new Date().toISOString());
  const month = today.slice(0, 7);
  const real = sales.filter((s) => PAID.has(s.estado));
  const sum = (arr) => Math.round(arr.reduce((t, s) => t + s.total, 0) * 100) / 100;

  const series = [];
  for (let i = 29; i >= 0; i--) {
    const d = day(new Date(Date.now() - i * 86400000).toISOString());
    const ds = real.filter((s) => day(s.fecha) === d);
    series.push({ fecha: d, ventas: ds.length, ingresos: sum(ds) });
  }
  const porEstado = {};
  for (const s of sales) porEstado[s.estado] = (porEstado[s.estado] || 0) + 1;
  const top = new Map();
  for (const s of real) for (const i of s.items) {
    const t = top.get(i.producto_id) || { producto_id: i.producto_id, nombre: i.nombre_producto, unidades: 0, ingresos: 0 };
    t.unidades += i.cantidad; t.ingresos += i.subtotal; top.set(i.producto_id, t);
  }
  const active = products.filter((p) => p.activo !== false);
  const ps = sales.filter(inPeriod);
  const porEstadoPeriodo = {};
  for (const s of ps) porEstadoPeriodo[s.estado] = (porEstadoPeriodo[s.estado] || 0) + 1;
  const porCategoria = new Map();
  for (const p of active) porCategoria.set(p.categoria || 'Sin categoría', (porCategoria.get(p.categoria || 'Sin categoría') || 0) + 1);
  const bajo = active.filter((p) => p.stock <= Math.max(LOW_STOCK, p.stock_minimo || 0)).sort((a, b) => a.stock - b.stock);
  return ok({
    periodo,
    resumen: {
      ingresos: sum(ps.filter((s) => PAID.has(s.estado))), pedidos: ps.length,
      pendientes: porEstadoPeriodo.pendiente || 0, entregados: porEstadoPeriodo.entregado || 0,
      productos: active.length, stock_total: active.reduce((t, p) => t + p.stock, 0),
      valor_inventario: Math.round(active.reduce((t, p) => t + (p.precio_compra ?? p.precio) * p.stock, 0) * 100) / 100,
    },
    estados_periodo: porEstadoPeriodo,
    // Los 8 productos con menos stock (para el gráfico de riesgo).
    riesgo_inventario: [...active].sort((a, b) => a.stock - b.stock).slice(0, 8)
      .map((p) => ({ id: p.id, nombre: p.nombre, stock: p.stock, stock_minimo: p.stock_minimo || 0 })),
    por_categoria: [...porCategoria].map(([nombre, productos]) => ({ nombre, productos })).sort((a, b) => b.productos - a.productos),
    alerta_stock: { umbral: LOW_STOCK, total: bajo.length, items: bajo.slice(0, 8).map((p) => ({ id: p.id, nombre: p.nombre, categoria: p.categoria, stock: p.stock, stock_minimo: p.stock_minimo || 0 })) },
    ultimos_pedidos: [...sales].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 5)
      .map((s) => ({ id: s.id, codigo: s.codigo, cliente: s.nombre_usuario, estado: s.estado, total: s.total, fecha: s.fecha })),
    kpis: {
      ingresos_hoy: sum(real.filter((s) => day(s.fecha) === today)), ingresos_mes: sum(real.filter((s) => s.fecha.startsWith(month))),
      ingresos_total: sum(real), pedidos_pendientes: porEstado.pendiente || 0, pedidos_total: sales.length,
      clientes: users.filter((u) => u.rol === 'cliente' && u.activo !== false).length,
      productos_activos: active.length, valor_inventario: Math.round(active.reduce((t, p) => t + (p.precio_compra ?? p.precio) * p.stock, 0) * 100) / 100,
    },
    serie_30_dias: series, por_estado: porEstado,
    top_productos: [...top.values()].sort((a, b) => b.unidades - a.unidades).slice(0, 5),
    stock_bajo: active.filter((p) => p.stock <= (p.stock_minimo || 0)).sort((a, b) => a.stock - b.stock).slice(0, 10)
      .map((p) => ({ id: p.id, nombre: p.nombre, stock: p.stock, stock_minimo: p.stock_minimo })),
  });
});
