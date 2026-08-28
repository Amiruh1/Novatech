import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from '../core/config/api.config';

export interface PreferencesPayload {
  favoritos: number[];
  comparador: number[];
}

export interface CartItemPayload {
  id: number;
  cantidad: number;
  nombre: string;
  precio: number;
  precio_oferta?: number | null;
  stock: number;
  imagen: string;
  categoria: string;
  marca: string;
  sku?: string;
  destacado?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class PreferencesService {
  private http = inject(HttpClient);
  private apiUrl = `${API_BASE_URL}/preferencias`;

  getMyPreferences() {
    return this.http.get<PreferencesPayload>(this.apiUrl);
  }

  saveFavoritos(favoritos: number[]) {
    return this.http.put<PreferencesPayload>(`${this.apiUrl}/favoritos`, { favoritos });
  }

  saveComparador(comparador: number[]) {
    return this.http.put<PreferencesPayload>(`${this.apiUrl}/comparador`, { comparador });
  }

  getCarrito() {
    return this.http.get<{ carrito: CartItemPayload[] }>(`${this.apiUrl}/carrito`);
  }

  saveCarrito(carrito: CartItemPayload[]) {
    return this.http.put<{ message: string }>(`${this.apiUrl}/carrito`, { carrito });
  }
}
