import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output, inject, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ProductsService, ProductMovement } from '../../../../services/products';

@Component({
  selector: 'app-movimientos-stock',
  standalone: true,
  imports: [
    CommonModule,
    DialogModule,
    TableModule,
    TagModule,
    DatePipe
  ],
  templateUrl: './movimientos-stock.component.html',
  styleUrl: './movimientos-stock.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MovimientosStock implements OnChanges {
  @Input() visible: boolean = false;
  @Input() productId: number | null = null;
  @Input() productName: string = '';

  @Output() visibleChange = new EventEmitter<boolean>();

  private productsService = inject(ProductsService);
  private cdr = inject(ChangeDetectorRef);

  movimientos: ProductMovement[] = [];
  loading: boolean = false;

  ngOnChanges(changes: SimpleChanges) {
    if (changes['visible'] && changes['visible'].currentValue && this.productId) {
      Promise.resolve().then(() => this.cargarMovimientos());
    }
    if (changes['productId'] && this.visible && this.productId) {
      Promise.resolve().then(() => this.cargarMovimientos());
    }
  }

  cargarMovimientos() {
    if (!this.productId) return;
    this.loading = true;
    this.cdr.markForCheck();
    this.productsService.getProductMovements(this.productId).subscribe({
      next: (data) => {
        this.movimientos = data;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Error cargando movimientos:', err);
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  actualizarVisibilidad(visible: boolean) {
    this.visibleChange.emit(visible);
  }

  cerrarDialogo() {
    this.visibleChange.emit(false);
  }

  getTipoSeverity(tipo: string): "success" | "info" | "warn" | "danger" | "secondary" | "contrast" {
    switch(tipo) {
      case 'ENTRADA': return 'success';
      case 'SALIDA': return 'danger';
      case 'VENTA': return 'info';
      case 'AJUSTE': return 'warn';
      case 'DEVOLUCION': return 'secondary';
      default: return 'info';
    }
  }
}
