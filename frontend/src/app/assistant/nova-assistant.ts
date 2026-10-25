import { DecimalPipe, DOCUMENT } from '@angular/common';
import { afterNextRender, Component, computed, DestroyRef, effect, ElementRef, inject, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { Drawer } from 'primeng/drawer';
import { filter } from 'rxjs';
import { NarratorToggle } from '../accessibility/narrator-toggle';
import { AccessibilityService } from '../core/services/accessibility.service';
import { ControlNarratorService } from '../core/services/control-narrator.service';
import { ConversationService, NovaAction, NovaMessage } from '../core/services/conversation.service';
import { SpeechService } from '../core/services/speech.service';
import { SILENCE_MS, VoiceInputService } from '../core/services/voice-input.service';
import { AuthModalService } from '../services/auth-modal';

const STORE_ROUTES = [/^\/tienda$/, /^\/producto\/[^/]+$/, /^\/carrito$/, /^\/checkout$/];
const BOTTOM_BARS = '.mobile-sticky-buy, .checkout-mobile-bar';
const BAR_GAP = 12;
const MIC_SUSPENSION = 'nova-microfono';
const RESUME_DELAY = 450;
const MAX_IDLE_TURNS = 2;

type VoicePhase = 'off' | 'listening' | 'thinking' | 'speaking' | 'waiting';
type Tone = 'listen' | 'sent' | 'end';

const GREETING_FIRST = 'Hola, soy Nova. Habla después del tono. Envío tu pregunta cuando hagas una pausa de tres segundos. '
  + 'Para terminar, di terminar o pulsa Alt más N.';
const GREETING_AGAIN = 'Te escucho.';
const FAREWELL = 'Hasta luego. Pulsa Alt más N cuando quieras volver a hablar.';
const IDLE_GOODBYE = 'No te escuché y cerré el micrófono. Pulsa Alt más N para volver a hablar.';
const NOTHING_TO_REPEAT = 'Todavía no te he respondido nada. Te escucho.';
const END_COMMAND = /^(?:(?:gracias|ok|bueno|nova)\s+)*(?:terminar|termina|terminamos|adios|chau|chao|hasta luego|salir|cerrar|cierra|detente|detener|para|basta|eso es todo|ya esta|nada mas)(?:\s+(?:nova|gracias|por favor))*$/;
const REPEAT_COMMAND = /^(?:(?:nova|puedes|podrias|por favor)\s+)*(?:repite|repitelo|repetir|otra vez|de nuevo|que dijiste|no te entendi|no entendi)(?:\s+(?:por favor|nova|eso|lo))*$/;
const QUICK_QUESTIONS = [
  '¿Qué productos tienen?',
  'Busco un monitor de menos de 1500 soles',
  'Lo más barato de la tienda',
  '¿Cómo pago mi pedido?',
  '¿Cuánto cuesta el envío?',
  '¿Cómo navego con el teclado?',
  '¿Cómo activo el narrador?'
];
const QUICK_ACTIONS: NovaAction[] = [
  { id: 'open_cart', label: 'Ver carrito' },
  { id: 'open_catalog', label: 'Ver catálogo' },
  { id: 'focus_catalog_search', label: 'Ir al buscador' },
  { id: 'open_accessibility', label: 'Accesibilidad' }
];
const LIST_FOLLOW_UPS = ['¿Cuál cuesta menos?', '¿Cuál es el más caro?', 'El primero'];
const PRODUCT_FOLLOW_UPS = ['¿Cómo lo compro?', '¿Qué otros productos tienen?'];
const HELP_FOLLOW_UPS = ['¿Qué productos tienen?', '¿Cómo pago mi pedido?', '¿Cómo navego con el teclado?'];

@Component({
  selector: 'app-nova-assistant',
  standalone: true,
  imports: [Drawer, RouterLink, DecimalPipe, NarratorToggle],
  templateUrl: './nova-assistant.html',
  styleUrl: './nova-assistant.scss'
})
export class NovaAssistant {
  readonly conversation = inject(ConversationService);
  readonly speech = inject(SpeechService);
  readonly voice = inject(VoiceInputService);
  private readonly narrator = inject(ControlNarratorService);
  private readonly accessibility = inject(AccessibilityService);
  private readonly authModal = inject(AuthModalService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly input = viewChild<ElementRef<HTMLInputElement>>('input');
  private readonly log = viewChild<ElementRef<HTMLElement>>('log');
  private readonly launcher = viewChild<ElementRef<HTMLButtonElement>>('launcher');
  private readonly quickToggle = viewChild<ElementRef<HTMLButtonElement>>('quickToggle');
  readonly open = signal(false);
  readonly draft = signal('');
  readonly route = signal(this.pathOf(this.router.url));
  readonly lift = signal<number | null>(null);
  readonly readAloud = signal(false);
  readonly phase = signal<VoicePhase>('off');
  readonly handsFree = computed(() => this.phase() !== 'off');
  readonly silenceSeconds = SILENCE_MS / 1000;
  readonly voiceNotice = signal('');
  readonly voiceStatus = computed(() => {
    switch (this.phase()) {
      case 'listening': return this.voice.transcript()
        ? `Te escucho: «${this.voice.transcript()}»`
        : 'Te escucho… habla cuando quieras.';
      case 'thinking': return 'Enviando tu pregunta…';
      case 'speaking': return 'Nova está respondiendo. Después te escucho de nuevo.';
      case 'waiting': return 'Preparando el micrófono…';
      default: return this.voice.error() || this.voiceNotice();
    }
  });
  readonly quickOpen = signal(false);
  readonly quickQuestions = QUICK_QUESTIONS;
  readonly quickActions = QUICK_ACTIONS;
  readonly suggestions = QUICK_QUESTIONS.slice(0, 4);
  readonly followUps = computed(() => {
    if (this.conversation.loading()) return [];
    const messages = this.conversation.messages();
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant' || last.failed) return [];
    const asked = messages[messages.length - 2]?.text.trim().toLowerCase();
    const options = last.products.length > 1 ? LIST_FOLLOW_UPS
      : last.products.length === 1 ? PRODUCT_FOLLOW_UPS : HELP_FOLLOW_UPS;
    return options.filter(option => option.toLowerCase() !== asked).slice(0, 3);
  });
  private stickToBottom = true;
  private returnFocus = true;
  private frame = 0;
  private lastSpoken = 0;
  private idleTurns = 0;
  private autoReadAloud = false;
  private resumeTimer: ReturnType<typeof setTimeout> | null = null;
  private greeted = false;
  private audio: AudioContext | null = null;
  private handledVoiceRequest = untracked(() => this.conversation.voiceRequest());

  constructor() {
    this.router.events.pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed()).subscribe(event => {
      this.route.set(this.pathOf(event.urlAfterRedirects));
      if (!this.onStoreRoute()) this.open.set(false);
    });
    const view = this.document.defaultView;
    const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => this.scheduleLift());
    const onResize = () => this.scheduleLift();
    const onVisibility = () => {
      if (this.document.visibilityState === 'hidden') this.stopVoice();
    };
    const onShortcut = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.code !== 'KeyN' || event.repeat) return;
      const target = event.target;
      if (event.key === 'Dead' && target instanceof HTMLElement && target.closest('input, textarea, [contenteditable="true"]')) return;
      if (!this.onStoreRoute()) return;
      event.preventDefault();
      event.stopPropagation();
      if (this.handsFree()) {
        this.toggleMic();
        return;
      }
      if (this.accessibility.panelOpen()) this.accessibility.closePanel();
      void this.startVoiceConversation();
    };
    afterNextRender(() => {
      const main = this.document.getElementById('main-content');
      if (main) observer?.observe(main, { childList: true, subtree: true });
      view?.addEventListener('resize', onResize);
      this.document.addEventListener('visibilitychange', onVisibility);
      this.document.addEventListener('keydown', onShortcut, true);
      this.scheduleLift();
    });
    inject(DestroyRef).onDestroy(() => {
      observer?.disconnect();
      view?.removeEventListener('resize', onResize);
      this.document.removeEventListener('visibilitychange', onVisibility);
      this.document.removeEventListener('keydown', onShortcut, true);
      if (this.frame) cancelAnimationFrame(this.frame);
      this.stopVoice();
      void this.audio?.close().catch(() => undefined);
    });
    effect(() => {
      const request = this.conversation.voiceRequest();
      untracked(() => {
        if (request === this.handledVoiceRequest) return;
        this.handledVoiceRequest = request;
        void this.startVoiceConversation();
      });
    });
    effect(() => {
      this.conversation.messages();
      this.conversation.loading();
      untracked(() => this.scrollToEnd(false));
    });
    effect(() => {
      const messages = this.conversation.messages();
      untracked(() => {
        const last = messages[messages.length - 1];
        if (!last || last.role !== 'assistant' || last.id <= this.lastSpoken) return;
        this.lastSpoken = last.id;
        const speak = this.readAloud() && this.open() && !last.failed && !this.voice.listening();
        const spoke = speak && this.speech.converse(last.speechText);
        if (this.phase() !== 'thinking') return;
        if (spoke) this.phase.set('speaking');
        else this.scheduleListen();
      });
    });
    effect(() => {
      const talking = this.speech.conversing();
      untracked(() => {
        if (!talking && this.phase() === 'speaking') this.scheduleListen();
      });
    });
  }

  toggleReadAloud(): void {
    this.autoReadAloud = false;
    if (this.readAloud()) {
      this.readAloud.set(false);
      this.speech.stopConversation();
      return;
    }
    const messages = this.conversation.messages();
    this.lastSpoken = messages.length ? messages[messages.length - 1].id : 0;
    this.readAloud.set(true);
  }

  toggleMic(): void {
    if (this.handsFree()) {
      this.endHandsFree('Conversación por voz terminada.');
      this.tone('end');
      return;
    }
    this.ensureAudio();
    this.voiceNotice.set('');
    this.quickOpen.set(false);
    this.idleTurns = 0;
    this.narrator.suspend(MIC_SUSPENSION);
    if (this.speech.supported && !this.readAloud()) {
      this.toggleReadAloud();
      this.autoReadAloud = true;
    }
    const greeting = this.greeted ? GREETING_AGAIN : GREETING_FIRST;
    this.greeted = true;
    this.phase.set('waiting');
    if (this.readAloud() && this.speech.converse(greeting)) {
      this.phase.set('speaking');
      return;
    }
    this.listenTurn();
  }

  async startVoiceConversation(): Promise<void> {
    if (!this.onStoreRoute()) {
      await this.router.navigate(['/tienda']);
      this.route.set(this.pathOf(this.router.url));
    }
    if (!this.onStoreRoute()) return;
    if (!this.open()) this.openPanel();
    if (!this.handsFree()) this.toggleMic();
  }

  stopVoice(): void {
    if (this.handsFree()) this.endHandsFree('');
    this.voice.stop();
    this.speech.stopConversation();
  }

  private listenTurn(): void {
    this.clearResume();
    if (!this.open()) {
      this.endHandsFree('');
      return;
    }
    this.speech.stopConversation();
    this.phase.set('listening');
    this.tone('listen');
    const started = this.voice.listen({
      onFinal: text => this.onHeard(text),
      onIdle: () => this.onIdleTurn(),
      onError: () => this.failVoice()
    });
    if (!started) this.failVoice();
  }

  private failVoice(): void {
    const message = this.voice.error();
    this.endHandsFree('');
    this.tone('end');
    if (message) this.speech.converse(message);
  }

  private onHeard(text: string): void {
    this.idleTurns = 0;
    const command = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9ñ\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (END_COMMAND.test(command)) {
      this.endHandsFree('Conversación por voz terminada.');
      this.tone('end');
      this.speech.converse(FAREWELL);
      return;
    }
    if (REPEAT_COMMAND.test(command)) {
      const last = [...this.conversation.messages()].reverse().find(message => message.role === 'assistant' && !message.failed);
      if (this.speech.converse(last?.speechText ?? NOTHING_TO_REPEAT)) this.phase.set('speaking');
      else this.scheduleListen();
      return;
    }
    this.tone('sent');
    if (this.conversation.send(text)) {
      this.draft.set('');
      this.stickToBottom = true;
      this.phase.set('thinking');
    } else {
      this.draft.set(text);
      this.scheduleListen();
    }
  }

  private onIdleTurn(): void {
    this.idleTurns += 1;
    if (this.idleTurns >= MAX_IDLE_TURNS) {
      this.endHandsFree('No te escuché y cerré el micrófono. Pulsa «Hablar» o Alt + N para seguir conversando.');
      this.tone('end');
      this.speech.converse(IDLE_GOODBYE);
      return;
    }
    this.listenTurn();
  }

  private scheduleListen(): void {
    if (!this.handsFree()) return;
    this.clearResume();
    this.phase.set('waiting');
    this.resumeTimer = setTimeout(() => {
      this.resumeTimer = null;
      if (this.handsFree()) this.listenTurn();
    }, RESUME_DELAY);
  }

  private endHandsFree(notice: string): void {
    const wasActive = this.handsFree();
    this.clearResume();
    this.phase.set('off');
    this.voice.stop();
    this.narrator.release(MIC_SUSPENSION);
    if (this.autoReadAloud && this.readAloud()) this.toggleReadAloud();
    this.autoReadAloud = false;
    if (wasActive) this.voiceNotice.set(notice);
  }

  private clearResume(): void {
    if (this.resumeTimer !== null) clearTimeout(this.resumeTimer);
    this.resumeTimer = null;
  }

  private ensureAudio(): void {
    if (this.audio) return;
    const view = this.document.defaultView as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext } | null;
    const Context = view?.AudioContext ?? view?.webkitAudioContext;
    if (!Context) return;
    try {
      this.audio = new Context();
    } catch {
      this.audio = null;
    }
  }

  private tone(kind: Tone): void {
    const audio = this.audio;
    if (!audio) return;
    if (audio.state === 'suspended') void audio.resume().catch(() => undefined);
    const notes = kind === 'listen' ? [660, 880] : kind === 'sent' ? [523] : [660, 440];
    let start = audio.currentTime + 0.01;
    for (const frequency of notes) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.13);
      start += 0.13;
    }
  }

  onStoreRoute(): boolean {
    return STORE_ROUTES.some(pattern => pattern.test(this.route()));
  }

  openPanel(): void {
    this.returnFocus = true;
    this.open.set(true);
  }

  onShow(): void {
    this.stickToBottom = true;
    this.scrollToEnd(true);
    setTimeout(() => this.input()?.nativeElement.focus());
  }

  onHide(): void {
    this.stopVoice();
    this.quickOpen.set(false);
    if (!this.returnFocus) return;
    setTimeout(() => (this.launcher()?.nativeElement ?? this.document.getElementById('main-content'))?.focus());
  }

  submit(event: Event): void {
    event.preventDefault();
    this.sendTyped(this.draft());
  }

  private sendTyped(text: string): boolean {
    const listening = this.phase() === 'listening' || this.phase() === 'waiting';
    if (listening) {
      this.clearResume();
      this.voice.stop();
    }
    if (!this.conversation.send(text)) {
      if (listening) this.listenTurn();
      return false;
    }
    this.draft.set('');
    this.stickToBottom = true;
    if (this.handsFree()) this.phase.set('thinking');
    return true;
  }

  ask(question: string): void {
    this.quickOpen.set(false);
    this.sendTyped(question);
    this.focusAfterChoice();
  }

  toggleQuick(): void {
    this.quickOpen.update(open => !open);
    if (this.quickOpen()) this.stickToBottom = true;
  }

  closeQuick(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !this.quickOpen()) return;
    event.stopPropagation();
    this.quickOpen.set(false);
    this.quickToggle()?.nativeElement.focus();
  }

  runQuick(action: NovaAction): void {
    this.quickOpen.set(false);
    this.run(action);
  }

  clearConversation(): void {
    this.stopVoice();
    this.voiceNotice.set('');
    this.quickOpen.set(false);
    this.conversation.clear();
    this.draft.set('');
    this.input()?.nativeElement.focus();
  }

  lines(message: NovaMessage): string[] {
    const lines = message.text.split('\n').map(line => line.trim()).filter(Boolean);
    return message.products.length ? lines.slice(0, 1) : lines;
  }

  closeForLink(): void {
    this.returnFocus = false;
    this.open.set(false);
  }

  run(action: NovaAction): void {
    switch (action.id) {
      case 'open_accessibility': return this.leave(() => this.accessibility.openPanel());
      case 'open_catalog': return this.leave(() => this.router.navigate(['/tienda']));
      case 'open_cart': return this.leave(() => this.router.navigate(['/carrito']));
      case 'open_favorites': return this.leave(() => this.router.navigate(['/favoritos']));
      case 'open_orders': return this.leave(() => this.router.navigate(['/miscompras']));
      case 'open_login': return this.leave(() => this.authModal.open({ view: 'login', mode: 'cliente', returnUrl: this.router.url }));
      case 'focus_catalog_search': return this.leave(() => this.focusSearch());
      case 'show_product': {
        const id = Number(action.productId);
        if (Number.isInteger(id) && id > 0) this.leave(() => this.router.navigate(['/producto', id]));
        return;
      }
    }
  }

  onLogScroll(): void {
    const log = this.log()?.nativeElement;
    if (log) this.stickToBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 48;
  }

  private scheduleLift(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      let top = Number.POSITIVE_INFINITY;
      for (const bar of Array.from(this.document.querySelectorAll<HTMLElement>(BOTTOM_BARS))) {
        const rect = bar.getBoundingClientRect();
        if (rect.height > 0 && this.document.defaultView?.getComputedStyle(bar).position === 'fixed') top = Math.min(top, rect.top);
      }
      const height = this.document.defaultView?.innerHeight ?? 0;
      this.lift.set(Number.isFinite(top) ? Math.max(0, Math.round(height - top)) + BAR_GAP : null);
    });
  }

  private focusAfterChoice(): void {
    const touch = this.document.defaultView?.matchMedia('(pointer: coarse)').matches;
    setTimeout(() => (touch ? this.quickToggle() : this.input())?.nativeElement.focus({ preventScroll: true }));
  }

  private leave(next: () => unknown): void {
    this.returnFocus = false;
    this.open.set(false);
    setTimeout(() => void next(), 150);
  }

  private async focusSearch(): Promise<void> {
    if (this.pathOf(this.router.url) !== '/tienda') await this.router.navigate(['/tienda']);
    setTimeout(() => {
      const search = this.document.getElementById('catalog-search');
      search?.focus();
      search?.scrollIntoView({ block: 'center', behavior: 'instant' });
    });
  }

  private scrollToEnd(force: boolean): void {
    if (!force && !this.stickToBottom) return;
    setTimeout(() => {
      const log = this.log()?.nativeElement;
      if (log) log.scrollTop = log.scrollHeight;
    });
  }

  private pathOf(url: string): string {
    return url.split(/[?#]/)[0];
  }
}
