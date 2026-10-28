import { Component, HostListener, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../services/auth';
import { Cart } from '../services/cart';
import { ProductsService } from '../services/products';
import { SalesService } from '../services/sales';
import { AuthModalService } from '../services/auth-modal';
import { ProductModel } from '../core/models/product.model';
import { SaleModel } from '../core/models/sale.model';
import { AppTheme, AppThemeOption, ThemeService } from '../core/services/theme.service';
import { Subscription, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';

import { ButtonModule } from 'primeng/button';
import { BadgeModule } from 'primeng/badge';
import { TooltipModule } from 'primeng/tooltip';
import { InputTextModule } from 'primeng/inputtext';
import { Drawer } from 'primeng/drawer';
import { NarratorToggle } from '../accessibility/narrator-toggle';
import { CartItem } from '../services/cart';
import { precioFinal } from '../core/models/product.model';
import { AccessibilityService } from '../core/services/accessibility.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  section: 'cliente' | 'empresa';
  adminOnly?: boolean;
  clientOnly?: boolean;
  showCartBadge?: boolean;
}

interface NavSection {
  key: 'cliente' | 'empresa';
  label: string;
  items: NavItem[];
}

type NotificationType = 'ventas' | 'stock' | 'sistema';
type NotificationFilter = 'todas' | 'no-leidas' | 'ventas' | 'stock' | 'sistema';

interface NotificationFilterOption {
  label: string;
  value: NotificationFilter;
}

interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  read: boolean;
  createdAt: string;
  route: string;
}

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    RouterModule,
    BadgeModule,
    TooltipModule,
    InputTextModule,
    Drawer,
    NarratorToggle
  ],
  templateUrl: './navbar.html',
  styleUrls: ['./navbar.scss', './navbar-storefront.scss'],
  host: { '[class.storefront-shell]': 'isStorefront' },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Navbar implements OnInit, OnDestroy {
  readonly accessibility = inject(AccessibilityService);
  private cdr = inject(ChangeDetectorRef);
  private authService = inject(AuthService);
  private cartService = inject(Cart);
  private productsService = inject(ProductsService);
  private salesService = inject(SalesService);
  private authModalService = inject(AuthModalService);
  private themeService = inject(ThemeService);
  private router = inject(Router);
  private subscriptions = new Subscription();
  private refreshIntervalId: ReturnType<typeof setInterval> | null = null;
  private readStateKey = 'nt_notifications_read_guest';
  private notificationsLastLoadedAt = 0;
  private readonly notificationCacheMs = 25000;

  usuario: any = null;
  rol: string = '';
  cantidadCarrito: number = 0;
  collapsed: boolean = false;
  mobileMenuOpen: boolean = false;
  isMobile: boolean = false;
  notificationsOpen: boolean = false;
  notifications: NotificationItem[] = [];
  activeNotificationFilter: NotificationFilter = 'todas';
  loadingNotifications: boolean = false;
  quickSearch: string = '';
  quickSearchOpen: boolean = false;
  menuVisible: NavItem[] = [];
  menuSections: NavSection[] = [];
  quickResults: NavItem[] = [];
  themeMenuOpen: boolean = false;
  currentTheme: AppTheme = 'ocean';
  themeOptions: AppThemeOption[] = [];
  isStorefront = false;

  cartSidebarOpen: boolean = false;
  cartItems: CartItem[] = [];
  getPrecioFinal = precioFinal;

  productQuickResults: ProductModel[] = [];
  private allProducts: ProductModel[] = [];
  private productsLoaded = false;
  private loadingProducts = false;

  notificationFilters: NotificationFilterOption[] = [
    { label: 'Todas', value: 'todas' },
    { label: 'No leidas', value: 'no-leidas' },
    { label: 'Ventas', value: 'ventas' },
    { label: 'Inventario', value: 'stock' },
    { label: 'Sistema', value: 'sistema' }
  ];

  navItems: NavItem[] = [
    { label: 'Catalogo', icon: 'pi pi-shop', route: '/tienda', section: 'cliente' },
    { label: 'Carrito', icon: 'pi pi-shopping-cart', route: '/carrito', section: 'cliente', showCartBadge: true },
    { label: 'Mis compras', icon: 'pi pi-receipt', route: '/miscompras', section: 'cliente', clientOnly: true },
    { label: 'Configuracion', icon: 'pi pi-cog', route: '/configuracion', section: 'cliente', clientOnly: true },
    { label: 'Dashboard', icon: 'pi pi-chart-line', route: '/empresa/dashboard', section: 'empresa', adminOnly: true },
    { label: 'Ventas', icon: 'pi pi-briefcase', route: '/empresa/ventas', section: 'empresa', adminOnly: true },
    { label: 'Catalogo admin', icon: 'pi pi-box', route: '/empresa/productos', section: 'empresa', adminOnly: true },
    { label: 'Categorías', icon: 'pi pi-tags', route: '/empresa/categorias', section: 'empresa', adminOnly: true },
    { label: 'Usuarios', icon: 'pi pi-users', route: '/empresa/usuarios', section: 'empresa', adminOnly: true },
    { label: 'Notificaciones', icon: 'pi pi-bell', route: '/empresa/notificaciones', section: 'empresa', adminOnly: true },
    { label: 'Configuracion', icon: 'pi pi-cog', route: '/configuracion', section: 'empresa', adminOnly: true }
  ];

  ngOnInit() {
    this.updateStorefrontPresentation(this.router.url);
    this.subscriptions.add(this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.updateStorefrontPresentation(event.urlAfterRedirects);
        this.cdr.markForCheck();
      }
    }));
    this.collapsed = localStorage.getItem('nt_sidebar_collapsed') === '1';
    this.updateViewportState();
    this.themeOptions = this.themeService.getThemeOptions();
    this.currentTheme = this.themeService.getTheme();

    this.subscriptions.add(this.authService.currentUser$.subscribe(user => {
      this.usuario = user;
      this.rol = user ? user.rol : '';
      this.readStateKey = `nt_notifications_read_${user?.id || 'guest'}`;
      this.rebuildMenu();
      this.refreshQuickResults();

      if (this.rol === 'admin') {
        this.loadNotifications();
        this.startNotificationsAutoRefresh();
      } else {
        this.notifications = [];
        this.stopNotificationsAutoRefresh();
      }
      this.cdr.markForCheck();
    }));

    this.subscriptions.add(this.cartService.cartCount$.subscribe(count => {
      this.cantidadCarrito = count;
      this.cartItems = this.cartService.getItems();
      this.refreshQuickResults();
      this.cdr.markForCheck();
    }));
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
    this.stopNotificationsAutoRefresh();
    document.body.classList.remove('sidebar-collapsed', 'sidebar-mobile-open');
  }

  private updateStorefrontPresentation(url: string) {
    const path = url.split(/[?#]/)[0];
    this.isStorefront = /^\/(tienda(?:\/|$)|producto\/|carrito(?:\/|$)|checkout(?:\/|$))/.test(path);
  }

  @HostListener('window:resize')
  onWindowResize() {
    this.updateViewportState();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.notificationsOpen && !this.quickSearchOpen && !this.themeMenuOpen) return;

    const target = event.target as HTMLElement;
    const clickedInNotification = !!target.closest('.notification-wrap') || !!target.closest('.notification-trigger');
    const clickedInQuickSearch = !!target.closest('.quick-nav-wrap');
    const clickedInThemePicker = !!target.closest('.theme-picker-wrap');

    let changed = false;

    if (!clickedInNotification && this.notificationsOpen) {
      this.notificationsOpen = false;
      changed = true;
    }

    if (!clickedInQuickSearch && this.quickSearchOpen) {
      this.quickSearchOpen = false;
    }

    if (!clickedInThemePicker && this.themeMenuOpen) {
      this.themeMenuOpen = false;
      changed = true;
    }

    if (changed) {
      this.cdr.markForCheck();
    }
  }

  get isCollapsedDesktop() {
    return this.collapsed && !this.isMobile;
  }

  get isAuthenticated() {
    return Boolean(this.usuario);
  }

  get notificaciones() {
    return this.notifications.filter(notification => !notification.read).length;
  }

  get filteredNotifications() {
    if (this.activeNotificationFilter === 'todas') {
      return this.notifications;
    }

    if (this.activeNotificationFilter === 'no-leidas') {
      return this.notifications.filter(notification => !notification.read);
    }

    return this.notifications.filter(notification => notification.type === this.activeNotificationFilter);
  }

  getInitial(nombre?: string) {
    return nombre ? nombre.charAt(0).toUpperCase() : 'U';
  }

  getBadge(item: NavItem) {
    if (!item.showCartBadge) return 0;
    return this.cantidadCarrito;
  }

  get currentThemeLabel() {
    return this.themeOptions.find((option) => option.key === this.currentTheme)?.label || 'Tema';
  }

  toggleNotifications(event: MouseEvent) {
    if (this.rol !== 'admin') {
      return;
    }

    event.stopPropagation();
    this.notificationsOpen = !this.notificationsOpen;

    if (this.notificationsOpen && this.shouldRefreshNotifications()) {
      this.loadNotifications();
    }
  }

  toggleThemeMenu(event: MouseEvent) {
    event.stopPropagation();
    this.themeMenuOpen = !this.themeMenuOpen;
    this.cdr.markForCheck();
  }

  aplicarTema(theme: AppTheme) {
    this.themeService.setTheme(theme);
    this.currentTheme = this.themeService.getTheme();
    this.themeMenuOpen = false;
  }

  esTemaActivo(theme: AppTheme) {
    return this.currentTheme === theme;
  }

  onQuickSearchFocus() {
    this.quickSearchOpen = true;
    this.loadProductsOnce();
    this.refreshQuickResults();
  }

  onQuickSearchInput(value: string) {
    this.refreshQuickResults();
    this.quickSearchOpen = true;
    if (!value.trim() && !this.quickResults.length && !this.productQuickResults.length) {
      this.quickSearchOpen = false;
    }
  }

  toggleCart() {
    this.cartSidebarOpen = !this.cartSidebarOpen;
  }

  get cartSubtotal() {
    return this.cartService.getSubtotal();
  }

  get cartIgv() {
    return this.cartService.getIGV();
  }

  get cartTotal() {
    return this.cartService.getTotal(0);
  }

  removerDelCarrito(productId: number) {
    this.cartService.removeFromCart(productId);
  }

  irAlCheckout() {
    this.cartSidebarOpen = false;
    this.router.navigate(['/carrito']);
  }

  clearQuickSearch() {
    this.quickSearch = '';
    this.quickSearchOpen = false;
    this.productQuickResults = [];
    this.refreshQuickResults();
  }

  navigateFromQuick(item: NavItem) {
    this.quickSearch = '';
    this.quickSearchOpen = false;
    this.closeMobileMenu();
    this.router.navigate([item.route]);
    this.cdr.markForCheck();
  }

  navigateToProductDetail(product: ProductModel) {
    this.quickSearch = '';
    this.quickSearchOpen = false;
    this.closeMobileMenu();
    this.router.navigate(['/producto', product.id]);
    this.cdr.markForCheck();
  }

  getProductPrice(product: ProductModel): number {
    return precioFinal(product);
  }

  private loadProductsOnce() {
    if (this.productsLoaded || this.loadingProducts) return;
    this.loadingProducts = true;

    this.productsService.getProducts().pipe(catchError(() => of([] as ProductModel[]))).subscribe(products => {
      this.allProducts = products;
      this.productsLoaded = true;
      this.loadingProducts = false;
      this.refreshQuickResults();
      this.cdr.markForCheck();
    });
  }

  setNotificationFilter(filter: NotificationFilter) {
    this.activeNotificationFilter = filter;
  }

  markAsRead(notificationId: string) {
    this.notifications = this.notifications.map(notification => {
      if (notification.id !== notificationId) {
        return notification;
      }

      return {
        ...notification,
        read: true
      };
    });

    this.saveReadState(notificationId, true);
  }

  markAllAsRead() {
    this.notifications = this.notifications.map(notification => ({
      ...notification,
      read: true
    }));

    const nextState: Record<string, boolean> = {};
    this.notifications.forEach(notification => {
      nextState[notification.id] = true;
    });

    localStorage.setItem(this.readStateKey, JSON.stringify(nextState));
  }

  openNotification(notification: NotificationItem) {
    this.markAsRead(notification.id);

    if (notification.route) {
      this.router.navigate([notification.route]);
      this.notificationsOpen = false;
    }
  }

  getNotificationIcon(type: NotificationType) {
    if (type === 'ventas') return 'pi pi-shopping-bag';
    if (type === 'stock') return 'pi pi-exclamation-triangle';
    return 'pi pi-cog';
  }

  getRelativeTime(createdAt: string) {
    const date = new Date(createdAt).getTime();
    const now = Date.now();
    const diffMinutes = Math.max(0, Math.floor((now - date) / 60000));

    if (diffMinutes < 1) return 'Hace unos segundos';
    if (diffMinutes < 60) return `Hace ${diffMinutes} min`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `Hace ${diffHours} h`;

    const diffDays = Math.floor(diffHours / 24);
    return `Hace ${diffDays} d`;
  }

  private loadNotifications() {
    if (!this.usuario || this.rol !== 'admin') {
      this.notifications = [];
      return;
    }

    if (this.loadingNotifications) {
      return;
    }

    this.loadingNotifications = true;

    forkJoin({
      products: this.productsService.getProducts().pipe(catchError(() => of([] as ProductModel[]))),
      sales: this.salesService.getAdminSales().pipe(catchError(() => of([] as SaleModel[])))
    }).subscribe(({ products, sales }) => {
        const notifications = this.buildAdminNotifications(products, sales);
        this.applyReadState(notifications);
        this.notificationsLastLoadedAt = Date.now();
        this.loadingNotifications = false;
    }, () => {
        this.loadingNotifications = false;
    });
  }

  private shouldRefreshNotifications() {
    if (!this.notifications.length) {
      return true;
    }

    const elapsed = Date.now() - this.notificationsLastLoadedAt;
    return elapsed > this.notificationCacheMs;
  }

  private buildAdminNotifications(products: ProductModel[], sales: SaleModel[]) {
    const notifications: NotificationItem[] = [];

    products
      .filter(product => Number(product.stock || 0) <= 5)
      .slice(0, 8)
      .forEach(product => {
        notifications.push({
          id: `stock-${product.id}`,
          type: 'stock',
          title: `Stock CRITICO: ${product.nombre}`,
          description: `El producto "${product.nombre}" esta en nivel critico (${Number(product.stock || 0)} unid). Minimo requerido: 5.`,
          read: false,
          createdAt: new Date().toISOString(),
          route: '/empresa/productos'
        });
      });

    sales
      .filter(sale => {
        const status = (sale.estado || 'pendiente').toLowerCase();
        return status !== 'entregado' && status !== 'cancelado' && status !== 'reembolsado';
      })
      .slice(0, 8)
      .forEach(sale => {
        const status = this.formatSaleStatus(sale.estado || 'pendiente');
        notifications.push({
          id: `venta-${sale.id}-${(sale.estado || 'pendiente').toLowerCase()}`,
          type: 'ventas',
          title: `Pedido #${sale.id} en ${status}`,
          description: `${sale.nombre_cliente || sale.nombre_usuario || 'Cliente'} - Total S/ ${sale.total}`,
          read: false,
          createdAt: sale.fecha || new Date().toISOString(),
          route: '/empresa/ventas'
        });
      });

    sales
      .filter(sale => {
        const status = (sale.estado || '').toLowerCase();
        return status === 'cancelado' || status === 'reembolsado';
      })
      .slice(0, 8)
      .forEach(sale => {
        const status = (sale.estado || '').toLowerCase();
        const isCancelado = status === 'cancelado';
        notifications.push({
          id: `venta-${sale.id}-${status}`,
          type: 'ventas',
          title: `Pedido #${sale.id} ${isCancelado ? 'CANCELADO' : 'REEMBOLSADO'}`,
          description: `${sale.nombre_cliente || sale.nombre_usuario || 'Cliente'} - Total S/ ${sale.total}`,
          read: false,
          createdAt: sale.fecha || new Date().toISOString(),
          route: '/empresa/ventas'
        });
      });

    if (!notifications.length) {
      notifications.push({
        id: 'sistema-admin-ok',
        type: 'sistema',
        title: 'Operacion estable',
        description: 'No hay alertas activas de ventas ni inventario en este momento.',
        read: false,
        createdAt: new Date().toISOString(),
        route: '/empresa/dashboard'
      });
    }

    return notifications;
  }

  private applyReadState(notifications: NotificationItem[]) {
    const uniqueNotifications = Array.from(
      new Map(notifications.map(notification => [notification.id, notification])).values()
    ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const readState = this.getReadState();

    this.notifications = uniqueNotifications.map(notification => ({
      ...notification,
      read: Boolean(readState[notification.id])
    }));

    this.pruneReadState(this.notifications.map(notification => notification.id));
  }

  private getReadState() {
    try {
      const rawState = localStorage.getItem(this.readStateKey);
      if (!rawState) return {} as Record<string, boolean>;
      return JSON.parse(rawState) as Record<string, boolean>;
    } catch {
      return {} as Record<string, boolean>;
    }
  }

  private saveReadState(notificationId: string, read: boolean) {
    const currentState = this.getReadState();
    currentState[notificationId] = read;
    localStorage.setItem(this.readStateKey, JSON.stringify(currentState));
  }

  private pruneReadState(validIds: string[]) {
    const state = this.getReadState();
    const validSet = new Set(validIds);
    const nextState: Record<string, boolean> = {};

    Object.keys(state).forEach(key => {
      if (validSet.has(key)) {
        nextState[key] = state[key];
      }
    });

    localStorage.setItem(this.readStateKey, JSON.stringify(nextState));
  }

  private formatSaleStatus(status: string) {
    const normalized = status.toLowerCase();

    if (normalized === 'en camino') return 'EN CAMINO';
    if (normalized === 'entregado') return 'ENTREGADO';
    if (normalized === 'cancelado') return 'CANCELADO';
    return 'PENDIENTE';
  }

  private startNotificationsAutoRefresh() {
    if (this.rol !== 'admin') {
      return;
    }

    this.stopNotificationsAutoRefresh();
    this.refreshIntervalId = setInterval(() => {
      this.loadNotifications();
    }, 45000);
  }

  private stopNotificationsAutoRefresh() {
    if (this.refreshIntervalId) {
      clearInterval(this.refreshIntervalId);
      this.refreshIntervalId = null;
    }
  }

  toggleSidebar() {
    if (this.isMobile) {
      this.mobileMenuOpen = !this.mobileMenuOpen;
    } else {
      this.collapsed = !this.collapsed;
      localStorage.setItem('nt_sidebar_collapsed', this.collapsed ? '1' : '0');
    }

    this.applyBodyClasses();
  }

  closeMobileMenu() {
    if (!this.isMobile) return;
    this.mobileMenuOpen = false;
    this.quickSearchOpen = false;
    this.applyBodyClasses();
  }

  private updateViewportState() {
    this.isMobile = window.innerWidth < 1024;
    if (!this.isMobile) {
      this.mobileMenuOpen = false;
    }
    this.applyBodyClasses();
  }

  private applyBodyClasses() {
    document.body.classList.toggle('sidebar-collapsed', this.collapsed && !this.isMobile);
    document.body.classList.toggle('sidebar-mobile-open', this.mobileMenuOpen && this.isMobile);
  }

  logout() {
    if (!this.usuario) {
      this.router.navigate(['/tienda']);
      return;
    }

    this.cartService.clearCart();

    this.authService.logout();
    this.mobileMenuOpen = false;
    this.quickSearchOpen = false;
    this.applyBodyClasses();
    this.router.navigate(['/tienda']);
  }

  goToLogin() {
    const returnUrl = this.router.url && this.router.url !== '/login' ? this.router.url : '/tienda';

    this.mobileMenuOpen = false;
    this.quickSearchOpen = false;
    this.applyBodyClasses();
    this.authModalService.open({
      view: 'login',
      mode: 'cliente',
      returnUrl
    });
  }

  private rebuildMenu() {
    this.menuVisible = this.navItems.filter(item => {
      if (item.adminOnly && this.rol !== 'admin') return false;
      if (item.clientOnly && !this.usuario) return false;
      if (item.clientOnly && this.rol === 'admin') return false;
      return true;
    });

    const sections: NavSection[] = [
      {
        key: 'cliente',
        label: 'Canal comercial',
        items: this.menuVisible.filter(item => item.section === 'cliente')
      },
      {
        key: 'empresa',
        label: 'Operacion empresa',
        items: this.menuVisible.filter(item => item.section === 'empresa')
      }
    ];

    this.menuSections = sections.filter(section => section.items.length > 0);
  }

  private refreshQuickResults() {
    const query = this.quickSearch.trim().toLowerCase();

    if (!query) {
      this.quickResults = this.menuVisible.slice(0, 5);
      this.productQuickResults = [];
      return;
    }

    this.quickResults = this.menuVisible
      .filter(item => item.label.toLowerCase().includes(query))
      .slice(0, 4);

    this.productQuickResults = this.allProducts
      .filter(p =>
        p.nombre.toLowerCase().includes(query) ||
        (p.categoria || '').toLowerCase().includes(query) ||
        (p.marca || '').toLowerCase().includes(query) ||
        (p.sku || '').toLowerCase().includes(query)
      )
      .slice(0, 5);
  }
}

