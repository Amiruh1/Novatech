import { sendEmail, sendEmailWithAttachment } from '../../access-data/integrations/email.gateway';
import {
  buildWelcomeEmail,
  buildPasswordResetEmail,
  buildPasswordResetCodeEmail,
  buildOrderConfirmationEmail,
  OrderEmailItem
} from '../templates/email.templates';

export async function sendRegistrationWelcome(nombre: string, email: string, rol: string): Promise<void> {
  const html = buildWelcomeEmail(nombre, email, rol, '');
  await sendEmail(email, '🎉 Bienvenido a NovaTech Commerce', html);
}

export async function sendAccountActivation(nombre: string, email: string, rol: string, setupToken: string): Promise<void> {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
  const setupLink = `${frontendUrl}/reset-password?token=${setupToken}`;
  const html = buildWelcomeEmail(nombre, email, rol, setupLink);
  await sendEmail(email, '🎉 Bienvenido a NovaTech Commerce — Activa tu cuenta', html);
}

export async function sendPasswordReset(email: string, token: string): Promise<void> {
  await sendEmail(email, '🔐 Restablecer contraseña - NovaTech', buildPasswordResetEmail(token));
}

export async function sendPasswordResetCode(email: string, code: string): Promise<void> {
  await sendEmail(email, '🔑 Tu código de recuperación - NovaTech', buildPasswordResetCodeEmail(code));
}

export async function sendOrderConfirmation(input: {
  email: string;
  clientName: string;
  saleId: number;
  total: number;
  items: OrderEmailItem[];
  methodLabel: string;
  shippingCost: number;
  receipt: Buffer;
}): Promise<void> {
  const html = buildOrderConfirmationEmail(input.clientName, input.saleId, input.total,
    input.items, input.methodLabel, input.shippingCost);
  await sendEmailWithAttachment(input.email, `✅ Pedido #${input.saleId} confirmado - NovaTech Commerce`, html, [{
    filename: `Comprobante_NovaTech_${input.saleId}.pdf`,
    content: input.receipt,
    contentType: 'application/pdf'
  }]);
}
