import { Component, inject, OnInit, ChangeDetectorRef, ElementRef, QueryList, ViewChild, ViewChildren, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Cart, CartItem } from '../services/cart';
import { AuthService } from '../services/auth';
import { SalesService } from '../services/sales';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { Router, RouterModule } from '@angular/router';
import { MessageService } from 'primeng/api';
import { finalize, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthModalService } from '../services/auth-modal';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { InputNumberModule } from 'primeng/inputnumber';
import { SalePaymentPayload } from '../services/sales';
import { DireccionesService, Direccion } from '../services/direcciones.service';
import { precioFinal } from '../core/models/product.model';
import { StoreAlertsService } from '../core/services/store-alerts.service';

interface MetodoPagoOption {
  label: string;
  value: string;
  icon: string;
}

@Component({
  selector: 'app-carrito',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    TableModule,
    RouterModule,
    DialogModule,
    SelectModule,
    InputTextModule,
    TextareaModule,
    InputNumberModule
  ],
  templateUrl: './carrito.html',
  styleUrl: './carrito.scss'
})
export class Carrito implements OnInit {
  @ViewChild('cartTitle') private cartTitle?: ElementRef<HTMLElement>;
  @ViewChildren('cartItemLink') private cartItemLinks?: QueryList<ElementRef<HTMLAnchorElement>>;
  cart = inject(Cart);
  router = inject(Router);
  auth = inject(AuthService);
  authModalService = inject(AuthModalService);
  salesService = inject(SalesService);
  messageService = inject(MessageService);
  direccionesService = inject(DireccionesService);
  private cd = inject(ChangeDetectorRef);
  private alerts = inject(StoreAlertsService);
  private readonly destroyRef = inject(DestroyRef);

  items: CartItem[] = [];
  procesandoPago: boolean = false;
  showPaymentDialog: boolean = false;
  
  misDirecciones: Direccion[] = [];
  direccionSeleccionada: number | null = null;
  costoEnvio: number = 0;

  private readonly TARIFAS_ENVIO: Record<string, number> = {
    'lima': 10,
    'callao': 10,
    'miraflores': 12,
    'san isidro': 12,
    'surco': 12,
    'la molina': 14,
    'san juan de lurigancho': 15,
    'ate': 15,
    'villa el salvador': 16,
    'chorrillos': 14,
    'default': 20
  };

  metodoPagoSeleccionado: string = 'tarjeta';
  
  telefonoBilletera: string = '';
  codigoVerificacion: string = '';

  numeroTarjeta: string = '';
  vencimientoTarjeta: string = '';
  cvvTarjeta: string = '';
  nombreTitular: string = '';

  tipoComprobante: 'boleta' | 'factura' = 'boleta';
  documentoFiscal: string = '';
  razonSocial: string = '';

  comentarioPago: string = '';

  showQuickDirDialog: boolean = false;
  guardandoNuevaDireccion: boolean = false;
  nuevaDireccion: Partial<Direccion> = {};

  ultimaVentaId: number | null = null;
  ultimaVentaCliente: string = '';
  ultimaVentaTotal: number = 0;
  ultimaVentaFecha: string = '';
  ultimaVentaMetodo: string = '';
  ultimaVentaResumenPago: string = '';
  ultimaVentaItemsSnapshot: any[] = [];
  ultimaVentaDetalleSnapshot: Array<{ id: number; cantidad: number }> = [];

  metodosPago: MetodoPagoOption[] = [
    { label: 'Tarjeta de credito/debito', value: 'tarjeta', icon: 'pi pi-credit-card' },
    { label: 'Yape / Plin', value: 'billetera', icon: 'pi pi-wallet' },
    { label: 'Transferencia Bancaria', value: 'transferencia', icon: 'pi pi-building' }
  ];

  bancoTransferencia: string = '';
  nroOperacionTransferencia: string = '';

  getPrecioFinal = precioFinal;

  trackCartItem(_index: number, item: CartItem): number {
    return Number(item.producto.id);
  }

  eliminar(productId: number) {
    const index = this.items.findIndex(item => Number(item.producto.id) === Number(productId));
    this.cart.removeFromCart(productId);
    this.actualizarDatos();
    this.cd.detectChanges();
    const links = this.cartItemLinks?.toArray() || [];
    (links[Math.min(Math.max(index, 0), links.length - 1)]?.nativeElement || this.cartTitle?.nativeElement)?.focus();
    this.messageService.add({severity:'info', summary:'Eliminado', detail:'Producto quitado del carrito'});
  }

  savedQty: Record<number, boolean> = {};

  actualizarCantidad(productId: number, nuevaCantidad: number, event?: Event) {
    const trigger = event?.currentTarget as HTMLButtonElement | null;
    this.cart.updateQuantity(productId, nuevaCantidad);
    this.actualizarDatos();
    this.savedQty[productId] = true;
    this.cd.detectChanges();
    if (trigger?.disabled) {
      trigger.parentElement?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    }
    setTimeout(() => { this.savedQty[productId] = false; this.cd.detectChanges(); }, 600);
  }

  actualizarDatos() {
    this.items = this.cart.getItems();
  }

  ngOnInit() {
    this.actualizarDatos();
    if (this.auth.isAuthenticated) {
      this.cargarDirecciones();
    }
  }

  cargarDirecciones() {
    this.direccionesService.getDirecciones().pipe(
      catchError(() => of([] as Direccion[]))
    ).subscribe(res => {
      this.misDirecciones = res;
      const predeterminada = res.find(d => d.predeterminada);
      const seleccionada = predeterminada ?? res[0] ?? null;
      if (seleccionada?.id) {
        this.direccionSeleccionada = seleccionada.id;
        this.actualizarCostoEnvio(seleccionada.id);
      }
      this.cd.detectChanges();
    });
  }

  onDireccionChange(id: number | null) {
    this.direccionSeleccionada = id;
    this.actualizarCostoEnvio(id);
  }

  private actualizarCostoEnvio(idDireccion: number | null) {
    const dir = this.misDirecciones.find(d => d.id === idDireccion);
    const clave = (dir?.distrito ?? '').toLowerCase().trim();
    this.costoEnvio = this.TARIFAS_ENVIO[clave] ?? this.TARIFAS_ENVIO['default'];
  }

  get subtotal(): number {
    return this.cart.getSubtotal();
  }

  get igv(): number {
    return this.cart.getIGV();
  }

  get total(): number {
    return this.cart.getTotal(this.costoEnvio);
  }

  irAlCheckout() {
    if (this.items.length === 0) return;

    if (!this.auth.currentUserValue) {
      this.requestLoginForCheckout();
      return;
    }

    this.router.navigate(['/checkout']);
  }

  async vaciarCarrito() {
    const trigger = document.activeElement as HTMLElement | null;
    const confirmed = await this.alerts.confirmClearCart();
    if (this.destroyRef.destroyed) return;
    if (!confirmed) { if (trigger?.isConnected) trigger.focus(); return; }
    this.cart.clearCart();
    this.actualizarDatos();
    this.cd.detectChanges();
    this.cartTitle?.nativeElement.focus();
    this.alerts.notify('success', 'Carrito vacío', 'Puedes seguir explorando el catálogo.');
  }

  pagar() {
    this.irAlCheckout();
  }

  validarFormulario(): boolean {
    if (!this.direccionSeleccionada) {
      this.messageService.add({ severity: 'warn', summary: 'Despacho', detail: 'Selecciona una direccion de envio o agrega una en Mi Cuenta.' });
      return false;
    }

    if (this.tipoComprobante === 'factura') {
      if (!this.documentoFiscal || this.documentoFiscal.length !== 11) {
        this.messageService.add({ severity: 'warn', summary: 'Facturacion', detail: 'Ingresa un RUC valido de 11 digitos.' });
        return false;
      }
      if (!this.razonSocial.trim()) {
        this.messageService.add({ severity: 'warn', summary: 'Facturacion', detail: 'Ingresa la Razon Social.' });
        return false;
      }
    }

    if (this.metodoPagoSeleccionado === 'tarjeta') {
      const cardDigits = this.onlyDigits(this.numeroTarjeta, 19);
      const cvvDigits = this.onlyDigits(this.cvvTarjeta, 4);

      if (!cardDigits || !this.vencimientoTarjeta || !cvvDigits || !this.nombreTitular.trim()) {
        this.messageService.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Completa todos los datos de la tarjeta.' });
        return false;
      }

      if (cardDigits.length < 13) {
        this.messageService.add({ severity: 'warn', summary: 'Tarjeta invalida', detail: 'Ingresa un numero de tarjeta valido.' });
        return false;
      }

      if (!this.isValidExpiry(this.vencimientoTarjeta)) {
        this.messageService.add({ severity: 'warn', summary: 'Vencimiento invalido', detail: 'Usa formato MM/YY con una fecha vigente.' });
        return false;
      }

      if (cvvDigits.length < 3) {
        this.messageService.add({ severity: 'warn', summary: 'CVV invalido', detail: 'El CVV debe tener 3 o 4 digitos.' });
        return false;
      }
    } else if (this.metodoPagoSeleccionado === 'billetera') {
      if (!this.telefonoBilletera || !this.codigoVerificacion) {
        this.messageService.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Ingresa el telefono y numero de operacion.' });
        return false;
      }

      if (this.telefonoBilletera.length < 9) {
        this.messageService.add({ severity: 'warn', summary: 'Teléfono inválido', detail: 'El teléfono debe tener 9 dígitos.' });
        return false;
      }
      if (!this.telefonoBilletera.startsWith('9')) {
        this.messageService.add({ severity: 'warn', summary: 'Teléfono inválido', detail: 'El teléfono debe comenzar con 9 (ej. 987654321).' });
        return false;
      }

      if (this.codigoVerificacion.length < 6) {
        this.messageService.add({ severity: 'warn', summary: 'Operacion invalida', detail: 'El codigo de operacion debe tener al menos 6 digitos.' });
        return false;
      }
    } else if (this.metodoPagoSeleccionado === 'transferencia') {
      if (!this.bancoTransferencia.trim()) {
        this.messageService.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Ingresa el nombre del banco.' });
        return false;
      }
      if (!this.nroOperacionTransferencia.trim() || this.nroOperacionTransferencia.trim().length < 4) {
        this.messageService.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Ingresa el numero de operacion (min 4 digitos).' });
        return false;
      }
    }
    return true;
  }

  confirmarPago() {
    if (this.items.length === 0 || this.procesandoPago) return;

    const usuario = this.auth.currentUserValue;
    if (!usuario) {
      this.requestLoginForCheckout();
      return;
    }

    if (!this.validarFormulario()) return;

    const detalle = this.buildDetallePayload();
    if (!detalle.length) return;

    this.procesandoPago = true;

    const itemsSnapshot = this.items.map(item => ({ ...item }));
    const resumenPago = this.buildResumenPago();

    this.salesService.createSale({
      id_usuario: usuario.id || 1,
      nombre_usuario: usuario.nombre,
      total: this.total,
      detalle,
      pago: this.buildPagoPayload()
    })
    .pipe(finalize(() => { this.procesandoPago = false; }))
    .subscribe({
      next: (res) => {
        this.ultimaVentaId = res.id_venta;
        this.ultimaVentaCliente = usuario.nombre;
        this.ultimaVentaTotal = this.total;
        this.ultimaVentaFecha = new Date().toLocaleString();
        this.ultimaVentaMetodo = this.metodoSeleccionado?.label || 'No especificado';
        this.ultimaVentaResumenPago = resumenPago;
        this.ultimaVentaItemsSnapshot = itemsSnapshot;
        this.ultimaVentaDetalleSnapshot = detalle;

        this.messageService.add({ severity: 'success', summary: 'Pago confirmado', detail: 'Transaccion registrada. Puedes descargar el comprobante manualmente.' });
        
        this.showPaymentDialog = false;
        this.limpiarFormulario();
        this.cart.clearCart();
        this.actualizarDatos();
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Pago no completado', detail: 'Intenta nuevamente.' });
      }
    });
  }

  cancelarPago() {
    if (this.procesandoPago) return;
    this.showPaymentDialog = false;
  }

  limpiarFormulario() {
    this.telefonoBilletera = '';
    this.codigoVerificacion = '';
    this.numeroTarjeta = '';
    this.vencimientoTarjeta = '';
    this.cvvTarjeta = '';
    this.nombreTitular = '';
    this.comentarioPago = '';
    this.documentoFiscal = '';
    this.razonSocial = '';
    this.tipoComprobante = 'boleta';
  }

  onTelefonoBilleteraChange(value: string) {
    this.telefonoBilletera = this.onlyDigits(value, 9);
  }

  onCodigoVerificacionChange(value: string) {
    this.codigoVerificacion = this.onlyDigits(value, 12);
  }

  onNumeroTarjetaChange(value: string) {
    const digits = this.onlyDigits(value, 19);
    this.numeroTarjeta = digits.replace(/(.{4})/g, '$1 ').trim();
  }

  onVencimientoTarjetaChange(value: string) {
    const digits = this.onlyDigits(value, 4);
    if (digits.length <= 2) {
      this.vencimientoTarjeta = digits;
      return;
    }

    this.vencimientoTarjeta = `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  onCvvTarjetaChange(value: string) {
    this.cvvTarjeta = this.onlyDigits(value, 4);
  }

  onDocumentoFiscalChange(value: string) {
    this.documentoFiscal = this.onlyDigits(value, 11);
  }

  get metodoSeleccionado() {
    return this.metodosPago.find(item => item.value === this.metodoPagoSeleccionado);
  }

  private requestLoginForCheckout() {
    this.showPaymentDialog = false;
    this.authModalService.open({
      view: 'login',
      mode: 'cliente',
      returnUrl: '/carrito'
    });
  }

  descargarUltimoComprobante() {
    if (!this.ultimaVentaId) return;
    this.generarComprobantePDF(
      this.ultimaVentaId,
      this.ultimaVentaCliente,
      this.ultimaVentaItemsSnapshot,
      this.ultimaVentaDetalleSnapshot,
      this.ultimaVentaTotal,
      this.ultimaVentaResumenPago,
      this.ultimaVentaFecha,
      this.ultimaVentaMetodo
    );
  }

  private buildDetallePayload() {
    return this.items.map(item => ({
      id: Number(item.producto.id),
      cantidad: item.cantidad
    })).filter(i => i.id > 0 && i.cantidad > 0);
  }

  private buildResumenPago(): string {
    if (this.metodoPagoSeleccionado === 'billetera') {
      return `Operacion: ${this.codigoVerificacion || 'N/A'} | Telefono: ${this.telefonoBilletera || 'N/A'}`;
    }
    if (this.metodoPagoSeleccionado === 'transferencia') {
      return `Transferencia ${this.bancoTransferencia || ''} | Nro: ${this.nroOperacionTransferencia || 'N/A'}`;
    }
    const terminacion = this.numeroTarjeta ? this.numeroTarjeta.replace(/\s+/g, '').slice(-4) : '****';
    return `Tarjeta terminada en ${terminacion}`;
  }

  private buildPagoPayload(): SalePaymentPayload {
    const validMethods = ['tarjeta', 'billetera', 'transferencia'] as const;
    const metodo = validMethods.includes(this.metodoPagoSeleccionado as any)
      ? (this.metodoPagoSeleccionado as 'tarjeta' | 'billetera' | 'transferencia')
      : 'no-definido';

    return {
      metodo,
      monto_pagado: Number(Math.max(0, this.total).toFixed(2)),
      referencia_pago: this.buildReferenciaPago(metodo),
      comentario_pago: this.buildComentarioFinal(),
      tipo_comprobante: this.tipoComprobante,
      documento_fiscal: this.tipoComprobante === 'factura' ? this.documentoFiscal : null,
      razon_social: this.tipoComprobante === 'factura' ? this.razonSocial : null,
      costo_envio: this.costoEnvio,
      direccion_envio_id: this.direccionSeleccionada,
      tipo_despacho: 'envio' as const
    };
  }

  private buildComentarioFinal(): string {
    let base = this.comentarioPago.trim() ? this.comentarioPago.trim() + ' | ' : '';
    const dir = this.misDirecciones.find(d => d.id === this.direccionSeleccionada);
    base += `DESPACHO: Domicilio (${dir?.direccion_detallada}, ${dir?.distrito})`;
    return base;
  }

  private buildReferenciaPago(metodo: SalePaymentPayload['metodo']) {
    if (metodo === 'tarjeta') {
      const digits = this.numeroTarjeta.replace(/\s+/g, '');
      const last4 = digits ? digits.slice(-4) : '****';
      return `Tarjeta terminada en ${last4}`;
    }

    if (metodo === 'billetera') {
      const operacion = this.codigoVerificacion || 'N/A';
      const telefono = this.telefonoBilletera || 'N/A';
      return `Operacion ${operacion} | Tel ${telefono}`;
    }

    if (metodo === 'transferencia') {
      return `Transferencia ${this.bancoTransferencia || ''} Nro: ${this.nroOperacionTransferencia || 'N/A'}`;
    }

    return null;
  }

  abrirQuickDirDialog() {
    this.nuevaDireccion = { alias: '', destinatario: '', direccion_detallada: '', distrito: '', provincia: '', predeterminada: false };
    this.showQuickDirDialog = true;
  }

  onCpQuickInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.value = input.value.replace(/\D/g, '').slice(0, 5);
    this.nuevaDireccion.codigo_postal = input.value;
  }

  guardarNuevaDireccionRapida() {
    const alias        = this.nuevaDireccion.alias?.trim() || '';
    const destinatario = this.nuevaDireccion.destinatario?.trim() || '';
    const direccion    = this.nuevaDireccion.direccion_detallada?.trim() || '';
    const distrito     = this.nuevaDireccion.distrito?.trim() || '';
    const provincia    = this.nuevaDireccion.provincia?.trim() || '';
    const cp           = this.nuevaDireccion.codigo_postal?.toString().trim() || '';

    if (!alias) { this.messageService.add({ severity: 'warn', summary: 'Alias requerido', detail: 'Escribe un alias para identificar esta dirección (ej. Casa, Trabajo).' }); return; }
    if (alias.length > 80) { this.messageService.add({ severity: 'warn', summary: 'Alias muy largo', detail: 'El alias no puede superar 80 caracteres.' }); return; }
    if (!destinatario) { this.messageService.add({ severity: 'warn', summary: 'Destinatario requerido', detail: 'Ingresa el nombre de quien recibirá el pedido.' }); return; }
    if (destinatario.length > 120) { this.messageService.add({ severity: 'warn', summary: 'Destinatario muy largo', detail: 'El destinatario no puede superar 120 caracteres.' }); return; }
    if (!direccion) { this.messageService.add({ severity: 'warn', summary: 'Dirección requerida', detail: 'La dirección detallada es obligatoria.' }); return; }
    if (direccion.length > 220) { this.messageService.add({ severity: 'warn', summary: 'Dirección muy larga', detail: 'La dirección no puede superar 220 caracteres.' }); return; }
    if (!distrito) { this.messageService.add({ severity: 'warn', summary: 'Distrito requerido', detail: 'El distrito es obligatorio.' }); return; }
    if (distrito.length > 80) { this.messageService.add({ severity: 'warn', summary: 'Distrito muy largo', detail: 'El distrito no puede superar 80 caracteres.' }); return; }
    if (!provincia) { this.messageService.add({ severity: 'warn', summary: 'Provincia requerida', detail: 'La provincia es obligatoria.' }); return; }
    if (provincia.length > 80) { this.messageService.add({ severity: 'warn', summary: 'Provincia muy larga', detail: 'La provincia no puede superar 80 caracteres.' }); return; }
    if (cp && !/^\d{5}$/.test(cp)) { this.messageService.add({ severity: 'warn', summary: 'Código postal inválido', detail: 'El código postal debe tener exactamente 5 dígitos.' }); return; }

    this.guardandoNuevaDireccion = true;
    this.direccionesService.createDireccion(this.nuevaDireccion as Direccion).subscribe({
      next: () => {
        this.showQuickDirDialog = false;
        this.guardandoNuevaDireccion = false;
        this.messageService.add({ severity: 'success', summary: 'Dirección guardada', detail: `"${alias}" fue añadida. Ya puedes continuar con tu pedido.`, life: 3500 });
        this.cargarDirecciones();
        this.cd.detectChanges();
      },
      error: () => {
        this.guardandoNuevaDireccion = false;
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo guardar la dirección. Intenta de nuevo.' });
      }
    });
  }

  private onlyDigits(value: string, maxLength: number): string {
    return String(value || '').replace(/\D/g, '').slice(0, maxLength);
  }

  private isValidExpiry(value: string): boolean {
    const match = /^(\d{2})\/(\d{2})$/.exec((value || '').trim());
    if (!match) {
      return false;
    }

    const month = Number(match[1]);
    const year = Number(match[2]);

    if (month < 1 || month > 12) {
      return false;
    }

    const now = new Date();
    const currentYear = now.getFullYear() % 100;
    const currentMonth = now.getMonth() + 1;

    if (year < currentYear) {
      return false;
    }

    if (year === currentYear && month < currentMonth) {
      return false;
    }

    return true;
  }

  private async generarComprobantePDF(
    idVenta: number,
    nombreCliente: string,
    itemsSnapshot: any[],
    detalleSnapshot: Array<{ id: number; cantidad: number }>,
    totalPagado: number,
    resumenPago: string,
    fechaOperacion: string,
    metodoPagoLabel: string
  ) {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable')
    ]);

    const doc = new jsPDF();
    const fecha = new Date().toLocaleString();

    doc.setFontSize(22);
    doc.setTextColor(15, 118, 110);
    doc.text('NovaTech', 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    const tipoDoc = this.tipoComprobante === 'factura' ? 'Factura Electronica' : 'Boleta de Venta Electronica';
    doc.text(tipoDoc, 14, 30);
    doc.text(`Fecha: ${fechaOperacion || fecha}`, 14, 36);
    doc.text(`Pedido #: ${idVenta}`, 14, 42);
    doc.text(`Cliente: ${nombreCliente}`, 14, 48);
    doc.text(`Metodo de pago: ${metodoPagoLabel}`, 14, 54);
    doc.text(`Detalle de pago: ${resumenPago}`, 14, 60);

    const bodyData = detalleSnapshot.map(item => {
      const p = itemsSnapshot.find((x: any) => (x.producto?.id || x.id) === item.id);
      const prod = p?.producto || p;
      const precio = this.getPrecioFinal(prod);
      return [
        prod?.nombre || 'Producto',
        item.cantidad.toString(),
        `S/ ${precio.toFixed(2)}`,
        `S/ ${(precio * item.cantidad).toFixed(2)}`
      ];
    });

    autoTable(doc, {
      startY: 70,
      head: [['Producto', 'Cant.', 'Precio Unit.', 'Subtotal']],
      body: bodyData,
      theme: 'grid',
      headStyles: { fillColor: [15, 118, 110] }
    });

    const finalY = (doc as any).lastAutoTable.finalY || 65;
    const s_subtotal = (totalPagado / 1.18).toFixed(2);
    const s_igv = (totalPagado - Number(s_subtotal)).toFixed(2);

    doc.setFontSize(10);
    doc.setTextColor(50);
    doc.text(`Subtotal: S/ ${s_subtotal}`, 14, finalY + 10);
    doc.text(`IGV (18%): S/ ${s_igv}`, 14, finalY + 15);

    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text(`Total Pagado: S/ ${totalPagado.toFixed(2)}`, 14, finalY + 25);
    
    doc.setFontSize(10);
    doc.setTextColor(150);
    doc.text('Gracias por su compra en NovaTech.', 14, finalY + 35);

    doc.save(`Comprobante_NovaTech_${idVenta}.pdf`);
  }
}

