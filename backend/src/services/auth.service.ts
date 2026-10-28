import * as authRepository from '../repositories/auth.repository';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export interface LoginResult {
  id: number;
  nombre: string;
  email: string;
  rol: string;
  telefono?: string;
  tipo_documento?: string;
  numero_documento?: string;
}

function normalizeEmail(email: string) {
  return String(email || '').trim().toLowerCase();
}

export async function loginWithCredentials(email: string, password: string): Promise<LoginResult | null> {
  const normalizedEmail = normalizeEmail(email);

  const rows = await authRepository.findLoginUser(normalizedEmail);

  const data = rows as Array<LoginResult & { password: string }>;
  const user = data[0];

  if (!user) {
    return null;
  }

  const storedPassword = String(user.password || '');

  const isBcryptHash = /^\$2[aby]\$\d{2}\$/.test(storedPassword);

  if (isBcryptHash) {
    const isValid = await bcrypt.compare(password, storedPassword);
    if (!isValid) {
      return null;
    }
  } else {
    if (storedPassword !== password) {
      return null;
    }

    const nextHash = await bcrypt.hash(password, 10);
    await authRepository.updatePassword(nextHash, user.id);
  }

  return {
    id:               user.id,
    nombre:           user.nombre,
    email:            user.email,
    rol:              user.rol,
    telefono:         user.telefono         || undefined,
    tipo_documento:   user.tipo_documento   || undefined,
    numero_documento: user.numero_documento || undefined
  };
}

export async function registerCustomerAccount(
  nombre: string,
  email: string,
  password: string,
  tipoDocumento: string,
  numeroDocumento: string
): Promise<LoginResult> {
  const normalizedName = String(nombre || '').trim();
  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = String(password || '');
  const tipoDocNormalizado = String(tipoDocumento || '').trim();
  const numDocNormalizado = String(numeroDocumento || '').trim();

  if (!normalizedName || !normalizedEmail || !normalizedPassword || !tipoDocNormalizado || !numDocNormalizado) {
    throw new Error('INVALID_REGISTER_PAYLOAD');
  }

  const existingRows = await authRepository.findRegistrationConflicts(normalizedEmail, numDocNormalizado);

  const existing = existingRows as Array<{ email: string; numero_documento: string }>;
  if (existing.length > 0) {
    const emailTaken = existing.some(r => r.email === normalizedEmail);
    const docTaken   = existing.some(r => r.numero_documento === numDocNormalizado);
    if (emailTaken && docTaken) throw new Error('EMAIL_AND_DOC_EXISTS');
    if (emailTaken)             throw new Error('EMAIL_ALREADY_EXISTS');
    throw new Error('DOC_ALREADY_EXISTS');
  }

  const hash = await bcrypt.hash(normalizedPassword, 10);

  const result = await authRepository.insertCustomer(normalizedName, normalizedEmail, hash, 'cliente', tipoDocNormalizado, numDocNormalizado);

  const insertId = Number((result as { insertId: number }).insertId || 0);

  return {
    id:               insertId,
    nombre:           normalizedName,
    email:            normalizedEmail,
    rol:              'cliente',
    tipo_documento:   tipoDocNormalizado  || undefined,
    numero_documento: numDocNormalizado   || undefined
  };
}

export async function forgotPassword(email: string) {
  const normalizedEmail = normalizeEmail(email);

  const rows = await authRepository.findActiveUserId(normalizedEmail);
  
  const user = (rows as any[])[0];
  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  const expireDate = new Date(Date.now() + 15 * 60 * 1000);

  await authRepository.setResetToken(hashedToken, expireDate, user.id);

  return resetToken;
}

function generateOtpCode(length = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

export async function forgotPasswordCode(email: string): Promise<string> {
  const normalizedEmail = normalizeEmail(email);

  const rows = await authRepository.findActiveUserId(normalizedEmail);

  const user = (rows as any[])[0];
  if (!user) throw new Error('USER_NOT_FOUND');

  const code = generateOtpCode(6);
  const hashedCode = crypto.createHash('sha256').update(code).digest('hex');
  const expireDate = new Date(Date.now() + 15 * 60 * 1000);

  await authRepository.setResetToken(hashedCode, expireDate, user.id);

  return code;
}

export async function resetPasswordByCode(email: string, code: string, newPassword: string) {
  const normalizedEmail = normalizeEmail(email);
  const hashedCode = crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');

  const rows = await authRepository.findResetCodeUser(normalizedEmail);

  const user = (rows as any[])[0];
  if (!user || user.reset_token !== hashedCode) throw new Error('INVALID_CODE');

  if (!user.reset_token_expires || new Date(user.reset_token_expires) < new Date()) {
    throw new Error('CODE_EXPIRED');
  }

  const hash = await bcrypt.hash(newPassword, 10);

  await authRepository.replacePasswordAndClearReset(hash, user.id);
}

// ── Google Sign-In — busca o crea usuario por email de Google ─────────────────
export async function loginWithGoogle(
  email: string,
  nombre: string,
  googleSub: string
): Promise<LoginResult> {
  const normalizedEmail  = email.trim().toLowerCase();
  const normalizedNombre = (nombre || '').trim() || normalizedEmail.split('@')[0];

  // Si ya existe la cuenta, retornar directamente (sin verificar contraseña)
  const rows = await authRepository.findGoogleUser(normalizedEmail);
  const existing = (rows as LoginResult[]);
  if (existing.length > 0) {
    return existing[0];
  }

  // Cuenta nueva — crear con contraseña aleatoria (nunca usable directamente)
  const randomPassword = crypto.randomBytes(32).toString('hex');
  const hash = await bcrypt.hash(randomPassword, 10);

  const result = await authRepository.insertGoogleCustomer(normalizedNombre, normalizedEmail, hash, 'cliente', 'GOOGLE');

  const insertId = Number((result as { insertId: number }).insertId || 0);
  return {
    id:             insertId,
    nombre:         normalizedNombre,
    email:          normalizedEmail,
    rol:            'cliente',
    tipo_documento: 'GOOGLE'
  };
}

export async function resetPassword(token: string, newPassword: string) {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  
  const rows = await authRepository.findResetTokenUser(hashedToken);

  const user = (rows as any[])[0];
  
  if (!user) {
    throw new Error('INVALID_TOKEN');
  }

  if (new Date(user.reset_token_expires) < new Date()) {
    throw new Error('TOKEN_EXPIRED');
  }

  const hash = await bcrypt.hash(newPassword, 10);

  await authRepository.replacePasswordAndClearReset(hash, user.id);
}

export async function isAccountActive(userId: number): Promise<boolean> {
  return (await authRepository.findActiveAccount(userId)).length > 0;
}

export async function changeAccountPassword(userId: number, currentPassword: string, newPassword: string) {
  const rows = await authRepository.findPasswordUser(userId);
  const user = (rows as Array<{ password: string }>)[0];
  if (!user) return 'USER_NOT_FOUND';
  if (!(await bcrypt.compare(currentPassword, user.password))) return 'INVALID_CURRENT_PASSWORD';
  if (await bcrypt.compare(newPassword, user.password)) return 'PASSWORD_UNCHANGED';

  const hash = await bcrypt.hash(newPassword, 10);
  await authRepository.updatePassword(hash, userId);
  return 'UPDATED';
}

export async function findProfile(userId: number) {
  return authRepository.findProfile(userId);
}

export async function findEmailConflict(email: string, userId: number) {
  return authRepository.findEmailConflict(email, userId);
}

export async function updateProfile(
  name: string,
  phone: string | null,
  email: string,
  documentType: string | null,
  documentNumber: string | null,
  userId: number
) {
  return authRepository.updateProfile(name, phone, email, documentType, documentNumber, userId);
}
