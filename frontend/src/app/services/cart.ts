import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Subject, debounceTime } from 'rxjs';
import { ProductModel, precioFinal } from '../core/models/product.model';
import { PreferencesService } from './preferences';
import { AuthService } from './auth';

export interface CartItem {
  producto: ProductModel;
  cantidad: number;
}

const STORAGE_KEY = 'nt_cart_items';
const IGV_RATE = 0.18;

@Injectable({
  providedIn: 'root'
})
export class Cart {
  private itemsSubject     = new BehaviorSubject<CartItem[]>([]);
  private cartCountSubject = new BehaviorSubject<number>(0);
  private syncSubject      = new Subject<CartItem[]>();

  items$     = this.itemsSubject.asObservable();
  cartCount$ = this.cartCountSubject.asObservable();

  private preferencesService = inject(PreferencesService);
  private authService        = inject(AuthService);

  constructor() {
    this.restoreFromStorage();

    this.syncSubject.pipe(debounceTime(1500)).subscribe(items => {
      if (this.authService.isAuthenticated) {
        this.saveToApi(items);
      }
    });

    this.authService.currentUser$.subscribe(user => {
      if (user) {
        this.loadFromApi();
      }
    });
  }

  getItems(): CartItem[] {
    return this.itemsSubject.value;
  }

  getItemCount(): number {
    return this.itemsSubject.value.reduce((acc, item) => acc + item.cantidad, 0);
  }

  addToCart(product: ProductModel, cantidad: number = 1): { success: boolean; message: string } {
    const items = [...this.itemsSubject.value];
    const existingIndex = items.findIndex(i => Number(i.producto.id) === Number(product.id));
    const maxStock = Number(product.stock || 0);

    if (maxStock <= 0) {
      return { success: false, message: 'Producto agotado' };
    }

    if (existingIndex >= 0) {
      const currentQty = items[existingIndex].cantidad;
      const newQty = currentQty + cantidad;

      if (newQty > maxStock) {
        return { success: false, message: `Solo quedan ${maxStock} unidades disponibles` };
      }

      items[existingIndex] = { ...items[existingIndex], cantidad: newQty };
    } else {
      if (cantidad > maxStock) {
        return { success: false, message: `Solo quedan ${maxStock} unidades disponibles` };
      }

      items.push({ producto: product, cantidad });
    }

    this.updateState(items);
    return { success: true, message: 'Producto agregado al carrito' };
  }

  updateQuantity(productId: number, nuevaCantidad: number): boolean {
    const items = [...this.itemsSubject.value];
    const index = items.findIndex(i => Number(i.producto.id) === productId);

    if (index < 0) return false;

    const maxStock = Number(items[index].producto.stock || 0);

    if (nuevaCantidad <= 0) {
      items.splice(index, 1);
    } else if (nuevaCantidad > maxStock) {
      items[index] = { ...items[index], cantidad: maxStock };
    } else {
      items[index] = { ...items[index], cantidad: nuevaCantidad };
    }

    this.updateState(items);
    return true;
  }

  removeFromCart(productId: number): void {
    const items = this.itemsSubject.value.filter(i => Number(i.producto.id) !== productId);
    this.updateState(items);
  }

  clearCart(): void {
    this.updateState([]);
  }

  getCatalogTotal(): number {
    return this.itemsSubject.value.reduce((acc, item) =>
      acc + (precioFinal(item.producto) * item.cantidad), 0);
  }

  getSubtotal(): number {
    return Number((this.getCatalogTotal() / (1 + IGV_RATE)).toFixed(2));
  }

  getIGV(): number {
    const catalog = this.getCatalogTotal();
    return Number((catalog - catalog / (1 + IGV_RATE)).toFixed(2));
  }

  getTotal(costoEnvio: number = 0): number {
    return Number((this.getCatalogTotal() + costoEnvio).toFixed(2));
  }

  private updateState(items: CartItem[]): void {
    this.itemsSubject.next(items);
    this.cartCountSubject.next(items.reduce((acc, i) => acc + i.cantidad, 0));
    this.persistToStorage(items);
    this.syncSubject.next(items);
  }

  private saveToApi(items: CartItem[]): void {
    const payload = items.map(i => ({
      id:          Number(i.producto.id),
      cantidad:    i.cantidad,
      nombre:      i.producto.nombre      || '',
      precio:      i.producto.precio      || 0,
      precio_oferta: i.producto.precio_oferta ?? null,
      stock:       i.producto.stock       || 0,
      imagen:      i.producto.imagen      || '',
      categoria:   i.producto.categoria   || '',
      marca:       i.producto.marca       || '',
      sku:         i.producto.sku         || '',
      destacado:   Boolean(i.producto.destacado)
    }));
    this.preferencesService.saveCarrito(payload).subscribe({ error: () => {} });
  }

  private loadFromApi(): void {
    this.preferencesService.getCarrito().subscribe({
      next: (res) => {
        if (!Array.isArray(res?.carrito) || !res.carrito.length) return;
        const items: CartItem[] = res.carrito.map((i: any) => ({
          producto: {
            id:           Number(i.id),
            nombre:       i.nombre      || '',
            precio:       Number(i.precio || 0),
            precio_oferta: i.precio_oferta ?? null,
            stock:        Number(i.stock || 0),
            imagen:       i.imagen      || '',
            categoria:    i.categoria   || '',
            marca:        i.marca       || '',
            sku:          i.sku         || '',
            destacado:    Boolean(i.destacado)
          } as ProductModel,
          cantidad: Number(i.cantidad || 1)
        }));
        this.itemsSubject.next(items);
        this.cartCountSubject.next(items.reduce((a, i) => a + i.cantidad, 0));
        this.persistToStorage(items);
      },
      error: () => {}
    });
  }

  private persistToStorage(items: CartItem[]): void {
    try {
      const serializable = items.map(i => ({
        producto: {
          id: i.producto.id,
          nombre: i.producto.nombre,
          precio: i.producto.precio,
          precio_oferta: i.producto.precio_oferta,
          stock: i.producto.stock,
          imagen: i.producto.imagen,
          categoria: i.producto.categoria,
          marca: i.producto.marca,
          sku: i.producto.sku,
          destacado: i.producto.destacado
        },
        cantidad: i.cantidad
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
    } catch {
    }
  }

  private restoreFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;

      const items: CartItem[] = parsed
        .filter((i: any) => i?.producto?.id && i?.cantidad > 0)
        .map((i: any) => ({
          producto: i.producto as ProductModel,
          cantidad: Number(i.cantidad)
        }));

      this.itemsSubject.next(items);
      this.cartCountSubject.next(items.reduce((acc, i) => acc + i.cantidad, 0));
    } catch {
    }
  }
}
