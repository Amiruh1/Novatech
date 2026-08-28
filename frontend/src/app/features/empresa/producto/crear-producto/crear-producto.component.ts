import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { OptionWithIcon } from '../productos.types';

@Component({
  selector: 'app-crear-producto',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    DialogModule,
    InputTextModule,
    TextareaModule,
    InputNumberModule,
    SelectModule,
    ButtonModule
  ],
  templateUrl: './crear-producto.component.html',
  styleUrl: './crear-producto.component.scss'
})
export class CrearProducto {
  @Input() visible: boolean = false;
  @Input() form: FormGroup = new FormGroup({});
  @Input() categoryOptions: OptionWithIcon[] = [];
  @Input() brandOptions: OptionWithIcon[] = [];
  @Input() guardando: boolean = false;

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saveRequested = new EventEmitter<void>();

  precioFields = [
    { label: 'Precio de venta (PEN)', control: 'precio', required: true, placeholder: '', help: 'Precio visible en catalogo (incluye IGV)', errorRequired: true, errorRange: true },
    { label: 'Precio de compra (PEN)', control: 'precio_compra', required: false, placeholder: 'Opcional', help: 'Costo de adquisicion (solo admin)', errorRequired: false, errorRange: false },
    { label: 'Precio de oferta (PEN)', control: 'precio_oferta', required: false, placeholder: 'Opcional', help: 'Dejar vacio si no hay oferta', errorRequired: false, errorRange: false }
  ];

  get nombreControl() {
    return this.form.get('nombre');
  }

  get precioControl() {
    return this.form.get('precio');
  }

  get stockControl() {
    return this.form.get('stock');
  }

  actualizarVisibilidad(visible: boolean) {
    this.visibleChange.emit(visible);
  }

  cerrarDialogo() {
    if (!this.guardando) {
      this.visibleChange.emit(false);
    }
  }

  guardar() {
    this.saveRequested.emit();
  }
}

