import { Component, OnInit, OnDestroy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { PaginatorModule } from 'primeng/paginator';
import { TooltipModule } from 'primeng/tooltip';

import { AuthService } from '../../../services/auth';
import { ProductsService } from '../../../services/products';
import { SalesService } from '../../../services/sales';
import { ProductModel } from '../../../core/models/product.model';
import { SaleModel } from '../../../core/models/sale.model';

type NotifType = 'ventas' | 'stock' | 'sistema';
type NotifFilter = 'todas' | 'no-leidas' | 'ventas' | 'stock' | 'sistema';

interface NotifItem {
  id: string;
  type: NotifType;
  title: string;
  description: string;
  read: boolean;
  createdAt: string;
  route: string;
}

@Component({
  selector: 'app-notificaciones',
  standalone: true,
  imports: [CommonModule, ButtonModule, TagModule, PaginatorModule, TooltipModule],
  templateUrl: './notificaciones.component.html',
  styleUrl: './notificaciones.component.scss'
})
export class NotificacionesPage implements OnInit, OnDestroy {
  private auth     = inject(AuthService);
  private products = inject(ProductsService);
  private sales    = inject(SalesService);
  private router   = inject(Router);
  private cdr      = inject(ChangeDetectorRef);

  notificaciones: NotifItem[] = [];
  filtro: NotifFilter = 'todas';
  loading = false;
  readonly itemsPorPagina = 10;
  paginaActual = 0;

  private sub = new Subscription();
  private readKey = '';

  readonly filtros: Array<{ label: string; value: NotifFilter; icon: string }> = [
    { label: 'Todas',      value: 'todas',      icon: 'pi pi-list' },
    { label: 'No leídas',  value: 'no-leidas',  icon: 'pi pi-circle-fill' },
    { label: 'Ventas',     value: 'ventas',      icon: 'pi pi-shopping-cart' },
    { label: 'Inventario', value: 'stock',       icon: 'pi pi-box' },
    { label: 'Sistema',    value: 'sistema',     icon: 'pi pi-cog' }
  ];

  ngOnInit() {
    const user = this.auth.currentUserValue;
    this.readKey = `nt_notifications_read_${user?.id || 'guest'}`;
    this.cargar();
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  cargar() {
    this.loading = true;
    this.sub.add(
      forkJoin({
        productos: this.products.getProducts().pipe(catchError(() => of([] as ProductModel[]))),
        ventas:    this.sales.getAdminSales().pipe(catchError(() => of([] as SaleModel[])))
      }).subscribe(({ productos, ventas }) => {
        const lista = this.buildNotificaciones(productos, ventas);
        this.applyReadState(lista);
        this.loading = false;
        this.cdr.markForCheck();
      })
    );
  }

  setFiltro(f: NotifFilter) {
    this.filtro = f;
    this.paginaActual = 0;
  }

  onPageChange(e: any) {
    this.paginaActual = e.page;
  }

  get listaFiltrada(): NotifItem[] {
    if (this.filtro === 'no-leidas') return this.notificaciones.filter(n => !n.read);
    if (this.filtro === 'todas')     return this.notificaciones;
    return this.notificaciones.filter(n => n.type === this.filtro);
  }

  get listaPaginada(): NotifItem[] {
    const start = this.paginaActual * this.itemsPorPagina;
    return this.listaFiltrada.slice(start, start + this.itemsPorPagina);
  }

  get totalNoLeidas(): number {
    return this.notificaciones.filter(n => !n.read).length;
  }

  marcarLeida(n: NotifItem, event?: Event) {
    event?.stopPropagation();
    n.read = true;
    this.saveReadState(n.id, true);
    this.cdr.markForCheck();
  }

  marcarTodasLeidas() {
    this.notificaciones.forEach(n => { n.read = true; this.saveReadState(n.id, true); });
    this.cdr.markForCheck();
  }

  irA(n: NotifItem) {
    if (!n.read) this.marcarLeida(n);
    this.router.navigateByUrl(n.route);
  }

  getTimeAgo(dateStr: string): string {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60)    return 'Ahora mismo';
    if (diff < 3600)  return `Hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
    return `Hace ${Math.floor(diff / 86400)} d`;
  }

  getSeverity(type: NotifType): 'success' | 'info' | 'warn' | 'danger' {
    switch (type) {
      case 'ventas':  return 'success';
      case 'stock':   return 'warn';
      case 'sistema': return 'info';
    }
  }

  getIconClass(type: NotifType): string {
    switch (type) {
      case 'ventas':  return 'pi pi-shopping-cart';
      case 'stock':   return 'pi pi-box';
      case 'sistema': return 'pi pi-cog';
    }
  }

  getIconBg(type: NotifType): string {
    switch (type) {
      case 'ventas':  return 'icon-bg-green';
      case 'stock':   return 'icon-bg-orange';
      case 'sistema': return 'icon-bg-blue';
    }
  }

  private buildNotificaciones(productos: ProductModel[], ventas: SaleModel[]): NotifItem[] {
    const lista: NotifItem[] = [];

    productos
      .filter(p => Number(p.stock || 0) <= 5)
      .slice(0, 10)
      .forEach(p => {
        lista.push({
          id: `stock-${p.id}`,
          type: 'stock',
          title: `Stock crítico: ${p.nombre}`,
          description: `"${p.nombre}" está en nivel crítico (${Number(p.stock || 0)} unid). Mínimo requerido: 5.`,
          read: false,
          createdAt: new Date().toISOString(),
          route: '/empresa/productos'
        });
      });

    ventas
      .filter(v => {
        const e = (v.estado || 'pendiente').toLowerCase();
        return e !== 'entregado' && e !== 'cancelado' && e !== 'reembolsado';
      })
      .slice(0, 15)
      .forEach(v => {
        lista.push({
          id: `venta-${v.id}`,
          type: 'ventas',
          title: `Pedido #${v.id} — ${(v.estado || 'Pendiente').toUpperCase()}`,
          description: `${v.nombre_cliente || v.nombre_usuario || 'Cliente'} · Total S/ ${v.total}`,
          read: false,
          createdAt: v.fecha || new Date().toISOString(),
          route: '/empresa/ventas'
        });
      });

    ventas
      .filter(v => {
        const e = (v.estado || '').toLowerCase();
        return e === 'cancelado' || e === 'reembolsado';
      })
      .slice(0, 15)
      .forEach(v => {
        const e = (v.estado || '').toLowerCase();
        lista.push({
          id: `venta-${v.id}`,
          type: 'ventas',
          title: `Pedido #${v.id} — ${e === 'cancelado' ? 'CANCELADO' : 'REEMBOLSADO'}`,
          description: `${v.nombre_cliente || v.nombre_usuario || 'Cliente'} · Total S/ ${v.total}`,
          read: false,
          createdAt: v.fecha || new Date().toISOString(),
          route: '/empresa/ventas'
        });
      });

    if (!lista.length) {
      lista.push({
        id: 'sistema-ok',
        type: 'sistema',
        title: 'Todo en orden',
        description: 'No hay alertas activas de ventas ni inventario en este momento.',
        read: false,
        createdAt: new Date().toISOString(),
        route: '/empresa/dashboard'
      });
    }

    return lista.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  private applyReadState(lista: NotifItem[]) {
    const state = this.getReadState();
    this.notificaciones = lista.map(n => ({ ...n, read: Boolean(state[n.id]) }));
  }

  private getReadState(): Record<string, boolean> {
    try { return JSON.parse(localStorage.getItem(this.readKey) || '{}'); } catch { return {}; }
  }

  private saveReadState(id: string, read: boolean) {
    const state = this.getReadState();
    state[id] = read;
    localStorage.setItem(this.readKey, JSON.stringify(state));
  }
}
