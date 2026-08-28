import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProductsService } from '../../../services/products';
import { SalesService } from '../../../services/sales';
import { ProductModel } from '../../../core/models/product.model';
import { SaleModel } from '../../../core/models/sale.model';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { RouterModule } from '@angular/router';
import { ChartModule }    from 'primeng/chart';
import { CardModule }     from 'primeng/card';
import { TableModule }    from 'primeng/table';
import { TagModule }      from 'primeng/tag';
import { ButtonModule }   from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { TooltipModule }  from 'primeng/tooltip';

export type DashPeriod = 'hoy' | 'semana' | 'mes';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [CommonModule, RouterModule, ChartModule, CardModule, TableModule, TagModule, ButtonModule, SkeletonModule, TooltipModule],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss'
})
export class DashboardPage implements OnInit {
  private productsService = inject(ProductsService);
  private salesService    = inject(SalesService);
  private cd              = inject(ChangeDetectorRef);

  loading = true;

  // ── Period filter ────────────────────────────────────────────────────────────
  period: DashPeriod = 'mes';

  readonly periods: { label: string; value: DashPeriod }[] = [
    { label: 'Hoy',    value: 'hoy'    },
    { label: 'Semana', value: 'semana' },
    { label: 'Mes',    value: 'mes'    }
  ];

  // ── Raw source data ──────────────────────────────────────────────────────────
  private allProducts: ProductModel[] = [];
  private allSales:    SaleModel[]    = [];

  // ── Derived KPIs (recalculated on period change) ─────────────────────────────
  totalProductos    = 0;
  totalStock        = 0;
  totalPedidos      = 0;
  totalIngresos     = 0;
  valorInventario   = 0;
  pedidosPendientes = 0;
  pedidosEntregados = 0;
  alertasPago       = 0; // pedidos con pago manual pendiente

  // Trend % vs. previous equal period
  trendIngresos     = 0;
  trendPedidos      = 0;

  // Animated display values
  displayTotalProductos    = 0;
  displayTotalStock        = 0;
  displayTotalPedidos      = 0;
  displayTotalIngresos     = 0;
  displayValorInventario   = 0;
  displayPedidosPendientes = 0;
  displayPedidosEntregados = 0;

  // ── Sparkline data (7 daily points) ─────────────────────────────────────────
  sparkIngresos:  number[] = [];
  sparkPedidos:   number[] = [];
  sparkPendientes: number[] = [];

  chartDataStock:       any;
  chartOptionsStock:    any;
  chartDataEstado:      any;
  chartOptionsEstado:   any;
  chartDataCategoria:   any;
  chartOptionsCategoria: any;

  lowStockProducts: ProductModel[] = [];
  recentSales:      SaleModel[]    = [];

  // ── Getters ──────────────────────────────────────────────────────────────────
  get pctEntregados(): number {
    if (!this.totalPedidos) return 0;
    return Math.round((this.pedidosEntregados / this.totalPedidos) * 100);
  }

  get tasaPendiente(): number {
    if (!this.totalPedidos) return 0;
    return Math.round((this.pedidosPendientes / this.totalPedidos) * 100);
  }

  get trendIngresosLabel(): string {
    if (!this.trendIngresos) return '';
    const sign = this.trendIngresos > 0 ? '+' : '';
    return `${sign}${this.trendIngresos.toFixed(1)}% vs. período anterior`;
  }

  get trendPedidosLabel(): string {
    if (!this.trendPedidos) return '';
    const sign = this.trendPedidos > 0 ? '+' : '';
    return `${sign}${this.trendPedidos.toFixed(1)}% vs. período anterior`;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  ngOnInit() { this.cargarDatos(); }

  // ── Period API ───────────────────────────────────────────────────────────────
  setPeriod(p: DashPeriod) {
    this.period = p;
    this.recalcular();
    this.cd.markForCheck();
  }

  cargarDatos() {
    this.loading = true;
    this.cd.markForCheck();

    forkJoin({
      products: this.productsService.getProducts().pipe(catchError(() => of([] as ProductModel[]))),
      sales:    this.salesService.getAdminSales().pipe(catchError(() => of([] as SaleModel[])))
    }).subscribe(({ products, sales }) => {
      this.allProducts = products;
      this.allSales    = sales;

      this.lowStockProducts = [...products]
        .sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0))
        .filter(p => Number(p.stock || 0) <= 8)
        .slice(0, 10);

      this.recentSales = [...sales]
        .sort((a, b) => new Date(b.fecha || '').getTime() - new Date(a.fecha || '').getTime())
        .slice(0, 6);

      this.configurarCharts(products, sales);
      this.configurarOpciones();
      this.loading = false;
      this.recalcular();
      this.cd.detectChanges();
    });
  }

  // ── Core recalculation ───────────────────────────────────────────────────────
  private recalcular() {
    const { current, previous } = this.filtrarPorPeriodo();

    this.totalProductos    = this.allProducts.length;
    this.totalStock        = this.allProducts.reduce((a, i) => a + Number(i.stock || 0), 0);
    this.valorInventario   = this.allProducts.reduce((a, i) => a + (Number(i.stock || 0) * Number(i.precio || 0)), 0);
    this.totalPedidos      = current.length;
    this.totalIngresos     = current.reduce((a, s) => a + Number(s.total || 0), 0);
    this.pedidosPendientes = current.filter(s => (s.estado || 'pendiente') === 'pendiente').length;
    this.pedidosEntregados = current.filter(s => (s.estado || 'pendiente') === 'entregado').length;
    this.alertasPago       = current.filter(s => String(s['pago_estado'] || '').toLowerCase() === 'pendiente').length;

    // Trend vs. previous period
    const prevIngresos = previous.reduce((a, s) => a + Number(s.total || 0), 0);
    const prevPedidos  = previous.length;
    this.trendIngresos = prevIngresos > 0 ? ((this.totalIngresos - prevIngresos) / prevIngresos) * 100 : 0;
    this.trendPedidos  = prevPedidos  > 0 ? ((this.totalPedidos  - prevPedidos)  / prevPedidos)  * 100 : 0;

    // Sparklines from daily buckets
    this.sparkIngresos   = this.buildSparkline(current, 'total', 7);
    this.sparkPedidos    = this.buildSparkline(current, 'count', 7);
    this.sparkPendientes = this.buildSparkline(
      current.filter(s => (s.estado || 'pendiente') === 'pendiente'), 'count', 7
    );

    this.animarTodosLosContadores();
  }

  // ── Period helpers ───────────────────────────────────────────────────────────
  private filtrarPorPeriodo(): { current: SaleModel[]; previous: SaleModel[] } {
    const now  = new Date();
    const msDay = 86400000;
    let cutStart: Date;
    let prevStart: Date;
    let prevEnd: Date;

    if (this.period === 'hoy') {
      cutStart  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      prevStart = new Date(cutStart.getTime() - msDay);
      prevEnd   = cutStart;
    } else if (this.period === 'semana') {
      const day = now.getDay(); // 0=Sun
      cutStart  = new Date(now.getTime() - (day === 0 ? 6 : day - 1) * msDay);
      cutStart  = new Date(cutStart.getFullYear(), cutStart.getMonth(), cutStart.getDate());
      prevStart = new Date(cutStart.getTime() - 7 * msDay);
      prevEnd   = cutStart;
    } else {
      cutStart  = new Date(now.getFullYear(), now.getMonth(), 1);
      prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      prevEnd   = cutStart;
    }

    const current  = this.allSales.filter(s => new Date(s.fecha || '') >= cutStart);
    const previous = this.allSales.filter(s => {
      const d = new Date(s.fecha || '');
      return d >= prevStart && d < prevEnd;
    });

    return { current, previous };
  }

  /** Genera N puntos diarios para sparkline desde un array de ventas */
  private buildSparkline(sales: SaleModel[], mode: 'total' | 'count', days: number): number[] {
    const buckets = new Array(days).fill(0);
    const now     = Date.now();
    const msDay   = 86400000;

    sales.forEach(s => {
      const t = new Date(s.fecha || '').getTime();
      const daysAgo = Math.floor((now - t) / msDay);
      const idx     = days - 1 - daysAgo;
      if (idx >= 0 && idx < days) {
        buckets[idx] += mode === 'total' ? Number(s.total || 0) : 1;
      }
    });

    return buckets;
  }

  // ── SVG Sparkline path ───────────────────────────────────────────────────────
  sparkPath(data: number[], w = 72, h = 24): string {
    if (!data.length) return '';
    const max   = Math.max(...data, 1);
    const min   = Math.min(...data);
    const range = max - min || 1;
    const pts   = data.map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * (h * 0.82) - h * 0.09;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `M ${pts.join(' L ')}`;
  }

  // ── Animated Counters ────────────────────────────────────────────────────────
  private animarTodosLosContadores() {
    this.animateCounter(this.totalProductos,    v => { this.displayTotalProductos    = v; this.cd.detectChanges(); });
    this.animateCounter(this.totalStock,        v => { this.displayTotalStock        = v; this.cd.detectChanges(); });
    this.animateCounter(this.totalPedidos,      v => { this.displayTotalPedidos      = v; this.cd.detectChanges(); });
    this.animateCounter(this.totalIngresos,     v => { this.displayTotalIngresos     = v; this.cd.detectChanges(); }, 2);
    this.animateCounter(this.valorInventario,   v => { this.displayValorInventario   = v; this.cd.detectChanges(); }, 2);
    this.animateCounter(this.pedidosPendientes, v => { this.displayPedidosPendientes = v; this.cd.detectChanges(); });
    this.animateCounter(this.pedidosEntregados, v => { this.displayPedidosEntregados = v; this.cd.detectChanges(); });
  }

  private animateCounter(target: number, setter: (v: number) => void, decimals = 0, durationMs = 600) {
    const start  = performance.now();
    const factor = Math.pow(10, decimals);
    const frame  = (now: number) => {
      const progress = Math.min((now - start) / durationMs, 1);
      const eased    = 1 - Math.pow(1 - progress, 3);
      setter(Math.round(target * eased * factor) / factor);
      if (progress < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  // ── Severity helpers ─────────────────────────────────────────────────────────
  getStockSeverity(stock: number): 'success' | 'warn' | 'danger' {
    if (stock <= 3) return 'danger';
    if (stock <= 8) return 'warn';
    return 'success';
  }

  getSaleSeverity(status?: string): 'success' | 'warn' | 'danger' | 'info' | 'secondary' {
    switch ((status || 'pendiente').toLowerCase()) {
      case 'entregado':   return 'success';
      case 'en camino':   return 'warn';
      case 'cancelado':
      case 'reembolsado': return 'danger';
      case 'pagado':
      case 'preparando':  return 'info';
      default:            return 'secondary';
    }
  }

  // ── Chart builders ───────────────────────────────────────────────────────────
  private configurarCharts(products: ProductModel[], sales: SaleModel[]) {
    const sorted = [...products].sort((a, b) => Number(a.stock||0) - Number(b.stock||0)).slice(0, 8);

    this.chartDataStock = {
      labels: sorted.map(p => p.nombre),
      datasets: [{
        label: 'Stock crítico',
        data: sorted.map(p => Number(p.stock || 0)),
        backgroundColor: sorted.map(p =>
          Number(p.stock||0) <= 3 ? '#ef4444' :
          Number(p.stock||0) <= 6 ? '#f97316' : '#0ea5e9'
        ),
        borderRadius: 8,
        maxBarThickness: 32
      }]
    };

    const statusCount: Record<string, number> = {
      pendiente: 0, pagado: 0, preparando: 0,
      'en camino': 0, entregado: 0, cancelado: 0, reembolsado: 0
    };
    sales.forEach(s => {
      const st = (s.estado || 'pendiente').toLowerCase();
      statusCount[st in statusCount ? st : 'pendiente']++;
    });
    const active = Object.entries(statusCount).filter(([, v]) => v > 0);

    this.chartDataEstado = {
      labels: active.map(([k]) => k.toUpperCase()),
      datasets: [{ data: active.map(([, v]) => v),
        backgroundColor: ['#38bdf8','#818cf8','#f97316','#f59e0b','#22c55e','#ef4444','#a78bfa'].slice(0, active.length),
        borderWidth: 0 }]
    };

    const catCount: Record<string, number> = {};
    products.forEach(p => { const c = p.categoria || 'General'; catCount[c] = (catCount[c] || 0) + 1; });
    const cats = Object.keys(catCount).slice(0, 6);

    this.chartDataCategoria = {
      labels: cats,
      datasets: [{ data: cats.map(c => catCount[c]),
        backgroundColor: ['#6366f1','#ec4899','#8b5cf6','#14b8a6','#f97316','#64748b'],
        borderWidth: 0 }]
    };
  }

  private configurarOpciones() {
    const textColor   = getComputedStyle(document.documentElement).getPropertyValue('--app-text') || '#0f172a';
    const borderColor = getComputedStyle(document.documentElement).getPropertyValue('--app-border') || '#e2e8f0';
    const tooltip     = { backgroundColor: '#0f172a', titleColor: '#f8fafc', bodyColor: '#94a3b8', padding: 12, cornerRadius: 10, borderColor: '#1e293b', borderWidth: 1 };

    this.chartOptionsStock = {
      plugins: { legend: { display: false }, tooltip },
      scales: {
        y: { beginAtZero: true, ticks: { color: '#64748b', font: { size: 11 } }, grid: { color: borderColor } },
        x: { ticks: { color: '#64748b', font: { size: 11 } }, grid: { display: false } }
      }
    };
    this.chartOptionsEstado    = { plugins: { legend: { labels: { color: textColor, padding: 16 } }, tooltip } };
    this.chartOptionsCategoria = { plugins: { legend: { position: 'right', labels: { color: textColor, padding: 16 } }, tooltip } };
  }
}
