import { Component, inject, OnInit, OnDestroy, ChangeDetectorRef, signal, ElementRef, HostListener } from '@angular/core';
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
import { AccessibilityToolbar } from '../../accessibility/accessibility-toolbar';
import { AccessibilityService } from '../../core/services/accessibility.service';
import { moveFocusWithArrow } from '../../accessibility/arrow-navigation';
import { NovaAssistant } from '../../assistant/nova-assistant';

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
  imports: [Navbar, RouterOutlet, RouterModule, AuthModalComponent, BottomNav, CommandPalette, AccessibilityToolbar, NovaAssistant],
  templateUrl: './shell-layout.component.html',
  styleUrl:    './shell-layout.component.scss',
  animations:  [routeAnim]
})
export class ShellLayoutComponent implements OnInit, OnDestroy {
  ariaLive        = inject(AriaLiveService);
  readonly accessibility = inject(AccessibilityService);
  private readonly element = inject(ElementRef<HTMLElement>);
  private readonly motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  readonly reducedMotion = signal(this.motionQuery.matches);
  private readonly onMotionChange = (event: MediaQueryListEvent) => this.reducedMotion.set(event.matches);
  private msgSvc  = inject(MessageService);
  private router  = inject(Router);
  private cd      = inject(ChangeDetectorRef);
  private sub     = new Subscription();

  routeState = 0;

  @HostListener('keydown', ['$event'])
  onNavigationKey(event: KeyboardEvent) {
    const isCatalog = this.router.url.split(/[?#]/)[0] === '/tienda';
    if ((isCatalog || this.accessibility.preferences().navigation) && !this.accessibility.panelOpen()) {
      moveFocusWithArrow(event, this.element.nativeElement);
    }
  }

  ngOnInit() {
    this.motionQuery.addEventListener('change', this.onMotionChange);
    this.sub.add(
      this.router.events.pipe(filter(e => e instanceof NavigationEnd))
        .subscribe(() => { this.routeState++; this.cd.markForCheck(); })
    );

    this.sub.add(
      (this.msgSvc as any).messageObserver.subscribe((payload: any) => {
        const msg = Array.isArray(payload) ? payload[0] : payload;
        if (!msg) return;
        const text = [msg.summary, msg.detail].filter(Boolean).join('. ');
        if (text) this.ariaLive.announce(text);
      })
    );
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
    this.motionQuery.removeEventListener('change', this.onMotionChange);
  }
}
