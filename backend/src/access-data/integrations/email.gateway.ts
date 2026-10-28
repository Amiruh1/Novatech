import nodemailer from 'nodemailer';

function createTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.ethereal.email';
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  const isSecure = port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure: isSecure,
    requireTLS: !isSecure,
    auth: user && pass ? { user, pass } : undefined,
    tls: {
      rejectUnauthorized: true
    }
  });
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const transporter = createTransporter();
  const from = process.env.SMTP_FROM || '"NovaTech Commerce" <no-reply@novatech.pe>';

  const info = await transporter.sendMail({ from, to, subject, html });

  if (process.env.NODE_ENV !== 'production') {
    const preview = nodemailer.getTestMessageUrl(info);
    console.log(`[Email] → ${to} | Asunto: "${subject}"${preview ? ` | Preview: ${preview}` : ''}`);
  }
}

export async function sendEmailWithAttachment(
  to: string,
  subject: string,
  html: string,
  attachments: Array<{ filename: string; content: Buffer; contentType: string }> = []
): Promise<void> {
  const transporter = createTransporter();
  const from = process.env.SMTP_FROM || '"NovaTech Commerce" <no-reply@novatech.pe>';

  const info = await transporter.sendMail({ from, to, subject, html, attachments });

  if (process.env.NODE_ENV !== 'production') {
    const preview = nodemailer.getTestMessageUrl(info);
    console.log(`[Email+PDF] → ${to} | Asunto: "${subject}"${preview ? ` | Preview: ${preview}` : ''}`);
  }
}
