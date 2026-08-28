import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { UsersService } from '../../../services/users';
import { AuthService } from '../../../services/auth';
import { MessageService } from 'primeng/api';
import { finalize } from 'rxjs';

import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { ListaUsuarios } from './lista-usuarios/lista-usuarios.component';
import { CrearUsuario } from './crear-usuario/crear-usuario.component';
import { EditarUsuario } from './editar-usuario/editar-usuario.component';
import { UserModel, UserRole } from '../../../core/models/user.model';
import { RoleOption } from './usuarios.types';

@Component({
  selector: 'app-usuario-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    CardModule,
    DialogModule,
    ButtonModule,
    ListaUsuarios,
    CrearUsuario,
    EditarUsuario
  ],
  templateUrl: './usuario-page.component.html',
  styleUrl: './usuario-page.component.scss'
})
export class UsuarioPage implements OnInit {
  readonly PERMISOS = {
    CREAR_USUARIO: 'CREAR_USUARIO',
    EDITAR_USUARIO: 'EDITAR_USUARIO',
    ELIMINAR_USUARIO: 'ELIMINAR_USUARIO'
  };

  users: UserModel[] = [];
  searchText: string = '';
  loading: boolean = true;
  visibleCrear: boolean = false;
  visibleEditar: boolean = false;
  currentUserId: number | null = null;
  guardandoUsuario: boolean = false;
  isAdmin: boolean = false;
  globalFilterFields = ['nombre', 'email', 'rol'];

  toggleDialog = false;
  toggleTarget: UserModel | null = null;
  toggleLoading = false;

  private fb = inject(FormBuilder);

  usuarioForm = this.fb.group({
    nombre: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(100)]],
    password: ['', [Validators.maxLength(255)]],
    rol: ['cliente' as UserRole]
  });

  roles: RoleOption[] = [
    { label: 'Administrador', value: 'admin', icon: 'pi pi-shield' },
    { label: 'Cliente', value: 'cliente', icon: 'pi pi-user' }
  ];

  private authService = inject(AuthService);
  private usersService = inject(UsersService);
  private cd = inject(ChangeDetectorRef);
  private messageService = inject(MessageService);

  ngOnInit() {
    this.isAdmin = this.authService.currentUserValue?.rol === 'admin';
    this.cargarUsuarios();
  }

  get nombreControl() {
    return this.usuarioForm.controls.nombre;
  }

  get emailControl() {
    return this.usuarioForm.controls.email;
  }

  get passwordControl() {
    return this.usuarioForm.controls.password;
  }

  get usersView(): UserModel[] {
    const query = (this.searchText || '').trim().toLowerCase();
    if (!query) {
      return this.users;
    }

    return this.users.filter(user => {
      const bag = `${user.nombre || ''} ${user.email || ''} ${user.rol || ''}`.toLowerCase();
      return bag.includes(query);
    });
  }

  get totalUsuarios() {
    return this.usersView.length;
  }

  get totalAdministradores() {
    return this.usersView.filter(user => (user.rol || '').toLowerCase() === 'admin').length;
  }

  get totalClientes() {
    return this.usersView.filter(user => (user.rol || '').toLowerCase() === 'cliente').length;
  }

  tienePermiso(permiso: string) {
    if (this.isAdmin) {
      return true;
    }

    return permiso === this.PERMISOS.EDITAR_USUARIO;
  }

  cargarUsuarios() {
    this.loading = true;
    this.usersService.getUsers().subscribe({
      next: (data) => {
        this.users = data;
        this.loading = false;
        this.cd.detectChanges();
      },
      error: (err) => {
        console.error(err);
        this.loading = false;
        this.cd.detectChanges();
      }
    });
  }

  abrirDialogoCrear() {
    if (!this.tienePermiso(this.PERMISOS.CREAR_USUARIO)) {
      return;
    }

    this.currentUserId = null;
    this.visibleEditar = false;
    this.setFormularioBloqueado(false);
    this.passwordControl.setValidators([Validators.required, Validators.minLength(8), Validators.maxLength(255)]);
    this.passwordControl.updateValueAndValidity({ emitEvent: false });
    this.usuarioForm.reset({ nombre: '', email: '', password: '', rol: 'cliente' });
    this.visibleCrear = true;
  }

  abrirDialogoEditar(user: UserModel) {
    if (!this.tienePermiso(this.PERMISOS.EDITAR_USUARIO)) {
      return;
    }

    this.currentUserId = user.id;
    this.visibleCrear = false;
    this.setFormularioBloqueado(false);
    this.passwordControl.clearValidators();
    this.passwordControl.setValidators([Validators.maxLength(255)]);
    this.passwordControl.updateValueAndValidity({ emitEvent: false });

    this.usuarioForm.reset({
      nombre: user.nombre,
      email: user.email,
      password: '',
      rol: user.rol || 'cliente'
    });

    this.visibleEditar = true;
  }

  cerrarDialogoCrear() {
    this.visibleCrear = false;
  }

  cerrarDialogoEditar() {
    this.visibleEditar = false;
  }

  guardarCreacionUsuario() {
    this.passwordControl.setValidators([Validators.required, Validators.minLength(8), Validators.maxLength(255)]);
    this.passwordControl.updateValueAndValidity({ emitEvent: false });

    if (this.usuarioForm.invalid) {
      this.usuarioForm.markAllAsTouched();
      this.messageService.add({
        severity: 'warn',
        summary: 'Formulario inválido',
        detail: 'Revisa nombre, email y contraseña (mínimo 8 caracteres)'
      });
      return;
    }

    this.guardandoUsuario = true;
    this.setFormularioBloqueado(true);
    const formValue = this.usuarioForm.getRawValue();
    const payload: Partial<UserModel> = {
      nombre: (formValue.nombre || '').trim(),
      email: (formValue.email || '').trim(),
      password: (formValue.password || '').trim(),
      rol: (formValue.rol || 'cliente') as UserRole
    };

    this.usersService.createUser(payload)
      .pipe(
        finalize(() => {
          this.guardandoUsuario = false;
          this.setFormularioBloqueado(false);
        })
      )
      .subscribe({
      next: () => {
        this.messageService.add({severity:'success', summary:'Creado', detail:'Usuario nuevo registrado'});
        this.visibleCrear = false;
        this.cargarUsuarios();
      },
      error: (err) => this.messageService.add({severity:'error', summary:'Error', detail: err.message})
    });
  }

  guardarEdicionUsuario() {
    this.passwordControl.clearValidators();
    this.passwordControl.setValidators([Validators.maxLength(255)]);
    this.passwordControl.updateValueAndValidity({ emitEvent: false });

    if (this.usuarioForm.invalid || !this.currentUserId) {
      this.usuarioForm.markAllAsTouched();
      this.messageService.add({
        severity: 'warn',
        summary: 'Formulario invalido',
        detail: 'Revisa nombre, email y longitud de campos'
      });
      return;
    }

    this.guardandoUsuario = true;
    this.setFormularioBloqueado(true);
    const formValue = this.usuarioForm.getRawValue();
    const payload: Partial<UserModel> & { password?: string } = {
      nombre: (formValue.nombre || '').trim(),
      email: (formValue.email || '').trim(),
      rol: (formValue.rol || 'cliente') as UserRole
    };

    if (formValue.password && formValue.password.trim().length >= 8) {
      payload.password = formValue.password.trim();
    }

    this.usersService.updateUser(this.currentUserId, payload)
      .pipe(
        finalize(() => {
          this.guardandoUsuario = false;
          this.setFormularioBloqueado(false);
        })
      )
      .subscribe({
      next: () => {
        this.messageService.add({severity:'success', summary:'Actualizado', detail:'Usuario modificado'});
        this.visibleEditar = false;
        this.cargarUsuarios();
      },
      error: (err) => this.messageService.add({severity:'error', summary:'Error', detail: err.message})
    });
  }

  get toggleIsActivo(): boolean {
    const u = this.toggleTarget;
    return !u || u.activo === undefined || u.activo === null || Number(u.activo) !== 0;
  }

  eliminarUsuario(user: UserModel) {
    if (!this.tienePermiso(this.PERMISOS.ELIMINAR_USUARIO)) return;
    this.toggleTarget  = user;
    this.toggleDialog  = true;
    this.toggleLoading = false;
  }

  confirmarToggleActivo() {
    if (!this.toggleTarget) return;
    this.toggleLoading = true;
    const user   = this.toggleTarget;
    const activo = this.toggleIsActivo;

    this.usersService.setActivo(user.id, !activo).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: activo ? 'Cuenta desactivada' : 'Cuenta reactivada',
          detail: `${user.nombre} fue ${activo ? 'desactivado' : 'reactivado'} correctamente.`
        });
        this.toggleDialog  = false;
        this.toggleLoading = false;
        this.toggleTarget  = null;
        this.cargarUsuarios();
      },
      error: (err) => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: err.message });
        this.toggleLoading = false;
      }
    });
  }

  private setFormularioBloqueado(bloqueado: boolean) {
    if (bloqueado) {
      this.usuarioForm.disable({ emitEvent: false });
      return;
    }

    this.usuarioForm.enable({ emitEvent: false });
  }
}


