import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';

export type NovaActionId = 'open_accessibility' | 'open_catalog' | 'open_cart' | 'open_favorites' | 'open_orders'
  | 'open_login' | 'focus_catalog_search' | 'show_product';

export interface NovaProduct {
  id: number;
  nombre: string;
  marca: string | null;
  categoria: string | null;
  precio: number;
  precioFinal: number;
  enOferta: boolean;
  disponible: boolean;
  imagen: string | null;
}

export interface NovaAction {
  id: NovaActionId;
  label: string;
  productId?: number;
}

export interface NovaMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  speechText: string;
  products: NovaProduct[];
  actions: NovaAction[];
  failed: boolean;
}

interface NovaReply {
  requestId: string;
  answer: string;
  speechText: string;
  products: NovaProduct[];
  actions: NovaAction[];
  source: string;
}

const HISTORY_TURNS = 6;
const HISTORY_CHARS = 4000;
const MAX_MESSAGE = 1000;

@Injectable({ providedIn: 'root' })
export class ConversationService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly url = `${API_BASE_URL}/asistente/consulta`;
  private pending: Subscription | null = null;
  private generation = 0;
  private nextId = 1;
  readonly messages = signal<NovaMessage[]>([]);
  readonly loading = signal(false);
  readonly voiceRequest = signal(0);

  requestVoice(): void {
    this.voiceRequest.update(count => count + 1);
  }

  send(text: string): boolean {
    const message = text.replace(/\s+/g, ' ').trim().slice(0, MAX_MESSAGE);
    if (!message || this.loading()) return false;
    const history = this.historyFor();
    const productIds = this.lastProductIds();
    this.push({ role: 'user', text: message });
    this.loading.set(true);
    const generation = ++this.generation;
    this.pending = this.http.post<NovaReply>(this.url, {
      message,
      route: this.router.url.split(/[?#]/)[0],
      history,
      productIds
    }).subscribe({
      next: reply => {
        if (generation !== this.generation) return;
        this.finish();
        this.push({
          role: 'assistant',
          text: reply.answer,
          speechText: reply.speechText,
          products: Array.isArray(reply.products) ? reply.products : [],
          actions: Array.isArray(reply.actions) ? reply.actions : []
        });
      },
      error: (error: HttpErrorResponse) => {
        if (generation !== this.generation) return;
        this.finish();
        const detail = error.status === 429 || error.status === 400 ? error.error?.message : '';
        this.push({
          role: 'assistant',
          text: detail || 'No pude responder ahora. Revisa tu conexión e inténtalo de nuevo.',
          failed: true
        });
      }
    });
    return true;
  }

  cancel(): void {
    if (!this.loading()) return;
    this.generation += 1;
    this.finish();
    this.push({ role: 'assistant', text: 'Consulta cancelada.', failed: true });
  }

  clear(): void {
    this.generation += 1;
    this.finish();
    this.messages.set([]);
  }

  private finish(): void {
    this.pending?.unsubscribe();
    this.pending = null;
    this.loading.set(false);
  }

  private push(message: Partial<NovaMessage> & Pick<NovaMessage, 'role' | 'text'>): void {
    this.messages.update(list => [...list, {
      id: this.nextId++,
      speechText: message.text,
      products: [],
      actions: [],
      failed: false,
      ...message
    }]);
  }

  private historyFor(): { role: 'user' | 'assistant'; text: string }[] {
    const turns: { role: 'user' | 'assistant'; text: string }[] = [];
    let total = 0;
    for (const message of [...this.messages()].reverse()) {
      if (message.failed) continue;
      const text = message.text.slice(0, MAX_MESSAGE);
      if (turns.length >= HISTORY_TURNS || total + text.length > HISTORY_CHARS) break;
      total += text.length;
      turns.unshift({ role: message.role, text });
    }
    return turns;
  }

  private lastProductIds(): number[] {
    const last = [...this.messages()].reverse().find(message => message.role === 'assistant' && message.products.length);
    return last ? last.products.map(product => product.id).slice(0, 5) : [];
  }
}
