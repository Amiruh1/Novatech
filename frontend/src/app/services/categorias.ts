import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../core/config/api.config';

export interface CategoriaModel {
  id?: number;
  nombre: string;
  slug: string;
  descripcion?: string;
  imagen?: string;
  categoria_padre_id?: number | null;
  activo: boolean | number;
  orden: number;
  creado_en?: string;
  actualizado_en?: string;
}

@Injectable({
  providedIn: 'root'
})
export class CategoriasService {
  private http = inject(HttpClient);
  private apiUrl = `${API_BASE_URL}/categorias`;

  getCategorias(): Observable<CategoriaModel[]> {
    return this.http.get<CategoriaModel[]>(this.apiUrl);
  }

  createCategoria(categoria: Partial<CategoriaModel>): Observable<any> {
    return this.http.post<any>(this.apiUrl, categoria);
  }

  updateCategoria(id: number, categoria: Partial<CategoriaModel>): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${id}`, categoria);
  }

  deleteCategoria(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/${id}`);
  }
}
