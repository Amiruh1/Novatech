import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { finalize, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { trigger, transition, style, animate } from '@angular/animations';

import { Cart, CartItem } from '../services/cart';
import { AuthService } from '../services/auth';
import { SalesService, SalePaymentPayload } from '../services/sales';
import { DireccionesService, Direccion } from '../services/direcciones.service';
import { MessageService, ToastMessageOptions } from 'primeng/api';
import { AuthModalService } from '../services/auth-modal';
import { precioFinal } from '../core/models/product.model';

import { ButtonModule }      from 'primeng/button';
import { SelectModule }      from 'primeng/select';
import { InputTextModule }   from 'primeng/inputtext';
import { TextareaModule }    from 'primeng/textarea';
import { DialogModule }      from 'primeng/dialog';
import { NarratorToggle } from '../accessibility/narrator-toggle';

interface MetodoPagoOption {
  label: string;
  value: string;
  icon: string;
}

const stepAnim = trigger('stepAnim', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateY(14px) scale(0.99)' }),
    animate(
      '240ms cubic-bezier(0.16, 1, 0.3, 1)',
      style({ opacity: 1, transform: 'translateY(0) scale(1)' })
    )
  ])
]);

const successAnim = trigger('successAnim', [
  transition(':enter', [
    style({ opacity: 0, transform: 'scale(0.94)' }),
    animate(
      '320ms cubic-bezier(0.34, 1.56, 0.64, 1)',
      style({ opacity: 1, transform: 'scale(1)' })
    )
  ])
]);

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule,
    ButtonModule, SelectModule, InputTextModule,
    TextareaModule, DialogModule, NarratorToggle
  ],
  templateUrl: './checkout.html',
  styleUrl:    './checkout.scss',
  animations:  [stepAnim, successAnim]
})
export class Checkout implements OnInit {

  private cart             = inject(Cart);
  private auth             = inject(AuthService);
  private salesService     = inject(SalesService);
  private direccionesService = inject(DireccionesService);
  private messageService   = inject(MessageService);
  private authModalService = inject(AuthModalService);
  private router           = inject(Router);
  private cd               = inject(ChangeDetectorRef);

  step: 1 | 2 | 3 | 4 = 1;
  items: CartItem[]   = [];
  procesando          = false;
  validationMessage = '';

  misDirecciones:       Direccion[]   = [];
  direccionSeleccionada: number | null = null;
  costoEnvio           = 0;
  loadingDirs          = false;

  showDirDialog        = false;
  guardandoDir         = false;
  nuevaDireccion: Partial<Direccion> = {};

  metodoPagoSeleccionado = 'tarjeta';
  telefonoBilletera      = '';
  codigoVerificacion     = '';
  numeroTarjeta          = '';
  vencimientoTarjeta     = '';
  cvvTarjeta             = '';
  nombreTitular          = '';
  bancoTransferencia     = '';
  nroOperacionTransferencia = '';

  tipoComprobante: 'boleta' | 'factura' = 'boleta';
  documentoFiscal  = '';
  razonSocial      = '';
  comentarioPago   = '';

  ventaId:    number | null = null;
  ventaFecha  = '';
  ventaMetodo = '';

  getPrecioFinal = precioFinal;

  readonly metodosPago: MetodoPagoOption[] = [
    { label: 'Tarjeta de crédito / débito', value: 'tarjeta',       icon: 'pi pi-credit-card' },
    { label: 'Yape / Plin',                 value: 'billetera',     icon: 'pi pi-wallet'      },
    { label: 'Transferencia bancaria',      value: 'transferencia', icon: 'pi pi-building'    }
  ];

  private readonly TARIFAS: Record<string, number> = {
    'lima': 10, 'callao': 10, 'miraflores': 12, 'san isidro': 12,
    'surco': 12, 'la molina': 14, 'san juan de lurigancho': 15,
    'ate': 15, 'villa el salvador': 16, 'chorrillos': 14, 'default': 20
  };

  ngOnInit() {
    const user = this.auth.currentUserValue;
    if (!user) {
      this.authModalService.open({ view: 'login', mode: 'cliente', returnUrl: '/checkout' });
      this.router.navigate(['/carrito']);
      return;
    }

    this.items = this.cart.getItems();
    if (!this.items.length) {
      this.router.navigate(['/tienda']);
      return;
    }

    this.cargarDirecciones();
  }

  get subtotal() { return this.cart.getSubtotal(); }
  get igv()      { return this.cart.getIGV(); }
  get total()    { return this.cart.getTotal(this.costoEnvio); }
  get totalItems() { return this.cart.getItemCount(); }

  get stepLabels() {
    return ['Resumen', 'Dirección', 'Pago', 'Confirmación'];
  }

  readonly stepIcons = ['pi-list-check', 'pi-map-marker', 'pi-credit-card', 'pi-check-circle'];

  get metodoActual() {
    return this.metodosPago.find(m => m.value === this.metodoPagoSeleccionado);
  }

  get direccionActual() {
    return this.misDirecciones.find(d => d.id === this.direccionSeleccionada);
  }

  siguiente() {
    this.validationMessage = '';
    if (this.step === 2 && !this.direccionSeleccionada) {
      this.showFeedback({ severity: 'warn', summary: 'Dirección requerida', detail: 'Selecciona o agrega una dirección de envío.' });
      return;
    }
    if (this.step < 3) {
      this.step = (this.step + 1) as any;
      this.cd.detectChanges();
      this.focusStepHeading();
    } else {
      this.confirmarPago();
    }
  }

  anterior() {
    this.validationMessage = '';
    if (this.step > 1) {
      this.step = (this.step - 1) as any;
      this.cd.detectChanges();
      this.focusStepHeading();
    } else {
      this.router.navigate(['/carrito']);
    }
  }

  private focusStepHeading() {
    document.getElementById('checkout-step-heading')?.focus();
  }

  cargarDirecciones() {
    this.loadingDirs = true;
    this.direccionesService.getDirecciones().pipe(
      catchError(() => of([] as Direccion[]))
    ).subscribe(dirs => {
      this.misDirecciones = dirs;
      const pred = dirs.find(d => d.predeterminada) ?? dirs[0] ?? null;
      if (pred?.id) {
        this.direccionSeleccionada = pred.id;
        this.actualizarEnvio(pred.id);
      }
      this.loadingDirs = false;
      this.cd.detectChanges();
    });
  }

  onDireccionChange(id: number | null) {
    this.direccionSeleccionada = id;
    this.actualizarEnvio(id);
  }

  private actualizarEnvio(id: number | null) {
    const dir  = this.misDirecciones.find(d => d.id === id);
    const clave = (dir?.distrito ?? '').toLowerCase().trim();
    this.costoEnvio = this.TARIFAS[clave] ?? this.TARIFAS['default'];
  }

  abrirDirDialog() {
    this.validationMessage = '';
    this.nuevaDireccion = { alias: '', destinatario: '', direccion_detallada: '', distrito: '', provincia: '', predeterminada: false };
    this.showDirDialog = true;
  }

  guardarDireccion() {
    this.validationMessage = '';
    const { alias, destinatario, direccion_detallada, distrito, provincia } = this.nuevaDireccion;
    if (!alias?.trim() || !destinatario?.trim() || !direccion_detallada?.trim() || !distrito?.trim() || !provincia?.trim()) {
      this.showFeedback({ severity: 'warn', summary: 'Campos requeridos', detail: 'Completa todos los campos obligatorios.' });
      return;
    }
    this.guardandoDir = true;
    this.direccionesService.createDireccion(this.nuevaDireccion as Direccion).subscribe({
      next: () => {
        this.showDirDialog = false;
        this.guardandoDir  = false;
        this.showFeedback({ severity: 'success', summary: 'Dirección guardada', detail: `"${alias}" fue añadida.` });
        this.cargarDirecciones();
      },
      error: () => {
        this.guardandoDir = false;
        this.showFeedback({ severity: 'error', summary: 'Error', detail: 'No se pudo guardar la dirección.' });
      }
    });
  }

  onNumeroTarjetaChange(v: string) {
    const d = v.replace(/\D/g, '').slice(0, 16);
    this.numeroTarjeta = d.replace(/(.{4})/g, '$1 ').trim();
  }

  onVencimientoChange(v: string) {
    const d = v.replace(/\D/g, '').slice(0, 4);
    this.vencimientoTarjeta = d.length <= 2 ? d : `${d.slice(0, 2)}/${d.slice(2)}`;
  }

  onCvvChange(v: string)       { this.cvvTarjeta = v.replace(/\D/g, '').slice(0, 4); }
  onTelefonoChange(v: string)  { this.telefonoBilletera = v.replace(/\D/g, '').slice(0, 9); }
  onCodigoChange(v: string)    { this.codigoVerificacion = v.replace(/\D/g, '').slice(0, 12); }
  onRucChange(v: string)       { this.documentoFiscal = v.replace(/\D/g, '').slice(0, 11); }

  get cardBrand(): string {
    const n = this.numeroTarjeta.replace(/\s/g, '');
    if (n.startsWith('4'))  return 'Visa';
    if (/^5[1-5]/.test(n)) return 'Mastercard';
    if (/^3[47]/.test(n))  return 'Amex';
    return '';
  }

  private validarPago(): boolean {
    if (!this.direccionSeleccionada) {
      this.showFeedback({ severity: 'warn', summary: 'Dirección requerida', detail: 'Selecciona una dirección de envío.' });
      return false;
    }

    if (this.tipoComprobante === 'factura') {
      if (!this.documentoFiscal || this.documentoFiscal.length !== 11) {
        this.showFeedback({ severity: 'warn', summary: 'RUC inválido', detail: 'Ingresa un RUC de 11 dígitos.' });
        return false;
      }
      if (!this.razonSocial.trim()) {
        this.showFeedback({ severity: 'warn', summary: 'Razón social requerida', detail: 'Ingresa la razón social.' });
        return false;
      }
    }

    if (this.metodoPagoSeleccionado === 'tarjeta') {
      const digits = this.numeroTarjeta.replace(/\s/g, '');
      if (digits.length < 13 || !this.vencimientoTarjeta || this.cvvTarjeta.length < 3 || !this.nombreTitular.trim()) {
        this.showFeedback({ severity: 'warn', summary: 'Datos de tarjeta incompletos', detail: 'Completa todos los campos de la tarjeta.' });
        return false;
      }
    }

    if (this.metodoPagoSeleccionado === 'billetera') {
      if (!this.telefonoBilletera || !this.telefonoBilletera.startsWith('9') || this.telefonoBilletera.length < 9) {
        this.showFeedback({ severity: 'warn', summary: 'Teléfono inválido', detail: 'Ingresa un número Yape/Plin válido (9 dígitos, comienza con 9).' });
        return false;
      }
      if (this.codigoVerificacion.length < 6) {
        this.showFeedback({ severity: 'warn', summary: 'Código inválido', detail: 'El código de operación debe tener al menos 6 dígitos.' });
        return false;
      }
    }

    if (this.metodoPagoSeleccionado === 'transferencia') {
      if (!this.bancoTransferencia.trim() || this.nroOperacionTransferencia.trim().length < 4) {
        this.showFeedback({ severity: 'warn', summary: 'Datos incompletos', detail: 'Ingresa el banco y número de operación.' });
        return false;
      }
    }

    return true;
  }

  confirmarPago() {
    if (this.procesando) return;
    this.validationMessage = '';
    const usuario = this.auth.currentUserValue;
    if (!usuario) { this.router.navigate(['/carrito']); return; }
    if (!this.validarPago()) return;

    const detalle = this.items.map(i => ({ id: Number(i.producto.id), cantidad: i.cantidad })).filter(i => i.id > 0);
    if (!detalle.length) return;

    this.procesando = true;

    const pago: SalePaymentPayload = {
      metodo: this.metodoPagoSeleccionado as any,
      monto_pagado: Number(this.total.toFixed(2)),
      referencia_pago: this.buildReferencia(),
      comentario_pago: this.comentarioPago.trim() || null,
      tipo_comprobante: this.tipoComprobante,
      documento_fiscal: this.tipoComprobante === 'factura' ? this.documentoFiscal : null,
      razon_social:     this.tipoComprobante === 'factura' ? this.razonSocial     : null,
      costo_envio:      this.costoEnvio,
      direccion_envio_id: this.direccionSeleccionada,
      tipo_despacho: 'envio'
    };

    this.salesService.createSale({ id_usuario: usuario.id || 1, nombre_usuario: usuario.nombre, total: this.total, detalle, pago })
      .pipe(finalize(() => { this.procesando = false; this.cd.detectChanges(); }))
      .subscribe({
        next: (res) => {
          this.ventaId    = res.id_venta;
          this.ventaFecha = new Date().toLocaleString('es-PE');
          this.ventaMetodo = this.metodoActual?.label || '';
          this.cart.clearCart();
          this.step = 4;
          this.cd.detectChanges();
          this.focusStepHeading();
        },
        error: () => {
          this.showFeedback({ severity: 'error', summary: 'Error al procesar', detail: 'Intenta nuevamente.' });
        }
      });
  }

  private buildReferencia(): string {
    if (this.metodoPagoSeleccionado === 'tarjeta') {
      const last4 = this.numeroTarjeta.replace(/\s/g, '').slice(-4) || '****';
      return `Tarjeta terminada en ${last4}`;
    }
    if (this.metodoPagoSeleccionado === 'billetera') {
      return `Yape/Plin Nro: ${this.codigoVerificacion} | Tel: ${this.telefonoBilletera}`;
    }
    return `Transferencia ${this.bancoTransferencia} Nro: ${this.nroOperacionTransferencia}`;
  }

  private showFeedback(message: ToastMessageOptions) {
    this.messageService.add(message);
    this.validationMessage = message.severity === 'warn' || message.severity === 'error'
      ? `${message.summary ?? ''}. ${message.detail ?? ''}`
      : '';
    this.cd.detectChanges();
    if (this.validationMessage) {
      const id = this.showDirDialog ? 'checkout-address-feedback' : 'checkout-feedback';
      document.getElementById(id)?.focus();
    }
  }

  irAMisCompras() { this.router.navigate(['/miscompras']); }
  irATienda()     { this.router.navigate(['/tienda']); }
}
