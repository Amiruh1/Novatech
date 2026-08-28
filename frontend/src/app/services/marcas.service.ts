import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from '../core/config/api.config';

export interface MarcaModel {
  id?: number;
  nombre: string;
  slug?: string;
  activo?: number | boolean;
}

@Injectable({ providedIn: 'root' })
export class MarcasService {
  private http = inject(HttpClient);
  private url = `${API_BASE_URL}/marcas`;

  getMarcas() {
    return this.http.get<MarcaModel[]>(this.url);
  }

  createMarca(data: Partial<MarcaModel>) {
    return this.http.post<{ message: string; id: number }>(this.url, data);
  }

  updateMarca(id: number, data: Partial<MarcaModel>) {
    return this.http.put<{ message: string }>(`${this.url}/${id}`, data);
  }

  deleteMarca(id: number) {
    return this.http.delete<{ message: string }>(`${this.url}/${id}`);
  }
}
