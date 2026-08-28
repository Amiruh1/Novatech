export interface ProductModel {
  id: number;
  sku?: string;
  nombre: string;
  descripcion?: string;
  precio: number;
  precio_compra?: number | null;
  precio_oferta?: number | null;
  stock: number;
  stock_minimo?: number;
  categoria?: string;
  subcategoria?: string;
  marca?: string;
  imagen?: string;
  destacado?: boolean | number;
  activo?: boolean | number;
  creado_en?: string;
  actualizado_en?: string;
}

export function precioFinal(p: ProductModel): number {
  if (p.precio_oferta && p.precio_oferta > 0 && p.precio_oferta < p.precio) {
    return p.precio_oferta;
  }
  return p.precio;
}

export function porcentajeDescuento(p: ProductModel): number {
  if (!p.precio_oferta || p.precio_oferta <= 0 || p.precio_oferta >= p.precio) {
    return 0;
  }
  return Math.round(((p.precio - p.precio_oferta) / p.precio) * 100);
}

export function cuotaReferencial(p: ProductModel, cuotas: number = 6): number {
  const final = precioFinal(p);
  return Number((final / cuotas).toFixed(2));
}

export function tieneOferta(p: ProductModel): boolean {
  return !!(p.precio_oferta && p.precio_oferta > 0 && p.precio_oferta < p.precio);
}
