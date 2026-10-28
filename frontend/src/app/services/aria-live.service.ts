import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AriaLiveService {
  readonly message = signal('');

  announce(text: string) {
    this.message.set('');
    setTimeout(() => this.message.set(text), 50);
  }
}
