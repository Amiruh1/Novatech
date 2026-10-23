import { DOCUMENT } from '@angular/common';
import { computed, inject, Injectable, signal } from '@angular/core';

export interface AccessibilityPreferences {
  reading: boolean;
  navigation: boolean;
}

const STORAGE_KEY = 'nt_accessibility_preferences_v1';

@Injectable({ providedIn: 'root' })
export class AccessibilityService {
  private readonly document = inject(DOCUMENT);
  private readonly state = signal<AccessibilityPreferences>({ reading: false, navigation: false });
  readonly preferences = this.state.asReadonly();
  readonly panelOpen = signal(true);
  readonly active = computed(() => this.state().reading || this.state().navigation);
  readonly storageNotice = signal('');

  constructor() {
    try {
      const saved: unknown = JSON.parse(this.document.defaultView?.localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && typeof saved === 'object') {
        const values = saved as Record<string, unknown>;
        this.state.set({ reading: values['reading'] === true, navigation: values['navigation'] === true });
      }
    } catch {
    }
    this.applyClasses();
  }

  setPreferences(preferences: AccessibilityPreferences): void {
    this.state.set({ reading: preferences.reading === true, navigation: preferences.navigation === true });
    this.applyClasses();
    try {
      this.document.defaultView?.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state()));
      this.storageNotice.set('');
    } catch {
      this.storageNotice.set('Las ayudas están activas. Este navegador no permite recordarlas al recargar.');
    }
  }

  enableMode(mode: 'reading' | 'navigation'): void {
    this.setPreferences({ ...this.state(), [mode]: true });
    this.openPanel();
  }

  openPanel(): void { this.panelOpen.set(true); }
  closePanel(): void { this.panelOpen.set(false); }

  private applyClasses(): void {
    const { reading, navigation } = this.state();
    this.document.documentElement.classList.toggle('a11y-reading', reading);
    this.document.body.classList.toggle('a11y-reading', reading);
    this.document.body.classList.toggle('a11y-navigation', navigation);
  }
}
