import { Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';
import type { SweetAlertIcon, SweetAlertOptions } from 'sweetalert2';
import Swal from 'sweetalert2/dist/sweetalert2.esm.all.js';
import { AccessibilityService } from './accessibility.service';

@Injectable({ providedIn: 'root' })
export class StoreAlertsService {
  private readonly accessibility = inject(AccessibilityService);

  constructor() {
    inject(Router).events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationStart) Swal.close();
    });
  }

  private options(): SweetAlertOptions {
    return {
      heightAuto: false,
      buttonsStyling: false,
      returnFocus: true,
      keydownListenerCapture: true,
      confirmButtonText: 'Entendido',
      closeButtonAriaLabel: 'Cerrar aviso',
      customClass: {
        container: 'nt-alert-container', popup: 'nt-alert', title: 'nt-alert-title',
        htmlContainer: 'nt-alert-text', confirmButton: 'nt-alert-confirm',
        cancelButton: 'nt-alert-cancel', closeButton: 'nt-alert-close'
      },
      showClass: { popup: '', backdrop: '', icon: '' },
      hideClass: { popup: '', backdrop: '', icon: '' }
    };
  }

  notify(icon: SweetAlertIcon, title: string, text: string): void {
    const trigger = document.activeElement as HTMLElement | null;
    void Swal.fire({
      ...this.options(), icon, titleText: title, text,
      toast: true, position: 'bottom-end',
      returnFocus: false,
      showConfirmButton: false, showCloseButton: true,
      timer: this.accessibility.active() ? undefined : 4500,
      timerProgressBar: !this.accessibility.active(),
      didOpen: popup => {
        popup.addEventListener('mouseenter', Swal.stopTimer);
        popup.addEventListener('mouseleave', Swal.resumeTimer);
        popup.addEventListener('focusin', Swal.stopTimer);
        popup.addEventListener('focusout', Swal.resumeTimer);
      },
      didClose: () => {
        if (document.activeElement === document.body && trigger?.isConnected) trigger.focus();
      }
    });
  }

  async info(title: string, text: string): Promise<void> {
    await Swal.fire({ ...this.options(), icon: 'info', titleText: title, text });
  }

  async confirmClearCart(): Promise<boolean> {
    const result = await Swal.fire({
      ...this.options(), icon: 'question', titleText: '¿Vaciar el carrito?',
      text: 'Se quitarán todos los productos que has añadido.',
      showCancelButton: true, confirmButtonText: 'Sí, vaciar carrito',
      cancelButtonText: 'Conservar productos', focusCancel: true,
      returnFocus: false
    });
    return result.isConfirmed;
  }
}
