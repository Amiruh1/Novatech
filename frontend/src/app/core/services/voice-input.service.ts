import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable, signal } from '@angular/core';

type RecognitionConstructor = new () => any;

export interface ListenHandlers {
  onFinal: (text: string) => void;
  onIdle?: () => void;
  onError?: (code: string) => void;
}

export const SILENCE_MS = 3_000;
const IDLE_MS = 10_000;
const MAX_TURN_MS = 45_000;
const MAX_RESTARTS = 6;

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'El micrófono está bloqueado para este sitio. Abre los permisos junto a la dirección, permite el micrófono y vuelve a pulsar Hablar.',
  'service-not-allowed': 'El navegador bloqueó el servicio de dictado. Prueba en Chrome o Edge, o escribe tu pregunta.',
  'audio-capture': 'No se encontró un micrófono. Puedes escribir tu pregunta.',
  network: 'El dictado necesita conexión a internet. Puedes escribir tu pregunta.',
  'language-not-supported': 'El navegador no puede dictar en español. Puedes escribir tu pregunta.'
};

@Injectable({ providedIn: 'root' })
export class VoiceInputService {
  private readonly document = inject(DOCUMENT);
  private readonly constructorRef: RecognitionConstructor | undefined = (() => {
    const view = this.document.defaultView as any;
    return view?.SpeechRecognition ?? view?.webkitSpeechRecognition;
  })();
  private recognition: any = null;
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private session = 0;
  readonly supported = !!this.constructorRef;
  readonly starting = signal(false);
  readonly listening = signal(false);
  readonly transcript = signal('');
  readonly heardTick = signal(0);
  readonly error = signal('');

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  listen(handlers: ListenHandlers): boolean {
    this.stop();
    this.error.set('');
    this.transcript.set('');
    if (!this.constructorRef) {
      this.error.set('Este navegador no permite dictar. Puedes escribir tu pregunta.');
      return false;
    }
    const session = ++this.session;
    const recognition = new this.constructorRef();
    recognition.lang = 'es-PE';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    let carried = '';
    let current = '';
    let done = false;
    let failed = false;
    let restarts = 0;
    const heard = () => `${carried} ${current}`.replace(/\s+/g, ' ').trim();
    const end = () => {
      if (done || session !== this.session) return;
      done = true;
      const text = heard();
      this.stop();
      if (text) handlers.onFinal(text);
      else handlers.onIdle?.();
    };

    recognition.onstart = () => {
      if (session !== this.session || done) return;
      this.starting.set(false);
      this.listening.set(true);
      if (this.silenceTimer === null) this.silenceTimer = setTimeout(end, IDLE_MS);
      if (this.turnTimer === null) this.turnTimer = setTimeout(end, MAX_TURN_MS);
    };
    recognition.onresult = (event: any) => {
      if (session !== this.session || done) return;
      current = Array.from(event.results as ArrayLike<any>).map(result => result[0]?.transcript ?? '').join(' ');
      const text = heard();
      if (!text) return;
      this.transcript.set(text);
      this.heardTick.update(tick => tick + 1);
      this.clearSilence();
      this.silenceTimer = setTimeout(end, SILENCE_MS);
    };
    recognition.onerror = (event: any) => {
      if (session !== this.session || done) return;
      const code = String(event?.error ?? '');
      if (code === 'no-speech' || code === 'aborted') return;
      failed = true;
      done = true;
      this.error.set(ERROR_MESSAGES[code] ?? 'No se pudo usar el micrófono. Puedes escribir tu pregunta.');
      this.stop();
      handlers.onError?.(code);
    };
    recognition.onend = () => {
      if (session !== this.session || done || failed) return;
      carried = heard();
      current = '';
      if (restarts >= MAX_RESTARTS) {
        end();
        return;
      }
      restarts += 1;
      try {
        recognition.start();
      } catch {
        end();
      }
    };

    this.recognition = recognition;
    this.starting.set(true);
    try {
      recognition.start();
    } catch {
      this.stop();
      this.error.set('No se pudo iniciar el micrófono. Puedes escribir tu pregunta.');
      return false;
    }
    return true;
  }

  stop(): void {
    const recognition = this.recognition;
    this.session += 1;
    this.recognition = null;
    this.clearSilence();
    if (this.turnTimer !== null) clearTimeout(this.turnTimer);
    this.turnTimer = null;
    this.starting.set(false);
    this.listening.set(false);
    try {
      recognition?.abort();
    } catch {
      return;
    }
  }

  private clearSilence(): void {
    if (this.silenceTimer !== null) clearTimeout(this.silenceTimer);
    this.silenceTimer = null;
  }
}
