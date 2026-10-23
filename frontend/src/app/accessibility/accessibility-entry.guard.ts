import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AccessibilityService } from '../core/services/accessibility.service';

export const accessibilityEntryGuard: CanActivateFn = route => {
  const mode = route.data['accessibilityMode'];
  if (mode === 'reading' || mode === 'navigation') {
    inject(AccessibilityService).enableMode(mode);
  }
  return inject(Router).createUrlTree(['/tienda']);
};
