import { Request, Response } from 'express';
import {
  confirmSalePayment,
  createSale,
  listAdminSales,
  listSalesByUser,
  saveSalePaymentMetadata,
  updateSaleStatus
} from '../../business/services/sales.service';
import { AuthRequest } from '../middlewares/auth.middleware';
import { sendOrderConfirmation } from '../../business/services/notification.service';
import { buildComprobantePDF, ComprobanteItem } from '../presenters/pdf.presenter';
import * as salesService from '../../business/services/sales.service';

type MetodoPagoKey = 'tarjeta' | 'billetera' | 'transferencia' | 'no-definido';

// H8: costo de envío definido en backend; el cliente no puede modificarlo
const COSTO_ENVIO_FIJO = Number(process.env.COSTO_ENVIO || 15);

interface NormalizedPaymentMetadata {
  metodo_key: MetodoPagoKey;
  metodo_label: string;
  monto_pagado: number | null;
  referencia_pago: string | null;
  comentario_pago: string | null;
  tipo_comprobante?: 'boleta' | 'factura';
  documento_fiscal?: string | null;
  razon_social?: string | null;
  costo_envio?: number;
  direccion_envio_id?: number | null;
  tipo_despacho?: 'envio' | 'retiro';
}

function sanitizeDetalle(detalle: unknown): Array<{ id: number; cantidad: number }> {
  if (!Array.isArray(detalle)) {
    return [];
  }

  return detalle
    .map((item) => ({
      id: Number((item as { id?: unknown })?.id || 0),
      cantidad: Number((item as { cantidad?: unknown })?.cantidad || 0)
    }))
    .filter((item) => Number.isInteger(item.id) && item.id > 0 && Number.isInteger(item.cantidad) && item.cantidad > 0);
}

function normalizeText(value: unknown, maxLength: number) {
  const text = String(value || '').trim();

  if (!text) {
    return null;
  }

  return text.slice(0, maxLength);
}

function normalizeMoney(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Number(parsed.toFixed(2));
}

function sanitizePaymentMetadata(pago: unknown): NormalizedPaymentMetadata {
  const source = pago && typeof pago === 'object' ? (pago as Record<string, unknown>) : {};

  const rawMethod = String(source.metodo || source.metodo_key || '').toLowerCase().trim();
  const metodoAliasMap: Record<string, MetodoPagoKey> = {
    tarjeta: 'tarjeta',
    credito: 'tarjeta',
    debito: 'tarjeta',
    billetera: 'billetera',
    yape: 'billetera',
    plin: 'billetera',
    transferencia: 'transferencia'
  };

  const metodo_key: MetodoPagoKey = metodoAliasMap[rawMethod] || 'no-definido';

  const metodoLabelMap: Record<MetodoPagoKey, string> = {
    tarjeta: 'Tarjeta',
    billetera: 'Yape / Plin',
    transferencia: 'Transferencia Bancaria',
    'no-definido': 'No especificado'
  };

  return {
    metodo_key,
    metodo_label: metodoLabelMap[metodo_key],
    monto_pagado: normalizeMoney(source.monto_pagado ?? source.montoPagado),
    referencia_pago: normalizeText(source.referencia_pago ?? source.referencia, 120),
    comentario_pago: normalizeText(source.comentario_pago ?? source.comentario, 300),
    tipo_comprobante: source.tipo_comprobante === 'factura' ? 'factura' : 'boleta',
    documento_fiscal: normalizeText(source.documento_fiscal, 20),
    razon_social: normalizeText(source.razon_social, 150),
    costo_envio: Number(source.costo_envio || 0),
    direccion_envio_id: source.direccion_envio_id ? Number(source.direccion_envio_id) : null,
    tipo_despacho: source.tipo_despacho === 'retiro' ? 'retiro' : 'envio'
  };
}

export async function postSale(req: AuthRequest, res: Response) {
  const userId = Number(req.user?.id || 0);
  const userName = String(req.user?.nombre || '').trim();
  const { detalle, pago } = req.body as {
    detalle?: unknown;
    pago?: unknown;
  };

  const detalleValidado = sanitizeDetalle(detalle);
  const pagoValidado = sanitizePaymentMetadata(pago);

  // H8: costo_envio calculado en backend según tipo de despacho; se ignora el valor del cliente
  const costoEnvioCalculado = pagoValidado.tipo_despacho === 'retiro' ? 0 : COSTO_ENVIO_FIJO;

  if (!userId) {
    return res.status(401).json({ message: 'No autenticado' });
  }

  if (!detalleValidado.length) {
    return res.status(400).json({ message: 'Payload de venta invalido' });
  }

  try {
    const data = await createSale({
      id_usuario: userId,
      nombre_usuario: userName,
      detalle: detalleValidado,
      costo_envio: costoEnvioCalculado
    });

    await saveSalePaymentMetadata(data.id_venta, data.total_venta, pagoValidado);

    if (userId > 0) {
      (async () => {
        try {
          const userRows = await salesService.findReceiptRecipient(userId);
          const userEmail = (userRows as any[])[0]?.email || '';
          if (!userEmail) return;

          const productIds = detalleValidado.map(d => d.id);
          const productRows = await salesService.findReceiptProducts(productIds);
          const productsMap = new Map((productRows as any[]).map(p => [p.id, p]));
          const itemsConInfo: ComprobanteItem[] = detalleValidado.map(d => {
            const p = productsMap.get(d.id);
            const unitPrice = Number(p?.precio_oferta || p?.precio || 0);
            return {
              nombre:     p?.nombre || `Producto #${d.id}`,
              categoria:  p?.categoria_nombre || undefined,
              cantidad:   d.cantidad,
              precio_unit: unitPrice,
              subtotal:   unitPrice * d.cantidad
            };
          });

          const subtotalItems = itemsConInfo.reduce((acc, it) => acc + it.subtotal, 0);
          const subtotalSinIGV = Number((subtotalItems / 1.18).toFixed(2));
          const igvMonto       = Number((subtotalItems - subtotalSinIGV).toFixed(2));
          
          const dirRows = await salesService.findReceiptAddress(pagoValidado.direccion_envio_id);
          const dir = (dirRows as any[])[0];
          const fullDirStr = dir ? `${dir.direccion_linea1}${dir.distrito ? `, ${dir.distrito}` : ''}${dir.provincia ? `, ${dir.provincia}` : ''}` : undefined;

          const pdfBuffer = await buildComprobantePDF({
            id_venta:         data.id_venta,
            tipo_comprobante: pagoValidado.tipo_comprobante || 'boleta',
            fecha:            new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' }),
            estado:           'PENDIENTE',
            cliente:          userName,
            email:            userEmail,
            dni_ruc:          pagoValidado.documento_fiscal || undefined,
            razon_social:     pagoValidado.razon_social || undefined,
            metodo_pago:      pagoValidado.metodo_label,
            referencia_pago:  pagoValidado.referencia_pago || undefined,
            comentario:       fullDirStr ? `DESPACHO: ${fullDirStr}` : undefined,
            items:            itemsConInfo,
            subtotal:         subtotalSinIGV,
            igv:              igvMonto,
            costo_envio:      costoEnvioCalculado,
            total:            data.total_venta,
            direccion:        fullDirStr
          });

          await sendOrderConfirmation({
            email: userEmail,
            clientName: userName,
            saleId: data.id_venta,
            total: data.total_venta,
            items: itemsConInfo.map(it => ({ id: 0, nombre: it.nombre, cantidad: it.cantidad, precio: it.precio_unit })),
            methodLabel: pagoValidado.metodo_label,
            shippingCost: costoEnvioCalculado,
            receipt: pdfBuffer
          });
        } catch (err) {
          console.error('[EmailError] Error sending order confirmation:', err);
        }
      })();
    }

    return res.json({
      message: 'Venta registrada correctamente',
      id_venta: data.id_venta,
      total_venta: data.total_venta
    });
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}

export async function getSalesByUser(req: AuthRequest, res: Response) {
  const authUserId = Number(req.user?.id || 0);
  const isAdmin = req.user?.rol === 'admin';
  const idUsuario = Number(req.params.idUsuario || 0);

  if (!authUserId) {
    return res.status(401).json({ message: 'No autenticado' });
  }

  if (!idUsuario) {
    return res.status(400).json({ message: 'ID de usuario invalido' });
  }

  if (!isAdmin && idUsuario !== authUserId) {
    return res.status(403).json({ message: 'No puedes consultar ventas de otro usuario' });
  }

  try {
    const rows = await listSalesByUser(isAdmin ? idUsuario : authUserId);
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}

export async function getAdminSales(_req: Request, res: Response) {
  try {
    const rows = await listAdminSales();
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}

export async function putSaleStatus(req: AuthRequest, res: Response) {
  const idVenta = Number(req.params.id || 0);
  const { estado } = req.body as { estado?: string };

  if (!idVenta || !estado) {
    return res.status(400).json({ message: 'ID y estado son obligatorios' });
  }

  try {
    await updateSaleStatus(idVenta, estado, Number(req.user?.id || 1));
    return res.json({ message: 'Estado de venta actualizado' });
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}

export async function getComprobantePDF(req: AuthRequest, res: Response) {
  const authUserId = Number(req.user?.id || 0);
  const isAdmin = req.user?.rol === 'admin';
  const idVenta = Number(req.params.id || 0);

  if (!authUserId) return res.status(401).json({ message: 'No autenticado' });
  if (!idVenta)    return res.status(400).json({ message: 'ID de venta inválido' });

  try {
    const ventaRows = await salesService.findSaleReceipt(idVenta);

    const venta = (ventaRows as any[])[0];
    if (!venta) return res.status(404).json({ message: 'Venta no encontrada' });
    if (!isAdmin && Number(venta.id_usuario) !== authUserId) {
      return res.status(403).json({ message: 'Sin acceso a este comprobante' });
    }

    const detalle: Array<{ id: number; cantidad: number }> =
      typeof venta.detalle === 'string' ? JSON.parse(venta.detalle) : (venta.detalle || []);

    const productIds = detalle.map((d: any) => d.id).filter(Boolean);
    let itemsConInfo: ComprobanteItem[] = [];

    if (productIds.length) {
      const productRows = await salesService.findReceiptProducts(productIds);
      const productsMap = new Map((productRows as any[]).map(p => [p.id, p]));
      itemsConInfo = detalle.map((d: any) => {
        const p = productsMap.get(d.id);
        const unitPrice = Number(p?.precio_oferta || p?.precio || 0);
        return {
          nombre:      p?.nombre || `Producto #${d.id}`,
          categoria:   p?.categoria_nombre || undefined,
          cantidad:    d.cantidad,
          precio_unit: unitPrice,
          subtotal:    unitPrice * d.cantidad
        };
      });
    }

    const subtotalItems  = itemsConInfo.reduce((acc, it) => acc + it.subtotal, 0);
    const subtotalSinIGV = Number((subtotalItems / 1.18).toFixed(2));
    const igvMonto       = Number((subtotalItems - subtotalSinIGV).toFixed(2));

    let fullDirStr: string | undefined;
    if (venta.direccion_envio_id) {
      const dirRows = await salesService.findReceiptAddress(venta.direccion_envio_id);
      const dir = (dirRows as any[])[0];
      if (dir) fullDirStr = `${dir.direccion_detallada || dir.direccion_linea1 || ''}${dir.distrito ? `, ${dir.distrito}` : ''}${dir.provincia ? `, ${dir.provincia}` : ''}`;
    }

    const fecha = new Date(venta.fecha).toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' });
    const refPago = venta.referencia_pago || (() => {
      try { const obs = JSON.parse(venta.observaciones || '{}'); return obs.referencia_pago || undefined; } catch { return undefined; }
    })();

    const pdfBuffer = await buildComprobantePDF({
      id_venta:         venta.id,
      tipo_comprobante: venta.tipo_comprobante || 'boleta',
      fecha,
      estado:           (venta.estado || 'pendiente').toUpperCase(),
      cliente:          venta.nombre_usuario || 'Cliente',
      email:            venta.email,
      dni_ruc:          venta.documento_fiscal || undefined,
      razon_social:     venta.razon_social || undefined,
      metodo_pago:      venta.metodo_pago_nombre,
      referencia_pago:  refPago,
      comentario:       fullDirStr ? `DESPACHO: ${fullDirStr}` : undefined,
      items:            itemsConInfo,
      subtotal:         subtotalSinIGV,
      igv:              igvMonto,
      costo_envio:      Number(venta.costo_envio || 0),
      total:            Number(venta.total || 0),
      direccion:        fullDirStr
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Comprobante_NovaTech_${idVenta}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}

export async function putConfirmarPago(req: AuthRequest, res: Response) {
  const idVenta = Number(req.params.id || 0);

  if (!idVenta) {
    return res.status(400).json({ message: 'ID de venta inválido' });
  }

  try {
    await confirmSalePayment(idVenta, Number(req.user?.id || 1));
    return res.json({ message: 'Pago confirmado correctamente' });
  } catch (error) {
    return res.status(400).json({ message: (error as Error).message });
  }
}
