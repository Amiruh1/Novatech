import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Router } from '@angular/router';
import { AuthService } from './auth';

export interface PaletteCommand {
  id: string;
  label: string;
  description?: string;
  icon: string;
  category: 'navigation' | 'admin' | 'account';
  keywords: string[];
  action: () => void;
  requiresAdmin?: boolean;
}

@Injectable({ providedIn: 'root' })
export class CommandPaletteService {
  private router = inject(Router);
  private auth   = inject(AuthService);

  readonly isOpen$ = new BehaviorSubject<boolean>(false);
  readonly query$  = new BehaviorSubject<string>('');

  open()  { this.isOpen$.next(true);  this.query$.next(''); }
  close() { this.isOpen$.next(false); this.query$.next(''); }
  toggle() { this.isOpen$.value ? this.close() : this.open(); }

  getBaseCommands(): PaletteCommand[] {
    const nav = (path: string) => () => { this.close(); this.router.navigate([path]); };

    const cmds: PaletteCommand[] = [
      { id: 'tienda',        label: 'Ir a la tienda',      description: 'Catálogo completo de productos', icon: 'pi-home',           category: 'navigation', keywords: ['tienda','inicio','catalogo','productos','home'] , action: nav('/tienda') },
      { id: 'carrito',       label: 'Ver carrito',         description: 'Revisa tus productos seleccionados', icon: 'pi-shopping-cart', category: 'navigation', keywords: ['carrito','cart','comprar','pedido'], action: nav('/carrito') },
      { id: 'checkout',      label: 'Proceder al pago',    description: 'Finaliza tu compra',           icon: 'pi-credit-card',    category: 'navigation', keywords: ['checkout','pago','pagar','confirmar'],  action: nav('/checkout') },
      { id: 'favoritos',     label: 'Mis favoritos',       description: 'Productos que guardaste',       icon: 'pi-heart',          category: 'account',    keywords: ['favoritos','favorito','guardados','wish','lista'], action: nav('/favoritos') },
      { id: 'miscompras',    label: 'Mis compras',         description: 'Historial de pedidos',          icon: 'pi-list-check',     category: 'account',    keywords: ['compras','pedidos','historial','ordenes'], action: nav('/miscompras') },
      { id: 'configuracion', label: 'Mi cuenta',           description: 'Perfil, contraseña y direcciones', icon: 'pi-user',        category: 'account',    keywords: ['cuenta','perfil','configuracion','password','direcciones'], action: nav('/configuracion') },
      { id: 'dashboard',     label: 'Panel de control',    description: 'Dashboard administrativo',      icon: 'pi-chart-bar',      category: 'admin',      keywords: ['dashboard','panel','admin','estadisticas'], action: nav('/empresa/dashboard'), requiresAdmin: true },
      { id: 'productos-adm', label: 'Gestión de productos',description: 'Crear y editar productos',     icon: 'pi-box',            category: 'admin',      keywords: ['productos','inventario','stock','crear','editar'], action: nav('/empresa/productos'), requiresAdmin: true },
      { id: 'ventas-adm',    label: 'Gestión de ventas',   description: 'Pedidos y ventas',              icon: 'pi-dollar',         category: 'admin',      keywords: ['ventas','pedidos','ordenes','admin'], action: nav('/empresa/ventas'), requiresAdmin: true },
      { id: 'usuarios-adm',  label: 'Gestión de usuarios', description: 'Administrar cuentas',           icon: 'pi-users',          category: 'admin',      keywords: ['usuarios','clientes','cuentas','admin'], action: nav('/empresa/usuarios'), requiresAdmin: true },
    ];

    const isAdmin = this.auth.currentUserValue?.rol === 'admin';
    return cmds.filter(c => !c.requiresAdmin || isAdmin);
  }

  filterCommands(query: string, commands: PaletteCommand[]): PaletteCommand[] {
    if (!query.trim()) return commands;
    const q = query.toLowerCase().trim();
    return commands.filter(c =>
      c.label.toLowerCase().includes(q) ||
      (c.description || '').toLowerCase().includes(q) ||
      c.keywords.some(k => k.includes(q))
    );
  }
}
