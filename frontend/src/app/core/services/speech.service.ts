import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SpeechService {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly synth = this.document.defaultView?.speechSynthesis;
  private current: SpeechSynthesisUtterance | null = null;
  private pendingRead: { text: string; request: number } | null = null;
  private voiceTimer: ReturnType<typeof setTimeout> | null = null;
  private request = 0;
  private voicesSettled = false;
  private readonly latinAmericanRegions = new Set([
    'pe', 'mx', '419', 'ar', 'bo', 'bz', 'cl', 'co', 'cr', 'cu', 'do', 'ec',
    'sv', 'gt', 'hn', 'ni', 'pa', 'py', 'pr', 'uy', 've', 'us'
  ]);
  readonly supported = Boolean(this.synth && typeof SpeechSynthesisUtterance !== 'undefined');
  readonly enabled = signal(false);
  readonly speaking = signal(false);
  readonly loadingVoice = signal(false);
  readonly voiceName = signal('');
  readonly voiceLanguage = signal('');
  readonly voiceNotice = signal('');
  readonly error = signal('');

  private readonly onVoicesChanged = (): void => {
    const pending = this.pendingRead;
    if (!pending) return;
    const voice = this.preferredVoice();
    if (voice && this.isLatinAmerican(voice)) {
      this.voicesSettled = true;
      this.startReading(pending.text, voice, pending.request);
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
    });
  }

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
    const voice = this.preferredVoice();
    if ((voice && this.isLatinAmerican(voice)) || this.voicesSettled) {
      this.startReading(content, voice, this.request);
      return;
    }

    const request = this.request;
    this.pendingRead = { text: content, request };
    this.loadingVoice.set(true);
    this.voiceNotice.set('Buscando una voz en español latinoamericano…');
    this.voiceTimer = setTimeout(() => {
      if (request !== this.request) return;
      this.voicesSettled = true;
      this.startReading(content, this.preferredVoice(), request);
    }, 1200);
  }

  private startReading(content: string, voice: SpeechSynthesisVoice | undefined, request: number): void {
    if (request !== this.request || !this.enabled() || !this.synth) return;
    this.clearPendingRead();
    const utterance = new SpeechSynthesisUtterance(content);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || 'es-MX';
    utterance.rate = 0.95;
    this.voiceName.set(voice?.name || 'Voz del navegador');
    this.voiceLanguage.set(voice?.lang || '');
    this.voiceNotice.set(this.describeFallback(voice));
    this.current = utterance;
    this.speaking.set(true);
    utterance.onend = () => {
      if (this.current !== utterance) return;
      this.current = null;
      this.speaking.set(false);
    };
    utterance.onerror = event => {
      if (this.current !== utterance) return;
      this.current = null;
      this.speaking.set(false);
      if (event.error === 'canceled' || event.error === 'interrupted') return;
      this.error.set('No se pudo reproducir la voz. Intenta de nuevo con el botón Escuchar o continúa con la guía escrita.');
    };
    try {
      this.synth.speak(utterance);
    } catch {
      this.current = null;
      this.speaking.set(false);
      this.error.set('No se pudo iniciar la voz. Puedes continuar con los textos y botones.');
    }
  }

  stop(): void {
    this.request += 1;
    if (this.loadingVoice()) this.voiceNotice.set('');
    this.clearPendingRead();
    this.current = null;
    this.synth?.cancel();
    this.speaking.set(false);
  }

  disable(): void {
    this.stop();
    this.enabled.set(false);
    this.error.set('');
    this.voiceNotice.set('');
  }

  private clearPendingRead(): void {
    if (this.voiceTimer !== null) clearTimeout(this.voiceTimer);
    this.voiceTimer = null;
    this.pendingRead = null;
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
