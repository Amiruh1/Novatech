import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { API_BASE_URL } from '../core/config/api.config';

interface AuthUser {
  id: number;
  nombre: string;
  email: string;
  rol: 'admin' | 'cliente' | string;
  telefono?: string;
  tipo_documento?: string;
  numero_documento?: string;
}

interface AuthResponse {
  token?: string;
  usuario?: AuthUser;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private apiUrl = API_BASE_URL;
  private readonly storageUserKey = 'nt_current_user';
  private readonly storageTokenKey = 'nt_auth_token';

  private currentUserSubject = new BehaviorSubject<AuthUser | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor() {
    this.restoreSession();
  }

  public get currentUserValue() {
    return this.currentUserSubject.value;
  }

  public get isAuthenticated() {
    return Boolean(this.currentUserSubject.value);
  }

  public get tokenValue() {
    return localStorage.getItem(this.storageTokenKey);
  }

  // --- LOGIN ---
  login(credentials: any): Observable<any> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, credentials).pipe(
      tap((response) => this.persistSession(response))
    );
  }

  // --- REGISTRO PUBLICO CLIENTE ---
  register(payload: { nombre: string; email: string; password: string; tipo_documento: string; numero_documento: string }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, payload).pipe(
      tap((response) => this.persistSession(response))
    );
  }

  // --- GOOGLE SIGN-IN ---
  googleLogin(credential: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/google`, { credential }).pipe(
      tap((response) => this.persistSession(response))
    );
  }

  // --- RECUPERACION DE PASSWORD ---
  forgotPassword(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/forgot-password`, { email });
  }

  resetPassword(payload: { token: string; password: string }): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/reset-password`, payload);
  }

  forgotPasswordCode(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/forgot-password-code`, { email });
  }

  resetPasswordByCode(payload: { email: string; code: string; password: string }): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/reset-password-code`, payload);
  }

  changePassword(payload: { passActual: string; passNueva: string }): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/change-password`, payload);
  }

  updateProfile(payload: { nombre: string; telefono?: string; email?: string; tipo_documento?: string; numero_documento?: string }): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${this.apiUrl}/update-profile`, payload);
  }

  // --- LOGOUT ---
  logout() {
    this.currentUserSubject.next(null);
    localStorage.removeItem(this.storageUserKey);
    localStorage.removeItem(this.storageTokenKey);
    localStorage.removeItem('nt_favoritos_productos');
    localStorage.removeItem('nt_compare_products');
  }

  private restoreSession() {
    try {
      const rawUser = localStorage.getItem(this.storageUserKey);

      if (!rawUser) {
        return;
      }

      const parsed = JSON.parse(rawUser) as AuthUser;

      if (parsed && parsed.id && parsed.email) {
        this.currentUserSubject.next(parsed);
        return;
      }

      this.logout();
    } catch {
      this.logout();
    }
  }

  private persistSession(response: AuthResponse | null | undefined) {
    if (!response || !response.usuario) {
      return;
    }

    this.currentUserSubject.next(response.usuario);
    localStorage.setItem(this.storageUserKey, JSON.stringify(response.usuario));

    if (response.token) {
      localStorage.setItem(this.storageTokenKey, response.token);
    }
  }
}


