import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { ShellLayoutComponent } from './layout/shell-layout/shell-layout.component';
import { accessibilityEntryGuard } from './accessibility/accessibility-entry.guard';

export const routes: Routes = [
    {
        path: 'accesibilidad/lectura',
        component: ShellLayoutComponent,
        canActivate: [accessibilityEntryGuard],
        data: { accessibilityMode: 'reading' }
    },
    {
        path: 'accesibilidad/navegacion',
        component: ShellLayoutComponent,
        canActivate: [accessibilityEntryGuard],
        data: { accessibilityMode: 'navigation' }
    },
    { path: 'login', redirectTo: '', pathMatch: 'full' },
    {
        path: '',
        component: ShellLayoutComponent,
        children: [
            { path: '', redirectTo: 'tienda', pathMatch: 'full' },
            {
                path: 'tienda',
                loadComponent: () => import('./tienda/tienda').then(m => m.Tienda)
            },
            {
                path: 'producto/:id',
                loadComponent: () => import('./detalle/detalle').then(m => m.Detalle)
            },
            {
                path: 'carrito',
                loadComponent: () => import('./carrito/carrito').then(m => m.Carrito)
            },
            {
                path: 'checkout',
                canActivate: [authGuard],
                loadComponent: () => import('./checkout/checkout').then(m => m.Checkout)
            },
            {
                path: 'favoritos',
                loadComponent: () => import('./favoritos/favoritos').then(m => m.FavoritosPage)
            },
            {
                path: 'miscompras',
                canActivate: [authGuard],
                loadComponent: () => import('./miscompras/miscompras').then(m => m.Miscompras)
            },
            {
                path: 'configuracion',
                canActivate: [authGuard],
                loadComponent: () => import('./configuracion/configuracion').then(m => m.ConfiguracionPage)
            },
            {
                path: 'empresa/dashboard',
                canActivate: [authGuard],
                loadComponent: () => import('./features/empresa/dashboard/dashboard-page.component').then(m => m.DashboardPage),
                data: { role: 'admin' }
            },
            {
                path: 'empresa/ventas',
                canActivate: [authGuard],
                loadComponent: () => import('./features/empresa/ventas/admin-ventas-page.component').then(m => m.AdminVentasPage),
                data: { role: 'admin' }
            },
            {
                path: 'empresa/productos',
                canActivate: [authGuard],
                loadComponent: () => import('./features/empresa/producto/producto-page.component').then(m => m.ProductoPage),
                data: { role: 'admin' }
            },
            {
                path: 'empresa/usuarios',
                canActivate: [authGuard],
                loadComponent: () => import('./features/empresa/usuario/usuario-page.component').then(m => m.UsuarioPage),
                data: { role: 'admin' }
            },
            {
                path: 'empresa/categorias',
                canActivate: [authGuard],
                loadComponent: () => import('./features/empresa/categorias/categorias-page.component').then(m => m.CategoriasPage),
                data: { role: 'admin' }
            },
            {
                path: 'empresa/notificaciones',
                canActivate: [authGuard],
                loadComponent: () => import('./features/empresa/notificaciones/notificaciones.component').then(m => m.NotificacionesPage),
                data: { role: 'admin' }
            },
                    {
                path: 'reset-password',
                loadComponent: () => import('./reset-password/reset-password.component').then(m => m.ResetPasswordComponent)
            },
            { path: 'dashboard', redirectTo: 'empresa/dashboard', pathMatch: 'full' },
            { path: 'adminventas', redirectTo: 'empresa/ventas', pathMatch: 'full' },
            { path: 'productos', redirectTo: 'empresa/productos', pathMatch: 'full' },
            { path: 'usuarios', redirectTo: 'empresa/usuarios', pathMatch: 'full' }
        ]
    },
    { path: '**', redirectTo: '' }
];

