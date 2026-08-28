import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { UserModel } from '../core/models/user.model';

@Injectable({
  providedIn: 'root'
})
export class UsersService {
  private http = inject(HttpClient);
  private apiUrl = 'http://localhost:3000/api/usuarios';

  getUsers() {
    return this.http.get<UserModel[]>(this.apiUrl);
  }

  createUser(usuario: Partial<UserModel>) {
    return this.http.post(this.apiUrl, usuario);
  }

  updateUser(id: number, usuario: Partial<UserModel>) {
    return this.http.put(`${this.apiUrl}/${id}`, usuario);
  }

  deleteUser(id: number) {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  setActivo(id: number, activo: boolean) {
    return this.http.patch(`${this.apiUrl}/${id}/activo`, { activo });
  }
}

