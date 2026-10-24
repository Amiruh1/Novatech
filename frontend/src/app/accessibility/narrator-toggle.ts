import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ControlNarratorService } from '../core/services/control-narrator.service';

@Component({
  selector: 'app-narrator-toggle',
  standalone: true,
  template: `
    @if (shown()) {
      <button type="button" class="narrator-toggle" (click)="narrator.toggle()">{{ narrator.toggleLabel() }}</button>
    }
  `,
  styleUrl: './narrator-toggle.scss'
})
export class NarratorToggle {
  readonly narrator = inject(ControlNarratorService);
  private readonly seen = signal(this.narrator.armed());
  readonly shown = computed(() => this.narrator.armed() || this.seen());

  constructor() {
    effect(() => {
      if (this.narrator.armed()) untracked(() => this.seen.set(true));
    });
  }
}
