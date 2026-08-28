import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth';

export const authErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const sentToken = req.headers.has('Authorization');
      if (error.status === 401 && sentToken && auth.isAuthenticated) {
        auth.logout();
        router.navigate(['/tienda']);
      }
      return throwError(() => error);
    })
  );
};
