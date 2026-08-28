import { Component, inject, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule }     from '@angular/common';
import { RouterModule }     from '@angular/router';
import { Subscription }     from 'rxjs';

import { ProductsService }    from '../services/products';
import { Cart }               from '../services/cart';
import { AuthService }        from '../services/auth';
import { PreferencesService } from '../services/preferences';
import { MessageService }     from 'primeng/api';
import { precioFinal, porcentajeDescuento, cuotaReferencial } from '../core/models/product.model';

import { ButtonModule }   from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { TooltipModule }  from 'primeng/tooltip';

@Component({
  selector: 'app-favoritos',
  standalone: true,
  imports: [CommonModule, RouterModule, ButtonModule, SkeletonModule, TooltipModule],
  templateUrl: './favoritos.html',
  styleUrl:    './favoritos.scss'
})
export class FavoritosPage implements OnInit, OnDestroy {
  private ps       = inject(ProductsService);
  private cart     = inject(Cart);
  private auth     = inject(AuthService);
  private prefs    = inject(PreferencesService);
  private msg      = inject(MessageService);
  private cd       = inject(ChangeDetectorRef);
  private authSub  = new Subscription();

  loading   = true;
  productos: any[] = [];
  favIds:   number[] = [];

  filtroActivo: 'todos' | 'disponible' | 'oferta' = 'todos';
  ordenActivo:  'reciente' | 'precio-asc' | 'precio-desc' = 'reciente';

  getPrecioFinal = precioFinal;
  getDescuento   = porcentajeDescuento;

  get productosFiltrados(): any[] {
    let lista = [...this.productos];
    if (this.filtroActivo === 'disponible') lista = lista.filter(p => +p.stock > 0);
    if (this.filtroActivo === 'oferta')     lista = lista.filter(p => this.getDescuento(p) > 0);
    if (this.ordenActivo === 'precio-asc')  lista.sort((a, b) => precioFinal(a) - precioFinal(b));
    if (this.ordenActivo === 'precio-desc') lista.sort((a, b) => precioFinal(b) - precioFinal(a));
    return lista;
  }

  setFiltro(f: typeof this.filtroActivo) { this.filtroActivo = f; }
  setOrden(o: typeof this.ordenActivo)   { this.ordenActivo = o; }

  ngOnInit() {
    this.favIds = this.loadFavIds();
    this.cargarProductosFavoritos();

    this.authSub = this.auth.currentUser$.subscribe(user => {
      if (user) {
        this.prefs.getMyPreferences().subscribe({
          next: d => {
            if (Array.isArray(d?.favoritos)) {
              this.favIds = d.favoritos;
              this.saveFavIds(this.favIds);
              this.cargarProductosFavoritos();
            }
          },
          error: () => {}
        });
      }
    });
  }

  ngOnDestroy() { this.authSub.unsubscribe(); }

  cargarProductosFavoritos() {
    if (!this.favIds.length) {
      this.loading   = false;
      this.productos = [];
      this.cd.detectChanges();
      return;
    }

    this.loading = true;
    this.ps.getProducts().subscribe({
      next: (all) => {
        const products = Array.isArray(all) ? all : (all as any).data || [];
        this.productos = products.filter((p: any) => this.favIds.includes(Number(p.id)));
        this.loading   = false;
        this.cd.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.cd.detectChanges();
      }
    });
  }

  quitarFavorito(productId: number) {
    this.favIds  = this.favIds.filter(id => id !== productId);
    this.productos = this.productos.filter((p: any) => Number(p.id) !== productId);
    this.saveFavIds(this.favIds);
    this.msg.add({ severity: 'info', summary: 'Quitado', detail: 'Producto removido de favoritos.' });

    if (this.auth.isAuthenticated) {
      this.prefs.saveFavoritos(this.favIds).subscribe({ error: () => {} });
    }
    this.cd.detectChanges();
  }

  agregarAlCarrito(product: any) {
    const result = this.cart.addToCart(product, 1);
    if (result.success) {
      this.msg.add({ severity: 'success', summary: 'Agregado', detail: `${product.nombre} fue al carrito.` });
    } else {
      this.msg.add({ severity: 'warn', summary: 'Stock', detail: result.message });
    }
  }

  compartir(product: any) {
    const url = `${window.location.origin}/producto/${product.id}`;
    navigator.clipboard.writeText(url).then(
      ()  => this.msg.add({ severity: 'success', summary: 'Enlace copiado', detail: 'Comparte este producto.' }),
      ()  => this.msg.add({ severity: 'warn', summary: 'No disponible', detail: 'Copia el enlace manualmente.' })
    );
  }

  get hayOfertas(): boolean {
    return this.productos.some(p => this.getDescuento(p) > 0);
  }

  private loadFavIds(): number[] {
    try {
      const raw = localStorage.getItem('nt_favoritos_productos');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map(Number).filter(Boolean) : [];
    } catch { return []; }
  }

  private saveFavIds(ids: number[]) {
    localStorage.setItem('nt_favoritos_productos', JSON.stringify(ids));
  }
}
