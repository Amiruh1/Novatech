export type SaleStatus = 'pendiente' | 'pagado' | 'preparando' | 'en camino' | 'entregado' | 'cancelado' | 'reembolsado';

export interface SaleDetailItem {
  id: number;
  nombre: string;
  precio: number;
  cantidad?: number;
  imagen?: string;
  categoria?: string;
}

export interface SaleModel {
  id: number;
  codigo?: string;
  id_usuario: number;
  nombre_usuario?: string;
  nombre_cliente?: string;
  fecha: string;
  subtotal?: number;
  impuesto?: number;
  costo_envio?: number;
  total: number;
  detalle?: string;
  estado?: SaleStatus;
  tipo_comprobante?: 'boleta' | 'factura';
  documento_fiscal?: string | null;
  razon_social?: string | null;
  direccion_envio_id?: number | null;
  metodo_pago_id?: number | null;
  metodo_pago_nombre?: string | null;
  monto_pagado?: number | null;
  referencia_pago?: string | null;
  pago_estado?: 'pendiente' | 'confirmado' | 'rechazado' | null;
  observaciones?: string | null;
  productos: SaleDetailItem[];
}

export const SALE_STATUS_FLOW: SaleStatus[] = [
  'pendiente',
  'pagado',
  'preparando',
  'en camino',
  'entregado'
];

export const SALE_STATUS_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  pagado: 'Pagado',
  preparando: 'Preparando',
  'en camino': 'En Camino',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
  reembolsado: 'Reembolsado'
};

export const SALE_STATUS_ICONS: Record<string, string> = {
  pendiente: 'pi pi-clock',
  pagado: 'pi pi-check-circle',
  preparando: 'pi pi-cog',
  'en camino': 'pi pi-truck',
  entregado: 'pi pi-home',
  cancelado: 'pi pi-times-circle',
  reembolsado: 'pi pi-replay'
};
