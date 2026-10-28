import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';
import { filter, Subject } from 'rxjs';

type SpeechChannel = 'manual' | 'narration' | 'conversation';

export interface NarrationHooks {
  onStart?: () => void;
  onFail?: (code: string) => void;
}

interface SpeechRequest extends NarrationHooks {
  channel: SpeechChannel;
  text: string;
  id: number;
  guard?: () => boolean;
}

@Injectable({ providedIn: 'root' })
export class SpeechService {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly synth = this.document.defaultView?.speechSynthesis;
  private current: { utterance: SpeechSynthesisUtterance; channel: SpeechChannel } | null = null;
  private pending: SpeechRequest | null = null;
  private voiceTimer: ReturnType<typeof setTimeout> | null = null;
  private request = 0;
  private cancellations = 0;
  private voicesSettled = false;
  private readonly manualFinished = new Subject<void>();
  private readonly manualStopped = new Subject<void>();
  private readonly latinAmericanRegions = new Set([
    'pe', 'mx', '419', 'ar', 'bo', 'bz', 'cl', 'co', 'cr', 'cu', 'do', 'ec',
    'sv', 'gt', 'hn', 'ni', 'pa', 'py', 'pr', 'uy', 've', 'us'
  ]);
  readonly supported = Boolean(this.synth && typeof SpeechSynthesisUtterance !== 'undefined');
  readonly enabled = signal(false);
  readonly speaking = signal(false);
  readonly manualActive = signal(false);
  readonly narrating = signal(false);
  readonly conversing = signal(false);
  readonly loadingVoice = signal(false);
  readonly voiceName = signal('');
  readonly voiceLanguage = signal('');
  readonly voiceNotice = signal('');
  readonly error = signal('');
  readonly manualFinished$ = this.manualFinished.asObservable();
  readonly manualStopped$ = this.manualStopped.asObservable();

  private readonly onVoicesChanged = (): void => {
    const pending = this.pending;
    if (!pending) return;
    const voice = this.preferredVoice();
    if (voice && this.isLatinAmerican(voice)) {
      this.voicesSettled = true;
      this.speak(pending, voice);
    }
  };

  constructor() {
    this.synth?.addEventListener('voiceschanged', this.onVoicesChanged);
    this.synth?.getVoices();
    this.router.events.pipe(
      filter(event => event instanceof NavigationStart),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => this.stop());
    this.destroyRef.onDestroy(() => {
      this.stop();
      this.synth?.removeEventListener('voiceschanged', this.onVoicesChanged);
      this.manualFinished.complete();
      this.manualStopped.complete();
    });
  }

  get epoch(): number { return this.cancellations; }

  read(text: string): void {
    this.stop();
    this.error.set('');
    if (!this.supported || !this.synth) {
      this.enabled.set(false);
      this.error.set('La voz no está disponible en este navegador. Puedes usar la guía escrita y los botones.');
      return;
    }
    const content = text.replace(/\s+/g, ' ').trim().slice(0, 5000);
    if (!content) return;
    this.enabled.set(true);
    this.manualActive.set(true);
    this.schedule({ channel: 'manual', text: content, id: ++this.request });
  }

  converse(text: string): boolean {
    this.stop();
    this.error.set('');
    if (!this.supported || !this.synth) return false;
    const content = text.replace(/\s+/g, ' ').trim().slice(0, 2000);
    if (!content) return false;
    this.manualActive.set(true);
    this.conversing.set(true);
    this.schedule({ channel: 'conversation', text: content, id: ++this.request });
    return this.conversing();
  }

  stopConversation(): void {
    if (this.conversing()) this.stop();
  }

  narrate(text: string, guard: () => boolean, hooks: NarrationHooks = {}): boolean {
    if (!this.supported || !this.synth) {
      hooks.onFail?.('unsupported');
      return false;
    }
    if (this.manualActive()) return false;
    const content = text.replace(/\s+/g, ' ').trim().slice(0, 400);
    if (!content) return false;
    this.cancelNarration();
    this.schedule({ channel: 'narration', text: content, id: ++this.request, guard, ...hooks });
    return true;
  }

  cancelNarration(): void {
    if (this.pending?.channel === 'narration') this.clearPending();
    if (this.current?.channel !== 'narration') return;
    this.current = null;
    this.synth?.cancel();
    this.narrating.set(false);
  }

  stop(): void {
    const manualWasActive = this.manualActive();
    this.request += 1;
    this.cancellations += 1;
    if (this.loadingVoice()) this.voiceNotice.set('');
    this.clearPending();
    this.current = null;
    this.synth?.cancel();
    this.speaking.set(false);
    this.narrating.set(false);
    this.conversing.set(false);
    this.manualActive.set(false);
    if (manualWasActive) this.manualStopped.next();
  }

  disable(): void {
    this.stop();
    this.enabled.set(false);
    this.error.set('');
    this.voiceNotice.set('');
  }

  private schedule(request: SpeechRequest): void {
    const voice = this.preferredVoice();
    if ((voice && this.isLatinAmerican(voice)) || this.voicesSettled) {
      this.speak(request, voice);
      return;
    }
    this.clearPending();
    this.pending = request;
    if (request.channel === 'manual') {
      this.loadingVoice.set(true);
      this.voiceNotice.set('Buscando una voz en español latinoamericano…');
    }
    this.voiceTimer = setTimeout(() => {
      if (this.pending !== request) return;
      this.voicesSettled = true;
      this.speak(request, this.preferredVoice());
    }, 1200);
  }

  private speak(request: SpeechRequest, voice: SpeechSynthesisVoice | undefined): void {
    if (this.pending === request) this.clearPending();
    if (request.id !== this.request || !this.synth) return;
    const manual = request.channel !== 'narration';
    const conversation = request.channel === 'conversation';
    if (request.channel === 'manual' && !this.enabled()) {
      this.manualActive.set(false);
      return;
    }
    if (!manual && (this.manualActive() || !request.guard?.())) return;
    const utterance = new SpeechSynthesisUtterance(request.text);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || 'es-MX';
    utterance.rate = conversation ? 1.15 : 0.95;
    this.voiceName.set(voice?.name || 'Voz del navegador');
    this.voiceLanguage.set(voice?.lang || '');
    if (manual) this.voiceNotice.set(this.describeFallback(voice));
    this.current = { utterance, channel: request.channel };
    (manual ? this.speaking : this.narrating).set(true);
    utterance.onstart = () => {
      if (this.current?.utterance === utterance) request.onStart?.();
    };
    utterance.onend = () => {
      if (this.current?.utterance !== utterance) return;
      this.current = null;
      if (manual) {
        this.speaking.set(false);
        this.conversing.set(false);
        this.manualActive.set(false);
        this.manualFinished.next();
      } else {
        this.narrating.set(false);
      }
    };
    utterance.onerror = event => {
      if (this.current?.utterance !== utterance) return;
      this.current = null;
      const cancelled = event.error === 'canceled' || event.error === 'interrupted';
      if (manual) {
        this.speaking.set(false);
        this.conversing.set(false);
        this.manualActive.set(false);
        if (!cancelled) this.error.set(event.error === 'not-allowed'
          ? 'El navegador bloqueó la voz. Permite el sonido en los permisos de este sitio y vuelve a intentarlo.'
          : 'No se pudo reproducir la voz. Puedes seguir leyendo las respuestas o intentarlo de nuevo.');
        return;
      }
      this.narrating.set(false);
      if (!cancelled) request.onFail?.(event.error);
    };
    try {
      this.synth.speak(utterance);
    } catch {
      this.current = null;
      if (manual) {
        this.speaking.set(false);
        this.conversing.set(false);
        this.manualActive.set(false);
        this.error.set('No se pudo iniciar la voz. Puedes continuar con los textos y botones.');
      } else {
        this.narrating.set(false);
        request.onFail?.('synthesis-failed');
      }
    }
  }

  private clearPending(): void {
    if (this.voiceTimer !== null) clearTimeout(this.voiceTimer);
    this.voiceTimer = null;
    this.pending = null;
    this.loadingVoice.set(false);
  }

  private preferredVoice(): SpeechSynthesisVoice | undefined {
    return this.synth?.getVoices()
      .filter(voice => /^es(?:[-_]|$)/i.test(voice.lang))
      .sort((first, second) => this.voicePriority(first) - this.voicePriority(second))[0];
  }

  private voiceRegion(voice: SpeechSynthesisVoice): string {
    return voice.lang.toLowerCase().replace(/_/g, '-').split('-').slice(1)
      .find(part => /^[a-z]{2}$|^419$/.test(part)) || '';
  }

  private isLatinAmerican(voice: SpeechSynthesisVoice): boolean {
    return this.latinAmericanRegions.has(this.voiceRegion(voice));
  }

  private voicePriority(voice: SpeechSynthesisVoice): number {
    const region = this.voiceRegion(voice);
    if (region === 'pe') return 0;
    if (region === 'mx') return 1;
    if (region === '419') return 2;
    if (region === 'us') return 4;
    if (this.isLatinAmerican(voice)) return 3;
    return region === 'es' ? 6 : 5;
  }

  private describeFallback(voice: SpeechSynthesisVoice | undefined): string {
    if (voice && this.isLatinAmerican(voice)) return '';
    if (voice && this.voiceRegion(voice) === 'es') {
      return 'No hay una voz latinoamericana disponible en este navegador. Se usará español de España.';
    }
    if (voice) {
      return 'La voz disponible está en español; el navegador no indica un acento latinoamericano.';
    }
    return this.synth?.getVoices().length
      ? 'No se detectó una voz en español. Se solicitará español de México; el acento depende del navegador.'
      : 'No se pudieron detectar las voces disponibles. Se solicitará español de México; el acento depende del navegador.';
  }
}
