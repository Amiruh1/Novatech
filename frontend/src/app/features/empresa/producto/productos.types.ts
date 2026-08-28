export interface OptionWithIcon {
  label: string;
  value: string;
  icon: string;
}

export interface ProductView {
  id: number;
  nombre: string;
  descripcion: string;
  precio: number;
  precio_compra: number | null;
  precio_oferta: number | null;
  stock: number;
  categoria: string;
  subcategoria: string;
  imagen: string;
  sku: string;
  marca: string;
}

