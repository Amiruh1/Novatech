import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { UserModel } from '../../../../core/models/user.model';

@Component({
  selector: 'app-lista-usuarios',
  standalone: true,
  imports: [CommonModule, TableModule, ButtonModule, TagModule, TooltipModule],
  templateUrl: './lista-usuarios.component.html',
  styleUrl: './lista-usuarios.component.scss'
})
export class ListaUsuarios {
  @Input() users: UserModel[] = [];
  @Input() loading: boolean = false;
  @Input() globalFilterFields: string[] = ['nombre', 'email', 'rol'];
  @Input() canCreate: boolean = false;
  @Input() canEdit: boolean = false;
  @Input() canDelete: boolean = false;

  @Output() createRequested = new EventEmitter<void>();
  @Output() editRequested = new EventEmitter<UserModel>();
  @Output() deleteRequested = new EventEmitter<UserModel>();

  solicitarCreacion() {
    this.createRequested.emit();
  }

  solicitarEdicion(user: UserModel) {
    this.editRequested.emit(user);
  }

  solicitarEliminacion(user: UserModel) {
    this.deleteRequested.emit(user);
  }

  isActivo(user: UserModel): boolean {
    return user.activo === undefined || user.activo === null || Number(user.activo) !== 0;
  }
}

