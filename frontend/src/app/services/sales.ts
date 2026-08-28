import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { SaleModel } from '../core/models/sale.model';
import { API_BASE_URL } from '../core/config/api.config';

export interface SalePaymentPayload {
  metodo: 'tarjeta' | 'billetera' | 'transferencia' | 'no-definido';
  monto_pagado?: number | null;
  referencia_pago?: string | null;
  comentario_pago?: string | null;
  tipo_comprobante?: 'boleta' | 'factura';
  documento_fiscal?: string | null;
  razon_social?: string | null;
  costo_envio?: number;
  direccion_envio_id?: number | null;
  tipo_despacho?: 'envio' | 'retiro';
}

interface SalePayload {
  id_usuario: number;
  nombre_usuario: string;
  total: number;
  detalle: Array<{ id: number; cantidad: number }>;
  pago?: SalePaymentPayload;
}

@Injectable({
  providedIn: 'root'
})
export class SalesService {
  private http = inject(HttpClient);
  private apiUrl = API_BASE_URL;

  createSale(payload: SalePayload): Observable<{ message: string; id_venta: number; total_venta: number }> {
    return this.http.post<{ message: string; id_venta: number; total_venta: number }>(`${this.apiUrl}/ventas`, payload);
  }

  updateSaleStatus(id: number, estado: string): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${this.apiUrl}/ventas/${id}/estado`, { estado });
  }

  getComprasPorUsuario(idUsuario: number): Observable<SaleModel[]> {
    return this.http.get<SaleModel[]>(`${this.apiUrl}/ventas/${idUsuario}`);
  }

  getAdminSales(): Observable<SaleModel[]> {
    return this.http.get<SaleModel[]>(`${this.apiUrl}/admin/ventas`);
  }

  confirmarPago(id: number): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${this.apiUrl}/ventas/${id}/confirmar-pago`, {});
  }

  downloadComprobante(id: number): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/ventas/${id}/comprobante`, { responseType: 'blob' });
  }
}
