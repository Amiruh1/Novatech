import { Component, inject, isDevMode } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastModule } from 'primeng/toast';
import { ThemeService } from './core/services/theme.service';
import { CommonModule } from '@angular/common';
import { AccessibilityAssistant } from './accessibility/accessibility-assistant';
import { ControlNarratorService } from './core/services/control-narrator.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastModule, CommonModule, AccessibilityAssistant],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  private themeService = inject(ThemeService);
  private readonly narrator = inject(ControlNarratorService);
  title = 'novatech-frontend';

  constructor() {
    this.themeService.getTheme();
    this.registerServiceWorker();
  }

  private registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      if (isDevMode()) {
        void navigator.serviceWorker.getRegistrations().then(registrations => {
          for (const registration of registrations) {
            const script = registration.active?.scriptURL || registration.waiting?.scriptURL;
            if (script && new URL(script).pathname === '/sw.js') void registration.unregister().catch(() => {});
          }
        }).catch(() => {});
        return;
      }
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {
        });
      });
    }
  }
}
