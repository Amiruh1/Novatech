import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ProductView } from '../productos.types';

@Component({
  selector: 'app-lista-productos',
  standalone: true,
  imports: [CommonModule, TableModule, ButtonModule, InputTextModule, TagModule, TooltipModule],
  templateUrl: './lista-productos.component.html',
  styleUrl: './lista-productos.component.scss'
})
export class ListaProductos {
  @Input() products: ProductView[] = [];
  @Input() loading: boolean = false;
  @Input() globalFilterFields: string[] = ['sku', 'nombre', 'descripcion', 'categoria', 'marca'];
  @Input() canCreate: boolean = false;
  @Input() canEdit: boolean = false;
  @Input() canDelete: boolean = false;
  @Input() canAdjustStock: boolean = false;

  @Output() createRequested = new EventEmitter<void>();
  @Output() editRequested = new EventEmitter<ProductView>();
  @Output() deleteRequested = new EventEmitter<ProductView>();
  @Output() adjustStockRequested = new EventEmitter<ProductView>();
  @Output() viewMovementsRequested = new EventEmitter<ProductView>();

  solicitarCreacion() {
    this.createRequested.emit();
  }

  solicitarEdicion(product: ProductView) {
    this.editRequested.emit(product);
  }

  solicitarEliminacion(product: ProductView) {
    this.deleteRequested.emit(product);
  }

  solicitarAjusteStock(product: ProductView) {
    this.adjustStockRequested.emit(product);
  }

  solicitarVerMovimientos(product: ProductView) {
    this.viewMovementsRequested.emit(product);
  }

  getStockSeverity(stock: number): 'success' | 'secondary' | 'info' | 'warn' | 'danger' | 'contrast' | undefined {
    if (stock === 0) {
      return 'danger';
    }

    if (stock < 10) {
      return 'warn';
    }

    if (stock > 20) {
      return 'success';
    }

    return 'info';
  }

  getStockLabel(stock: number) {
    if (stock === 0) {
      return 'Sin stock';
    }

    if (stock < 10) {
      return `${stock} unid. bajo`;
    }

    if (stock > 20) {
      return `${stock} unid. alto`;
    }

    return `${stock} unid.`;
  }

  getStockClass(stock: number) {
    if (stock === 0) {
      return 'stock-zero';
    }

    if (stock < 10) {
      return 'stock-low';
    }

    if (stock > 20) {
      return 'stock-high';
    }

    return 'stock-medium';
  }
}

