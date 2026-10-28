import * as salesRepository from '../repositories/sales.repository';

interface SaleDetailItem {
  id: number;
  cantidad: number;
}

interface SalePaymentMetadataInput {
  metodo_key?: string | null;
  metodo_label?: string | null;
  monto_pagado?: number | null;
  referencia_pago?: string | null;
  comentario_pago?: string | null;
  tipo_comprobante?: 'boleta' | 'factura';
  documento_fiscal?: string | null;
  razon_social?: string | null;
  costo_envio?: number;
  direccion_envio_id?: number | null;
  tipo_despacho?: 'envio' | 'retiro';
}

const PAYMENT_METHOD_NAME_MAP: Record<string, string[]> = {
  tarjeta: ['tarjeta'],
  billetera: ['yape', 'plin', 'billetera']
};

function normalizeMoney(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Number(parsed.toFixed(2));
}

function normalizeText(value: unknown, maxLength: number) {
  const text = String(value || '').trim();

  if (!text) {
    return null;
  }

  return text.slice(0, maxLength);
}

async function resolveMetodoPagoId(metodoKey: string): Promise<number | null> {
  const names = PAYMENT_METHOD_NAME_MAP[metodoKey] || [];

  if (!names.length) {
    return null;
  }

  const rows = await salesRepository.findActivePaymentMethods();

  const methods = rows as Array<{ id: number; nombre: string }>;
  const target = methods.find((method) => names.includes(String(method.nombre || '').toLowerCase().trim()));

  return target ? Number(target.id) : null;
}

export async function createSale(input: {
  id_usuario: number;
  nombre_usuario: string;
  detalle: SaleDetailItem[];
  costo_envio?: number;
}) {
  const detalleJson = JSON.stringify(input.detalle || []);

  const rows = await salesRepository.registerSale(Number(input.id_usuario), input.nombre_usuario || null, detalleJson);

  const callData = rows as Array<Array<{ id_venta: number; total_venta: number }>>;
  const firstResult = callData?.[0]?.[0];
  const ventaId = Number(firstResult?.id_venta || 0);

  if (ventaId > 0) {
    const costoEnvio = Number(input.costo_envio || 0);
    await salesRepository.updateSaleTotals(costoEnvio, costoEnvio, ventaId);

    for (const item of input.detalle) {
      try {
        const stockRows = await salesRepository.findProductStock(item.id);
        const stockNuevo    = Number((stockRows as any[])[0]?.stock ?? 0);
        const stockAnterior = stockNuevo + Number(item.cantidad);

        await salesRepository.insertSaleMovement(
          item.id,
          Number(item.cantidad),
          stockAnterior,
          stockNuevo,
          `Venta #${ventaId}`,
          ventaId,
          input.id_usuario
        );
      } catch {
      }
    }

    const updated = await salesRepository.findSaleTotal(ventaId);
    const newTotal = (updated as any[])[0]?.total || 0;
    return {
      id_venta: ventaId,
      total_venta: Number(newTotal)
    };
  }

  return {
    id_venta: ventaId,
    total_venta: Number(firstResult?.total_venta || 0)
  };
}

export async function saveSalePaymentMetadata(
  saleId: number,
  saleTotal: number,
  input?: SalePaymentMetadataInput
) {
  const safeSaleId = Number(saleId || 0);

  if (!safeSaleId) {
    return;
  }

  const metodoKey = String(input?.metodo_key || 'no-definido').toLowerCase();
  const metodoLabel = normalizeText(input?.metodo_label, 80);
  // H7: monto_pagado del cliente se ignora; el monto autorizado es siempre el total calculado en backend
  const amount = normalizeMoney(saleTotal) ?? 0;
  const reference = normalizeText(input?.referencia_pago, 120);
  const comment = normalizeText(input?.comentario_pago, 300);
  const methodId = await resolveMetodoPagoId(metodoKey);

  const observaciones = JSON.stringify({
    metodo_key: metodoKey,
    metodo_label: metodoLabel,
    monto_pagado: amount,
    comentario_pago: comment,
    referencia_pago: reference,
    tipo_despacho: input?.tipo_despacho || 'envio'
  });

  await salesRepository.updatePaymentMetadata(
    methodId,
    reference,
    observaciones,
    input?.tipo_comprobante || 'boleta',
    input?.documento_fiscal || null,
    input?.razon_social || null,
    input?.direccion_envio_id || null,
    safeSaleId
  );

  await salesRepository.deletePayments(safeSaleId);

  const requiresManualReview = ['billetera', 'transferencia'].includes(metodoKey);

  if (requiresManualReview) {
    await salesRepository.insertPendingPayment(safeSaleId, methodId, amount, reference);
  } else {
    await salesRepository.insertConfirmedPayment(safeSaleId, methodId, amount, reference);
  }
}

export async function listSalesByUser(idUsuario: number) {
  const rows = await salesRepository.findSalesByUser(idUsuario);

  return rows;
}

export async function listAdminSales() {
  const rows = await salesRepository.findAdminSales();

  return rows;
}

const TRANSICIONES_VALIDAS: Record<string, string[]> = {
  pendiente:   ['pagado', 'cancelado'],
  pagado:      ['preparando', 'cancelado', 'reembolsado'],
  preparando:  ['en camino', 'cancelado'],
  'en camino': ['entregado'],
  entregado:   ['reembolsado'],
  cancelado:   [],
  reembolsado: []
};

export async function updateSaleStatus(idVenta: number, estado: string, userId: number) {
  if (!TRANSICIONES_VALIDAS.hasOwnProperty(estado)) {
    throw new Error('Estado de venta no permitido');
  }

  const existing = await salesRepository.findSaleStatus(idVenta);
  const venta = (existing as any[])[0];

  if (!venta) {
    throw new Error('Venta no encontrada');
  }

  const estadoActual = String(venta.estado || '').toLowerCase();
  const permitidos = TRANSICIONES_VALIDAS[estadoActual] ?? [];

  if (!permitidos.includes(estado)) {
    throw new Error(JSON.stringify({
      code: 'INVALID_TRANSITION',
      from: estadoActual,
      to: estado,
      allowed: permitidos
    }));
  }

  await salesRepository.updateStatus(estado, idVenta);

  if (estado === 'cancelado' || estado === 'reembolsado') {
    let detalle: Array<{ id: number; cantidad: number }> = [];
    try {
      const raw = typeof venta.detalle === 'string' ? JSON.parse(venta.detalle) : venta.detalle;
      detalle = Array.isArray(raw) ? raw : [];
    } catch {}

    const motivo = estado === 'cancelado'
      ? `Cancelacion venta #${idVenta}`
      : `Reembolso venta #${idVenta}`;

    for (const item of detalle) {
      try {
        const productId = Number(item.id || 0);
        const cantidad  = Number(item.cantidad || 0);
        if (!productId || !cantidad) continue;

        const stockRows = await salesRepository.findProductStock(productId);
        const stockAnterior = Number((stockRows as any[])[0]?.stock ?? 0);
        const stockNuevo    = stockAnterior + cantidad;

        await salesRepository.updateProductStock(stockNuevo, productId);

        await salesRepository.insertReturnMovement(productId, cantidad, stockAnterior, stockNuevo, motivo, idVenta, userId);
      } catch {}
    }
  }

  try {
    await salesRepository.insertStatusAudit(userId, String(idVenta), estado);
  } catch {}
}

export async function confirmSalePayment(idVenta: number, userId: number) {
  const existing = await salesRepository.findPendingPayment(idVenta);
  const rows = existing as any[];

  if (!rows.length) {
    throw new Error('No hay pago pendiente para esta venta o ya fue confirmado');
  }

  await salesRepository.confirmPayment(idVenta);

  await salesRepository.insertPaymentAudit(userId, String(idVenta), idVenta, userId);
}

export async function findReceiptRecipient(userId: number) {
  return salesRepository.findReceiptRecipient(userId);
}

export async function findReceiptProducts(ids: number[]) {
  return salesRepository.findReceiptProducts(ids);
}

export async function findReceiptAddress(id: number | null | undefined) {
  return salesRepository.findReceiptAddress(id);
}

export async function findSaleReceipt(saleId: number) {
  return salesRepository.findSaleReceipt(saleId);
}
