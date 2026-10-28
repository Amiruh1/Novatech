function baseEmail(headerGradient: string, headerEmoji: string, headerTitle: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${headerTitle}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:36px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(15,23,42,.12);">

        <tr><td style="background:${headerGradient};padding:28px 36px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <p style="margin:0 0 2px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.65);">NovaTech Commerce</p>
                <h1 style="margin:0;font-size:22px;font-weight:800;color:#fff;line-height:1.2;">${headerEmoji} ${headerTitle}</h1>
              </td>
              <td align="right" valign="middle" style="font-size:40px;padding-left:12px;">${headerEmoji}</td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="padding:32px 36px;">${body}</td></tr>

        <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 36px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.7;">
            © 2026 <strong style="color:#64748b;">NovaTech Commerce</strong> · Lima, Perú<br/>
            Este mensaje fue generado automáticamente, por favor no respondas a este correo.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildWelcomeEmail(nombre: string, email: string, rol: string, setupLink: string): string {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';

  const isAdminCreated = Boolean(setupLink);

  const credentialsBlock = isAdminCreated ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;margin-bottom:22px;">
      <tr><td style="padding:20px 24px;">
        <p style="margin:0 0 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#16a34a;">Tu cuenta</p>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:13px;color:#64748b;padding:6px 0;">Correo electrónico</td>
            <td align="right" style="font-size:13px;font-weight:700;color:#0f172a;padding:6px 0;">${email}</td>
          </tr>
        </table>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;">
      <tr><td align="center">
        <a href="${setupLink}"
          style="display:inline-block;background:linear-gradient(135deg,#059669,#0f766e);color:#fff;font-weight:700;font-size:14px;padding:13px 34px;border-radius:10px;text-decoration:none;letter-spacing:.02em;">
          Establecer mi contraseña →
        </a>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;margin-bottom:28px;">
      <tr><td style="padding:14px 18px;">
        <p style="margin:0;font-size:13px;color:#92400e;line-height:1.65;">
          ⚠️ Este enlace expira en <strong>72 horas</strong>. Si no solicitaste esta cuenta, ignora este correo.
        </p>
      </td></tr>
    </table>
  ` : `
    <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.75;">
      Tu cuenta fue creada con el correo <strong>${email}</strong>. Ya puedes explorar el catálogo, guardar favoritos y hacer compras con tu cuenta activa.
    </p>
  `;

  const body = `
    <p style="margin:0 0 6px;font-size:15px;color:#0f172a;">Hola, <strong>${nombre}</strong> 👋</p>
    <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.75;">
      ${isAdminCreated
        ? 'Tu cuenta en <strong>NovaTech Commerce</strong> fue creada por el equipo administrativo.'
        : 'Gracias por unirte a <strong>NovaTech Commerce</strong>. Tu cuenta está activa.'
      }
    </p>
    ${credentialsBlock}
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <a href="${frontendUrl}/tienda"
          style="display:inline-block;background:linear-gradient(135deg,#059669,#0f766e);color:#fff;font-weight:700;font-size:14px;padding:13px 34px;border-radius:10px;text-decoration:none;letter-spacing:.02em;">
          Ir a la tienda →
        </a>
      </td></tr>
    </table>
  `;

  return baseEmail('linear-gradient(135deg,#059669 0%,#0f766e 100%)', '🎉', 'Bienvenido a NovaTech', body);
}

export function buildPasswordResetEmail(token: string): string {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
  const resetLink = `${frontendUrl}/reset-password?token=${token}`;

  const body = `
    <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.75;">
      Recibimos una solicitud para <strong>restablecer la contraseña</strong> de tu cuenta en NovaTech Commerce.
      Haz clic en el botón de abajo para crear una nueva contraseña.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;">
      <tr><td align="center">
        <a href="${resetLink}"
          style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;font-weight:700;font-size:14px;padding:13px 34px;border-radius:10px;text-decoration:none;">
          Restablecer contraseña →
        </a>
      </td></tr>
    </table>

    <p style="margin:0 0 6px;font-size:12px;color:#94a3b8;text-align:center;">
      Si el botón no funciona, copia y pega este enlace en tu navegador:
    </p>
    <p style="margin:0 0 24px;font-size:11px;color:#0ea5e9;text-align:center;word-break:break-all;">
      ${resetLink}
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;">
      <tr><td style="padding:14px 18px;">
        <p style="margin:0;font-size:13px;color:#92400e;line-height:1.65;">
          ⚠️ Este enlace expira en <strong>1 hora</strong>. Si no solicitaste este cambio, ignora este correo — tu cuenta permanecerá segura.
        </p>
      </td></tr>
    </table>
  `;

  return baseEmail('linear-gradient(135deg,#7c3aed 0%,#a855f7 100%)', '🔐', 'Restablecer contraseña', body);
}

export function buildPasswordResetCodeEmail(code: string): string {
  const body = `
    <p style="margin:0 0 6px;font-size:15px;color:#0f172a;">Hola 👋</p>
    <p style="margin:0 0 28px;font-size:14px;color:#475569;line-height:1.75;">
      Recibimos una solicitud para <strong>restablecer la contraseña</strong> de tu cuenta en NovaTech Commerce.
      Ingresa el siguiente código en la pantalla de recuperación:
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr><td align="center">
        <table cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#7c3aed,#a855f7);border-radius:16px;padding:2px;">
          <tr><td style="background:#faf5ff;border-radius:14px;padding:24px 48px;text-align:center;">
            <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#7c3aed;">Tu código de recuperación</p>
            <p style="margin:0;font-size:40px;font-weight:900;letter-spacing:.22em;color:#4c1d95;font-family:'Courier New',monospace;">${code}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>

    <p style="margin:0 0 20px;font-size:13px;color:#475569;text-align:center;line-height:1.6;">
      Ingresa este código en la pantalla de recuperación junto con tu nueva contraseña.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;">
      <tr><td style="padding:14px 18px;">
        <p style="margin:0;font-size:13px;color:#92400e;line-height:1.65;">
          ⚠️ Este código expira en <strong>15 minutos</strong>. Si no solicitaste este cambio, ignora este correo — tu cuenta permanecerá segura.
        </p>
      </td></tr>
    </table>
  `;

  return baseEmail('linear-gradient(135deg,#7c3aed 0%,#a855f7 100%)', '🔑', 'Código de recuperación', body);
}

export interface OrderEmailItem {
  id: number;
  nombre?: string;
  cantidad: number;
  precio?: number;
}

export function buildOrderConfirmationEmail(
  clientName: string,
  ventaId: number,
  total: number,
  detalle: OrderEmailItem[],
  metodoLabel: string,
  costoEnvio = 0
): string {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
  const nroDoc = `B001-${String(ventaId).padStart(8, '0')}`;

  const subtotalItems = detalle.reduce((acc, item) => {
    return acc + (Number(item.precio || 0) * Number(item.cantidad));
  }, 0);

  const baseTotal   = subtotalItems > 0 ? subtotalItems : (total - costoEnvio);
  const subtotalSinIGV = Number((baseTotal / 1.18).toFixed(2));
  const igvMonto       = Number((baseTotal - subtotalSinIGV).toFixed(2));

  const itemRows = detalle.map((item, i) => {
    const nombre   = item.nombre || `Producto #${item.id}`;
    const precioU  = Number(item.precio || 0);
    const subtotal = precioU * item.cantidad;
    const bg       = i % 2 === 0 ? '#ffffff' : '#f8fafc';

    return `<tr style="background:${bg};">
      <td style="padding:11px 14px;font-size:13px;color:#334155;border-bottom:1px solid #f1f5f9;">${nombre}</td>
      <td align="center" style="padding:11px 14px;font-size:13px;font-weight:700;color:#0f172a;border-bottom:1px solid #f1f5f9;width:48px;">${item.cantidad}</td>
      ${precioU > 0 ? `<td align="right" style="padding:11px 14px;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9;">S/ ${precioU.toFixed(2)}</td>
      <td align="right" style="padding:11px 14px;font-size:13px;font-weight:700;color:#0f766e;border-bottom:1px solid #f1f5f9;">S/ ${subtotal.toFixed(2)}</td>` : `<td colspan="2" style="border-bottom:1px solid #f1f5f9;"></td>`}
    </tr>`;
  }).join('');

  const body = `
    <p style="margin:0 0 4px;font-size:15px;color:#0f172a;">Hola, <strong>${clientName}</strong> 👋</p>
    <p style="margin:0 0 22px;font-size:14px;color:#475569;line-height:1.75;">
      Tu pedido fue recibido con éxito y está siendo procesado. Adjuntamos tu comprobante en PDF para tus registros.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;">
      <tr>
        <td style="background:linear-gradient(135deg,#059669,#0f766e);border-radius:10px;padding:14px 22px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,.7);">Estado de tu pedido</p>
                <p style="margin:3px 0 0;font-size:16px;font-weight:800;color:#fff;">✅ Confirmado y en procesamiento</p>
              </td>
              <td align="right">
                <p style="margin:0;font-size:11px;color:rgba(255,255,255,.7);">Nro. pedido</p>
                <p style="margin:2px 0 0;font-size:15px;font-weight:800;color:#fff;">#${ventaId}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 10px;font-size:11px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:.08em;">🛒 Productos adquiridos</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:20px;">
      <thead>
        <tr style="background:linear-gradient(135deg,#0f766e,#0ea5e9);">
          <th align="left"   style="padding:10px 14px;font-size:11px;color:#fff;font-weight:700;text-transform:uppercase;letter-spacing:.04em;">Producto</th>
          <th align="center" style="padding:10px 14px;font-size:11px;color:#fff;font-weight:700;text-transform:uppercase;letter-spacing:.04em;width:48px;">Cant.</th>
          <th align="right"  style="padding:10px 14px;font-size:11px;color:#fff;font-weight:700;text-transform:uppercase;letter-spacing:.04em;">P. Unit.</th>
          <th align="right"  style="padding:10px 14px;font-size:11px;color:#fff;font-weight:700;text-transform:uppercase;letter-spacing:.04em;">Subtotal</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td width="50%"></td>
        <td width="50%">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
            <tr style="background:#f8fafc;">
              <td style="padding:9px 14px;font-size:13px;color:#64748b;">Subtotal (sin IGV)</td>
              <td align="right" style="padding:9px 14px;font-size:13px;font-weight:700;color:#0f172a;">S/ ${subtotalSinIGV.toFixed(2)}</td>
            </tr>
            <tr>
              <td style="padding:9px 14px;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">IGV (18%)</td>
              <td align="right" style="padding:9px 14px;font-size:13px;font-weight:700;color:#0f172a;border-top:1px solid #e2e8f0;">S/ ${igvMonto.toFixed(2)}</td>
            </tr>
            ${costoEnvio > 0 ? `<tr>
              <td style="padding:9px 14px;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Costo de envío</td>
              <td align="right" style="padding:9px 14px;font-size:13px;font-weight:700;color:#0f172a;border-top:1px solid #e2e8f0;">S/ ${costoEnvio.toFixed(2)}</td>
            </tr>` : ''}
            <tr style="background:linear-gradient(135deg,#0f766e,#059669);">
              <td style="padding:12px 14px;font-size:14px;font-weight:800;color:#fff;">TOTAL PAGADO</td>
              <td align="right" style="padding:12px 14px;font-size:16px;font-weight:800;color:#fff;">S/ ${Number(total).toFixed(2)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;margin-bottom:28px;">
      <tr><td style="padding:14px 20px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#0369a1;">Método de pago</p>
        <p style="margin:0;font-size:14px;font-weight:700;color:#0f172a;">💳 ${metodoLabel}</p>
      </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr><td align="center">
        <a href="${frontendUrl}/miscompras"
          style="display:inline-block;background:linear-gradient(135deg,#0ea5e9,#2563eb);color:#fff;font-weight:700;font-size:13px;padding:13px 34px;border-radius:10px;text-decoration:none;letter-spacing:.02em;">
          Ver mis compras →
        </a>
      </td></tr>
    </table>

    <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">
      📄 Tu comprobante <strong>${nroDoc}</strong> está adjunto en este correo en formato PDF.
    </p>
  `;

  return baseEmail('linear-gradient(135deg,#059669 0%,#0f766e 100%)', '✅', `Pedido #${ventaId} confirmado`, body);
}
