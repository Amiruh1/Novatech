// Autenticación: tokens JWT HS256 de 8 horas y códigos OTP.
// Las contraseñas viven en Amazon Cognito (lib/idp.js). Bcrypt y scrypt quedan solo para verificar las
// cuentas antiguas que aún tienen hash en la base: se migran a Cognito al iniciar sesión (routes/auth.js).
import { scrypt, randomBytes, timingSafeEqual, createHmac, randomInt, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import bcrypt from 'bcryptjs';
const scryptAsync = promisify(scrypt);

export const BCRYPT_COST = 10;
export const hashPassword = (password) => bcrypt.hash(password, BCRYPT_COST);

/** Verifica Bcrypt y, por compatibilidad, los hashes scrypt antiguos (se migran al iniciar sesión). */
export async function verifyPassword(password, stored) {
  const s = String(stored || '');
  if (/^\$2[aby]\$/.test(s)) return bcrypt.compare(password, s);
  const [alg, saltHex, hashHex] = s.split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

const b64u = (b) => Buffer.from(b).toString('base64url');
const secret = () => {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error('JWT_SECRET no configurado (mínimo 16 caracteres)');
  return s;
};
export function signToken(payload, ttlSeconds = 60 * 60 * 8) {
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const sig = createHmac('sha256', secret()).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
export function verifyToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const expected = createHmac('sha256', secret()).update(`${parts[0]}.${parts[1]}`).digest();
  const given = Buffer.from(parts[2], 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    return p.exp && p.exp > Date.now() / 1000 ? p : null;
  } catch { return null; }
}

// RF-03: código de 6 caracteres en mayúsculas, sin O, 0, I ni 1 (se confunden al leerlos).
export const OTP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newOtp = () => Array.from({ length: 6 }, () => OTP_ALPHABET[randomInt(0, OTP_ALPHABET.length)]).join('');
/** Normaliza lo que escribe el usuario: mayúsculas y sin espacios. */
export const cleanOtp = (v) => String(v ?? '').toUpperCase().replace(/\s+/g, '').slice(0, 6);
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
