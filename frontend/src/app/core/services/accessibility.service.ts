import { DOCUMENT } from '@angular/common';
import { computed, inject, Injectable, signal } from '@angular/core';

export interface AccessibilityPreferences {
  reading: boolean;
  navigation: boolean;
  narrator: boolean;
}

const STORAGE_KEY = 'nt_accessibility_preferences_v1';

@Injectable({ providedIn: 'root' })
export class AccessibilityService {
  private readonly document = inject(DOCUMENT);
  private readonly state = signal<AccessibilityPreferences>({ reading: false, navigation: false, narrator: false });
  readonly preferences = this.state.asReadonly();
  readonly panelOpen = signal(true);
  readonly active = computed(() => this.state().reading || this.state().navigation);
  readonly storageNotice = signal('');

  constructor() {
    try {
      const saved: unknown = JSON.parse(this.document.defaultView?.localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && typeof saved === 'object') {
        const values = saved as Record<string, unknown>;
        this.state.set({
          reading: values['reading'] === true,
          navigation: values['navigation'] === true,
          narrator: values['narrator'] === true
        });
      }
    } catch {
    }
    this.applyClasses();
  }

  setPreferences(preferences: Partial<AccessibilityPreferences>): void {
    const current = this.state();
    this.state.set({
      reading: 'reading' in preferences ? preferences.reading === true : current.reading,
      navigation: 'navigation' in preferences ? preferences.navigation === true : current.navigation,
      narrator: 'narrator' in preferences ? preferences.narrator === true : current.narrator
    });
    this.applyClasses();
    try {
      this.document.defaultView?.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state()));
      this.storageNotice.set('');
    } catch {
      this.storageNotice.set('Las ayudas están activas. Este navegador no permite recordarlas al recargar.');
    }
  }

  enableMode(mode: 'reading' | 'navigation'): void {
    this.setPreferences({ [mode]: true });
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
