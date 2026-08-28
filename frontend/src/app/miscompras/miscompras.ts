import { Component, inject, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../services/auth';
import { SalesService } from '../services/sales';
import { ProductsService } from '../services/products';
import { RouterModule } from '@angular/router';
import { ProductModel } from '../core/models/product.model';
import { SALE_STATUS_LABELS, SALE_STATUS_ICONS, SALE_STATUS_FLOW } from '../core/models/sale.model';
import { MessageService } from 'primeng/api';
import { catchError } from 'rxjs/operators';
import { forkJoin, of } from 'rxjs';

import { ButtonModule }    from 'primeng/button';
import { TagModule }       from 'primeng/tag';
import { TableModule }     from 'primeng/table';
import { TooltipModule }   from 'primeng/tooltip';
import { SkeletonModule }  from 'primeng/skeleton';
import { PaginatorModule } from 'primeng/paginator';

interface OrderPaymentInfo {
  metodoKey: string;
  metodoLabel: string;
  montoPagado: number;
  referencia: string | null;
  comentario: string | null;
}

@Component({
  selector: 'app-miscompras',
  standalone: true,
  imports: [CommonModule, ButtonModule, TagModule, TableModule, TooltipModule, RouterModule, SkeletonModule, PaginatorModule],
  templateUrl: './miscompras.html',
  styleUrl: './miscompras.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Miscompras implements OnInit {
  private auth     = inject(AuthService);
  private salesService    = inject(SalesService);
  private productsService = inject(ProductsService);
  private messageService  = inject(MessageService);
  private cd              = inject(ChangeDetectorRef);

  compras: any[] = [];
  loading: boolean = true;
  usuario: any = null;
  expandedSaleId: number | null = null;

  statusLabels = SALE_STATUS_LABELS;
  statusIcons  = SALE_STATUS_ICONS;
  statusFlow   = SALE_STATUS_FLOW;

  ngOnInit() {
    this.usuario = this.auth.currentUserValue;
    if (this.usuario) {
      this.cargarHistorial(this.usuario.id);
    } else {
      this.loading = false;
      this.cd.markForCheck();
    }
  }

  // Paginación de order cards
  readonly pageSize = 6;
  pageIndex = 0;

  get comprasPaginadas() {
    const start = this.pageIndex * this.pageSize;
    return this.compras.slice(start, start + this.pageSize);
  }

  get totalPages() { return Math.ceil(this.compras.length / this.pageSize); }

  onPageChange(e: any) {
    this.pageIndex = e.page ?? 0;
    this.cd.markForCheck();
  }

  // KPI display values (animados)
  displayTotalPedidos      = 0;
  displayTotalGastado      = 0;
  displayPedidosPendientes = 0;
  displayPedidosEntregados = 0;

  get totalPedidos()      { return this.compras.length; }
  get totalGastado()      { return this.compras.reduce((acc, v) => acc + Number(v.total || 0), 0); }
  get pedidosPendientes() { return this.compras.filter(v => (v.estado || 'pendiente') === 'pendiente').length; }
  get pedidosEntregados() { return this.compras.filter(v => (v.estado || 'pendiente') === 'entregado').length; }

  private animateCounter(target: number, setter: (v: number) => void, decimals = 0, durationMs = 600) {
    const start  = performance.now();
    const factor = Math.pow(10, decimals);
    const frame  = (now: number) => {
      const progress = Math.min((now - start) / durationMs, 1);
      const eased    = 1 - Math.pow(1 - progress, 3);
      setter(Math.round(target * eased * factor) / factor);
      if (progress < 1) requestAnimationFrame(frame);
      else this.cd.markForCheck();
    };
    requestAnimationFrame(frame);
  }

  private animarKPIs() {
    this.animateCounter(this.totalPedidos,      v => { this.displayTotalPedidos      = v; this.cd.markForCheck(); });
    this.animateCounter(this.totalGastado,      v => { this.displayTotalGastado      = v; this.cd.markForCheck(); }, 2);
    this.animateCounter(this.pedidosPendientes, v => { this.displayPedidosPendientes = v; this.cd.markForCheck(); });
    this.animateCounter(this.pedidosEntregados, v => { this.displayPedidosEntregados = v; this.cd.markForCheck(); });
  }

  cargarHistorial(idUsuario: number) {
    this.loading = true;
    this.expandedSaleId = null;
    this.pageIndex = 0;
    this.cd.markForCheck();

    forkJoin({
      sales:    this.salesService.getComprasPorUsuario(idUsuario).pipe(catchError(() => of([] as any[]))),
      products: this.productsService.getProducts().pipe(catchError(() => of([] as ProductModel[])))
    }).subscribe({
      next: ({ sales, products }) => {
        const productsMap = new Map<number, ProductModel>();
        (Array.isArray(products) ? products : []).forEach(p => productsMap.set(Number(p.id), p));

        this.compras = sales.map((venta: any) => {
          venta.productos = this.parseDetalle(venta.detalle, productsMap);
          venta.estado    = venta.estado ? venta.estado.toLowerCase() : 'pendiente';
          venta.pago      = this.parsePaymentInfo(venta);
          return venta;
        });

        this.loading = false;
        this.cd.markForCheck();
        this.animarKPIs();
      },
      error: () => {
        this.compras = [];
        this.loading = false;
        this.cd.markForCheck();
      }
    });
  }

  toggleDetalle(venta: any, event?: Event) {
    event?.stopPropagation();
    const saleId = Number(venta?.id || 0);
    if (!saleId) return;
    this.expandedSaleId = this.expandedSaleId === saleId ? null : saleId;
    this.cd.markForCheck();
  }

  isDetalleAbierto(venta: any) {
    return this.expandedSaleId === Number(venta?.id || 0);
  }

  getTrackingStepIndex(estado: string): number {
    const idx = SALE_STATUS_FLOW.indexOf(estado as any);
    return idx === -1 ? 0 : idx;
  }

  isTerminalState(estado: string): boolean {
    return estado === 'cancelado' || estado === 'reembolsado';
  }

  getSeverity(estado: string): 'success' | 'secondary' | 'info' | 'warn' | 'danger' | 'contrast' | undefined {
    switch ((estado || '').toLowerCase()) {
      case 'entregado':  return 'success';
      case 'en camino':  return 'warn';
      case 'cancelado':
      case 'reembolsado': return 'danger';
      case 'pagado':
      case 'preparando': return 'info';
      default:           return 'secondary';
    }
  }

  descargarComprobante(venta: any) {
    this.salesService.downloadComprobante(venta.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Comprobante_NovaTech_${venta.id}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Comprobante', detail: 'No se pudo descargar el comprobante.' });
      }
    });
  }

  private _unused(venta: any) {
    void venta;
    void (async () => { try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable')
      ]);

      const IGV_RATE   = 0.18;
      const doc        = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageW      = 210;
      const marginL    = 14;
      const marginR    = 196;
      const fecha      = new Date(venta?.fecha || new Date()).toLocaleString('es-PE', { dateStyle: 'long', timeStyle: 'short' });
      const productos  = Array.isArray(venta?.productos) ? venta.productos : [];
      const pago       = this.parsePaymentInfo(venta);

      const catalogTotal = Number(venta?.subtotal || productos.reduce((a: number, p: any) => a + Number(p?.subtotal || 0), 0));
      const basePrice    = Number((catalogTotal / (1 + IGV_RATE)).toFixed(2));
      const igvAmount    = Number((catalogTotal - basePrice).toFixed(2));
      const costoEnvio   = Number(venta?.costo_envio || 0);
      const totalFinal   = Number(venta?.total || (catalogTotal + costoEnvio).toFixed(2));

      doc.setTextColor(238, 242, 255);
      doc.setFontSize(60);
      doc.text('NOVATECH', pageW / 2, 170, { align: 'center', angle: 45 });

      doc.setFillColor(14, 165, 233);
      doc.rect(0, 0, pageW, 36, 'F');
      doc.setFillColor(2, 132, 199);
      doc.rect(0, 32, pageW, 4, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(21);
      doc.text('NovaTech Commerce', marginL, 15);
      doc.setFontSize(9.5);
      doc.text('Plataforma de comercio electronico · Lima, Peru', marginL, 22);
      doc.setFontSize(10);
      doc.text(`COMPROBANTE DE COMPRA`, marginR, 13, { align: 'right' });
      doc.setFontSize(13);
      doc.text(`Pedido #${venta.id}`, marginR, 21, { align: 'right' });

      let y = 48;
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text('DATOS DEL PEDIDO', marginL, y);

      doc.setDrawColor(226, 232, 240);
      doc.line(marginL, y + 2, marginR, y + 2);
      y += 8;

      const infoLeft: [string, string][] = [
        ['Cliente',     this.usuario?.nombre || venta?.nombre_usuario || 'Cliente'],
        ['Correo',      this.usuario?.email || venta?.correo_usuario || '—'],
        ['Fecha',       fecha],
        ['Estado',      String(venta?.estado || 'pendiente').toUpperCase()],
      ];

      const infoRight: [string, string][] = [
        ['Metodo de pago', pago.metodoLabel],
        ['Monto pagado',   `S/ ${Number(pago.montoPagado).toFixed(2)}`],
        ...(pago.referencia ? [['Referencia', pago.referencia] as [string, string]] : []),
        ...(pago.comentario ? [['Comentario', pago.comentario] as [string, string]] : []),
      ];

      const colMid = pageW / 2 + 2;
      doc.setFontSize(9);
      infoLeft.forEach(([label, value]) => {
        doc.setTextColor(100, 116, 139);
        doc.text(`${label}:`, marginL, y);
        doc.setTextColor(15, 23, 42);
        doc.text(value, marginL + 28, y);
        y += 6;
      });

      let yRight = 56;
      infoRight.forEach(([label, value]) => {
        doc.setTextColor(100, 116, 139);
        doc.text(`${label}:`, colMid, yRight);
        doc.setTextColor(15, 23, 42);
        doc.text(value, colMid + 32, yRight);
        yRight += 6;
      });

      y = Math.max(y, yRight) + 4;

      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text('DETALLE DE PRODUCTOS', marginL, y);
      doc.setDrawColor(226, 232, 240);
      doc.line(marginL, y + 2, marginR, y + 2);
      y += 5;

      autoTable(doc, {
        startY: y,
        head: [['Producto', 'Categoria', 'Cant.', 'P. Unit. (c/IGV)', 'Subtotal']],
        body: productos.map((item: any) => [
          item?.nombre || `Producto #${item?.id || 'N/A'}`,
          item?.categoria || 'General',
          String(Number(item?.cantidad || 1)),
          `S/ ${Number(item?.precio || 0).toFixed(2)}`,
          `S/ ${Number(item?.subtotal || 0).toFixed(2)}`
        ]),
        theme: 'striped',
        styles: { fontSize: 8.5, cellPadding: 3, textColor: [30, 41, 59] },
        headStyles: { fillColor: [14, 165, 233], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
        alternateRowStyles: { fillColor: [241, 245, 249] },
        columnStyles: {
          0: { cellWidth: 65 },
          2: { halign: 'center', cellWidth: 16 },
          3: { halign: 'right', cellWidth: 38 },
          4: { halign: 'right', cellWidth: 28 }
        }
      });

      const tableEndY = ((doc as any).lastAutoTable?.finalY || y + 30) + 8;

      const boxX = pageW / 2 + 10;
      const boxW = marginR - boxX;
      let boxY   = tableEndY;

      const drawTotalRow = (label: string, value: string, bold = false, highlight = false) => {
        if (highlight) {
          doc.setFillColor(14, 165, 233);
          doc.roundedRect(boxX - 2, boxY - 4, boxW + 4, 9, 1.5, 1.5, 'F');
          doc.setTextColor(255, 255, 255);
        } else {
          doc.setTextColor(bold ? 15 : 100, bold ? 23 : 116, bold ? 42 : 139);
        }
        doc.setFontSize(bold ? 10 : 8.5);
        doc.text(label, boxX + 2, boxY);
        doc.text(value, marginR, boxY, { align: 'right' });
        boxY += highlight ? 10 : 7;
      };

      doc.setDrawColor(226, 232, 240);
      doc.line(boxX - 2, tableEndY - 4, marginR + 2, tableEndY - 4);

      drawTotalRow('Subtotal (sin IGV):',   `S/ ${basePrice.toFixed(2)}`);
      drawTotalRow('IGV (18%):',            `S/ ${igvAmount.toFixed(2)}`);
      if (costoEnvio > 0) {
        drawTotalRow('Costo de envio:',     `S/ ${costoEnvio.toFixed(2)}`);
      }
      boxY += 2;
      drawTotalRow('TOTAL PAGADO:', `S/ ${totalFinal.toFixed(2)}`, true, true);

      const footerY = 282;
      doc.setFillColor(241, 245, 249);
      doc.rect(0, footerY - 4, pageW, 16, 'F');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text('Gracias por comprar en NovaTech Commerce. Este documento es valido como comprobante digital.', pageW / 2, footerY + 2, { align: 'center' });
      doc.text(`Emitido el ${new Date().toLocaleDateString('es-PE')} · novatech.pe`, pageW / 2, footerY + 7, { align: 'center' });

      doc.save(`comprobante-pedido-${venta.id}.pdf`);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Comprobante', detail: 'No se pudo generar el PDF.' });
    } })(); }

  getInitial(nombre: string): string {
    return (nombre || 'U').charAt(0).toUpperCase();
  }

  private parseDetalle(detalleRaw: unknown, productsMap: Map<number, ProductModel>): any[] {
    const hydrate = (items: any[]) => items.map((item: any) => {
      const productId = Number(item?.id || item?.producto_id || 0);
      const product   = productsMap.get(productId);
      const cantidad  = Number(item?.cantidad || 1);
      const precio    = Number(item?.precio || product?.precio || 0);
      return {
        id: productId,
        cantidad,
        nombre:   item?.nombre   || product?.nombre   || `Producto #${productId || 'N/A'}`,
        categoria: item?.categoria || product?.categoria || 'General',
        precio,
        imagen:   item?.imagen   || product?.imagen   || 'https://via.placeholder.com/50?text=IMG',
        subtotal: Number((precio * cantidad).toFixed(2))
      };
    });

    if (Array.isArray(detalleRaw)) return hydrate(detalleRaw);
    if (typeof detalleRaw === 'string') {
      try {
        const parsed = JSON.parse(detalleRaw);
        return Array.isArray(parsed) ? hydrate(parsed) : [];
      } catch { return []; }
    }
    return [];
  }

  private parsePaymentInfo(venta: any): OrderPaymentInfo {
    const obs = this.parseJsonLike(venta?.observaciones);
    const metodoKeyRaw = String(obs?.['metodo_key'] || '').toLowerCase().trim();
    const metodoKey    = metodoKeyRaw || this.resolveMethodKeyFromName(venta?.metodo_pago_nombre);
    const metodoLabel  = String(obs?.['metodo_label'] || this.resolveMethodLabel(metodoKey, venta?.metodo_pago_nombre));
    const montoPagado  = Number(venta?.monto_pagado || obs?.['monto_pagado'] || venta?.total || 0);
    return {
      metodoKey,
      metodoLabel,
      montoPagado: Number(Number.isFinite(montoPagado) ? montoPagado.toFixed(2) : Number(venta?.total || 0).toFixed(2)),
      referencia:  String(venta?.referencia_pago || obs?.['referencia_pago'] || '').trim() || null,
      comentario:  String(obs?.['comentario_pago'] || '').trim() || null
    };
  }

  private parseJsonLike(value: unknown): Record<string, unknown> | null {
    if (!value) return null;
    if (typeof value === 'object') return value as Record<string, unknown>;
    if (typeof value === 'string') {
      try { const p = JSON.parse(value); return (p && typeof p === 'object') ? p : null; }
      catch { return null; }
    }
    return null;
  }

  private resolveMethodKeyFromName(methodName: unknown) {
    const n = String(methodName || '').toLowerCase().trim();
    if (n.includes('tarjeta'))    return 'tarjeta';
    if (n.includes('yape') || n.includes('plin') || n.includes('billetera')) return 'billetera';
    if (n.includes('transferencia')) return 'transferencia';
    return 'no-definido';
  }

  private resolveMethodLabel(methodKey: string, fallbackName: unknown) {
    if (methodKey === 'tarjeta')       return 'Tarjeta';
    if (methodKey === 'billetera')     return 'Yape / Plin';
    if (methodKey === 'transferencia') return 'Transferencia Bancaria';
    const fallback = String(fallbackName || '').trim();
    return fallback || 'No especificado';
  }
}
