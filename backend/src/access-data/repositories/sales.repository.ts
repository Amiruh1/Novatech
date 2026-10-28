import db from '../config/db';

export async function findActivePaymentMethods() {
  const [result] = await db.query(
    'SELECT id, nombre FROM metodos_pago WHERE activo = 1'
  );
  return result;
}

export async function registerSale(userId: number, userName: string | null, detail: string) {
  const [result] = await db.query(
    'CALL sp_registrar_venta(?, ?, ?)',
    [userId, userName, detail]
  );
  return result;
}

export async function updateSaleTotals(shippingCost: number, shippingCostForTotal: number, saleId: number) {
  const [result] = await db.query(
    `UPDATE ventas
       SET impuesto = ROUND(subtotal - ROUND(subtotal / 1.18, 2), 2),
           costo_envio = ?,
           total = ROUND(subtotal + ?, 2),
           actualizado_en = CURRENT_TIMESTAMP
       WHERE id = ?`,
    [shippingCost, shippingCostForTotal, saleId]
  );
  return result;
}

export async function findProductStock(productId: number) {
  const [result] = await db.query(
    'SELECT stock FROM productos WHERE id = ?',
    [productId]
  );
  return result;
}

export async function insertSaleMovement(
  productId: number,
  quantity: number,
  previousStock: number,
  currentStock: number,
  reason: string,
  saleId: number,
  userId: number
) {
  const [result] = await db.query(
    `INSERT INTO inventario_movimientos
             (producto_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, referencia_tabla, referencia_id, usuario_id)
           VALUES (?, 'VENTA', ?, ?, ?, ?, 'ventas', ?, ?)`,
    [productId, quantity, previousStock, currentStock, reason, saleId, userId]
  );
  return result;
}

export async function findSaleTotal(saleId: number) {
  const [result] = await db.query(
    'SELECT total FROM ventas WHERE id = ?',
    [saleId]
  );
  return result;
}

export async function updatePaymentMetadata(
  paymentMethodId: number | null,
  reference: string | null,
  observations: string,
  receiptType: string,
  taxDocument: string | null,
  companyName: string | null,
  addressId: number | null,
  saleId: number
) {
  const [result] = await db.query(
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
    [paymentMethodId, reference, observations, receiptType, taxDocument, companyName, addressId, saleId]
  );
  return result;
}

export async function deletePayments(saleId: number) {
  const [result] = await db.query(
    'DELETE FROM ventas_pagos WHERE venta_id = ?',
    [saleId]
  );
  return result;
}

export async function insertPendingPayment(saleId: number, paymentMethodId: number | null, amount: number, reference: string | null) {
  const [result] = await db.query(
    `INSERT INTO ventas_pagos (
        venta_id, metodo_pago_id, monto, moneda, referencia, estado
      ) VALUES (?, ?, ?, 'PEN', ?, 'pendiente')`,
    [saleId, paymentMethodId, amount, reference]
  );
  return result;
}

export async function insertConfirmedPayment(saleId: number, paymentMethodId: number | null, amount: number, reference: string | null) {
  const [result] = await db.query(
    `INSERT INTO ventas_pagos (
        venta_id, metodo_pago_id, monto, moneda, referencia, estado, pagado_en
      ) VALUES (?, ?, ?, 'PEN', ?, 'confirmado', CURRENT_TIMESTAMP)`,
    [saleId, paymentMethodId, amount, reference]
  );
  return result;
}

export async function findSalesByUser(userId: number) {
  const [result] = await db.query(
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
    [userId]
  );
  return result;
}

export async function findAdminSales() {
  const [result] = await db.query(
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
  return result;
}

export async function findSaleStatus(saleId: number) {
  const [result] = await db.query(
    'SELECT id, estado, detalle FROM ventas WHERE id = ?',
    [saleId]
  );
  return result;
}

export async function updateStatus(status: string, saleId: number) {
  const [result] = await db.query(
    'UPDATE ventas SET estado = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?',
    [status, saleId]
  );
  return result;
}

export async function updateProductStock(stock: number, productId: number) {
  const [result] = await db.query(
    'UPDATE productos SET stock = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?',
    [stock, productId]
  );
  return result;
}

export async function insertReturnMovement(
  productId: number,
  quantity: number,
  previousStock: number,
  currentStock: number,
  reason: string,
  saleId: number,
  userId: number
) {
  const [result] = await db.query(
    `INSERT INTO inventario_movimientos
             (producto_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, referencia_tabla, referencia_id, usuario_id)
           VALUES (?, 'DEVOLUCION', ?, ?, ?, ?, 'ventas', ?, ?)`,
    [productId, quantity, previousStock, currentStock, reason, saleId, userId]
  );
  return result;
}

export async function insertStatusAudit(userId: number, recordId: string, status: string) {
  const [result] = await db.query(
    `INSERT INTO auditoria (usuario_id, accion, tabla, registro_id, valores_nuevos)
       VALUES (?, 'UPDATE_ESTADO', 'ventas', ?, JSON_OBJECT('estado', ?))`,
    [userId, recordId, status]
  );
  return result;
}

export async function findPendingPayment(saleId: number) {
  const [result] = await db.query(
    'SELECT id FROM ventas_pagos WHERE venta_id = ? AND estado = "pendiente" LIMIT 1',
    [saleId]
  );
  return result;
}

export async function confirmPayment(saleId: number) {
  const [result] = await db.query(
    `UPDATE ventas_pagos
     SET estado = 'confirmado', pagado_en = CURRENT_TIMESTAMP
     WHERE venta_id = ? AND estado = 'pendiente'`,
    [saleId]
  );
  return result;
}

export async function insertPaymentAudit(userId: number, recordId: string, saleId: number, confirmedBy: number) {
  const [result] = await db.query(
    `INSERT INTO auditoria (usuario_id, accion, tabla, registro_id, valores_nuevos)
     VALUES (?, 'CONFIRMAR_PAGO', 'ventas_pagos', ?, JSON_OBJECT('venta_id', ?, 'confirmado_por', ?))`,
    [userId, recordId, saleId, confirmedBy]
  );
  return result;
}

export async function findReceiptRecipient(userId: number) {
  const [result] = await db.query(
    'SELECT email FROM usuarios WHERE id = ?',
    [userId]
  );
  return result;
}

export async function findReceiptProducts(ids: number[]) {
  const [result] = await db.query(
    `SELECT p.id, p.nombre, p.precio, p.precio_oferta, c.nombre AS categoria_nombre
             FROM productos p
             LEFT JOIN categorias c ON c.id = p.categoria_id
             WHERE p.id IN (?)`,
    [ids]
  );
  return result;
}

export async function findReceiptAddress(id: number | null | undefined) {
  const [result] = await db.query(
    'SELECT * FROM direcciones_usuario WHERE id = ?',
    [id]
  );
  return result;
}

export async function findSaleReceipt(saleId: number) {
  const [result] = await db.query(
    `SELECT v.id, v.id_usuario, v.nombre_usuario, v.fecha, v.subtotal, v.impuesto,
              v.costo_envio, v.total, v.detalle, v.tipo_comprobante,
              v.documento_fiscal, v.razon_social, v.referencia_pago, v.observaciones,
              v.direccion_envio_id,
              u.email,
              COALESCE(
                CASE WHEN JSON_VALID(v.observaciones)
                  THEN NULLIF(JSON_UNQUOTE(JSON_EXTRACT(v.observaciones, '$.metodo_label')), '')
                  ELSE NULL END,
                mp.nombre, 'No especificado'
              ) AS metodo_pago_nombre
       FROM ventas v
       INNER JOIN usuarios u ON u.id = v.id_usuario
       LEFT JOIN metodos_pago mp ON mp.id = v.metodo_pago_id
       WHERE v.id = ?`,
    [saleId]
  );
  return result;
}
