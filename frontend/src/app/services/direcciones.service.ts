import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../core/config/api.config';

export interface Direccion {
  id?: number;
  alias: string;
  destinatario: string;
  direccion_detallada: string;
  distrito: string;
  provincia: string;
  codigo_postal?: string;
  referencias?: string;
  predeterminada?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class DireccionesService {
  private http = inject(HttpClient);
  private apiUrl = `${API_BASE_URL}/direcciones`;

  getDirecciones(): Observable<Direccion[]> {
    return this.http.get<Direccion[]>(this.apiUrl);
  }

  createDireccion(direccion: Direccion): Observable<any> {
    return this.http.post(this.apiUrl, direccion);
  }

  updateDireccion(id: number, direccion: Direccion): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, direccion);
  }

  deleteDireccion(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }
}
