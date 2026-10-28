import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from '../core/config/api.config';

@Injectable({ providedIn: 'root' })
export class MediaService {
  private http = inject(HttpClient);

  upload(file: File) {
    return this.http.post<{ key: string; url: string }>(`${API_BASE_URL}/media/images`, file, {
      headers: { 'Content-Type': file.type },
    });
  }
}
