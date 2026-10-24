import { Injectable, Injector, effect, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';
import type { SweetAlertIcon, SweetAlertOptions } from 'sweetalert2';
import Swal from 'sweetalert2/dist/sweetalert2.esm.all.js';
import { AccessibilityService } from './accessibility.service';
import { ControlNarratorService } from './control-narrator.service';

const NARRATOR_TITLES = new Set(['¿Vaciar el carrito?', 'Comparador completo', 'Elige dos productos', 'Revisa el rango']);

@Injectable({ providedIn: 'root' })
export class StoreAlertsService {
  private readonly accessibility = inject(AccessibilityService);
  private readonly narrator = inject(ControlNarratorService);
  private readonly injector = inject(Injector);

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

  private narratorHooks(title: string): Pick<SweetAlertOptions, 'willOpen' | 'willClose'> {
    let detach: (() => void) | null = null;
    return {
      willOpen: popup => {
        this.narrator.registerAlert(popup, NARRATOR_TITLES.has(title) ? title : 'Aviso');
        detach = this.attachNarratorControl(popup);
      },
      willClose: popup => {
        detach?.();
        detach = null;
        this.narrator.unregisterAlert(popup);
      }
    };
  }

  private attachNarratorControl(popup: HTMLElement): () => void {
    const actions = popup.querySelector('.swal2-actions');
    if (!actions) return () => {};
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nt-alert-narrator';
    let shown = this.narrator.armed();
    button.textContent = this.narrator.toggleLabel();
    button.hidden = !shown;
    const toggle = (): void => this.narrator.toggle();
    button.addEventListener('click', toggle);
    actions.append(button);
    const watcher = effect(() => {
      const label = this.narrator.toggleLabel();
      if (this.narrator.armed()) shown = true;
      button.textContent = label;
      button.hidden = !shown;
    }, { injector: this.injector });
    return () => {
      watcher.destroy();
      button.removeEventListener('click', toggle);
      button.remove();
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
    await Swal.fire({ ...this.options(), icon: 'info', titleText: title, text, ...this.narratorHooks(title) });
  }

  async confirmClearCart(): Promise<boolean> {
    const title = '¿Vaciar el carrito?';
    const result = await Swal.fire({
      ...this.options(), icon: 'question', titleText: title,
      text: 'Se quitarán todos los productos que has añadido.',
      showCancelButton: true, confirmButtonText: 'Sí, vaciar carrito',
      cancelButtonText: 'Conservar productos', focusCancel: true,
      returnFocus: false,
      ...this.narratorHooks(title)
    });
    return result.isConfirmed;
  }
}
