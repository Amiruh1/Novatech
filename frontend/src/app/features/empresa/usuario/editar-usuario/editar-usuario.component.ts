import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { RoleOption } from '../usuarios.types';

@Component({
  selector: 'app-editar-usuario',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DialogModule, InputTextModule, SelectModule, ButtonModule],
  templateUrl: './editar-usuario.component.html',
  styleUrl: './editar-usuario.component.scss'
})
export class EditarUsuario {
  @Input() visible: boolean = false;
  @Input() form: FormGroup = new FormGroup({});
  @Input() roles: RoleOption[] = [];
  @Input() guardando: boolean = false;

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saveRequested = new EventEmitter<void>();

  get nombreControl() {
    return this.form.get('nombre');
  }

  get emailControl() {
    return this.form.get('email');
  }

  get passwordControl() {
    return this.form.get('password');
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

