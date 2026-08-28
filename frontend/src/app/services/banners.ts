import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from '../core/config/api.config';
import { Observable } from 'rxjs';

export interface BannerModel {
  id?: number;
  imagen: string;
  titulo: string;
  subtitulo?: string;
  link?: string;
  activo: boolean | number;
  orden: number;
}

@Injectable({
  providedIn: 'root'
})
export class BannersService {
  private http = inject(HttpClient);
  private apiUrl = `${API_BASE_URL}/banners`;

  getBanners(activos: boolean = false): Observable<BannerModel[]> {
    const url = activos ? `${this.apiUrl}?activos=true` : this.apiUrl;
    return this.http.get<BannerModel[]>(url);
  }

  createBanner(banner: Partial<BannerModel>): Observable<any> {
    return this.http.post(this.apiUrl, banner);
  }

  updateBanner(id: number, banner: Partial<BannerModel>): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, banner);
  }

  deleteBanner(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }
}
