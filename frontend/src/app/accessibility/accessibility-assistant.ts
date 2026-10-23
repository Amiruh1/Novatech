import { DOCUMENT } from '@angular/common';
import { Component, effect, ElementRef, inject, OnDestroy, signal, untracked, viewChild } from '@angular/core';
import { AccessibilityService } from '../core/services/accessibility.service';
import { SpeechService } from '../core/services/speech.service';
import { moveFocusWithArrow } from './arrow-navigation';

const GUIDE = 'Guía por voz activada. Usa Tab para avanzar y Shift más Tab para retroceder. '
  + 'También puedes usar flecha abajo o derecha para avanzar, y arriba o izquierda para retroceder en este asistente. '
  + 'Activa el botón seleccionado con Enter y marca las ayudas con Espacio. '
  + 'Puedes elegir Texto y contraste, Controles amplios y navegación, o ambas opciones. '
  + 'Después activa Aplicar y continuar. La tecla K o Escape cierra esta guía y detiene la voz. '
  + 'En la tienda encontrarás botones Escuchar para leer información de los productos.';

@Component({
  selector: 'app-accessibility-assistant',
  standalone: true,
  templateUrl: './accessibility-assistant.html',
  styleUrl: './accessibility-assistant.scss'
})
export class AccessibilityAssistant implements OnDestroy {
  readonly accessibility = inject(AccessibilityService);
  readonly speech = inject(SpeechService);
  private readonly document = inject(DOCUMENT);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('welcome');
  private readonly title = viewChild<ElementRef<HTMLElement>>('heading');
  private readonly voiceButton = viewChild<ElementRef<HTMLButtonElement>>('voiceButton');
  private returnFocus: HTMLElement | null = null;
  private focusFrame = 0;
  readonly reading = signal(false);
  readonly navigation = signal(false);
  readonly notice = signal('');

  constructor() {
    effect(() => {
      const element = this.dialog()?.nativeElement;
      const open = this.accessibility.panelOpen();
      // A route entry can enable a profile while the welcome is already open.
      const preferences = this.accessibility.preferences();
      if (!element) return;
      if (open) {
        this.reading.set(preferences.reading);
        this.navigation.set(preferences.navigation);
        if (!element.open) {
          this.returnFocus = this.document.activeElement instanceof HTMLElement
            && this.document.activeElement !== this.document.body ? this.document.activeElement : null;
          this.notice.set('');
          element.showModal();
          this.document.body.classList.add('a11y-modal-open');
          this.focusFrame = requestAnimationFrame(() => this.title()?.nativeElement.focus());
        }
      } else if (element.open) {
        element.close();
        this.document.body.classList.remove('a11y-modal-open');
        untracked(() => this.restoreFocus());
      }
    });
  }

  enableVoice(): void { this.speech.read(GUIDE); }

  disableVoice(): void {
    this.speech.disable();
    requestAnimationFrame(() => this.voiceButton()?.nativeElement.focus());
  }

  apply(): void {
    this.accessibility.setPreferences({ reading: this.reading(), navigation: this.navigation() });
    this.speech.stop();
    this.accessibility.closePanel();
  }

  skip(): void {
    this.speech.disable();
    this.accessibility.closePanel();
  }

  cancel(event: Event): void {
    event.preventDefault();
    this.skip();
  }

  reset(): void {
    this.reading.set(false);
    this.navigation.set(false);
    this.accessibility.setPreferences({ reading: false, navigation: false });
    this.speech.disable();
    this.notice.set('Vista habitual restaurada. Puedes elegir otras ayudas o continuar.');
  }

  onKeydown(event: KeyboardEvent): void {
    const dialog = this.dialog()?.nativeElement;
    if (this.accessibility.panelOpen() && dialog && moveFocusWithArrow(event, dialog, true)) return;
    if (this.accessibility.panelOpen() && event.key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey) {
      const controls = [...(this.dialog()?.nativeElement.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'
      ) || [])].filter(element => element.getClientRects().length > 0);
      const index = controls.indexOf(this.document.activeElement as HTMLElement);
      if (controls.length && (index < 0 || (event.shiftKey ? index === 0 : index === controls.length - 1))) {
        event.preventDefault();
        controls[event.shiftKey ? controls.length - 1 : 0].focus();
      }
      return;
    }
    if (this.accessibility.panelOpen() && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.skip();
      return;
    }
    if (!this.accessibility.panelOpen() || event.repeat || event.isComposing
      || event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest(
      'textarea, select, [contenteditable="true"], input:not([type="checkbox"]):not([type="radio"])'
    )) return;
    if (event.key.toLowerCase() === 'f') {
      event.preventDefault();
      event.stopPropagation();
      this.enableVoice();
    } else if (event.key.toLowerCase() === 'k') {
      event.preventDefault();
      event.stopPropagation();
      this.skip();
    }
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.focusFrame);
    this.document.body.classList.remove('a11y-modal-open');
    this.dialog()?.nativeElement.close();
  }

  private restoreFocus(): void {
    cancelAnimationFrame(this.focusFrame);
    this.focusFrame = requestAnimationFrame(() => {
      const overlay = [...this.document.querySelectorAll<HTMLElement>('.p-dialog, .p-drawer')]
        .reverse().find(element => element.getClientRects().length > 0);
      if (overlay && !overlay.contains(this.returnFocus)) {
        const control = [...overlay.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex="0"]')]
          .find(element => element.getClientRects().length > 0);
        (control || overlay).focus({ preventScroll: true });
        return;
      }
      const target = this.returnFocus?.isConnected ? this.returnFocus
        : this.document.querySelector<HTMLElement>('#main-content');
      target?.focus({ preventScroll: true });
    });
  }
}
