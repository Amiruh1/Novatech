import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { PasswordModule } from 'primeng/password';
import { API_BASE_URL } from '../core/config/api.config';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, PasswordModule],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ResetPasswordComponent implements OnInit {
  private route  = inject(ActivatedRoute);
  private router = inject(Router);
  private http   = inject(HttpClient);
  private msg    = inject(MessageService);
  private cd     = inject(ChangeDetectorRef);

  token      = '';
  passNueva  = '';
  passConfirm = '';
  loading    = false;
  done       = false;
  errorMsg   = '';

  ngOnInit() {
    this.token = this.route.snapshot.queryParamMap.get('token') || '';
    if (!this.token) {
      this.errorMsg = 'Enlace inválido o expirado. Solicita un nuevo enlace desde la pantalla de inicio.';
      this.cd.markForCheck();
    }
  }

  resetear() {
    if (!this.passNueva || this.passNueva.length < 8) {
      this.msg.add({ severity: 'warn', summary: 'Contraseña muy corta', detail: 'La contraseña debe tener al menos 8 caracteres.' });
      return;
    }
    if (this.passNueva.length > 64) {
      this.msg.add({ severity: 'warn', summary: 'Contraseña muy larga', detail: 'La contraseña no puede superar 64 caracteres.' });
      return;
    }
    if (/^\s|\s$/.test(this.passNueva)) {
      this.msg.add({ severity: 'warn', summary: 'Contraseña inválida', detail: 'La contraseña no debe tener espacios al inicio o al final.' });
      return;
    }
    if (this.passNueva !== this.passConfirm) {
      this.msg.add({ severity: 'warn', summary: 'No coincide', detail: 'Las contraseñas no coinciden.' });
      return;
    }

    this.loading = true;
    this.errorMsg = '';
    this.cd.markForCheck();

    this.http.post(`${API_BASE_URL}/reset-password`, { token: this.token, password: this.passNueva })
      .subscribe({
        next: () => {
          this.done    = true;
          this.loading = false;
          this.cd.markForCheck();
        },
        error: (err) => {
          this.errorMsg = err?.error?.message || 'No se pudo restablecer la contraseña. El enlace puede haber expirado.';
          this.loading  = false;
          this.cd.markForCheck();
        }
      });
  }

  irATienda() {
    this.router.navigate(['/tienda']);
  }
}
