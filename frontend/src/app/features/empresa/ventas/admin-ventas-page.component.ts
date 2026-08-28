import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SalesService } from '../../../services/sales';
import { ProductsService } from '../../../services/products';
import { ProductModel } from '../../../core/models/product.model';

import { TableModule }        from 'primeng/table';
import { ButtonModule }       from 'primeng/button';
import { TagModule }          from 'primeng/tag';
import { SelectModule }       from 'primeng/select';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { ToastModule }        from 'primeng/toast';
import { DialogModule }       from 'primeng/dialog';
import { DrawerModule }       from 'primeng/drawer';
import { DatePickerModule }   from 'primeng/datepicker';
import { CheckboxModule }     from 'primeng/checkbox';
import { TooltipModule }      from 'primeng/tooltip';
import { MessageService }     from 'primeng/api';
import { catchError, finalize } from 'rxjs';
import { forkJoin, of } from 'rxjs';

interface FilterOption {
  id: number;
  code: string;
  label: string;
  icon: string;
}

interface OrderPaymentInfo {
  metodoKey: string;
  metodoLabel: string;
  montoPagado: number;
  vuelto: number | null;
  referencia: string | null;
  comentario: string | null;
}

@Component({
  selector: 'app-admin-ventas-page',
  standalone: true,
  imports: [
    CommonModule, TableModule, ButtonModule,
    TagModule, SelectModule, FormsModule, ToastModule,
    AutoCompleteModule, DialogModule, DrawerModule,
    DatePickerModule, CheckboxModule, TooltipModule
  ],
  templateUrl: './admin-ventas-page.component.html',
  styleUrl: './admin-ventas-page.component.scss'
})
export class AdminVentasPage implements OnInit {
  private salesService    = inject(SalesService);
  private productsService = inject(ProductsService);
  private messageService  = inject(MessageService);
  private cdr             = inject(ChangeDetectorRef);

  ventas:          any[] = [];
  ventasFiltradas: any[] = [];
  expandedSaleId:  number | null = null;
  loadingVentas:   boolean = false;
  updatingEstadoId: number | null = null;

  // ── Drawer (reemplaza dialog de detalle) ─────────────────────────────────────
  drawerVisible: boolean = false;
  ventaDrawer:   any | null = null;

  // ── Bulk Selection ────────────────────────────────────────────────────────────
  selectedVentas: any[] = [];
  showBulkDialog  = false;
  bulkEstado:     string = '';
  procesandoBulk  = false;

  // ── Date Range Filter ─────────────────────────────────────────────────────────
  fechaRango: Date[] | null = null; // [desde, hasta] del datepicker range

  // ── Autocomplete Filters ──────────────────────────────────────────────────────
  clientesDisponibles: FilterOption[] = [];
  productosDisponibles: FilterOption[] = [];
  clientesSugeridos:   FilterOption[] = [];
  productosSugeridos:  FilterOption[] = [];

  clienteSeleccionado:  FilterOption | null = null;
  productoSeleccionado: FilterOption | null = null;
  estadoFiltro:         string | null = null;

  confirmandoPagoId: number | null = null;

  readonly estados = [
    { label: 'PENDIENTE',   value: 'pendiente',   icon: 'pi pi-clock'         },
    { label: 'PAGADO',      value: 'pagado',       icon: 'pi pi-check-circle'  },
    { label: 'PREPARANDO',  value: 'preparando',   icon: 'pi pi-cog'           },
    { label: 'EN CAMINO',   value: 'en camino',    icon: 'pi pi-truck'         },
    { label: 'ENTREGADO',   value: 'entregado',    icon: 'pi pi-home'          },
    { label: 'CANCELADO',   value: 'cancelado',    icon: 'pi pi-times-circle'  },
    { label: 'REEMBOLSADO', value: 'reembolsado',  icon: 'pi pi-replay'        }
  ];

  readonly quickRanges = [
    { label: 'Hoy',    value: 'hoy'    },
    { label: '7 días', value: 'semana' },
    { label: 'Mes',    value: 'mes'    },
    { label: 'Todo',   value: 'todo'   }
  ];

  ngOnInit() { this.cargarVentas(); }

  // ── KPI Getters ───────────────────────────────────────────────────────────────
  get totalPedidosVista()    { return this.ventasFiltradas.length; }
  get totalMontoVista()      { return this.ventasFiltradas.reduce((a, v) => a + Number(v.total || 0), 0); }
  get ticketPromedioVista()  { return this.ventasFiltradas.length ? this.totalMontoVista / this.ventasFiltradas.length : 0; }
  get pedidosPendientesVista() { return this.ventasFiltradas.filter(v => (v.estado || 'pendiente') === 'pendiente').length; }
  get pedidosEntregadosVista() { return this.ventasFiltradas.filter(v => (v.estado || 'pendiente') === 'entregado').length; }
  get selectedCount() { return this.selectedVentas.length; }

  // ── Data Loading ───────────────────────────────────────────────────────────────
  cargarVentas() {
    if (this.loadingVentas) return;
    this.loadingVentas   = true;
    this.expandedSaleId  = null;
    this.selectedVentas  = [];

    forkJoin({
      sales:    this.salesService.getAdminSales().pipe(catchError(() => of([] as any[]))),
      products: this.productsService.getProducts().pipe(catchError(() => of([] as ProductModel[])))
    }).pipe(finalize(() => { this.loadingVentas = false; }))
      .subscribe({
        next: ({ sales, products }) => {
          const map = new Map<number, ProductModel>();
          products.forEach(p => map.set(Number(p.id), p));

          this.ventas = sales.map((v: any) => {
            v.productos = this.parseDetalle(v.detalle, map);
            v.estado    = v.estado ? v.estado.toLowerCase() : 'pendiente';
            v.pago      = this.parsePaymentInfo(v);
            return v;
          });

          this.prepararOpcionesBusqueda();
          this.aplicarFiltros();
          this.cdr.detectChanges();
        },
        error: err => console.error(err)
      });
  }

  // ── Quick date range shortcuts ────────────────────────────────────────────────
  setQuickRange(range: string) {
    const now  = new Date();
    const hoy  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (range === 'hoy') {
      this.fechaRango = [hoy, new Date(hoy.getTime() + 86399999)];
    } else if (range === 'semana') {
      this.fechaRango = [new Date(hoy.getTime() - 6 * 86400000), new Date(hoy.getTime() + 86399999)];
    } else if (range === 'mes') {
      this.fechaRango = [new Date(now.getFullYear(), now.getMonth(), 1), new Date(hoy.getTime() + 86399999)];
    } else {
      this.fechaRango = null;
    }
    this.aplicarFiltros();
  }

  // ── Filters ───────────────────────────────────────────────────────────────────
  aplicarFiltros() {
    let data = [...this.ventas];

    if (this.clienteSeleccionado) {
      data = data.filter(v => Number(v.id_usuario) === this.clienteSeleccionado?.id);
    }
    if (this.productoSeleccionado) {
      data = data.filter(v => v.productos.some((p: any) => Number(p.id) === this.productoSeleccionado?.id));
    }
    if (this.estadoFiltro) {
      data = data.filter(v => (v.estado || '').toLowerCase() === this.estadoFiltro);
    }
    if (this.fechaRango?.[0] && this.fechaRango?.[1]) {
      const desde = this.fechaRango[0].getTime();
      const hasta = this.fechaRango[1].getTime();
      data = data.filter(v => {
        const t = new Date(v.fecha || '').getTime();
        return t >= desde && t <= hasta;
      });
    }

    this.ventasFiltradas = data;
    this.selectedVentas  = []; // reset selection on filter change
  }

  limpiarFiltros() {
    this.clienteSeleccionado  = null;
    this.productoSeleccionado = null;
    this.estadoFiltro         = null;
    this.fechaRango           = null;
    this.aplicarFiltros();
  }

  // ── Expand row ────────────────────────────────────────────────────────────────
  toggleDetalle(venta: any, event?: Event) {
    event?.stopPropagation();
    const id = Number(venta?.id || 0);
    if (!id) return;
    this.expandedSaleId = this.expandedSaleId === id ? null : id;
  }

  isDetalleAbierto(venta: any) { return this.expandedSaleId === Number(venta?.id || 0); }

  // ── Drawer ────────────────────────────────────────────────────────────────────
  abrirDrawer(venta: any) {
    this.ventaDrawer   = venta;
    this.drawerVisible = true;
  }

  // ── Estado ────────────────────────────────────────────────────────────────────
  cambiarEstado(venta: any) {
    const id = venta.id;
    if (!id || !venta.estado) return;
    this.updatingEstadoId = id;
    this.salesService.updateSaleStatus(id, venta.estado)
      .pipe(finalize(() => { this.updatingEstadoId = null; }))
      .subscribe({
        next: () => {
          this.messageService.add({ severity: 'success', summary: 'Actualizado', detail: `Pedido #${id}: ${venta.estado.toUpperCase()}` });
          this.aplicarFiltros();
        },
        error: () => {
          this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo actualizar el estado.' });
        }
      });
  }

  // ── Bulk actions ─────────────────────────────────────────────────────────────
  abrirBulkDialog() {
    if (!this.selectedVentas.length) return;
    this.bulkEstado   = '';
    this.showBulkDialog = true;
  }

  async aplicarBulkEstado() {
    if (!this.bulkEstado || !this.selectedVentas.length) return;
    this.procesandoBulk = true;

    const ids = this.selectedVentas.map(v => Number(v.id));
    let ok = 0;
    let fail = 0;

    // Sequential to avoid overloading the API
    for (const id of ids) {
      try {
        await this.salesService.updateSaleStatus(id, this.bulkEstado).toPromise();
        const venta = this.ventas.find(v => Number(v.id) === id);
        if (venta) venta.estado = this.bulkEstado;
        ok++;
      } catch {
        fail++;
      }
    }

    this.procesandoBulk  = false;
    this.showBulkDialog  = false;
    this.selectedVentas  = [];

    this.messageService.add({
      severity: fail === 0 ? 'success' : 'warn',
      summary:  `${ok} actualizado${ok > 1 ? 's' : ''}`,
      detail:   fail > 0 ? `${fail} no se pudo${fail > 1 ? 'ieron' : ''} actualizar.` : `Estado → ${this.bulkEstado.toUpperCase()}`
    });
    this.aplicarFiltros();
    this.cdr.detectChanges();
  }

  // ── Export CSV ────────────────────────────────────────────────────────────────
  exportarCSV(soloSeleccionados = false) {
    const fuente = soloSeleccionados && this.selectedVentas.length
      ? this.selectedVentas
      : this.ventasFiltradas;

    const headers = ['ID', 'Cliente', 'Fecha', 'Estado', 'Método', 'Ref. Pago', 'Total (S/)'];
    const rows = fuente.map(v => [
      v.id,
      (v.nombre_cliente || `Usuario ${v.id_usuario}`).replace(/"/g, '""'),
      v.fecha ? new Date(v.fecha).toLocaleDateString('es-PE') : '',
      v.estado || 'pendiente',
      v.pago?.metodoLabel || 'N/E',
      (v.pago?.referencia || '').replace(/"/g, '""'),
      Number(v.total || 0).toFixed(2)
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(c => `"${c}"`).join(','))
      .join('\r\n');

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `ventas-novatech-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.messageService.add({
      severity: 'success',
      summary:  'CSV exportado',
      detail:   `${fuente.length} registro${fuente.length > 1 ? 's' : ''} descargado${fuente.length > 1 ? 's' : ''}.`
    });
  }

  // ── Confirm payment ────────────────────────────────────────────────────────────
  confirmarPago(venta: any) {
    const id = Number(venta?.id || 0);
    if (!id || this.confirmandoPagoId) return;
    this.confirmandoPagoId = id;
    this.salesService.confirmarPago(id)
      .pipe(finalize(() => { this.confirmandoPagoId = null; }))
      .subscribe({
        next: () => {
          venta.pago_pendiente = false;
          this.messageService.add({ severity: 'success', summary: 'Pago confirmado', detail: `Pedido #${id} validado.` });
          this.cargarVentas();
        },
        error: err => {
          this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'No se pudo confirmar.' });
        }
      });
  }

  pagoPendiente(venta: any): boolean {
    return String(venta?.pago_estado || '').toLowerCase() === 'pendiente';
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  esEstadoTerminal(estado: string) { return estado === 'cancelado' || estado === 'reembolsado'; }

  getSeverity(estado: string): 'success' | 'secondary' | 'info' | 'warn' | 'danger' | 'contrast' | undefined {
    switch (estado) {
      case 'entregado': return 'success';
      case 'en camino': return 'warn';
      case 'cancelado': return 'danger';
      default:          return 'info';
    }
  }

  getEstadoIcon(estado?: string | null) {
    return this.estados.find(e => e.value === (estado || '').toLowerCase())?.icon || 'pi pi-info-circle';
  }

  buscarClientes(event: { query: string }) {
    const q = (event.query || '').toLowerCase().trim();
    this.clientesSugeridos = q
      ? this.clientesDisponibles.filter(i => i.label.toLowerCase().includes(q) || i.code.toLowerCase().includes(q))
      : [...this.clientesDisponibles];
  }

  buscarProductos(event: { query: string }) {
    const q = (event.query || '').toLowerCase().trim();
    this.productosSugeridos = q
      ? this.productosDisponibles.filter(i => i.label.toLowerCase().includes(q) || i.code.toLowerCase().includes(q))
      : [...this.productosDisponibles];
  }

  // ── Private helpers ───────────────────────────────────────────────────────────
  private prepararOpcionesBusqueda() {
    const clientMap  = new Map<number, FilterOption>();
    const productMap = new Map<number, FilterOption>();

    this.ventas.forEach(v => {
      const cid = Number(v.id_usuario);
      if (!clientMap.has(cid)) clientMap.set(cid, { id: cid, code: `CLI-${String(cid).padStart(4,'0')}`, label: v.nombre_cliente || `Cliente ${cid}`, icon: 'pi pi-user' });

      v.productos.forEach((p: any, idx: number) => {
        const pid = Number(p.id || idx + 1);
        if (!productMap.has(pid)) productMap.set(pid, { id: pid, code: `PRD-${String(pid).padStart(4,'0')}`, label: p.nombre || `Producto ${pid}`, icon: 'pi pi-box' });
      });
    });

    this.clientesDisponibles  = Array.from(clientMap.values());
    this.productosDisponibles = Array.from(productMap.values());
    this.clientesSugeridos    = [...this.clientesDisponibles];
    this.productosSugeridos   = [...this.productosDisponibles];
  }

  private parseDetalle(raw: unknown, map: Map<number, ProductModel>): any[] {
    const hydrate = (items: any[]) => items.map(item => {
      const pid    = Number(item?.id || item?.producto_id || 0);
      const prod   = map.get(pid);
      const cant   = Number(item?.cantidad || 1);
      const precio = Number(item?.precio || prod?.precio || 0);
      return { id: pid, cantidad: cant, nombre: item?.nombre || prod?.nombre || `Producto #${pid}`,
               precio, imagen: item?.imagen || prod?.imagen || 'https://placehold.co/42x42?text=NT',
               subtotal: Number((precio * cant).toFixed(2)) };
    });

    if (Array.isArray(raw)) return hydrate(raw);
    if (typeof raw === 'string') {
      try { const p = JSON.parse(raw); return Array.isArray(p) ? hydrate(p) : []; }
      catch { return []; }
    }
    return [];
  }

  private parsePaymentInfo(v: any): OrderPaymentInfo {
    const obs = this.parseJsonLike(v?.observaciones);
    const key = String(obs?.['metodo_key'] || '').toLowerCase().trim() || this.resolveKey(v?.metodo_pago_nombre);
    const monto = Number(v?.monto_pagado || obs?.['monto_pagado'] || v?.total || 0);
    const vueltoRaw = Number(obs?.['vuelto']);
    return {
      metodoKey:   key,
      metodoLabel: String(obs?.['metodo_label'] || this.resolveLabel(key, v?.metodo_pago_nombre)),
      montoPagado: Number(Number.isFinite(monto) ? monto.toFixed(2) : Number(v?.total || 0).toFixed(2)),
      vuelto:      Number.isFinite(vueltoRaw) && vueltoRaw > 0 ? Number(vueltoRaw.toFixed(2)) : null,
      referencia:  String(v?.referencia_pago || obs?.['referencia_pago'] || '').trim() || null,
      comentario:  String(obs?.['comentario_pago'] || '').trim() || null
    };
  }

  private parseJsonLike(val: unknown): Record<string, unknown> | null {
    if (!val) return null;
    if (typeof val === 'object') return val as Record<string, unknown>;
    if (typeof val === 'string') {
      try { const p = JSON.parse(val); return p && typeof p === 'object' ? p as Record<string, unknown> : null; }
      catch { return null; }
    }
    return null;
  }

  private resolveKey(name: unknown) {
    const n = String(name || '').toLowerCase();
    if (n.includes('tarjeta'))                                        return 'tarjeta';
    if (n.includes('yape') || n.includes('plin') || n.includes('billetera')) return 'billetera';
    if (n.includes('efectivo') || n.includes('contra'))              return 'efectivo';
    return 'no-definido';
  }

  private resolveLabel(key: string, fallback: unknown) {
    if (key === 'tarjeta')   return 'Tarjeta';
    if (key === 'billetera') return 'Yape / Plin';
    if (key === 'efectivo')  return 'Efectivo';
    return String(fallback || '').trim() || 'No especificado';
  }
}
