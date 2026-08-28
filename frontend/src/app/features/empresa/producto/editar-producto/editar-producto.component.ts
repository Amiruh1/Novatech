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
  selector: 'app-editar-producto',
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
  templateUrl: './editar-producto.component.html',
  styleUrl: './editar-producto.component.scss'
})
export class EditarProducto {
  @Input() visible: boolean = false;
  @Input() form: FormGroup = new FormGroup({});
  @Input() categoryOptions: OptionWithIcon[] = [];
  @Input() brandOptions: OptionWithIcon[] = [];
  @Input() guardando: boolean = false;

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saveRequested = new EventEmitter<void>();

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

