import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map } from 'rxjs';
import { ProductModel } from '../core/models/product.model';
import { API_BASE_URL } from '../core/config/api.config';

export interface CatalogResponse {
  data: ProductModel[];
  total: number;
}

export interface ProductMovement {
  id: number;
  producto_id: number;
  tipo: 'ENTRADA' | 'SALIDA' | 'VENTA' | 'AJUSTE' | 'DEVOLUCION';
  cantidad: number;
  stock_anterior: number;
  stock_nuevo: number;
  motivo?: string;
  usuario_nombre?: string;
  creado_en: string;
}

export interface SubcategoryItem {
  id: number;
  nombre: string;
  slug: string;
  categoria_nombre: string;
}

export interface BrandItem {
  id: number;
  nombre: string;
  slug: string;
}

@Injectable({
  providedIn: 'root'
})
export class ProductsService {
  private http = inject(HttpClient);
  private apiUrl = `${API_BASE_URL}/productos`;
  private categoriesUrl = `${API_BASE_URL}/catalogos/categorias`;
  private subcategoriesUrl = `${API_BASE_URL}/catalogos/subcategorias`;
  private brandsUrl = `${API_BASE_URL}/catalogos/marcas`;

  getProducts() {
    return this.http.get<CatalogResponse>(this.apiUrl).pipe(
      map(res => {
        return Array.isArray(res) ? res : res.data;
      })
    );
  }

  searchProducts(options: {
    query?: string;
    categoria?: string;
    subcategoria?: string;
    marca?: string;
    soloDisponibles?: boolean;
    destacados?: boolean;
    conOferta?: boolean;
    precioMin?: number;
    precioMax?: number;
    orden?: string;
    page: number;
    limit: number;
  }) {
    let params = new HttpParams()
      .set('page', options.page.toString())
      .set('limit', options.limit.toString());
    
    if (options.query) params = params.set('q', options.query);
    if (options.categoria && options.categoria !== 'Todas') params = params.set('categoria', options.categoria);
    if (options.subcategoria) params = params.set('subcategoria', options.subcategoria);
    if (options.marca && options.marca !== 'Todas') params = params.set('marca', options.marca);
    if (options.soloDisponibles) params = params.set('soloDisponibles', 'true');
    if (options.destacados) params = params.set('destacados', 'true');
    if (options.conOferta) params = params.set('conOferta', 'true');
    if (options.precioMin) params = params.set('precioMin', options.precioMin.toString());
    if (options.precioMax) params = params.set('precioMax', options.precioMax.toString());
    if (options.orden) params = params.set('orden', options.orden);

    return this.http.get<CatalogResponse>(this.apiUrl, { params });
  }

  getCategories() {
    return this.http.get<string[]>(this.categoriesUrl);
  }

  getSubcategories() {
    return this.http.get<SubcategoryItem[]>(this.subcategoriesUrl);
  }

  getBrands() {
    return this.http.get<BrandItem[]>(this.brandsUrl);
  }

  getProductById(id: number) {
    // Llama al endpoint REST individual — O(1) vs. cargar todo el catálogo
    return this.http.get<any>(`${this.apiUrl}/${id}`).pipe(
      map(res => {
        // Normaliza distintos formatos de respuesta del backend
        return res?.producto ?? res?.data ?? res;
      })
    );
  }

  createProduct(producto: Partial<ProductModel>) {
    return this.http.post(this.apiUrl, producto);
  }

  updateProduct(id: number, producto: Partial<ProductModel>) {
    return this.http.put(`${this.apiUrl}/${id}`, producto);
  }

  updateProductStock(id: number, stock: number) {
    return this.http.put(`${this.apiUrl}/${id}/stock`, { stock });
  }

  adjustStock(id: number, stock: number, motivo: string) {
    return this.http.put(`${this.apiUrl}/${id}/ajuste-stock`, { stock, motivo });
  }

  getProductMovements(id: number) {
    return this.http.get<ProductMovement[]>(`${this.apiUrl}/${id}/movimientos`);
  }

  deleteProduct(id: number) {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }
}
