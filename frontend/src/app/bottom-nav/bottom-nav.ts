import { Component, inject, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule }                    from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { Subscription, filter }            from 'rxjs';
import { Cart }                            from '../services/cart';
import { AuthService }                     from '../services/auth';
import { AuthModalService }                from '../services/auth-modal';

@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './bottom-nav.html',
  styleUrl: './bottom-nav.scss'
})
export class BottomNav implements OnInit, OnDestroy {
  private router           = inject(Router);
  private cart             = inject(Cart);
  private auth             = inject(AuthService);
  private authModalService = inject(AuthModalService);
  private cd               = inject(ChangeDetectorRef);
  private subs             = new Subscription();

  cartCount  = 0;
  currentUrl = '';

  ngOnInit() {
    this.cartCount  = this.cart.getItemCount();
    this.currentUrl = this.router.url;

    this.subs.add(
      this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe((e: any) => {
        this.currentUrl = e.urlAfterRedirects || e.url;
        this.cartCount  = this.cart.getItemCount();
        this.cd.detectChanges();
      })
    );
  }

  ngOnDestroy() { this.subs.unsubscribe(); }

  isActive(path: string): boolean {
    return this.currentUrl.startsWith(path);
  }

  irATienda()   { this.router.navigate(['/tienda']); }
  irACarrito()  { this.router.navigate(['/carrito']); }

  irACuenta() {
    if (this.auth.isAuthenticated) {
      this.router.navigate(['/configuracion']);
    } else {
      this.authModalService.open({ view: 'login', mode: 'cliente', returnUrl: '/configuracion' });
    }
  }

  irAFavoritos() {
    this.router.navigate(['/favoritos']);
  }
}
