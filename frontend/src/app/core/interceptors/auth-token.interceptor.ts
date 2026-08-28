import { HttpInterceptorFn } from '@angular/common/http';

const AUTH_TOKEN_KEY = 'nt_auth_token';

export const authTokenInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);

  if (!token || req.headers.has('Authorization')) {
    return next(req);
  }

  const authReq = req.clone({
    setHeaders: {
      Authorization: `Bearer ${token}`
    }
  });

  return next(authReq);
};

