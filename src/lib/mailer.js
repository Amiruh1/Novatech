// Envío de correos.
//   MAIL_MODE=smtp    → SMTP (p. ej. Gmail): SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
//   MAIL_MODE=ses     → Amazon SES: MAIL_FROM, SES_REGION / AWS_REGION
//   MAIL_MODE=console → local: guarda el HTML en .data/outbox (no envía nada)
import { mkdirSync, writeFileSync } from 'node:fs';

let sesClient, smtp;
async function smtpTransport() {
  if (smtp) return smtp;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) throw new Error('SMTP no configurado (SMTP_HOST, SMTP_USER, SMTP_PASS)');
  const nodemailer = (await import('nodemailer')).default;
  const port = Number(SMTP_PORT || 587);
  smtp = nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
  return smtp;
}
/** Comprueba la conexión y el usuario SMTP sin enviar ningún correo. */
export async function verifySmtp() { return (await smtpTransport()).verify(); }

// attachments: [{ filename, content: Buffer, contentType }] (p. ej. el comprobante PDF de la compra).
// inline: imágenes incrustadas en el HTML con cid (logo e iconos de las plantillas).
export async function sendMail({ to, subject, html, text, attachments = [], inline = [] }) {
  const list = (Array.isArray(to) ? to : [to]).filter(Boolean);
  const all = [...inline, ...attachments];
  if (!list.length) return { skipped: true };
  const mode = process.env.MAIL_MODE || 'console';
  if (mode === 'smtp') {
    const t = await smtpTransport();
    const info = await t.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: list.join(', '), subject, html, text: text || subject, attachments: all });
    return { id: info.messageId };
  }
  if (mode === 'ses') {
    const { SESv2Client, SendEmailCommand } = await import('@aws-sdk/client-sesv2');
    sesClient ||= new SESv2Client({ region: process.env.SES_REGION || process.env.AWS_REGION });
    const from = process.env.MAIL_FROM;
    if (!from) throw new Error('MAIL_FROM no configurado');
    if (all.length) { // con adjuntos o imágenes incrustadas se envía el mensaje MIME completo
      const MailComposer = (await import('nodemailer/lib/mail-composer/index.js')).default;
      const raw = await new MailComposer({ from, to: list.join(', '), subject, html, text: text || subject, attachments: all }).compile().build();
      const r = await sesClient.send(new SendEmailCommand({ Content: { Raw: { Data: raw } } }));
      return { id: r.MessageId };
    }
    const r = await sesClient.send(new SendEmailCommand({
      FromEmailAddress: from,
      Destination: { ToAddresses: list },
      Content: { Simple: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: { Html: { Data: html, Charset: 'UTF-8' }, Text: { Data: text || subject, Charset: 'UTF-8' } },
      } },
    }));
    return { id: r.MessageId };
  }
  const dir = process.env.OUTBOX_DIR || './.data/outbox';
  mkdirSync(dir, { recursive: true });
  const file = `${dir}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${list[0].replace(/[^a-z0-9@.]/gi, '_')}.html`;
  // Vista previa local: las imágenes incrustadas se reemplazan por data URI para verlas al abrir el HTML.
  let preview = html;
  for (const im of inline) preview = preview.split(`cid:${im.cid}`).join(`data:${im.contentType};base64,${im.content.toString('base64')}`);
  writeFileSync(file, `<!-- To: ${list.join(', ')} | Subject: ${subject} | Adjuntos: ${attachments.map((a) => a.filename).join(', ') || '-'} -->\n${preview}`);
  for (const a of attachments) writeFileSync(file.replace(/\.html$/, `-${a.filename}`), a.content);
  console.log(`[mail:console] ${subject} -> ${list.join(', ')} (${file})`);
  return { file, attachments: attachments.map((a) => a.filename) };
}

// Un fallo de correo NUNCA debe romper la operación principal (compra, registro...).
export async function sendMailSafe(msg) {
  try { return await sendMail(msg); }
  catch (e) { console.error('[mail:error]', e.message); return { error: e.message }; }
}
