import { Component, inject, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { MessageService } from 'primeng/api';

import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CardModule,
    InputTextModule,
    PasswordModule,
    ButtonModule
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class Login implements OnInit {
  email: string = '';
  password: string = '';
  loading: boolean = false;
  modoAcceso: 'cliente' | 'elevado' = 'cliente';

  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private messageService = inject(MessageService);
  private cd = inject(ChangeDetectorRef);

  ngOnInit() {
    const usuario = this.authService.currentUserValue;

    if (usuario) {
      this.redirectAfterLogin(usuario);
    }
  }

  seleccionarModo(modo: 'cliente' | 'elevado') {
    this.modoAcceso = modo;
  }

  onLogin() {
    if (!this.email || !this.password) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Campos requeridos',
        detail: 'Ingresa correo y contrasena para continuar.',
        life: 2500
      });
      return;
    }

    this.loading = true;
    const datos = { email: this.email, password: this.password };

    this.authService.login(datos).subscribe({
      next: (res) => {
        const usuario = res?.usuario;

        if (!usuario) {
          this.loading = false;
          this.cd.detectChanges();
          return;
        }

        if (this.modoAcceso === 'elevado' && usuario.rol !== 'admin') {
          this.authService.logout();
          this.loading = false;
          this.cd.detectChanges();
          this.messageService.add({
            severity: 'error',
            summary: 'Modo Elevado restringido',
            detail: 'Esta cuenta no tiene permisos administrativos.',
            life: 3000
          });
          return;
        }

        this.loading = false;
        this.cd.detectChanges();

        this.messageService.add({
            severity: 'success',
          summary: 'Bienvenido',
            detail: `Hola de nuevo, ${usuario.nombre}`,
            life: 3000
        });

        this.redirectAfterLogin(usuario);
      },
      error: (err) => {
        this.loading = false;

        this.cd.detectChanges();

        const mensaje = err.error?.message || err.error?.mensaje || 'Credenciales incorrectas o error de servidor';

        this.messageService.add({
            severity: 'error',
            summary: 'Error de Acceso',
            detail: mensaje,
            life: 3000
        });
      }
    });
  }

  get emailPlaceholder() {
    return this.modoAcceso === 'elevado' ? 'admin@novatech.com' : 'cliente@novatech.com';
  }

  get ctaLabel() {
    return this.modoAcceso === 'elevado' ? 'Entrar en Modo Elevado' : 'Iniciar sesion';
  }

  private redirectAfterLogin(usuario: any) {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');

    if (returnUrl && returnUrl !== '/login') {
      this.router.navigateByUrl(returnUrl);
      return;
    }

    if (usuario.rol === 'admin') {
      this.router.navigate(['/empresa/dashboard']);
      return;
    }

    this.router.navigate(['/tienda']);
  }
}

