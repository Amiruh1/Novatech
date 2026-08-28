export type UserRole = 'admin' | 'cliente';

export interface UserModel {
  id: number;
  nombre: string;
  email: string;
  password?: string;
  rol: UserRole;
  telefono?: string | null;
  activo?: boolean | number;
  creado_en?: string;
}

