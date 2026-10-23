import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize, Subscription } from 'rxjs';
import { MessageService, ToastMessageOptions } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { AuthService } from '../services/auth';
import { AuthModalMode, AuthModalService, AuthModalView } from '../services/auth-modal';
import { GOOGLE_CLIENT_ID } from '../core/config/api.config';

// Tipos mínimos para el Google Identity Services SDK
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize:   (config: { client_id: string; callback: (r: { credential: string }) => void; auto_select?: boolean }) => void;
          prompt:       (cb?: (n: { isNotDisplayed(): boolean; isSkippedMoment(): boolean }) => void) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
          cancel:       () => void;
        };
      };
    };
  }
}

@Component({
  selector: 'app-auth-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DialogModule,
    InputTextModule,
    ButtonModule,
    SelectModule
  ],
  templateUrl: './auth-modal.component.html',
  styleUrl: './auth-modal.component.scss'
})
export class AuthModalComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private authModalService = inject(AuthModalService);
  private messageService = inject(MessageService);
  private router = inject(Router);
  private ngZone = inject(NgZone);
  private cd = inject(ChangeDetectorRef);
  private subscription = new Subscription();
  private focusTimer: ReturnType<typeof setTimeout> | undefined;

  visible: boolean = false;
  loading: boolean = false;
  authView: AuthModalView = 'login';
  modoAcceso: AuthModalMode = 'cliente';
  returnUrl: string | null = null;
  formError = '';

  showLoginPassword: boolean = false;
  showResetPassword: boolean = false;
  showResetConfirm: boolean = false;
  showRegisterPassword = false;
  showRegisterConfirm = false;

  loginEmail: string = '';
  loginPassword: string = '';
  forgotEmail: string = '';
  forgotCode: string = '';
  resetNueva: string = '';
  resetConfirm: string = '';
  registerNombre: string = '';
  registerEmail: string = '';
  registerPassword: string = '';
  registerConfirmPassword: string = '';
  registerTipoDocumento: string = 'DNI';
  registerNumeroDocumento: string = '';

  tiposDocumento = [
    { label: 'DNI', value: 'DNI' },
    { label: 'CE', value: 'CE' },
    { label: 'Pasaporte', value: 'Pasaporte' }
  ];

  ngOnInit() {
    this.subscription.add(
      this.authModalService.state$.subscribe((state) => {
        this.visible = state.visible;
        this.authView = state.view;
        this.modoAcceso = state.mode;
        this.returnUrl = state.returnUrl;

        if (!state.visible) {
          this.loading = false;
        }

        // Renderiza el botón oficial de Google tras la animación del modal
        if (state.visible) {
          setTimeout(() => this.renderGoogleButtons(), 500);
        }
      })
    );
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
    clearTimeout(this.focusTimer);
  }

  closeModal() {
    if (this.loading) {
      return;
    }

    this.authModalService.close();
    this.resetForms();
  }

  switchView(view: AuthModalView) {
    this.formError = '';
    this.authModalService.open({
      view,
      mode: view === 'register' ? 'cliente' : this.modoAcceso,
      returnUrl: this.returnUrl || this.getCurrentContextUrl()
    });
    this.focusCurrentView();
  }

  focusCurrentView() {
    clearTimeout(this.focusTimer);
    this.focusTimer = setTimeout(() => {
      if (!this.visible || this.loading) return;
      this.cd.detectChanges();
      const fieldByView = {
        login: 'am-email', register: 'am-register-name',
        forgot: 'am-forgot-email', 'forgot-code': 'am-forgot-code'
      };
      document.getElementById(fieldByView[this.authView])?.focus();
    }, 0);
  }

  toggleLoginPassword() {
    this.showLoginPassword = !this.showLoginPassword;
  }

  toggleModo() {
    const next: AuthModalMode = this.modoAcceso === 'cliente' ? 'elevado' : 'cliente';
    this.seleccionarModo(next);
  }

  seleccionarModo(mode: AuthModalMode) {
    if (this.authView !== 'login') {
      return;
    }

    this.authModalService.open({
      view: 'login',
      mode,
      returnUrl: this.returnUrl || this.getCurrentContextUrl()
    });
  }

  submitLogin() {
    if (this.loading) return;
    this.formError = '';
    if (!this.loginEmail || !this.loginPassword) {
      this.showFeedback({
        severity: 'warn',
        summary: 'Campos requeridos',
        detail: 'Ingresa correo y password para continuar.',
        life: 2500
      });
      return;
    }
    if (this.loginPassword.trim() === '') {
      this.showFeedback({
        severity: 'warn',
        summary: 'Contraseña inválida',
        detail: 'La contraseña no puede ser solo espacios.',
        life: 2500
      });
      return;
    }

    this.loading = true;

    this.authService
      .login({ email: this.loginEmail, password: this.loginPassword })
      .pipe(finalize(() => {
        this.loading = false;
      }))
      .subscribe({
        next: (response) => {
          const usuario = response?.usuario;

          if (!usuario) {
            this.showFeedback({
              severity: 'error',
              summary: 'Login incompleto',
              detail: 'No fue posible obtener datos de usuario.',
              life: 3000
            });
            return;
          }

          if (this.modoAcceso === 'elevado' && usuario.rol !== 'admin') {
            this.authService.logout();
            this.showFeedback({
              severity: 'error',
              summary: 'Modo elevado restringido',
              detail: 'Esta cuenta no tiene permisos administrativos.',
              life: 3200
            });
            return;
          }

          this.showFeedback({
            severity: 'success',
            summary: 'Sesion iniciada',
            detail: `Bienvenido, ${usuario.nombre}`,
            life: 2500
          });

          this.completeAuth(usuario);
        },
        error: (error) => {
          this.showFeedback({
            severity: 'error',
            summary: 'Acceso denegado',
            detail: this.extractErrorMessage(error, 'Credenciales incorrectas o error de servidor'),
            life: 3200
          });
        }
      });
  }

  submitRegister() {
    if (this.loading) return;
    this.formError = '';
    const nombre = this.registerNombre.trim();
    const email = this.registerEmail.trim().toLowerCase();
    const password = this.registerPassword;
    const confirm = this.registerConfirmPassword;
    const tipo_documento = this.registerTipoDocumento;
    const numero_documento = this.registerNumeroDocumento.trim();

    if (!nombre || !email || !password || !confirm || !numero_documento) {
      this.showFeedback({
        severity: 'warn',
        summary: 'Campos requeridos',
        detail: 'Completa todos los campos solicitados para crear tu cuenta.',
        life: 2800
      });
      return;
    }

    if (nombre.length < 3) {
      this.showFeedback({
        severity: 'warn',
        summary: 'Nombre inválido',
        detail: 'El nombre debe tener al menos 3 caracteres.',
        life: 2800
      });
      return;
    }
    if (nombre.length > 120) {
      this.showFeedback({
        severity: 'warn',
        summary: 'Nombre muy largo',
        detail: 'El nombre no puede superar 120 caracteres.',
        life: 2800
      });
      return;
    }
    if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s-]+$/.test(nombre)) {
      this.showFeedback({
        severity: 'warn',
        summary: 'Nombre inválido',
        detail: 'El nombre solo puede contener letras, tildes y guiones.',
        life: 2800
      });
      return;
    }

    if (!this.isValidEmail(email)) {
      this.showFeedback({
        severity: 'warn',
        summary: 'Email inválido',
        detail: 'Ingresa un correo con formato válido (ej. usuario@gmail.com).',
        life: 2800
      });
      return;
    }
    if (email.length > 320) {
      this.showFeedback({
        severity: 'warn',
        summary: 'Email muy largo',
        detail: 'El correo no puede superar 320 caracteres.',
        life: 2800
      });
      return;
    }

    const docError = this.validateDocumento(tipo_documento, numero_documento);
    if (docError) {
      this.showFeedback({ severity: 'warn', summary: 'Documento inválido', detail: docError, life: 3000 });
      return;
    }

    if (password.trim() === '') {
      this.showFeedback({
        severity: 'warn',
        summary: 'Contraseña inválida',
        detail: 'La contraseña no puede estar vacía o ser solo espacios.',
        life: 2800
      });
      return;
    }
    if (password.length < 8) {
      this.showFeedback({
        severity: 'warn',
        summary: 'Contraseña muy corta',
        detail: 'La contraseña debe tener al menos 8 caracteres.',
        life: 2800
      });
      return;
    }
    if (password.length > 64) {
      this.showFeedback({
        severity: 'warn',
        summary: 'Contraseña muy larga',
        detail: 'La contraseña no puede superar 64 caracteres.',
        life: 2800
      });
      return;
    }

    if (password !== confirm) {
      this.showFeedback({
        severity: 'warn',
        summary: 'Confirmación incorrecta',
        detail: 'Las contraseñas no coinciden.',
        life: 2800
      });
      return;
    }

    this.loading = true;

    this.authService
      .register({ nombre, email, password, tipo_documento, numero_documento })
      .pipe(finalize(() => {
        this.loading = false;
      }))
      .subscribe({
        next: (response) => {
          const usuario = response?.usuario;

          if (!usuario) {
            this.showFeedback({
              severity: 'error',
              summary: 'Registro incompleto',
              detail: 'No fue posible obtener la nueva sesion.',
              life: 3000
            });
            return;
          }

          this.showFeedback({
            severity: 'success',
            summary: 'Cuenta creada',
            detail: `Tu cuenta ya esta activa, ${usuario.nombre}.`,
            life: 2800
          });

          this.completeAuth(usuario);
        },
        error: (error) => {
          this.showFeedback({
            severity: 'error',
            summary: 'No se pudo registrar',
            detail: this.extractErrorMessage(error, 'Intenta nuevamente con otro correo.'),
            life: 3200
          });
        }
      });
  }

  submitForgot() {
    if (this.loading) return;
    this.formError = '';
    const email = this.forgotEmail.trim().toLowerCase();

    if (!this.isValidEmail(email)) {
      this.showFeedback({ severity: 'warn', summary: 'Email inválido', detail: 'Ingresa un correo válido.' });
      return;
    }

    this.loading = true;
    this.authService.forgotPasswordCode(email).pipe(finalize(() => this.loading = false)).subscribe({
      next: () => {
        this.showFeedback({ severity: 'success', summary: 'Código enviado', detail: 'Revisa tu correo y copia el código de 6 caracteres.', life: 5000 });
        this.switchView('forgot-code');
      },
      error: (err) => {
        this.showFeedback({ severity: 'error', summary: 'Error', detail: this.extractErrorMessage(err, 'No se pudo enviar') });
      }
    });
  }

  submitResetCode() {
    if (this.loading) return;
    this.formError = '';
    const email = this.forgotEmail.trim().toLowerCase();
    const code = this.forgotCode.trim().toUpperCase();
    const password = this.resetNueva;
    const confirm = this.resetConfirm;

    if (!code || code.length !== 6) {
      this.showFeedback({ severity: 'warn', summary: 'Código inválido', detail: 'El código debe tener 6 caracteres.' });
      return;
    }

    if (password.length < 8) {
      this.showFeedback({ severity: 'warn', summary: 'Contraseña muy corta', detail: 'La contraseña debe tener al menos 8 caracteres.' });
      return;
    }
    if (password.length > 64) {
      this.showFeedback({ severity: 'warn', summary: 'Contraseña muy larga', detail: 'La contraseña no puede superar 64 caracteres.' });
      return;
    }
    if (/^\s|\s$/.test(password)) {
      this.showFeedback({ severity: 'warn', summary: 'Contraseña inválida', detail: 'La contraseña no debe tener espacios al inicio o al final.' });
      return;
    }

    if (password !== confirm) {
      this.showFeedback({ severity: 'warn', summary: 'No coinciden', detail: 'Las contraseñas no coinciden.' });
      return;
    }

    this.loading = true;
    this.authService.resetPasswordByCode({ email, code, password }).pipe(finalize(() => this.loading = false)).subscribe({
      next: () => {
        this.showFeedback({ severity: 'success', summary: '¡Contraseña actualizada!', detail: 'Ya puedes iniciar sesión con tu nueva contraseña.', life: 4000 });
        this.forgotCode = '';
        this.resetNueva = '';
        this.resetConfirm = '';
        this.switchView('login');
      },
      error: (err) => {
        this.showFeedback({ severity: 'error', summary: 'Error', detail: this.extractErrorMessage(err, 'Código incorrecto o expirado.'), life: 4000 });
      }
    });
  }

  toggleResetPassword() { this.showResetPassword = !this.showResetPassword; }
  toggleResetConfirm() { this.showResetConfirm = !this.showResetConfirm; }

  get loginButtonLabel() {
    return this.modoAcceso === 'elevado' ? 'Entrar en modo elevado' : 'Iniciar sesion';
  }

  get emailPlaceholder() {
    return this.modoAcceso === 'elevado' ? 'admin@novatech.com' : 'cliente@novatech.com';
  }

  private completeAuth(usuario: any) {
    const targetRoute = this.resolveTargetRoute(usuario);

    this.authModalService.close();
    this.resetForms();

    if (targetRoute && targetRoute !== this.router.url) {
      this.router.navigateByUrl(targetRoute);
    }
  }

  private resolveTargetRoute(usuario: any) {
    if (this.returnUrl && this.returnUrl !== '/login') {
      return this.returnUrl;
    }

    if (usuario?.rol === 'admin') {
      return '/empresa/dashboard';
    }

    return '/tienda';
  }

  private resetForms() {
    this.formError = '';
    this.showRegisterPassword = false;
    this.showRegisterConfirm = false;
    this.showLoginPassword = false;
    this.showResetPassword = false;
    this.showResetConfirm = false;
    this.loginEmail = '';
    this.loginPassword = '';
    this.forgotCode = '';
    this.resetNueva = '';
    this.resetConfirm = '';
    this.registerNombre = '';
    this.registerEmail = '';
    this.registerPassword = '';
    this.registerConfirmPassword = '';
    this.registerTipoDocumento = 'DNI';
    this.registerNumeroDocumento = '';
  }

  private getCurrentContextUrl() {
    const current = this.router.url;
    if (!current || current === '/login') {
      return '/tienda';
    }
    return current;
  }

  get docPlaceholder(): string {
    switch (this.registerTipoDocumento) {
      case 'DNI':      return 'Exactamente 8 dígitos';
      case 'CE':       return '8 a 12 caracteres';
      case 'Pasaporte': return '6 a 12 caracteres';
      default:         return 'Número de documento';
    }
  }

  get docMaxLength(): number {
    switch (this.registerTipoDocumento) {
      case 'DNI':      return 8;
      case 'RUC':      return 11;
      case 'CE':       return 12;
      case 'Pasaporte': return 12;
      default:         return 20;
    }
  }

  onDocumentoInput(event: Event): void {
    const tipo = this.registerTipoDocumento;
    if (tipo === 'DNI' || tipo === 'RUC') {
      const input = event.target as HTMLInputElement;
      input.value = input.value.replace(/\D/g, '').slice(0, this.docMaxLength);
      this.registerNumeroDocumento = input.value;
    }
  }

  private validateDocumento(tipo: string, numero: string): string | null {
    if (tipo === 'DNI') {
      if (!/^\d{8}$/.test(numero)) return 'El DNI debe tener exactamente 8 dígitos numéricos.';
    } else if (tipo === 'CE') {
      if (numero.length < 8 || numero.length > 12) return 'El CE debe tener entre 8 y 12 caracteres.';
    } else if (tipo === 'Pasaporte') {
      if (numero.length < 6 || numero.length > 12) return 'El pasaporte debe tener entre 6 y 12 caracteres.';
    }
    return null;
  }

  // ── Google Sign-In ──────────────────────────────────────────────────────────

  // renderGoogleButtons — renderiza el botón oficial de Google en los contenedores del modal.
  // Usa renderButton() en lugar de prompt() para evitar que los navegadores lo bloqueen,
  // ya que renderButton() abre un popup directamente desde el click del usuario.
  private renderGoogleButtons(): void {
    if (!window.google?.accounts?.id) return;
    if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.includes('TU_CLIENT_ID')) return;

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => {
        this.ngZone.run(() => this.handleGoogleCredential(response.credential));
      },
      auto_select: false
    });

    // Renderiza en ambos contenedores (login y register) si existen en el DOM
    ['google-btn-login', 'google-btn-register'].forEach(id => {
      const container = document.getElementById(id);
      if (!container) return;
      container.innerHTML = ''; // Limpia render anterior
      window.google!.accounts.id.renderButton(container, {
        theme:  'outline',
        size:   'large',
        text:   'continue_with',
        locale: 'es',
        width:  container.offsetWidth || 300,
        shape:  'rectangular',
      });
    });
  }

  private handleGoogleCredential(credential: string): void {
    if (!credential) return;
    this.loading = true;

    this.authService.googleLogin(credential).pipe(
      finalize(() => this.loading = false)
    ).subscribe({
      next: (response) => {
        const usuario = response?.usuario;
        if (!usuario) {
          this.showFeedback({ severity: 'error', summary: 'Error', detail: 'No se pudo obtener datos del usuario.' });
          return;
        }
        this.showFeedback({
          severity: 'success',
          summary: 'Bienvenido',
          detail: `Sesión iniciada como ${usuario.nombre}`,
          life: 2500
        });
        this.completeAuth(usuario);
      },
      error: (err) => {
        this.showFeedback({
          severity: 'error',
          summary: 'Error con Google',
          detail: this.extractErrorMessage(err, 'No se pudo verificar tu cuenta de Google.'),
          life: 4000
        });
      }
    });
  }

  private isValidEmail(email: string) {
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    return pattern.test(email);
  }

  private extractErrorMessage(error: any, fallback: string) {
    return error?.error?.message || error?.error?.mensaje || fallback;
  }

  private showFeedback(message: ToastMessageOptions) {
    this.messageService.add(message);
    this.formError = message.severity === 'warn' || message.severity === 'error'
      ? `${message.summary ?? ''}. ${message.detail ?? ''}`
      : '';
    this.cd.detectChanges();
    if (this.formError) document.getElementById('auth-feedback')?.focus();
  }
}
