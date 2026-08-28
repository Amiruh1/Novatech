import db from '../config/db';

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

  const [rows] = await db.query(
    'SELECT id, nombre FROM metodos_pago WHERE activo = 1'
  );

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

  const [rows] = await db.query('CALL sp_registrar_venta(?, ?, ?)', [
    Number(input.id_usuario),
    input.nombre_usuario || null,
    detalleJson
  ]);

  const callData = rows as Array<Array<{ id_venta: number; total_venta: number }>>;
  const firstResult = callData?.[0]?.[0];
  const ventaId = Number(firstResult?.id_venta || 0);

  if (ventaId > 0) {
    const costoEnvio = Number(input.costo_envio || 0);
    await db.query(
      `UPDATE ventas
       SET impuesto = ROUND(subtotal - ROUND(subtotal / 1.18, 2), 2),
           costo_envio = ?,
           total = ROUND(subtotal + ?, 2),
           actualizado_en = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [costoEnvio, costoEnvio, ventaId]
    );

    for (const item of input.detalle) {
      try {
        const [stockRows] = await db.query('SELECT stock FROM productos WHERE id = ?', [item.id]);
        const stockNuevo    = Number((stockRows as any[])[0]?.stock ?? 0);
        const stockAnterior = stockNuevo + Number(item.cantidad);

        await db.query(
          `INSERT INTO inventario_movimientos
             (producto_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, referencia_tabla, referencia_id, usuario_id)
           VALUES (?, 'VENTA', ?, ?, ?, ?, 'ventas', ?, ?)`,
          [item.id, Number(item.cantidad), stockAnterior, stockNuevo,
           `Venta #${ventaId}`, ventaId, input.id_usuario]
        );
      } catch {
      }
    }

    const [updated] = await db.query('SELECT total FROM ventas WHERE id = ?', [ventaId]);
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

  await db.query(
    `UPDATE ventas
     SET metodo_pago_id = ?,
         referencia_pago = ?,
         observaciones = ?,
         tipo_comprobante = ?,
         documento_fiscal = ?,
         razon_social = ?,
         direccion_envio_id = ?,
         actualizado_en = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [methodId, reference, observaciones, input?.tipo_comprobante || 'boleta', input?.documento_fiscal || null, input?.razon_social || null, input?.direccion_envio_id || null, safeSaleId]
  );

  await db.query('DELETE FROM ventas_pagos WHERE venta_id = ?', [safeSaleId]);

  const requiresManualReview = ['billetera', 'transferencia'].includes(metodoKey);

  if (requiresManualReview) {
    await db.query(
      `INSERT INTO ventas_pagos (
        venta_id, metodo_pago_id, monto, moneda, referencia, estado
      ) VALUES (?, ?, ?, 'PEN', ?, 'pendiente')`,
      [safeSaleId, methodId, amount, reference]
    );
  } else {
    await db.query(
      `INSERT INTO ventas_pagos (
        venta_id, metodo_pago_id, monto, moneda, referencia, estado, pagado_en
      ) VALUES (?, ?, ?, 'PEN', ?, 'confirmado', CURRENT_TIMESTAMP)`,
      [safeSaleId, methodId, amount, reference]
    );
  }
}

export async function listSalesByUser(idUsuario: number) {
  const [rows] = await db.query(
    `SELECT
      v.id,
      v.id_usuario,
      v.nombre_usuario,
      u.nombre AS nombre_cliente,
      v.fecha,
      v.subtotal,
      v.impuesto,
      v.costo_envio,
      v.total,
      v.detalle,
      v.estado,
      v.tipo_comprobante,
      v.documento_fiscal,
      v.razon_social,
      v.direccion_envio_id,
      v.metodo_pago_id,
      COALESCE(
        CASE
          WHEN JSON_VALID(v.observaciones) THEN NULLIF(JSON_UNQUOTE(JSON_EXTRACT(v.observaciones, '$.metodo_label')), '')
          ELSE NULL
        END,
        mp.nombre,
        'No especificado'
      ) AS metodo_pago_nombre,
      COALESCE(vp.monto, v.total) AS monto_pagado,
      COALESCE(v.referencia_pago, vp.referencia) AS referencia_pago,
      vp.estado AS pago_estado,
      v.observaciones
     FROM ventas v
     INNER JOIN usuarios u ON u.id = v.id_usuario
     LEFT JOIN metodos_pago mp ON mp.id = v.metodo_pago_id
     LEFT JOIN (
       SELECT vp1.venta_id, vp1.monto, vp1.referencia, vp1.estado
       FROM ventas_pagos vp1
       INNER JOIN (
         SELECT venta_id, MAX(id) AS max_id
         FROM ventas_pagos
         GROUP BY venta_id
       ) vp2 ON vp2.max_id = vp1.id
     ) vp ON vp.venta_id = v.id
     WHERE v.id_usuario = ?
     ORDER BY v.fecha DESC`,
    [idUsuario]
  );

  return rows;
}

export async function listAdminSales() {
  const [rows] = await db.query(
    `SELECT
      v.id,
      v.id_usuario,
      v.nombre_usuario,
      u.nombre AS nombre_cliente,
      v.fecha,
      v.subtotal,
      v.impuesto,
      v.costo_envio,
      v.total,
      v.detalle,
      v.estado,
      v.tipo_comprobante,
      v.documento_fiscal,
      v.razon_social,
      v.direccion_envio_id,
      v.codigo,
      v.metodo_pago_id,
      COALESCE(
        CASE
          WHEN JSON_VALID(v.observaciones) THEN NULLIF(JSON_UNQUOTE(JSON_EXTRACT(v.observaciones, '$.metodo_label')), '')
          ELSE NULL
        END,
        mp.nombre,
        'No especificado'
      ) AS metodo_pago_nombre,
      COALESCE(vp.monto, v.total) AS monto_pagado,
      COALESCE(v.referencia_pago, vp.referencia) AS referencia_pago,
      vp.estado AS pago_estado,
      v.observaciones
     FROM ventas v
     INNER JOIN usuarios u ON u.id = v.id_usuario
     LEFT JOIN metodos_pago mp ON mp.id = v.metodo_pago_id
     LEFT JOIN (
       SELECT vp1.venta_id, vp1.monto, vp1.referencia, vp1.estado
       FROM ventas_pagos vp1
       INNER JOIN (
         SELECT venta_id, MAX(id) AS max_id
         FROM ventas_pagos
         GROUP BY venta_id
       ) vp2 ON vp2.max_id = vp1.id
     ) vp ON vp.venta_id = v.id
     ORDER BY v.fecha DESC`
  );

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

  const [existing] = await db.query('SELECT id, estado, detalle FROM ventas WHERE id = ?', [idVenta]);
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

  await db.query(
    'UPDATE ventas SET estado = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?',
    [estado, idVenta]
  );

  if (TRANSICIONES_VALIDAS[estado]?.length === 0) {
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

        const [stockRows] = await db.query('SELECT stock FROM productos WHERE id = ?', [productId]);
        const stockAnterior = Number((stockRows as any[])[0]?.stock ?? 0);
        const stockNuevo    = stockAnterior + cantidad;

        await db.query(
          'UPDATE productos SET stock = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?',
          [stockNuevo, productId]
        );

        await db.query(
          `INSERT INTO inventario_movimientos
             (producto_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, referencia_tabla, referencia_id, usuario_id)
           VALUES (?, 'DEVOLUCION', ?, ?, ?, ?, 'ventas', ?, ?)`,
          [productId, cantidad, stockAnterior, stockNuevo, motivo, idVenta, userId]
        );
      } catch {}
    }
  }

  try {
    await db.query(
      `INSERT INTO auditoria (usuario_id, accion, tabla, registro_id, valores_nuevos)
       VALUES (?, 'UPDATE_ESTADO', 'ventas', ?, JSON_OBJECT('estado', ?))`,
      [userId, String(idVenta), estado]
    );
  } catch {}
}

export async function confirmSalePayment(idVenta: number, userId: number) {
  const [existing] = await db.query(
    'SELECT id FROM ventas_pagos WHERE venta_id = ? AND estado = "pendiente" LIMIT 1',
    [idVenta]
  );
  const rows = existing as any[];

  if (!rows.length) {
    throw new Error('No hay pago pendiente para esta venta o ya fue confirmado');
  }

  await db.query(
    `UPDATE ventas_pagos
     SET estado = 'confirmado', pagado_en = CURRENT_TIMESTAMP
     WHERE venta_id = ? AND estado = 'pendiente'`,
    [idVenta]
  );

  await db.query(
    `INSERT INTO auditoria (usuario_id, accion, tabla, registro_id, valores_nuevos)
     VALUES (?, 'CONFIRMAR_PAGO', 'ventas_pagos', ?, JSON_OBJECT('venta_id', ?, 'confirmado_por', ?))`,
    [userId, String(idVenta), idVenta, userId]
  );
}
