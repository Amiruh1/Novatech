import { bad } from './http.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]+$/;

export const str = (v, max = 300) => String(v ?? '').trim().slice(0, max);
export const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
export const money = (v) => Math.round(num(v) * 100) / 100;

export function email(v) {
  const e = str(v, 320).toLowerCase();
  if (!EMAIL.test(e)) throw bad('Formato de email inválido.');
  return e;
}
export function password(v) {
  const p = String(v ?? '');
  if (/^\s|\s$/.test(p)) throw bad('La contraseña no puede empezar ni terminar con espacios.');
  if (p.length < 8) throw bad('La contraseña debe tener al menos 8 caracteres.');
  if (p.length > 64) throw bad('La contraseña no puede superar 64 caracteres.');
  return p;
}
export function nombre(v) {
  const n = str(v, 120);
  if (n.length < 3) throw bad('El nombre debe tener al menos 3 caracteres.');
  if (!NAME.test(n)) throw bad('El nombre solo puede tener letras, espacios y guiones.');
  return n;
}
// Teléfono opcional (RF-06): exactamente 9 dígitos (celular en Perú). Vacío → null.
export function telefono(v) {
  const t = str(v, 30).replace(/[\s-]/g, '');
  if (!t) return null;
  if (!/^\d{9}$/.test(t)) throw bad('El teléfono debe tener exactamente 9 dígitos.');
  return t;
}
// Mismas reglas de documento que el sistema original.
export function documento(tipo, numero) {
  const t = str(tipo, 20).toUpperCase() || 'DNI';
  const n = str(numero, 20);
  if (t === 'DNI' && !/^\d{8}$/.test(n)) throw bad('El DNI debe tener exactamente 8 dígitos numéricos.');
  if (t === 'RUC' && !/^\d{11}$/.test(n)) throw bad('El RUC debe tener exactamente 11 dígitos numéricos.');
  if (t === 'CE' && (n.length < 8 || n.length > 12)) throw bad('El CE debe tener entre 8 y 12 caracteres.');
  if (t === 'PASAPORTE' && (n.length < 6 || n.length > 12)) throw bad('El pasaporte debe tener entre 6 y 12 caracteres.');
  if (!['DNI', 'RUC', 'CE', 'PASAPORTE'].includes(t)) throw bad('Tipo de documento inválido.');
  return { tipo_documento: t, numero_documento: n };
}
export const publicUser = (u) => {
  if (!u) return null;
  const { passHash, cognito, failedLogins, lockedUntil, ...rest } = u;
  return rest;
};
