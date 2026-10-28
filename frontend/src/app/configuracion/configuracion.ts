import { Component, inject, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../services/auth';
import { DireccionesService, Direccion } from '../services/direcciones.service';
import { MessageService } from 'primeng/api';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { DialogModule } from 'primeng/dialog';
import { TooltipModule } from 'primeng/tooltip';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';

@Component({
  selector: 'app-configuracion',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, PasswordModule, DialogModule, TooltipModule, TagModule, SelectModule],
  templateUrl: './configuracion.html',
  styleUrl: './configuracion.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConfiguracionPage implements OnInit {
  private auth       = inject(AuthService);
  private dirService = inject(DireccionesService);
  private msg        = inject(MessageService);
  private cd         = inject(ChangeDetectorRef);

  usuario: any = null;

  inputNombre    = '';
  inputEmail     = '';
  inputDni       = '';
  inputTelefono  = '';
  inputTipoDoc   = 'DNI';
  guardandoPerfil = false;
  savedPerfil     = false;
  savedPass       = false;
  savedDir        = false;

  tiposDocumento = [
    { label: 'DNI (8 dígitos)', value: 'DNI' },
    { label: 'CE (8-12 car.)', value: 'CE' },
    { label: 'Pasaporte (6-12 car.)', value: 'Pasaporte' }
  ];

  get docPlaceholder(): string {
    switch (this.inputTipoDoc) {
      case 'DNI': return 'Exactamente 8 dígitos numéricos';
      case 'CE': return '8 a 12 caracteres';
      case 'Pasaporte': return '6 a 12 caracteres';
      default: return 'Número de documento';
    }
  }

  get docMaxLength(): number {
    switch (this.inputTipoDoc) {
      case 'DNI': return 8;
      case 'CE': return 12;
      case 'Pasaporte': return 12;
      default: return 20;
    }
  }

  onDocInput(event: Event): void {
    if (this.inputTipoDoc === 'DNI') {
      const input = event.target as HTMLInputElement;
      input.value = input.value.replace(/\D/g, '').slice(0, 8);
      this.inputDni = input.value;
    }
  }

  onTelefonoInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.value = input.value.replace(/\D/g, '').slice(0, 9);
    this.inputTelefono = input.value;
  }

  onCodigoPostalInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.value = input.value.replace(/\D/g, '').slice(0, 5);
    this.dirActual.codigo_postal = input.value;
  }

  onSoloLetrasInput(event: Event, field: 'destinatario' | 'distrito' | 'provincia'): void {
    const input = event.target as HTMLInputElement;
    const sanitized = input.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s\-\.]/g, '');
    input.value = sanitized;
    (this.dirActual as any)[field === 'destinatario' ? 'destinatario' : field] = sanitized;
    if (field === 'destinatario') this.dirActual.destinatario = sanitized;
    if (field === 'distrito')     this.dirActual.distrito     = sanitized;
    if (field === 'provincia')    this.dirActual.provincia    = sanitized;
  }

  passActual  = '';
  passNueva   = '';
  passConfirm = '';
  guardandoPass = false;

  direcciones: Direccion[] = [];
  loadingDirs     = false;
  mostrarDirDialog = false;
  dirActual: Partial<Direccion> = {};
  guardandoDir = false;

  
  ngOnInit() {
    this.usuario = this.auth.currentUserValue;
    if (this.usuario) {
      this.inputNombre   = this.usuario.nombre            || '';
      this.inputEmail    = this.usuario.email             || '';
      this.inputDni      = this.usuario.numero_documento  || '';
      this.inputTelefono = this.usuario.telefono          || '';
      this.inputTipoDoc  = this.usuario.tipo_documento    || 'DNI';
      this.cargarDirecciones();
    }
  }

  private readonly EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;


  guardarPerfil() {
    const nombreVal = this.inputNombre.trim();
    if (!nombreVal) {
      this.msg.add({ severity: 'warn', summary: 'Nombre requerido', detail: 'El nombre completo es obligatorio.' });
      return;
    }
    if (nombreVal.length < 3) {
      this.msg.add({ severity: 'warn', summary: 'Nombre muy corto', detail: 'El nombre debe tener al menos 3 caracteres.' });
      return;
    }
    if (nombreVal.length > 120) {
      this.msg.add({ severity: 'warn', summary: 'Nombre muy largo', detail: 'El nombre no puede superar 120 caracteres.' });
      return;
    }
    if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s-]+$/.test(nombreVal)) {
      this.msg.add({ severity: 'warn', summary: 'Nombre inválido', detail: 'El nombre solo puede contener letras, tildes y guiones.' });
      return;
    }

    const emailVal = this.inputEmail.trim();
    if (emailVal && !this.EMAIL_RE.test(emailVal)) {
      this.msg.add({ severity: 'warn', summary: 'Email inválido', detail: 'Ingresa un formato de correo válido (ej. nombre@dominio.com).' });
      return;
    }
    if (emailVal && emailVal.length > 320) {
      this.msg.add({ severity: 'warn', summary: 'Email muy largo', detail: 'El correo no puede superar 320 caracteres.' });
      return;
    }

    const telVal = this.inputTelefono.trim();
    if (telVal && !/^\d{9}$/.test(telVal)) {
      this.msg.add({ severity: 'warn', summary: 'Teléfono inválido', detail: 'El teléfono debe tener exactamente 9 dígitos.' });
      return;
    }
    if (telVal && !telVal.startsWith('9')) {
      this.msg.add({ severity: 'warn', summary: 'Teléfono inválido', detail: 'El teléfono debe comenzar con 9 (ej. 987654321).' });
      return;
    }

    if (!this.usuario?.numero_documento && this.inputDni.trim()) {
      if (this.inputTipoDoc === 'DNI' && !/^\d{8}$/.test(this.inputDni.trim())) {
        this.msg.add({ severity: 'warn', summary: 'DNI inválido', detail: 'El DNI debe tener exactamente 8 dígitos numéricos.' });
        return;
      }
      if (this.inputTipoDoc === 'CE' && (this.inputDni.trim().length < 8 || this.inputDni.trim().length > 12)) {
        this.msg.add({ severity: 'warn', summary: 'CE inválido', detail: 'El CE debe tener entre 8 y 12 caracteres.' });
        return;
      }
      if (this.inputTipoDoc === 'Pasaporte' && (this.inputDni.trim().length < 6 || this.inputDni.trim().length > 12)) {
        this.msg.add({ severity: 'warn', summary: 'Pasaporte inválido', detail: 'El pasaporte debe tener entre 6 y 12 caracteres.' });
        return;
      }
    }

    this.guardandoPerfil = true;
    this.cd.markForCheck();

    const payload: Parameters<typeof this.auth.updateProfile>[0] = {
      nombre:   this.inputNombre.trim(),
      telefono: telVal || undefined,
      email:    emailVal || undefined
    };

    if (!this.usuario?.numero_documento && this.inputDni.trim()) {
      payload.tipo_documento   = this.inputTipoDoc;
      payload.numero_documento = this.inputDni.trim();
    }

    this.auth.updateProfile(payload).subscribe({
      next: () => {
        this.msg.add({ severity: 'success', summary: 'Perfil actualizado' });
        if (this.usuario) {
          this.usuario.nombre   = this.inputNombre.trim();
          this.usuario.telefono = this.inputTelefono.trim();
          this.usuario.email    = this.inputEmail.trim() || this.usuario.email;
          if (!this.usuario.numero_documento && this.inputDni.trim()) {
            this.usuario.tipo_documento   = this.inputTipoDoc;
            this.usuario.numero_documento = this.inputDni.trim();
          }
          const stored = JSON.parse(localStorage.getItem('nt_current_user') || '{}');
          localStorage.setItem('nt_current_user', JSON.stringify({
            ...stored,
            nombre:           this.usuario.nombre,
            telefono:         this.usuario.telefono,
            email:            this.usuario.email,
            tipo_documento:   this.usuario.tipo_documento,
            numero_documento: this.usuario.numero_documento
          }));
        }
        this.guardandoPerfil = false;
        this.savedPerfil     = true;
        this.cd.markForCheck();
        setTimeout(() => { this.savedPerfil = false; this.cd.markForCheck(); }, 2000);
      },
      error: () => {
        this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudo actualizar el perfil.' });
        this.guardandoPerfil = false;
        this.cd.markForCheck();
      }
    });
  }


  cambiarPassword() {
    if (!this.passActual) {
      this.msg.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Ingresa tu contraseña actual.' });
      return;
    }
    if (!this.passNueva || this.passNueva.length < 8) {
      this.msg.add({ severity: 'warn', summary: 'Contraseña muy corta', detail: 'La nueva contraseña debe tener al menos 8 caracteres.' });
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
    if (this.passNueva === this.passActual) {
      this.msg.add({ severity: 'warn', summary: 'Sin cambios', detail: 'La nueva contraseña debe ser diferente a la actual.' });
      return;
    }
    if (this.passNueva !== this.passConfirm) {
      this.msg.add({ severity: 'warn', summary: 'No coinciden', detail: 'La confirmación no coincide con la nueva contraseña.' });
      return;
    }

    this.guardandoPass = true;
    this.cd.markForCheck();

    this.auth.changePassword({ passActual: this.passActual, passNueva: this.passNueva }).subscribe({
      next: () => {
        this.msg.add({ severity: 'success', summary: 'Contraseña actualizada' });
        this.passActual = ''; this.passNueva = ''; this.passConfirm = '';
        this.guardandoPass = false;
        this.savedPass     = true;
        this.cd.markForCheck();
        setTimeout(() => { this.savedPass = false; this.cd.markForCheck(); }, 2000);
      },
      error: (err) => {
        this.msg.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Contraseña actual incorrecta.' });
        this.guardandoPass = false;
        this.cd.markForCheck();
      }
    });
  }


  cargarDirecciones() {
    this.loadingDirs = true;
    this.cd.markForCheck();

    this.dirService.getDirecciones().pipe(catchError(() => of([] as Direccion[]))).subscribe(res => {
      this.direcciones = res;
      this.loadingDirs = false;
      this.cd.markForCheck();
    });
  }

  abrirDirDialog(dir?: Direccion) {
    this.dirActual = dir
      ? { ...dir }
      : { alias: '', destinatario: '', direccion_detallada: '', distrito: '', provincia: '', predeterminada: false };
    this.mostrarDirDialog = true;
    this.cd.markForCheck();
  }

  private readonly SOLO_LETRAS_RE = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s\-\.]+$/;

  guardarDireccion() {
    const alias        = this.dirActual.alias?.trim() || '';
    const destinatario = this.dirActual.destinatario?.trim() || '';
    const direccion    = this.dirActual.direccion_detallada?.trim() || '';
    const distrito     = this.dirActual.distrito?.trim() || '';
    const provincia    = this.dirActual.provincia?.trim() || '';
    const cp           = this.dirActual.codigo_postal?.toString().trim() || '';

    if (!alias) {
      this.msg.add({ severity: 'warn', summary: 'Alias requerido', detail: 'El alias es obligatorio (ej. Casa, Trabajo).' });
      return;
    }
    if (alias.length < 2) {
      this.msg.add({ severity: 'warn', summary: 'Alias muy corto', detail: 'El alias debe tener al menos 2 caracteres.' });
      return;
    }
    if (alias.length > 80) {
      this.msg.add({ severity: 'warn', summary: 'Alias muy largo', detail: 'El alias no puede superar 80 caracteres.' });
      return;
    }
    if (!/[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]/.test(alias)) {
      this.msg.add({ severity: 'warn', summary: 'Alias inválido', detail: 'El alias debe contener al menos una letra (ej. Casa, Trabajo, Oficina).' });
      return;
    }

    if (!destinatario) {
      this.msg.add({ severity: 'warn', summary: 'Destinatario requerido', detail: 'Ingresa el nombre completo de quien recibirá el pedido.' });
      return;
    }
    if (destinatario.length < 5) {
      this.msg.add({ severity: 'warn', summary: 'Nombre muy corto', detail: 'El nombre del destinatario debe tener al menos 5 caracteres (nombre y apellido).' });
      return;
    }
    if (destinatario.length > 120) {
      this.msg.add({ severity: 'warn', summary: 'Nombre muy largo', detail: 'El destinatario no puede superar 120 caracteres.' });
      return;
    }
    if (!this.SOLO_LETRAS_RE.test(destinatario)) {
      this.msg.add({ severity: 'warn', summary: 'Destinatario inválido', detail: 'El nombre solo puede contener letras, tildes y espacios. Sin números ni caracteres especiales.' });
      return;
    }
    if (!destinatario.includes(' ')) {
      this.msg.add({ severity: 'warn', summary: 'Nombre incompleto', detail: 'Ingresa nombre y apellido (ej. Juan García). Obligatorio para la entrega.' });
      return;
    }

    if (!direccion) {
      this.msg.add({ severity: 'warn', summary: 'Dirección requerida', detail: 'La dirección detallada es obligatoria.' });
      return;
    }
    if (direccion.length < 8) {
      this.msg.add({ severity: 'warn', summary: 'Dirección muy corta', detail: 'Ingresa la dirección completa con nombre de calle y número (ej. Av. Lima 456).' });
      return;
    }
    if (direccion.length > 220) {
      this.msg.add({ severity: 'warn', summary: 'Dirección muy larga', detail: 'La dirección no puede superar 220 caracteres.' });
      return;
    }
    if (!/\d/.test(direccion)) {
      this.msg.add({ severity: 'warn', summary: 'Falta número de calle', detail: 'La dirección debe incluir el número del inmueble (ej. Av. Lima 456 o Jr. Junín 123, Dpto 2).' });
      return;
    }

    if (!distrito) {
      this.msg.add({ severity: 'warn', summary: 'Distrito requerido', detail: 'El distrito es obligatorio.' });
      return;
    }
    if (distrito.length < 3) {
      this.msg.add({ severity: 'warn', summary: 'Distrito muy corto', detail: 'El nombre del distrito debe tener al menos 3 letras (ej. Lince, Surco).' });
      return;
    }
    if (distrito.length > 80) {
      this.msg.add({ severity: 'warn', summary: 'Distrito muy largo', detail: 'El distrito no puede superar 80 caracteres.' });
      return;
    }
    if (!this.SOLO_LETRAS_RE.test(distrito)) {
      this.msg.add({ severity: 'warn', summary: 'Distrito inválido', detail: 'El distrito solo puede contener letras y espacios (ej. San Isidro, Miraflores, Ate Vitarte).' });
      return;
    }

    if (!provincia) {
      this.msg.add({ severity: 'warn', summary: 'Provincia requerida', detail: 'La provincia es obligatoria.' });
      return;
    }
    if (provincia.length < 3) {
      this.msg.add({ severity: 'warn', summary: 'Provincia muy corta', detail: 'El nombre de la provincia debe tener al menos 3 letras (ej. Lima, Cusco).' });
      return;
    }
    if (provincia.length > 80) {
      this.msg.add({ severity: 'warn', summary: 'Provincia muy larga', detail: 'La provincia no puede superar 80 caracteres.' });
      return;
    }
    if (!this.SOLO_LETRAS_RE.test(provincia)) {
      this.msg.add({ severity: 'warn', summary: 'Provincia inválida', detail: 'La provincia solo puede contener letras y espacios (ej. Lima, Arequipa, La Libertad).' });
      return;
    }

    if (cp && !/^\d{5}$/.test(cp)) {
      this.msg.add({ severity: 'warn', summary: 'Código postal inválido', detail: 'El código postal peruano tiene exactamente 5 dígitos numéricos (ej. 15001, 07001).' });
      return;
    }

    this.guardandoDir = true;
    this.cd.markForCheck();

    const req$ = this.dirActual.id
      ? this.dirService.updateDireccion(this.dirActual.id, this.dirActual as Direccion)
      : this.dirService.createDireccion(this.dirActual as Direccion);

    req$.subscribe({
      next: () => {
        this.mostrarDirDialog = false;
        this.guardandoDir = false;
        this.savedDir     = true;
        this.msg.add({ severity: 'success', summary: this.dirActual.id ? 'Dirección actualizada' : 'Dirección agregada' });
        this.cargarDirecciones();
        setTimeout(() => { this.savedDir = false; this.cd.markForCheck(); }, 2000);
      },
      error: () => {
        this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudo guardar la dirección.' });
        this.guardandoDir = false;
        this.cd.markForCheck();
      }
    });
  }

  eliminarDireccion(id?: number) {
    if (!id) return;
    this.dirService.deleteDireccion(id).pipe(catchError(() => of(null))).subscribe(() => {
      this.msg.add({ severity: 'success', summary: 'Dirección eliminada' });
      this.cargarDirecciones();
    });
  }

  getInitial(nombre: string): string {
    return (nombre || 'U').charAt(0).toUpperCase();
  }

}

