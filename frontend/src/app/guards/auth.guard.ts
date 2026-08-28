import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { AuthModalService } from '../services/auth-modal';
import { MessageService } from 'primeng/api';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const authModalService = inject(AuthModalService);
  const router = inject(Router);
  const messageService = inject(MessageService);
  const usuario = authService.currentUserValue;
  const requiredRole = route.data?.['role'] as string | undefined;

  if (!usuario) {
    authModalService.open({
      view: 'login',
      mode: requiredRole === 'admin' ? 'elevado' : 'cliente',
      returnUrl: state.url
    });

    return router.createUrlTree(['/tienda']);
  }

  if (requiredRole && usuario.rol !== requiredRole) {
    messageService.add({ severity: 'warn', summary: 'Acceso denegado', detail: 'No tienes permiso para acceder a esta sección.' });
    router.navigate(['/tienda']);
    return false;
  }

  return true;
};

export const authChildGuard: CanActivateChildFn = (childRoute, state) => {
  const authService = inject(AuthService);
  const authModalService = inject(AuthModalService);
  const router = inject(Router);
  const messageService = inject(MessageService);
  const usuario = authService.currentUserValue;
  const requiredRole = childRoute.data?.['role'] as string | undefined;

  if (!usuario) {
    authModalService.open({
      view: 'login',
      mode: requiredRole === 'admin' ? 'elevado' : 'cliente',
      returnUrl: state.url
    });

    return router.createUrlTree(['/tienda']);
  }

  if (requiredRole && usuario.rol !== requiredRole) {
    messageService.add({ severity: 'warn', summary: 'Acceso denegado', detail: 'No tienes permiso para acceder a esta sección.' });
    return router.createUrlTree(['/tienda']);
  }

  return true;
};

