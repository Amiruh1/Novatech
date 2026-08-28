import { Injectable, OnDestroy, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth';

export type AppTheme = 'ocean' | 'sunset';

export interface AppThemeOption {
  key: AppTheme;
  label: string;
  description: string;
}

const THEME_STORAGE_KEY_PREFIX = 'nt_theme_user_';
const THEME_CLASS_PREFIX = 'theme-';
const DEFAULT_THEME: AppTheme = 'ocean';

const THEME_OPTIONS: AppThemeOption[] = [
  {
    key: 'ocean',
    label: 'Oceano',
    description: 'Turquesa fresco para operacion diaria'
  },
  {
    key: 'sunset',
    label: 'Atardecer',
    description: 'Acentos calidos para panel comercial'
  }
];

@Injectable({
  providedIn: 'root'
})
export class ThemeService implements OnDestroy {
  private authService = inject(AuthService);
  private readonly validThemes = new Set<AppTheme>(THEME_OPTIONS.map((item) => item.key));
  private readonly subscriptions = new Subscription();
  private currentTheme: AppTheme = DEFAULT_THEME;
  private activeUserId: number | null = null;

  constructor() {
    this.bootstrapThemeScope();
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  getThemeOptions(): AppThemeOption[] {
    return THEME_OPTIONS;
  }

  getTheme(): AppTheme {
    return this.currentTheme;
  }

  setTheme(theme: AppTheme, persist: boolean = true): void {
    const nextTheme = this.validThemes.has(theme) ? theme : DEFAULT_THEME;

    this.currentTheme = nextTheme;
    this.applyThemeToBody(nextTheme);

    if (persist && this.canUseBrowserApis() && this.activeUserId) {
      localStorage.setItem(this.buildUserThemeKey(this.activeUserId), nextTheme);
    }
  }

  private bootstrapThemeScope() {
    const initialUserId = this.extractUserId(this.authService.currentUserValue);
    this.syncThemeForUser(initialUserId);

    this.subscriptions.add(
      this.authService.currentUser$.subscribe((user) => {
        const nextUserId = this.extractUserId(user);
        this.syncThemeForUser(nextUserId);
      })
    );
  }

  private syncThemeForUser(userId: number | null): void {
    this.activeUserId = userId;

    if (!this.canUseBrowserApis()) {
      this.setTheme(DEFAULT_THEME, false);
      return;
    }

    if (!userId) {
      this.setTheme(DEFAULT_THEME, false);
      return;
    }

    const savedTheme = localStorage.getItem(this.buildUserThemeKey(userId)) as AppTheme | null;

    if (savedTheme && this.validThemes.has(savedTheme)) {
      this.setTheme(savedTheme, false);
      return;
    }

    this.setTheme(DEFAULT_THEME, false);
  }

  private applyThemeToBody(theme: AppTheme): void {
    if (typeof document === 'undefined') {
      return;
    }

    document.body.classList.remove(
      ...THEME_OPTIONS.map((option) => `${THEME_CLASS_PREFIX}${option.key}`)
    );

    document.body.classList.add(`${THEME_CLASS_PREFIX}${theme}`);
  }

  private canUseBrowserApis(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  }

  private extractUserId(user: unknown): number | null {
    const id = Number((user as { id?: unknown } | null)?.id || 0);
    return id > 0 ? id : null;
  }

  private buildUserThemeKey(userId: number): string {
    return `${THEME_STORAGE_KEY_PREFIX}${userId}`;
  }
}
