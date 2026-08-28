import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-ajustar-stock',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    DialogModule,
    SelectModule,
    InputNumberModule,
    TextareaModule,
    ButtonModule
  ],
  templateUrl: './ajustar-stock.component.html',
  styleUrl: './ajustar-stock.component.scss'
})
export class AjustarStock {
  @Input() visible: boolean = false;
  @Input() form: FormGroup = new FormGroup({});
  @Input() guardando: boolean = false;
  @Input() productName: string = '';

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saveRequested = new EventEmitter<void>();

  operaciones = [
    { label: 'Incrementar stock', value: 'sumar', icon: 'pi pi-plus-circle' },
    { label: 'Reducir stock', value: 'restar', icon: 'pi pi-minus-circle' },
    { label: 'Fijar stock exacto', value: 'fijar', icon: 'pi pi-sliders-h' }
  ];

  get cantidadControl() {
    return this.form.get('cantidad');
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

