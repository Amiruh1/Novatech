import { Component, inject, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router, RouterModule, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import {
  trigger, transition, style, animate, query
} from '@angular/animations';

import { Navbar }             from '../../navbar/navbar';
import { AuthModalComponent } from '../../auth-modal/auth-modal.component';
import { BottomNav }          from '../../bottom-nav/bottom-nav';
import { CommandPalette }     from '../../command-palette/command-palette';
import { AriaLiveService }    from '../../services/aria-live.service';
import { MessageService }     from 'primeng/api';

// ── Route transition animation ────────────────────────────────────────────────
// Sólo anima el :enter para evitar flashes de layout durante el :leave.
// prefers-reduced-motion: la media query global en styles.scss colapsa
// animation-duration a 0.01ms, por lo que este trigger se respeta automáticamente.
const routeAnim = trigger('routeAnim', [
  transition('* => *', [
    query(':enter', [
      style({ opacity: 0, transform: 'translateY(7px)' }),
      animate(
        '200ms cubic-bezier(0.16, 1, 0.3, 1)',
        style({ opacity: 1, transform: 'translateY(0)' })
      )
    ], { optional: true })
  ])
]);

@Component({
  selector: 'app-shell-layout',
  standalone: true,
  imports: [Navbar, RouterOutlet, RouterModule, AuthModalComponent, BottomNav, CommandPalette],
  templateUrl: './shell-layout.component.html',
  styleUrl:    './shell-layout.component.scss',
  animations:  [routeAnim]
})
export class ShellLayoutComponent implements OnInit, OnDestroy {
  ariaLive        = inject(AriaLiveService);
  private msgSvc  = inject(MessageService);
  private router  = inject(Router);
  private cd      = inject(ChangeDetectorRef);
  private sub     = new Subscription();

  /** Incrementa en cada NavigationEnd → desencadena routeAnim */
  routeState = 0;

  ngOnInit() {
    // ── Animación de ruta ──────────────────────────────────────────────────────
    this.sub.add(
      this.router.events.pipe(filter(e => e instanceof NavigationEnd))
        .subscribe(() => { this.routeState++; this.cd.markForCheck(); })
    );

    // ── Pipe PrimeNG toasts → aria-live region ─────────────────────────────────
    // MessageService.messageObserver es público en PrimeNG 21.
    // Convertimos cada toast en un anuncio para screen readers sin duplicar UI.
    this.sub.add(
      (this.msgSvc as any).messageObserver.subscribe((payload: any) => {
        const msg = Array.isArray(payload) ? payload[0] : payload;
        if (!msg) return;
        const text = [msg.summary, msg.detail].filter(Boolean).join('. ');
        if (text) this.ariaLive.announce(text);
      })
    );
  }

  ngOnDestroy() { this.sub.unsubscribe(); }
}
