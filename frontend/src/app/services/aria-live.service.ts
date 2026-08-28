import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AriaLiveService {
  readonly message = signal('');

  announce(text: string) {
    // Vaciar primero para que el screen reader re-detecte el cambio
    // aunque el texto sea el mismo que el anterior
    this.message.set('');
    setTimeout(() => this.message.set(text), 50);
  }
}
