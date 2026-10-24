import { DOCUMENT } from '@angular/common';
import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { describeControl } from '../../accessibility/control-announcement';
import { CommandPaletteService } from '../../services/command-palette.service';
import { AccessibilityService } from './accessibility.service';
import { SpeechService } from './speech.service';

interface NarratorContext {
  identity: string;
  title: string;
  kind: string;
  titleElement: Element | null;
}

interface OverlayContext {
  container: HTMLElement;
  title: string;
  kind: string;
}

const INCLUDED_ROUTES = [/^\/tienda$/, /^\/producto\/[^/]+$/, /^\/carrito$/, /^\/checkout$/];
const OVERLAYS = 'dialog, [role="dialog"], [role="alertdialog"], .p-dialog, .p-drawer, .p-overlay, .p-select-overlay, .swal2-container, .p-toast, .cp-backdrop';
const MODAL_AREAS = 'dialog.a11y-dialog, .swal2-popup:not(.swal2-toast), [data-narrator-context] .p-dialog, [data-narrator-context] .p-drawer';
const TOAST_CLOSE = '.swal2-toast .swal2-close';
const WATCHED_ATTRIBUTES = ['aria-pressed', 'aria-checked', 'aria-expanded', 'aria-selected', 'aria-activedescendant', 'aria-disabled', 'aria-label', 'disabled'];
const ASSISTANT_TITLE = '¿Cómo prefieres navegar?';
const FOCUS_DELAY = 180;
const QUIET_AFTER_MANUAL_STOP = 450;

@Injectable({ providedIn: 'root' })
export class ControlNarratorService {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly speech = inject(SpeechService);
  private readonly accessibility = inject(AccessibilityService);
  private readonly palette = inject(CommandPaletteService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly armedState = signal(false);
  private readonly usedState = signal(false);
  private readonly routeState = signal(false);
  readonly armed = this.armedState.asReadonly();
  readonly availableHere = this.routeState.asReadonly();
  readonly notice = signal('');
  readonly remembered = computed(() => this.accessibility.preferences().narrator);
  readonly offered = computed(() => this.armedState() || this.remembered() || this.usedState());
  readonly toggleLabel = computed(() => this.armedState() ? 'Silenciar narrador'
    : this.remembered() || this.usedState() ? 'Reactivar narrador' : 'Activar narrador');
  readonly statusText = computed(() => {
    if (this.notice()) return this.notice();
    if (this.armedState()) return 'Narrador activado.';
    return this.remembered() ? 'El narrador está guardado, pero en silencio hasta que pulses Reactivar narrador.' : '';
  });

  private suspended = false;
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private observer: MutationObserver | null = null;
  private watched: HTMLElement | null = null;
  private focusSerial = 0;
  private lastKey = '';
  private lastSerial = -1;
  private lastContext = '';
  private lastArea = '';
  private titleSpoken = false;
  private quietUntil = 0;
  private missedDuringManual = false;
  private pageSerial = 0;
  private assistantSerial = 0;
  private assistantWasOpen = false;
  private nextId = 1;
  private readonly ids = new WeakMap<Element, number>();
  private readonly alerts = new Map<HTMLElement, { identity: string; title: string }>();

  private readonly onFocusIn = (event: FocusEvent): void => {
    if (!this.armedState()) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    this.focusSerial += 1;
    this.watch(target);
    const area = this.areaOf(target);
    if (area !== this.lastArea) {
      this.lastArea = area;
      if (area !== 'page' && this.speech.manualActive()) this.stopAll();
    }
    this.schedule(target);
  };

  private readonly onChange = (event: Event): void => {
    if (!this.armedState()) return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || (target.type !== 'checkbox' && target.type !== 'radio')) return;
    if (this.document.activeElement === target) this.schedule(target);
  };

  private readonly onVisibilityChange = (): void => {
    if (this.document.visibilityState === 'hidden') this.interrupt();
  };

  private readonly onWindowBlur = (): void => {
    setTimeout(() => {
      if (!this.pageVisible()) this.interrupt();
    });
  };

  constructor() {
    const view = this.document.defaultView;
    this.document.addEventListener('focusin', this.onFocusIn, true);
    this.document.addEventListener('change', this.onChange, true);
    this.document.addEventListener('visibilitychange', this.onVisibilityChange);
    view?.addEventListener('blur', this.onWindowBlur);
    this.routeState.set(this.isIncluded(this.router.url));

    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(event => {
      if (event instanceof NavigationStart) this.invalidate();
      if (event instanceof NavigationEnd) {
        this.pageSerial += 1;
        this.routeState.set(this.isIncluded(event.urlAfterRedirects));
        if (!this.routeState() && !this.accessibility.panelOpen()) this.disarm();
      }
    });

    this.palette.isOpen$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(open => {
      if (open === this.suspended) return;
      this.suspended = open;
      this.invalidate();
      if (open && this.armedState()) this.stopAll();
    });

    this.speech.manualFinished$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.resumeAfterManual());
    this.speech.manualStopped$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.missedDuringManual = false;
      this.quietUntil = performance.now() + QUIET_AFTER_MANUAL_STOP;
    });

    effect(() => {
      const open = this.accessibility.panelOpen();
      untracked(() => this.onPanelChange(open));
    });

    this.destroyRef.onDestroy(() => {
      this.document.removeEventListener('focusin', this.onFocusIn, true);
      this.document.removeEventListener('change', this.onChange, true);
      this.document.removeEventListener('visibilitychange', this.onVisibilityChange);
      view?.removeEventListener('blur', this.onWindowBlur);
      this.invalidate();
      this.watch(null);
      this.alerts.clear();
    });
  }

  toggle(): void {
    if (this.armedState()) this.silence();
    else this.activate();
  }

  activate(): void {
    this.notice.set('');
    if (!this.speech.supported) {
      this.notice.set('La voz no está disponible en este navegador. Puedes seguir usando el teclado y las guías escritas.');
      return;
    }
    this.accessibility.setPreferences({ narrator: true });
    this.usedState.set(true);
    this.armedState.set(true);
    this.stopAll();
    this.invalidate();
    this.forgetFocus();
    const generation = this.generation;
    this.speech.narrate('Narrador activado. Escucharás el nombre de cada control al moverte.',
      () => this.armedState() && generation === this.generation && this.pageVisible(),
      { onFail: code => this.fail(code) });
  }

  silence(): void {
    this.armedState.set(false);
    this.invalidate();
    this.stopAll();
    this.accessibility.setPreferences({ narrator: false });
    this.usedState.set(true);
    this.notice.set('Narrador silenciado.');
  }

  disarm(): void {
    if (!this.armedState()) {
      this.invalidate();
      return;
    }
    this.armedState.set(false);
    this.invalidate();
    this.stopAll();
  }

  reset(): void {
    this.disarm();
    this.usedState.set(false);
    this.notice.set('');
  }

  registerAlert(popup: HTMLElement, title: string): void {
    this.alerts.set(popup, { identity: `alert:${this.idOf(popup)}`, title });
    this.invalidate();
    if (this.armedState() && this.speech.manualActive()) this.stopAll();
  }

  unregisterAlert(popup: HTMLElement): void {
    if (!this.alerts.delete(popup)) return;
    this.invalidate();
  }

  private fail(code: string): void {
    this.armedState.set(false);
    this.invalidate();
    this.usedState.set(true);
    this.notice.set(code === 'not-allowed'
      ? 'El navegador no permitió iniciar la voz. Usa Reactivar narrador para intentarlo de nuevo.'
      : 'No se pudo reproducir la voz del narrador. Usa Reactivar narrador para intentarlo de nuevo.');
  }

  private onPanelChange(open: boolean): void {
    if (open && !this.assistantWasOpen) this.assistantSerial += 1;
    if (!open && this.assistantWasOpen) {
      this.invalidate();
      if (!this.routeState()) this.disarm();
    }
    this.assistantWasOpen = open;
  }

  private schedule(element: HTMLElement): void {
    this.clearTimer();
    this.generation += 1;
    if (this.speech.manualActive()) {
      this.missedDuringManual = true;
      return;
    }
    if (performance.now() < this.quietUntil) return;
    this.speech.cancelNarration();
    const generation = this.generation;
    const epoch = this.speech.epoch;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.announce(element, generation, epoch);
    }, FOCUS_DELAY);
  }

  private announce(element: HTMLElement, generation: number, epoch: number): void {
    if (!this.isCurrent(element, generation, epoch)) return;
    const context = this.contextFor(element);
    if (!context) return;
    const description = describeControl(element);
    if (!description) return;
    const key = `${context.identity}|${this.idOf(element)}|${description}`;
    if (key === this.lastKey && this.lastSerial === this.focusSerial) return;
    if (context.identity !== this.lastContext) {
      this.lastContext = context.identity;
      this.titleSpoken = false;
    }
    const withTitle = !!context.title && !this.titleSpoken;
    const text = !withTitle ? description
      : context.titleElement === element ? `${context.title}, ${context.kind}`
      : `${context.title}, ${context.kind}. ${description}`;
    this.lastKey = key;
    this.lastSerial = this.focusSerial;
    const identity = context.identity;
    this.speech.narrate(text,
      () => this.isCurrent(element, generation, epoch) && this.contextFor(element)?.identity === identity,
      {
        onStart: () => {
          if (withTitle && this.lastContext === identity) this.titleSpoken = true;
        },
        onFail: code => this.fail(code)
      });
  }

  private resumeAfterManual(): void {
    const missed = this.missedDuringManual;
    this.missedDuringManual = false;
    if (!missed || !this.armedState()) return;
    const active = this.document.activeElement;
    if (!(active instanceof HTMLElement)) return;
    this.lastKey = '';
    this.schedule(active);
  }

  private contextFor(element: HTMLElement): NarratorContext | null {
    const owner = this.ownerOf(element);
    const assistant = this.document.querySelector<HTMLDialogElement>('dialog.a11y-dialog[open]');
    if (assistant) {
      if (!assistant.contains(owner)) return null;
      return {
        identity: `assistant:${this.assistantSerial}`,
        title: ASSISTANT_TITLE,
        kind: 'diálogo',
        titleElement: assistant.querySelector('#a11y-title')
      };
    }
    if (!this.routeState() || this.suspended) return null;
    const alert = this.openAlert();
    if (alert) {
      if (!alert.popup.contains(owner)) return null;
      return { identity: alert.identity, title: alert.title, kind: 'diálogo', titleElement: null };
    }
    const overlay = this.topOverlay();
    if (overlay) {
      if (!overlay.container.contains(owner)) return null;
      return { identity: `overlay:${this.idOf(overlay.container)}`, title: overlay.title, kind: overlay.kind, titleElement: null };
    }
    if (owner.matches(TOAST_CLOSE)) return { identity: 'toast', title: '', kind: '', titleElement: null };
    if (owner.closest(OVERLAYS) || !owner.closest('app-shell-layout')) return null;
    return { identity: `page:${this.pageSerial}`, title: '', kind: '', titleElement: null };
  }

  private openAlert(): { popup: HTMLElement; identity: string; title: string } | null {
    let found: { popup: HTMLElement; identity: string; title: string } | null = null;
    for (const [popup, info] of this.alerts) {
      if (!popup.isConnected) {
        this.alerts.delete(popup);
        continue;
      }
      if (!popup.classList.contains('swal2-toast')) found = { popup, ...info };
    }
    return found;
  }

  private topOverlay(): OverlayContext | null {
    let best: OverlayContext | null = null;
    let bestLayer = Number.NEGATIVE_INFINITY;
    for (const host of Array.from(this.document.querySelectorAll<HTMLElement>('[data-narrator-context]'))) {
      const container = host.querySelector<HTMLElement>('.p-dialog, .p-drawer');
      if (!container || !container.getClientRects().length) continue;
      const layer = this.layerOf(container);
      if (layer < bestLayer) continue;
      bestLayer = layer;
      best = {
        container,
        title: host.getAttribute('data-narrator-title') || '',
        kind: container.classList.contains('p-drawer') ? 'panel' : 'diálogo'
      };
    }
    return best;
  }

  private layerOf(element: HTMLElement): number {
    const view = this.document.defaultView;
    for (let node: HTMLElement | null = element; node && node !== this.document.body; node = node.parentElement) {
      const layer = Number.parseInt(view?.getComputedStyle(node).zIndex || '', 10);
      if (!Number.isNaN(layer)) return layer;
    }
    return 0;
  }

  private ownerOf(element: HTMLElement): HTMLElement {
    const overlay = element.closest<HTMLElement>('.p-select-overlay, .p-overlay');
    if (!overlay) return element;
    const list = overlay.querySelector<HTMLElement>('[role="listbox"][id]');
    const owner = list && this.document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(list.id)}"]`);
    return owner || element;
  }

  private areaOf(element: HTMLElement): string {
    const area = this.ownerOf(element).closest<HTMLElement>(MODAL_AREAS);
    return area ? `area:${this.idOf(area)}` : 'page';
  }

  private isCurrent(element: HTMLElement, generation: number, epoch: number): boolean {
    return this.armedState() && !this.suspended && generation === this.generation && epoch === this.speech.epoch
      && this.pageVisible() && element.isConnected && this.document.activeElement === element && this.isShown(element);
  }

  private isShown(element: HTMLElement): boolean {
    if (element.closest('[inert], [hidden], [aria-hidden="true"]') || !element.getClientRects().length) return false;
    const visibility = this.document.defaultView?.getComputedStyle(element).visibility;
    return visibility !== 'hidden' && visibility !== 'collapse';
  }

  private pageVisible(): boolean {
    return this.document.visibilityState === 'visible'
      && (this.document.hasFocus() || this.document.activeElement instanceof HTMLIFrameElement);
  }

  private watch(element: HTMLElement | null): void {
    this.observer?.disconnect();
    this.watched = element;
    if (!element || typeof MutationObserver === 'undefined') return;
    this.observer ??= new MutationObserver(() => this.onStateChange());
    this.observer.observe(element, { attributes: true, attributeFilter: WATCHED_ATTRIBUTES });
  }

  private onStateChange(): void {
    const element = this.watched;
    if (!element || !this.armedState() || this.document.activeElement !== element) return;
    this.schedule(element);
  }

  private interrupt(): void {
    if (!this.armedState()) return;
    this.invalidate();
    this.stopAll();
  }

  private stopAll(): void {
    this.speech.stop();
    this.quietUntil = 0;
    this.missedDuringManual = false;
  }

  private invalidate(): void {
    this.generation += 1;
    this.clearTimer();
    this.speech.cancelNarration();
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private forgetFocus(): void {
    this.lastKey = '';
    this.lastSerial = -1;
    this.lastContext = '';
    this.lastArea = '';
    this.titleSpoken = false;
  }

  private isIncluded(url: string): boolean {
    const path = url.split(/[?#]/)[0];
    return INCLUDED_ROUTES.some(route => route.test(path));
  }

  private idOf(element: Element): number {
    let id = this.ids.get(element);
    if (id === undefined) {
      id = this.nextId++;
      this.ids.set(element, id);
    }
    return id;
  }
}
