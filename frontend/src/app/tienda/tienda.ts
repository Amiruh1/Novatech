import { Component, inject, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { ProductsService, SubcategoryItem } from '../services/products';
import { Cart } from '../services/cart';
import { AuthService } from '../services/auth';
import { PreferencesService } from '../services/preferences';
import { MessageService } from 'primeng/api';
import { Subject, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import { ProductModel, precioFinal, porcentajeDescuento, cuotaReferencial, tieneOferta } from '../core/models/product.model';
import { BannersService, BannerModel } from '../services/banners';
import { CategoriasService, CategoriaModel } from '../services/categorias';

import { ButtonModule } from 'primeng/button';
import { DataViewModule } from 'primeng/dataview';
import { PaginatorModule } from 'primeng/paginator';
import { TagModule } from 'primeng/tag';
import { InputTextModule } from 'primeng/inputtext';
import { DialogModule } from 'primeng/dialog';
import { SkeletonModule } from 'primeng/skeleton';
import { SliderModule } from 'primeng/slider';

@Component({
  selector: 'app-tienda',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    DataViewModule,
    PaginatorModule,
    TagModule,
    InputTextModule,
    DialogModule,
    RouterModule,
    SkeletonModule,
    SliderModule
  ],
  templateUrl: './tienda.html',
  styleUrl: './tienda.scss'
})
export class Tienda implements OnInit, OnDestroy {
  allProducts: any[] = [];
  visibleProducts: any[] = [];
  categorias: string[] = [];
  marcas: string[] = [];
  categoriaActual: string = 'Todas';
  marcaActual: string = 'Todas';
  todasSubcategorias: SubcategoryItem[] = [];
  subcategoriasActuales: SubcategoryItem[] = [];
  subcategoriaActual: string = '';
  ordenActual: 'relevancia' | 'precio_desc' | 'precio_asc' = 'relevancia';
  busquedaTexto: string = '';
  busquedaAplicada: string = '';
  private searchSubject = new Subject<string>();
  private authSub = new Subscription();
  
  soloDisponibles: boolean = false;
  envioRapido: boolean = false;
  sugerencias: string[] = [];
  mostrarSugerencias: boolean = false;
  favoritos: number[] = [];
  vistosRecientes: any[] = [];
  comparadorVisible: boolean = false;
  comparados: any[] = [];
  mostrarOrdenDropdown: boolean = false;

  // Add-to-cart feedback animation state
  addedIds = new Set<number>();

  readonly opcionesOrden: Array<{ label: string; value: 'relevancia' | 'precio_desc' | 'precio_asc'; icon: string }> = [
    { label: 'Más relevantes',      value: 'relevancia',   icon: 'pi pi-star' },
    { label: 'Precio mayor a menor', value: 'precio_desc', icon: 'pi pi-arrow-down' },
    { label: 'Precio menor a mayor', value: 'precio_asc',  icon: 'pi pi-arrow-up' },
  ];
  
  currentPage: number = 1;
  limit: number = 12;
  totalRegistros: number = 0;
  loading: boolean = true;

  precioRango: number[] = [0, 10000];
  precioMin: number = 0;
  precioMax: number = 10000;

  getPrecioFinal = precioFinal;
  getPorcentajeDescuento = porcentajeDescuento;
  getCuotaReferencial = cuotaReferencial;
  getHayOferta = tieneOferta;

  heroBanners: BannerModel[] = [];
  activeBannerIndex: number = 0;
  private bannerInterval: any;

  categoriasData: CategoriaModel[] = [];

  private productsService = inject(ProductsService);
  private cart = inject(Cart);
  private auth = inject(AuthService);
  private preferencesService = inject(PreferencesService);
  private cd = inject(ChangeDetectorRef);
  private route = inject(ActivatedRoute);
  private messageService = inject(MessageService);
  private bannersService = inject(BannersService);
  private categoriasSrv = inject(CategoriasService);
  private categoriaQuery: string = 'Todas';

  getCategoryImageUrl(categoria: string): string {
    const found = this.categoriasData.find(c => c.nombre === categoria);
    if (found && found.imagen) return found.imagen;
    return `https://picsum.photos/seed/${categoria}/200/200`;
  }

  ngOnInit() {
    this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged()
    ).subscribe(searchTerm => {
      this.aplicarBusqueda();
    });

    this.route.queryParamMap.subscribe(params => {
      const categoria = (params.get('categoria') || 'Todas').trim();
      this.categoriaQuery = categoria || 'Todas';

      if (this.allProducts.length) {
        this.aplicarCategoriaDesdeQuery();
      }
    });

    this.cargarProductos();
    this.cargarBanners();

    this.authSub = this.auth.currentUser$.subscribe(user => {
      if (!user) {
        this.favoritos = [];
        this.comparados = [];
      }
      this.vistosRecientes = this.loadRecentProducts();
      this.cd.detectChanges();
    });
  }

  get totalProductosDisponibles() {
    return this.visibleProducts.filter(product => Number(product.stock || 0) > 0).length;
  }

  get totalAgotados() {
    return this.visibleProducts.filter(product => Number(product.stock || 0) === 0).length;
  }

  get categoriasActivas() {
    return this.categorias.length;
  }

  get mostrarVistosRecientes() {
    return this.auth.isAuthenticated && this.vistosRecientes.length > 0;
  }

  get marcasActivas() {
    return this.marcas.length;
  }

  get puedeComparar() {
    return this.comparados.length >= 2;
  }

  get precioMinComparador() {
    if (!this.comparados.length) {
      return 0;
    }

    return Math.min(...this.comparados.map(product => Number(product?.precio || 0)).filter(price => price > 0));
  }

  get stockMaxComparador() {
    if (!this.comparados.length) {
      return 0;
    }

    return Math.max(...this.comparados.map(product => Number(product?.stock || 0)));
  }

  get filtrosActivos() {
    return this.categoriaActual !== 'Todas'
      || this.marcaActual !== 'Todas'
      || this.busquedaAplicada.length > 0
      || this.ordenActual !== 'relevancia'
      || this.soloDisponibles
      || this.envioRapido;
  }

  get ordenLabel() {
    switch (this.ordenActual) {
      case 'precio_desc':
        return 'Precio mayor a menor';
      case 'precio_asc':
        return 'Precio menor a mayor';
      default:
        return 'Mas relevantes';
    }
  }

  ngOnDestroy() {
    this.searchSubject.complete();
    this.authSub.unsubscribe();
    if (this.bannerInterval) {
      clearInterval(this.bannerInterval);
    }
  }

  cargarBanners() {
    this.bannersService.getBanners(true).subscribe({
      next: (data) => {
        if (data && data.length > 0) {
          this.heroBanners = data;
          this.iniciarCarrusel();
          this.cd.detectChanges();
        }
      }
    });
  }

  iniciarCarrusel() {
    if (this.bannerInterval) clearInterval(this.bannerInterval);
    if (this.heroBanners.length <= 1) return;

    this.bannerInterval = setInterval(() => {
      this.siguienteBanner();
    }, 10000);
  }

  siguienteBanner() {
    this.activeBannerIndex = (this.activeBannerIndex + 1) % this.heroBanners.length;
    this.cd.detectChanges();
  }

  siguienteBannerManual() {
    this.siguienteBanner();
    this.iniciarCarrusel();
  }

  bannerAnteriorManual() {
    this.activeBannerIndex = (this.activeBannerIndex - 1 + this.heroBanners.length) % this.heroBanners.length;
    this.cd.detectChanges();
    this.iniciarCarrusel();
  }

  setBanner(index: number) {
    this.activeBannerIndex = index;
    this.iniciarCarrusel();
    this.cd.detectChanges();
  }

  navegarABanner(link?: string) {
    if (!link) return;
    if (link.includes('categoria=')) {
      const parts = link.split('categoria=');
      if (parts.length > 1) {
        this.filtrarPorCategoria(parts[1].trim());
        window.scrollTo({ top: 300, behavior: 'smooth' });
        return;
      }
    }
    window.location.href = link;
  }

  cargarProductos() {
    this.productsService.getProducts().subscribe({
      next: (data) => {
        this.allProducts = data;

        this.categoriasSrv.getCategorias().subscribe(cats => {
            this.categoriasData = cats.filter(c => c.activo == 1 || c.activo == true);
            this.categorias = this.categoriasData.map(c => c.nombre);
            this.cd.detectChanges();
        });

        this.productsService.getSubcategories().subscribe(subs => {
            this.todasSubcategorias = subs;
            this.cd.detectChanges();
        });

        const marcasSet = new Set(data.map((p: any) => p.marca));
        this.marcas = Array.from(marcasSet as Set<string>);
        this.favoritos = this.loadFavoritos();
        this.comparados = this.mapProductsByIds(this.loadComparadorIds());
        this.vistosRecientes = this.loadRecentProducts();

        if (this.auth.isAuthenticated) {
          this.syncPreferencesFromApi();
        }

        this.aplicarCategoriaDesdeQuery();
        this.aplicarFiltrosYOrden();
        
        this.cd.detectChanges();
      },
      error: (err) => {
          console.error(err);
          this.cd.detectChanges();
      }
    });
  }

  filtrarPorCategoria(categoria: string) {
    this.categoriaActual = categoria;
    this.subcategoriaActual = '';
    this.subcategoriasActuales = categoria === 'Todas'
      ? []
      : this.todasSubcategorias.filter(s => s.categoria_nombre === categoria);
    this.currentPage = 1;
    this.aplicarFiltrosYOrden();
  }

  filtrarPorSubcategoria(nombre: string) {
    this.subcategoriaActual = nombre;
    this.currentPage = 1;
    this.aplicarFiltrosYOrden();
  }

  filtrarPorMarca(marca: string) {
    this.marcaActual = marca;
    this.currentPage = 1;
    this.aplicarFiltrosYOrden();
  }

  onSearchChange(text: string) {
    this.computeSugerencias(text);
    this.searchSubject.next(text);
  }

  aplicarBusqueda() {
    this.busquedaAplicada = (this.busquedaTexto || '').trim();
    this.mostrarSugerencias = false;
    this.sugerencias = [];
    this.currentPage = 1;
    this.aplicarFiltrosYOrden();
  }

  limpiarBusqueda() {
    this.busquedaTexto = '';
    this.busquedaAplicada = '';
    this.sugerencias = [];
    this.mostrarSugerencias = false;
    this.aplicarFiltrosYOrden();
  }

  seleccionarSugerencia(texto: string) {
    this.busquedaTexto     = texto;
    this.busquedaAplicada  = texto;
    this.sugerencias       = [];
    this.mostrarSugerencias = false;
    this.currentPage = 1;
    this.aplicarFiltrosYOrden();
  }

  ocultarSugerencias() {
    setTimeout(() => {
      this.mostrarSugerencias = false;
      this.cd.detectChanges();
    }, 180);
  }

  computeSugerencias(texto: string) {
    const q = (texto || '').trim().toLowerCase();
    if (q.length < 2) {
      this.sugerencias = [];
      this.mostrarSugerencias = false;
      return;
    }
    const seen = new Set<string>();
    const result: string[] = [];
    for (const p of this.allProducts) {
      for (const field of [p.nombre, p.marca, p.sku]) {
        const val = String(field || '');
        if (val.toLowerCase().includes(q) && !seen.has(val)) {
          seen.add(val);
          result.push(val);
          if (result.length >= 6) break;
        }
      }
      if (result.length >= 6) break;
    }
    this.sugerencias = result;
    this.mostrarSugerencias = result.length > 0;
  }

  limpiarTodo() {
    this.categoriaActual = 'Todas';
    this.subcategoriaActual = '';
    this.subcategoriasActuales = [];
    this.marcaActual = 'Todas';
    this.ordenActual = 'relevancia';
    this.busquedaTexto = '';
    this.busquedaAplicada = '';
    this.soloDisponibles = false;
    this.envioRapido = false;
    this.currentPage = 1;
    this.aplicarFiltrosYOrden();
  }

  toggleSoloDisponibles() {
    this.soloDisponibles = !this.soloDisponibles;
    this.aplicarFiltrosYOrden();
  }

  toggleEnvioRapido() {
    this.envioRapido = !this.envioRapido;
    this.aplicarFiltrosYOrden();
  }

  toggleFavorito(productId: number) {
    const id = Number(productId || 0);
    if (!id) {
      return;
    }

    if (this.favoritos.includes(id)) {
      this.favoritos = this.favoritos.filter(item => item !== id);
    } else {
      this.favoritos = [id, ...this.favoritos];
    }

    this.persistFavoritos();
  }

  estaComparado(productId: number) {
    const id = Number(productId || 0);
    return this.comparados.some(item => Number(item?.id) === id);
  }

  toggleComparar(product: any) {
    const id = Number(product?.id || 0);
    if (!id) {
      return;
    }

    if (this.estaComparado(id)) {
      this.comparados = this.comparados.filter(item => Number(item.id) !== id);
      this.persistComparador();
      return;
    }

    if (this.comparados.length >= 3) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Comparador',
        detail: 'Solo puedes comparar hasta 3 productos a la vez.'
      });
      return;
    }

    this.comparados = [...this.comparados, product];
    this.persistComparador();
  }

  limpiarComparador() {
    this.comparados = [];
    this.comparadorVisible = false;
    this.persistComparador();
  }

  abrirComparador() {
    if (this.comparados.length < 2) {
      this.messageService.add({
        severity: 'info',
        summary: 'Comparador',
        detail: 'Selecciona al menos 2 productos para comparar.'
      });
      return;
    }

    this.comparadorVisible = true;
  }

  esFavorito(productId: number) {
    return this.favoritos.includes(Number(productId || 0));
  }

  precioLista(product: ProductModel) {
    return product.precio;
  }

  descuentoAproximado(product: ProductModel) {
    return porcentajeDescuento(product);
  }

  cuotaRef(product: ProductModel) {
    return cuotaReferencial(product);
  }

  getStockPercent(product: any) {
    const stock = Number(product?.stock || 0);
    const cap = 30;
    return Math.max(0, Math.min(100, Math.round((stock / cap) * 100)));
  }

  getRetailBadge(product: any) {
    const stock = Number(product?.stock || 0);
    if (stock === 0) {
      return 'Agotado';
    }

    if (stock <= 3) {
      return 'Ultimas unidades';
    }

    if (this.descuentoAproximado(product) >= 15) {
      return 'Oferta flash';
    }

    return 'Envio gratis';
  }

  getRetailBadgeClass(product: any) {
    const stock = Number(product?.stock || 0);
    if (stock === 0) {
      return 'danger';
    }

    if (stock <= 3) {
      return 'warning';
    }

    if (this.descuentoAproximado(product) >= 15) {
      return 'promo';
    }

    return 'success';
  }

  isBestPrice(product: any) {
    const price = Number(product?.precio || 0);
    return this.precioMinComparador > 0 && price === this.precioMinComparador;
  }

  isBestStock(product: any) {
    const stock = Number(product?.stock || 0);
    return stock === this.stockMaxComparador && stock > 0;
  }

  diferenciaVsMejorPrecio(product: any) {
    if (!this.precioMinComparador) {
      return 0;
    }

    const price = Number(product?.precio || 0);
    return Number((price - this.precioMinComparador).toFixed(2));
  }

  alternarOrden() {
    this.mostrarOrdenDropdown = !this.mostrarOrdenDropdown;
  }

  seleccionarOrden(orden: 'relevancia' | 'precio_desc' | 'precio_asc') {
    this.ordenActual = orden;
    this.mostrarOrdenDropdown = false;
    this.aplicarFiltrosYOrden();
  }

  cerrarOrdenDropdown() {
    this.mostrarOrdenDropdown = false;
  }

  onPageChange(event: any) {
    this.currentPage = (event.page || 0) + 1;
    this.limit = event.rows || 12;
    this.aplicarFiltrosYOrden();
  }

  agregarAlCarrito(producto: ProductModel) {
    const result = this.cart.addToCart(producto);
    if (result.success) {
      // Feedback visual: checkmark durante 700ms
      this.addedIds.add(Number(producto.id));
      setTimeout(() => {
        this.addedIds.delete(Number(producto.id));
        this.cd.detectChanges();
      }, 700);
    }
    this.messageService.add({
      severity: result.success ? 'success' : 'warn',
      summary: result.success ? 'Agregado' : 'Stock',
      detail: result.success ? `${producto.nombre} añadido al carrito` : result.message,
      life: 2000
    });
  }

  isJustAdded(productId: any): boolean {
    return this.addedIds.has(Number(productId));
  }

  aplicarPrecioRango() {
    const [min, max] = this.precioRango;
    if (min > max) {
      this.messageService.add({ severity: 'warn', summary: 'Rango inválido', detail: 'El precio mínimo no puede ser mayor al precio máximo.', life: 3000 });
      return;
    }
    this.precioMin = min;
    this.precioMax = max;
    this.currentPage = 1;
    this.aplicarFiltrosYOrden();
  }

  private aplicarFiltrosYOrden() {
    this.loading = true;
    this.productsService.searchProducts({
      query: this.busquedaAplicada,
      categoria: this.categoriaActual,
      subcategoria: this.subcategoriaActual || undefined,
      marca: this.marcaActual,
      soloDisponibles: this.soloDisponibles,
      precioMin: this.precioMin > 0 ? this.precioMin : undefined,
      precioMax: this.precioMax < 10000 ? this.precioMax : undefined,
      orden: this.ordenActual,
      page: this.currentPage,
      limit: this.limit
    }).subscribe({
      next: (res) => {
        let data = res.data;
        if (this.envioRapido) {
           data = data.filter(product => Number(product.stock || 0) >= 3);
        }
        
        this.visibleProducts = data;
        this.totalRegistros = res.total;
        this.loading = false;
        this.cd.detectChanges();
      },
      error: (err) => {
        console.error(err);
        this.loading = false;
        this.cd.detectChanges();
      }
    });
  }

  private aplicarCategoriaDesdeQuery() {
    if (this.categoriaQuery === 'Todas') {
      this.categoriaActual = 'Todas';
      return;
    }

    this.categoriaActual = this.categorias.includes(this.categoriaQuery)
      ? this.categoriaQuery
      : 'Todas';
  }

  private loadFavoritos(): number[] {
    try {
      const raw = localStorage.getItem('nt_favoritos_productos');
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(item => Number(item || 0)).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  private getRecentKey(): string {
    const userId = this.auth.currentUserValue?.id || 'guest';
    return `nt_recent_products_${userId}`;
  }

  private loadRecentProducts(): any[] {
    try {
      const raw = localStorage.getItem(this.getRecentKey());
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      const valid = parsed
        .map((item: any) => ({
          id: Number(item?.id || 0),
          nombre: item?.nombre || '',
          precio: Number(item?.precio || 0),
          imagen: item?.imagen || '',
          categoria: item?.categoria || '',
          stock: Number(item?.stock || 0)
        }))
        .filter((item: any) => item.id > 0);

      return valid.slice(0, 6);
    } catch {
      return [];
    }
  }

  private loadComparadorIds(): number[] {
    try {
      const raw = localStorage.getItem('nt_compare_products');
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .map((item: any) => Number(item || 0))
        .filter((id: number) => Number.isInteger(id) && id > 0)
        .slice(0, 3);
    } catch {
      return [];
    }
  }

  private mapProductsByIds(ids: number[]): any[] {
    if (!ids.length) {
      return [];
    }

    const map = new Map(this.allProducts.map((product: any) => [Number(product.id), product]));
    return ids.map((id) => map.get(Number(id))).filter(Boolean);
  }

  private persistFavoritos() {
    localStorage.setItem('nt_favoritos_productos', JSON.stringify(this.favoritos));

    if (!this.auth.isAuthenticated) {
      return;
    }

    this.preferencesService.saveFavoritos(this.favoritos).subscribe({
      next: (data) => {
        this.favoritos = Array.isArray(data?.favoritos) ? data.favoritos : this.favoritos;
        localStorage.setItem('nt_favoritos_productos', JSON.stringify(this.favoritos));
      },
      error: () => {}
    });
  }

  private persistComparador() {
    const ids = this.comparados.map((item: any) => Number(item?.id || 0)).filter(Boolean).slice(0, 3);
    localStorage.setItem('nt_compare_products', JSON.stringify(ids));

    if (!this.auth.isAuthenticated) {
      return;
    }

    this.preferencesService.saveComparador(ids).subscribe({
      next: (data) => {
        const compareIds = Array.isArray(data?.comparador) ? data.comparador : ids;
        this.comparados = this.mapProductsByIds(compareIds);
        localStorage.setItem('nt_compare_products', JSON.stringify(compareIds));
      },
      error: () => {}
    });
  }

  private syncPreferencesFromApi() {
    this.preferencesService.getMyPreferences().subscribe({
      next: (data) => {
        this.favoritos = Array.isArray(data?.favoritos) ? data.favoritos : this.favoritos;
        const compareIds = Array.isArray(data?.comparador) ? data.comparador : [];
        this.comparados = this.mapProductsByIds(compareIds);

        localStorage.setItem('nt_favoritos_productos', JSON.stringify(this.favoritos));
        localStorage.setItem('nt_compare_products', JSON.stringify(compareIds));
      },
      error: () => {}
    });
  }
}

