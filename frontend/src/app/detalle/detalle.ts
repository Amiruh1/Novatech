import { Component, inject, OnInit, OnDestroy, ChangeDetectorRef, ElementRef, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ProductsService } from '../services/products';
import { Cart } from '../services/cart';
import { AuthService } from '../services/auth';
import { PreferencesService } from '../services/preferences';
import { MessageService } from 'primeng/api';
import { ProductModel, precioFinal, porcentajeDescuento, cuotaReferencial, tieneOferta } from '../core/models/product.model';
import { SpeechService } from '../core/services/speech.service';
import { NarratorToggle } from '../accessibility/narrator-toggle';

import { ButtonModule }      from 'primeng/button';
import { DialogModule }      from 'primeng/dialog';
import { FormsModule }       from '@angular/forms';
import { RatingModule }      from 'primeng/rating';
import { TextareaModule }    from 'primeng/textarea';
import { SkeletonModule }    from 'primeng/skeleton';

interface ProductReview {
  id: string;
  stars: number;
  comment: string;
  author: string;
  createdAt: string;
}

@Component({
  selector: 'app-detalle',
  standalone: true,
  imports: [
    CommonModule, ButtonModule, DialogModule,
    FormsModule, RouterModule, RatingModule,
    TextareaModule, SkeletonModule, NarratorToggle
  ],
  templateUrl: './detalle.html',
  styleUrl: './detalle.scss'
})
export class Detalle implements OnInit, OnDestroy {
  @ViewChild('zoomDialog', { read: ElementRef }) private zoomDialog?: ElementRef<HTMLElement>;
  readonly speech = inject(SpeechService);
  private route             = inject(ActivatedRoute);
  private router            = inject(Router);
  private productsService   = inject(ProductsService);
  private cart              = inject(Cart);
  private auth              = inject(AuthService);
  private preferencesService = inject(PreferencesService);
  private messageService    = inject(MessageService);
  private cd                = inject(ChangeDetectorRef);
  private authSub           = new Subscription();

  product: any = null;
  sugeridos: any[] = [];
  cantidad = 1;
  loading  = true;
  loadingSugeridos = false;

  displayModal     = false;
  displayImageZoom = false;

  reviews: ProductReview[] = [];
  favoritos: number[] = [];

  nuevaResena: { stars: number; comment: string } = { stars: 0, comment: '' };

  getPrecioFinal = precioFinal;

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  ngOnInit() {
    this.route.params.subscribe(params => this.cargarProducto(params['id']));

    this.authSub = this.auth.currentUser$.subscribe(user => {
      if (!user) {
        this.favoritos = [];
        this.cd.detectChanges();
      }
    });
  }

  ngOnDestroy() { this.authSub.unsubscribe(); }

  // ── Carga de producto — O(1) con endpoint REST real ────────────────────────
  cargarProducto(id: any) {
    this.loading = true;
    this.sugeridos = [];
    this.product = null;
    const idNum = Number(id);

    this.productsService.getProductById(idNum).subscribe({
      next: (product) => {
        if (!product || !product.id) {
          this.messageService.add({ severity: 'warn', summary: 'No disponible', detail: 'Producto no encontrado en el catálogo.' });
          this.router.navigate(['/tienda']);
          return;
        }

        this.product = product;
        this.saveRecentProduct(product);
        this.favoritos  = this.loadFavoritos();
        this.reviews    = this.loadReviewsByProduct(idNum);
        this.cantidad   = 1;
        this.loading    = false;
        this.cd.detectChanges();

        if (this.auth.isAuthenticated) this.syncFavoritosFromApi();

        // Cargar sugeridos en segundo plano (no bloquea el render del producto)
        this.cargarSugeridos(product.categoria, idNum);
      },
      error: () => {
        this.loading = false;
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el producto.' });
        this.router.navigate(['/tienda']);
        this.cd.detectChanges();
      }
    });
  }

  // Sugeridos lazy — solo 4 productos de la misma categoría
  private cargarSugeridos(categoria: string, excludeId: number) {
    if (!categoria) return;
    this.loadingSugeridos = true;

    this.productsService.searchProducts({
      categoria,
      page: 1,
      limit: 8
    }).subscribe({
      next: (res) => {
        const all: any[] = Array.isArray(res) ? res : ((res as any).data ?? []);
        this.sugeridos = all
          .filter((p: any) => Number(p.id) !== excludeId)
          .slice(0, 4);
        this.loadingSugeridos = false;
        this.cd.detectChanges();
      },
      error: () => { this.loadingSugeridos = false; }
    });
  }

  // ── Carrito ─────────────────────────────────────────────────────────────────
  agregarAlCarro() {
    if (!this.product) return;
    this.normalizarCantidad(this.cantidad);
    const result = this.cart.addToCart(this.product, this.cantidad);
    if (result.success) {
      this.displayModal = true;
    } else {
      this.messageService.add({ severity: 'warn', summary: 'Stock', detail: result.message });
    }
  }

  agregarSugeridoAlCarro(item: any) {
    const result = this.cart.addToCart(item, 1);
    if (result.success) {
      this.messageService.add({ severity: 'success', summary: 'Agregado', detail: `${item.nombre} fue añadido al carrito.` });
    } else {
      this.messageService.add({ severity: 'warn', summary: 'Stock', detail: result.message });
    }
  }

  aumentarCantidad() {
    if (this.cantidad < Number(this.product?.stock || 1)) this.cantidad += 1;
  }

  reducirCantidad() {
    if (this.cantidad > 1) this.cantidad -= 1;
  }

  normalizarCantidad(value: number) {
    const maxStock = Math.max(1, Number(this.product?.stock || 1));
    const parsed   = Math.trunc(Number(value || 1));
    this.cantidad  = Number.isFinite(parsed) && parsed >= 1 ? Math.min(maxStock, parsed) : 1;
  }

  get puedeAgregar() { return Number(this.product?.stock || 0) > 0; }

  irAlCarro()       { this.displayModal = false; this.router.navigate(['/carrito']); }
  seguirComprando() { this.displayModal = false; this.router.navigate(['/tienda']); }
  abrirZoomImagen() { this.displayImageZoom = true; }

  enfocarCierreZoom() {
    setTimeout(() => this.zoomDialog?.nativeElement
      .querySelector<HTMLElement>('.p-dialog-close-button, .p-dialog-header-actions button')?.focus());
  }

  escucharProducto() {
    if (!this.product) return;
    const precio = this.precioFinalCalc.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const stock = Number(this.product.stock || 0);
    this.speech.read(`${this.product.nombre}. Precio: ${precio} soles. ${stock > 0 ? `${stock} unidades disponibles.` : 'Producto agotado.'} ${this.product.descripcion || 'Sin descripción adicional.'}`);
  }

  // ── Computed ────────────────────────────────────────────────────────────────
  get calificacionPromedio() {
    if (!this.reviews.length) return 0;
    return Number((this.reviews.reduce((a, r) => a + r.stars, 0) / this.reviews.length).toFixed(1));
  }

  get totalResenas()       { return this.reviews.length; }
  get precioLista()        { return this.product ? Number(this.product.precio) : 0; }
  get precioFinalCalc()    { return this.product ? precioFinal(this.product) : 0; }
  get descuentoAproximado(){ return this.product ? porcentajeDescuento(this.product) : 0; }
  get cuotaReferencial()   { return this.product ? cuotaReferencial(this.product) : 0; }
  get hayOferta()          { return this.product ? tieneOferta(this.product) : false; }

  get esFavorito() {
    return this.favoritos.includes(Number(this.product?.id || 0));
  }

  // ── Favoritos ───────────────────────────────────────────────────────────────
  toggleFavorito() {
    const id = Number(this.product?.id || 0);
    if (!id) return;

    if (this.favoritos.includes(id)) {
      this.favoritos = this.favoritos.filter(f => f !== id);
      this.messageService.add({ severity: 'info', summary: 'Favoritos', detail: 'Producto quitado de favoritos.' });
    } else {
      this.favoritos = [id, ...this.favoritos];
      this.messageService.add({ severity: 'success', summary: 'Favoritos', detail: 'Producto agregado a favoritos.' });
    }

    this.persistFavoritos();
  }

  // ── Compartir ───────────────────────────────────────────────────────────────
  compartirProducto() {
    navigator.clipboard.writeText(window.location.href).then(
      ()  => this.messageService.add({ severity: 'success', summary: 'Enlace copiado', detail: 'Comparte este producto.' }),
      ()  => this.messageService.add({ severity: 'warn', summary: 'No disponible', detail: 'Copia el enlace manualmente.' })
    );
  }

  // ── Reseñas ─────────────────────────────────────────────────────────────────
  registrarResena() {
    const usuario = this.auth.currentUserValue;
    const comment = (this.nuevaResena.comment || '').trim();

    if (!usuario) {
      this.messageService.add({ severity: 'warn', summary: 'Inicia sesión', detail: 'Debes iniciar sesión para dejar una reseña.' });
      return;
    }
    if (comment.length < 6) {
      this.messageService.add({ severity: 'warn', summary: 'Reseña incompleta', detail: 'Escribe al menos 6 caracteres.' });
      return;
    }
    if (!this.nuevaResena.stars) {
      this.messageService.add({ severity: 'warn', summary: 'Calificación requerida', detail: 'Selecciona de 1 a 5 estrellas.' });
      return;
    }

    const productId = Number(this.product?.id || 0);
    if (!productId) return;

    const review: ProductReview = {
      id: `rv-${Date.now()}`,
      stars: Number(this.nuevaResena.stars),
      comment,
      author: usuario.nombre || 'Cliente',
      createdAt: new Date().toISOString()
    };

    this.reviews = [review, ...this.reviews];
    this.saveReviewsByProduct(productId, this.reviews);
    this.nuevaResena = { stars: 0, comment: '' };
    this.messageService.add({ severity: 'success', summary: 'Reseña publicada', detail: '¡Gracias por tu opinión!' });
  }

  getRelativeDate(createdAt: string) {
    const diff    = Date.now() - new Date(createdAt).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `Hace ${Math.max(1, minutes)} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Hace ${hours} h`;
    return `Hace ${Math.floor(hours / 24)} d`;
  }

  // ── Persistencia (localStorage) ─────────────────────────────────────────────
  private loadReviewsByProduct(id: number): ProductReview[] {
    try {
      const raw = localStorage.getItem(`nt_product_reviews_${id}`);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }

  private saveReviewsByProduct(id: number, reviews: ProductReview[]) {
    localStorage.setItem(`nt_product_reviews_${id}`, JSON.stringify(reviews));
  }

  private loadFavoritos(): number[] {
    try {
      const raw = localStorage.getItem('nt_favoritos_productos');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(i => Number(i)).filter(Boolean) : [];
    } catch { return []; }
  }

  private persistFavoritos() {
    localStorage.setItem('nt_favoritos_productos', JSON.stringify(this.favoritos));
    if (!this.auth.isAuthenticated) return;
    this.preferencesService.saveFavoritos(this.favoritos).subscribe({
      next: (d) => {
        if (Array.isArray(d?.favoritos)) this.favoritos = d.favoritos;
      },
      error: () => {}
    });
  }

  private syncFavoritosFromApi() {
    this.preferencesService.getMyPreferences().subscribe({
      next: (d) => {
        if (Array.isArray(d?.favoritos)) {
          this.favoritos = d.favoritos;
          localStorage.setItem('nt_favoritos_productos', JSON.stringify(this.favoritos));
        }
      },
      error: () => {}
    });
  }

  private saveRecentProduct(product: any) {
    try {
      if (!product?.id) return;
      const userId  = this.auth.currentUserValue?.id || 'guest';
      const key     = `nt_recent_products_${userId}`;
      const current = (() => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } })();
      const item    = { id: Number(product.id), nombre: product.nombre || '', precio: Number(product.precio || 0), imagen: product.imagen || '', categoria: product.categoria || '', stock: Number(product.stock || 0) };
      const deduped = [item, ...current.filter((p: any) => Number(p.id) !== item.id)].slice(0, 6);
      localStorage.setItem(key, JSON.stringify(deduped));
    } catch {}
  }
}
