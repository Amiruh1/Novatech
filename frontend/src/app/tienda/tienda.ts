import { Component, inject, OnInit, ChangeDetectorRef, OnDestroy, ElementRef, ViewChild, ViewChildren, QueryList, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { ProductsService, SubcategoryItem } from '../services/products';
import { Cart } from '../services/cart';
import { AuthService } from '../services/auth';
import { PreferencesService } from '../services/preferences';
import { Subject, Subscription, debounceTime, distinctUntilChanged, finalize, timeout } from 'rxjs';
import { StoreAlertsService } from '../core/services/store-alerts.service';
import { ProductModel, precioFinal, porcentajeDescuento, cuotaReferencial, tieneOferta } from '../core/models/product.model';
import { BannersService, BannerModel } from '../services/banners';
import { CategoriasService, CategoriaModel } from '../services/categorias';
import { AccessibilityService } from '../core/services/accessibility.service';
import { SpeechService } from '../core/services/speech.service';
import { NarratorToggle } from '../accessibility/narrator-toggle';

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
    SliderModule,
    NarratorToggle
  ],
  templateUrl: './tienda.html',
  styleUrl: './tienda.scss'
})
export class Tienda implements OnInit, OnDestroy {
  @ViewChild('catalogSearch') private catalogSearch?: ElementRef<HTMLInputElement>;
  @ViewChild('catalogTitle') private catalogTitle?: ElementRef<HTMLElement>;
  @ViewChild('orderButton') private orderButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('orderOptions') private orderOptions?: ElementRef<HTMLElement>;
  @ViewChild('compareClose') private compareClose?: ElementRef<HTMLButtonElement>;
  @ViewChildren('compareRemove') private compareRemoveButtons?: QueryList<ElementRef<HTMLButtonElement>>;
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
  loadError = '';
  private catalogRequest?: Subscription;
  private searchRequest?: Subscription;
  private readonly destroyRef = inject(DestroyRef);

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
  bannerPaused = false;
  bannerInteracting = false;
  bannerFocused = false;
  readonly accessibility = inject(AccessibilityService);
  readonly speech = inject(SpeechService);

  categoriasData: CategoriaModel[] = [];

  private productsService = inject(ProductsService);
  private cart = inject(Cart);
  private auth = inject(AuthService);
  private preferencesService = inject(PreferencesService);
  private cd = inject(ChangeDetectorRef);
  private route = inject(ActivatedRoute);
  private alerts = inject(StoreAlertsService);
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
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(searchTerm => {
      this.aplicarBusqueda(false);
    });

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const categoria = (params.get('categoria') || 'Todas').trim();
      this.categoriaQuery = categoria || 'Todas';

      if (this.allProducts.length) {
        this.filtrarPorCategoria(this.categoriaQuery);
      } else {
        this.categoriaActual = this.categoriaQuery;
        this.subcategoriaActual = '';
        this.subcategoriasActuales = [];
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
      || this.subcategoriaActual.length > 0
      || this.precioMin > 0 || this.precioMax < 10000
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
        return 'Más relevantes';
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
    this.bannersService.getBanners(true).pipe(timeout(15000), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (data) => {
        if (data && data.length > 0) {
          this.heroBanners = data;
          this.iniciarCarrusel();
          this.cd.detectChanges();
        }
      },
      error: () => { this.heroBanners = []; this.cd.markForCheck(); }
    });
  }

  iniciarCarrusel() {
    if (this.bannerInterval) clearInterval(this.bannerInterval);
    if (this.heroBanners.length <= 1) return;

    this.bannerInterval = setInterval(() => {
      const preferences = this.accessibility.preferences();
      if (this.bannerPaused || this.bannerInteracting || this.bannerFocused || preferences.reading || preferences.navigation
          || this.accessibility.panelOpen() || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      this.siguienteBanner();
    }, 10000);
  }

  siguienteBanner() {
    this.activeBannerIndex = (this.activeBannerIndex + 1) % this.heroBanners.length;
    this.cd.detectChanges();
  }

  salirBanner(event: FocusEvent) {
    this.bannerFocused = (event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null);
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
    this.catalogRequest?.unsubscribe();
    this.searchRequest?.unsubscribe();
    this.loading = true;
    this.loadError = '';
    this.catalogRequest = this.productsService.getProducts().pipe(
      timeout(15000), takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (data) => {
        this.allProducts = data;

        this.categorias = [...new Set(data.map(p => p.categoria).filter((value): value is string => !!value))];
        this.categoriasSrv.getCategorias().pipe(timeout(15000), takeUntilDestroyed(this.destroyRef)).subscribe({ next: cats => {
            this.categoriasData = cats.filter(c => c.activo == 1 || c.activo == true);
            this.categorias = this.categoriasData.map(c => c.nombre);
            this.cd.detectChanges();
        }, error: () => {} });

        this.productsService.getSubcategories().pipe(timeout(15000), takeUntilDestroyed(this.destroyRef)).subscribe({ next: subs => {
            this.todasSubcategorias = subs;
            this.subcategoriasActuales = this.categoriaActual === 'Todas'
              ? [] : subs.filter(s => s.categoria_nombre === this.categoriaActual);
            this.cd.detectChanges();
        }, error: () => {} });

        const marcasSet = new Set(data.map((p: any) => p.marca));
        this.marcas = Array.from(marcasSet as Set<string>);
        this.favoritos = this.loadFavoritos();
        this.comparados = this.mapProductsByIds(this.loadComparadorIds());
        this.vistosRecientes = this.loadRecentProducts();

        if (this.auth.isAuthenticated) {
          this.syncPreferencesFromApi();
        }

        this.aplicarFiltrosYOrden();
        
        this.cd.detectChanges();
      },
      error: (err) => {
        this.mostrarErrorCarga(err);
        this.loading = false;
        this.cd.detectChanges();
      }
    });
  }

  reintentarCarga() {
    // The error button disappears during loading; keep focus on a stable heading.
    this.catalogTitle?.nativeElement.focus();
    this.cargarProductos();
  }

  escucharProducto(producto: ProductModel) {
    const precio = Number(precioFinal(producto)).toLocaleString('es-PE', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
    const stock = Number(producto.stock || 0);
    this.speech.read(`${producto.nombre}. Precio: ${precio} soles. ${stock > 0
      ? `${stock} unidades disponibles.` : 'Producto agotado.'} Abre el producto para ver más detalles.`);
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

  aplicarBusqueda(cerrarSugerencias = true) {
    this.busquedaAplicada = (this.busquedaTexto || '').trim();
    if (cerrarSugerencias) this.cerrarSugerencias();
    this.currentPage = 1;
    this.aplicarFiltrosYOrden();
  }

  limpiarBusqueda() {
    this.catalogSearch?.nativeElement.focus();
    this.busquedaTexto = '';
    this.busquedaAplicada = '';
    this.sugerencias = [];
    this.mostrarSugerencias = false;
    this.currentPage = 1;
    this.aplicarFiltrosYOrden();
  }

  seleccionarSugerencia(texto: string) {
    this.busquedaTexto     = texto;
    this.busquedaAplicada  = texto;
    this.sugerencias       = [];
    this.mostrarSugerencias = false;
    this.currentPage = 1;
    this.aplicarFiltrosYOrden();
    this.catalogSearch?.nativeElement.focus();
    this.cerrarSugerencias();
  }

  cerrarSugerencias(devolverFoco = false) {
    if (devolverFoco) this.catalogSearch?.nativeElement.focus();
    this.mostrarSugerencias = false;
    this.sugerencias = [];
  }

  salirBusqueda(event: FocusEvent) {
    if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) {
      this.cerrarSugerencias();
    }
  }

  salirOrden(event: FocusEvent) {
    if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) {
      this.cerrarOrdenDropdown();
    }
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
    this.precioRango = [0, 10000];
    this.precioMin = 0;
    this.precioMax = 10000;
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
      void this.alerts.info('Comparador completo', 'Puedes comparar hasta 3 productos. Quita uno para añadir otro.');
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

  quitarDelComparador(product: ProductModel, index: number) {
    this.toggleComparar(product);
    this.cd.detectChanges();
    const buttons = this.compareRemoveButtons?.toArray() || [];
    (buttons[Math.min(index, buttons.length - 1)]?.nativeElement
      || this.compareClose?.nativeElement)?.focus();
  }

  abrirComparador() {
    if (this.comparados.length < 2) {
      void this.alerts.info('Elige dos productos', 'Marca el icono de comparación en al menos 2 productos para ver sus diferencias.');
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
    if (this.mostrarOrdenDropdown) {
      this.cd.detectChanges();
      this.orderOptions?.nativeElement.querySelector<HTMLButtonElement>('.selected')?.focus();
    }
  }

  seleccionarOrden(orden: 'relevancia' | 'precio_desc' | 'precio_asc') {
    this.ordenActual = orden;
    this.mostrarOrdenDropdown = false;
    this.aplicarFiltrosYOrden();
    this.orderButton?.nativeElement.focus();
  }

  cerrarOrdenDropdown(devolverFoco = false) {
    this.mostrarOrdenDropdown = false;
    if (devolverFoco) this.orderButton?.nativeElement.focus();
  }

  onPageChange(event: any) {
    this.catalogTitle?.nativeElement.focus();
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
        if (this.destroyRef.destroyed) return;
        this.addedIds.delete(Number(producto.id));
        this.cd.detectChanges();
      }, 700);
    }
    this.alerts.notify(result.success ? 'success' : 'warning',
      result.success ? 'Añadido al carrito' : 'Revisa la disponibilidad',
      result.success ? producto.nombre : result.message);
  }

  isJustAdded(productId: any): boolean {
    return this.addedIds.has(Number(productId));
  }

  aplicarPrecioRango() {
    const [min, max] = this.precioRango;
    if (min > max) {
      void this.alerts.info('Revisa el rango', 'El precio mínimo no puede ser mayor que el máximo.');
      return;
    }
    this.precioMin = min;
    this.precioMax = max;
    this.currentPage = 1;
    this.aplicarFiltrosYOrden();
  }

  private aplicarFiltrosYOrden() {
    this.searchRequest?.unsubscribe();
    this.loading = true;
    this.loadError = '';
    this.searchRequest = this.productsService.searchProducts({
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
    }).pipe(
      timeout(15000),
      takeUntilDestroyed(this.destroyRef),
      finalize(() => {
        if (!this.destroyRef.destroyed) { this.loading = false; this.cd.markForCheck(); }
      })
    ).subscribe({
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
        this.mostrarErrorCarga(err);
        this.loading = false;
        this.cd.detectChanges();
      }
    });
  }

  private mostrarErrorCarga(error: { status?: number }) {
    this.visibleProducts = [];
    this.totalRegistros = 0;
    this.loadError = error?.status === 0
      ? 'No podemos conectar con la tienda. Revisa tu conexión e inténtalo de nuevo.'
      : 'No pudimos cargar los productos. Inténtalo de nuevo en unos momentos.';
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

