import {
  Component, inject, OnInit, OnDestroy,
  HostListener, ElementRef, ViewChild,
  ChangeDetectorRef, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule }          from '@angular/common';
import { FormsModule }           from '@angular/forms';
import { Router }                from '@angular/router';
import { Subject, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';

import { CommandPaletteService, PaletteCommand } from '../services/command-palette.service';
import { ProductsService }       from '../services/products';
import { AccessibilityService } from '../core/services/accessibility.service';

interface ProductResult {
  id: number;
  nombre: string;
  categoria?: string;
  precio: number;
  imagen?: string;
}

@Component({
  selector: 'app-command-palette',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './command-palette.html',
  styleUrl:    './command-palette.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CommandPalette implements OnInit, OnDestroy {
  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;
  @ViewChild('resultsList') resultsList!: ElementRef<HTMLElement>;

  readonly cp      = inject(CommandPaletteService);
  private readonly accessibility = inject(AccessibilityService);
  private router   = inject(Router);
  private ps       = inject(ProductsService);
  private cd       = inject(ChangeDetectorRef);

  isOpen       = false;
  query        = '';
  activeIndex  = 0;
  searching    = false;

  baseCommands:     PaletteCommand[]  = [];
  filteredCommands: PaletteCommand[]  = [];
  productResults:   ProductResult[]   = [];

  private subs      = new Subscription();
  private search$   = new Subject<string>();

  ngOnInit() {
    this.baseCommands = this.cp.getBaseCommands();

    this.subs.add(
      this.cp.isOpen$.subscribe(open => {
        this.isOpen = open;
        if (open) {
          this.query           = '';
          this.filteredCommands = this.baseCommands;
          this.productResults  = [];
          this.activeIndex     = 0;
          setTimeout(() => this.searchInput?.nativeElement.focus(), 40);
        }
        this.cd.markForCheck();
      })
    );

    this.subs.add(
      this.search$.pipe(
        debounceTime(220),
        distinctUntilChanged()
      ).subscribe(q => this.doSearch(q))
    );
  }

  ngOnDestroy() { this.subs.unsubscribe(); }

  onQueryChange(q: string) {
    this.query           = q;
    this.filteredCommands = this.cp.filterCommands(q, this.baseCommands);
    this.activeIndex     = 0;
    this.search$.next(q);
    this.cd.markForCheck();
  }

  private doSearch(q: string) {
    if (!q.trim()) {
      this.productResults = [];
      this.searching      = false;
      this.cd.markForCheck();
      return;
    }

    this.searching = true;
    this.cd.markForCheck();

    this.ps.searchProducts({ query: q, page: 1, limit: 4 }).subscribe({
      next: (res: any) => {
        const all = Array.isArray(res) ? res : (res?.data ?? []);
        this.productResults = all.slice(0, 4).map((p: any) => ({
          id: Number(p.id),
          nombre: p.nombre || '',
          categoria: p.categoria,
          precio: Number(p.precio || 0),
          imagen: p.imagen
        }));
        this.searching = false;
        this.cd.markForCheck();
      },
      error: () => { this.searching = false; this.cd.markForCheck(); }
    });
  }

  get allResults(): { type: 'command' | 'product'; item: PaletteCommand | ProductResult }[] {
    return [
      ...this.filteredCommands.map(c => ({ type: 'command' as const, item: c })),
      ...this.productResults.map(p => ({ type: 'product' as const, item: p }))
    ];
  }

  get totalResults() { return this.allResults.length; }

  execute(result: { type: 'command' | 'product'; item: any }) {
    if (result.type === 'command') {
      (result.item as PaletteCommand).action();
    } else {
      this.cp.close();
      this.router.navigate(['/producto', result.item.id]);
    }
    this.cd.markForCheck();
  }

  @HostListener('keydown', ['$event'])
  onKeyDown(e: KeyboardEvent) {
    if (!this.isOpen) return;

    if (e.key === 'Escape')      { e.preventDefault(); this.cp.close(); return; }
    if (e.key === 'ArrowDown')   { e.preventDefault(); this.activeIndex = Math.min(this.activeIndex + 1, this.totalResults - 1); this.scrollToActive(); }
    if (e.key === 'ArrowUp')     { e.preventDefault(); this.activeIndex = Math.max(this.activeIndex - 1, 0); this.scrollToActive(); }
    if (e.key === 'Enter' && this.totalResults > 0) {
      e.preventDefault();
      this.execute(this.allResults[this.activeIndex]);
    }
    this.cd.markForCheck();
  }

  private scrollToActive() {
    setTimeout(() => {
      const el = this.resultsList?.nativeElement.querySelector('[data-active="true"]') as HTMLElement | null;
      el?.scrollIntoView({ block: 'nearest' });
    }, 10);
  }

  closeOnBackdrop(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('cp-backdrop')) this.cp.close();
  }

  categoryLabel(cat: string) {
    return cat === 'navigation' ? 'Navegación' : cat === 'admin' ? 'Administración' : 'Mi cuenta';
  }

  @HostListener('window:keydown', ['$event'])
  onGlobalKey(e: KeyboardEvent) {
    if (this.accessibility.panelOpen()) return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      this.cp.toggle();
      this.cd.markForCheck();
    }
  }
}
