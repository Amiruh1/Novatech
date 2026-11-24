import { route, requireAuth } from '../lib/router.js';
import { ok, bad, unauthorized, forbidden, HttpError } from '../lib/http.js';
import * as v from '../lib/validate.js';
import { verifyPassword, signToken, newOtp, cleanOtp, sha256 } from '../lib/auth.js';
import { getIdp } from '../lib/idp.js';
import { newId } from '../lib/id.js';
import { sendMail, sendMailSafe } from '../lib/mailer.js';
import { welcomeEmail, otpEmail, registerOtpEmail } from '../lib/emails.js';
import { audit } from '../lib/audit.js';

const MAX_FAILS = 5;
const LOCK_MIN = 15;
const OTP_MIN = 15;
// RF-08: el token del administrador lleva "elev" solo si entró por "Acceso empresa".
const session = (u, elev = false) => ({ token: signToken({ sub: u.id, rol: u.rol, ...(elev ? { elev: true } : {}) }), user: v.publicUser(u) });
const findByEmail = async (db, e) => (await db.listBy('user', 'email', e))[0] || null;
// RF-01: el número de documento también es único (los de Google sin documento usan el marcador 00000000).
export const NO_DOC = '00000000';
export async function findByDocument(db, tipo, numero, exceptId) {
  if (!numero || numero === NO_DOC) return null;
  return (await db.list('user')).find((u) => u.id !== exceptId && u.tipo_documento === tipo && u.numero_documento === numero) || null;
}
const DUP = 'Ya existe una cuenta con ese correo o documento.'; // HU-001 CA-2: sin revelar cuál

// ---- Contraseñas en Amazon Cognito (lib/idp.js) ----
// Las cuentas nuevas solo existen en Cognito (cognito: true) y la base no guarda ningún hash.
// Una cuenta antigua (con hash en la base) se migra al iniciar sesión, cambiar o recuperar su
// contraseña: se crea en Cognito con esa contraseña y el hash se borra de la base.
const withoutHash = ({ passHash, ...u }) => ({ ...u, cognito: true });
/** Comprueba la contraseña → { status: 'ok' | 'bad' | 'locked', user } (user ya migrado si correspondía). */
export async function checkPassword(db, user, password) {
  if (user.cognito) return { status: await getIdp().check(user.id, password), user };
  if (!user.passHash || !(await verifyPassword(password, user.passHash))) return { status: 'bad', user };
  await getIdp().create(user.id, user.email, password);
  return { status: 'ok', user: await db.put('user', withoutHash(user)) };
}
/** Fija la contraseña en Cognito y devuelve el usuario sin hash (falta guardarlo con db.put). */
export async function setUserPassword(user, password) {
  if (user.cognito) await getIdp().setPassword(user.id, password);
  else await getIdp().create(user.id, user.email, password);
  return withoutHash(user);
}
/** Borra de Cognito las cuentas pendientes (deshabilitadas, sin usuario en la base) de este correo. */
async function dropPendingLogins(db, email, prev) {
  const idp = getIdp();
  if (prev?.userId) await idp.remove(prev.userId);
  for (const u of await idp.findByEmail(email)) if (!u.enabled && !(await db.get('user', u.id))) await idp.remove(u.id);
}

// ---- Registro con verificación por código (OTP) ----
// 1) POST /auth/register: valida los datos, guarda una solicitud pendiente (no crea la cuenta) y envía el código.
// 2) POST /auth/register/verify: con el código correcto se crea la cuenta y se envía la bienvenida;
//    el usuario vuelve al login (HU-001: "el modal vuelve al login").
// 3) POST /auth/register/resend: nuevo código (mínimo 60 s entre envíos).
const REG_MIN = 10;          // validez del código
const REG_RESEND_S = 60;     // espera entre envíos
const regId = (email) => `reg:${email}`;

async function sendRegisterCode(db, pending) {
  const code = newOtp();
  const now = Date.now();
  const saved = await db.put('otp', {
    ...pending, hash: sha256(`${pending.email}:${code}`), attempts: 0,
    expires: new Date(now + REG_MIN * 60000).toISOString(), sentAt: new Date(now).toISOString(),
    ttl: Math.floor(now / 1000) + 3600,
  });
  try { await sendMail({ to: pending.email, ...registerOtpEmail(pending.nombre, code, REG_MIN) }); }
  catch (e) {
    console.error('[mail:error]', e.message);
    throw new HttpError(502, 'No pudimos enviar el código a tu correo. Inténtalo de nuevo en unos minutos.');
  }
  return saved;
}
function checkCooldown(pending) {
  const wait = REG_RESEND_S - Math.floor((Date.now() - Date.parse(pending.sentAt || 0)) / 1000);
  if (wait > 0) throw new HttpError(429, `Espera ${wait} s para pedir un nuevo código.`);
}

route('POST', '/auth/register', async ({ db, body }) => {
  const email = v.email(body.email);
  const nombre = v.nombre(body.nombre);
  const pass = v.password(body.password);
  if (body.confirmacion !== undefined && body.confirmacion !== pass) throw bad('Las contraseñas no coinciden.');
  const doc = v.documento(body.tipo_documento, body.numero_documento);
  const telefono = v.telefono(body.telefono);
  if (await findByEmail(db, email) || await findByDocument(db, doc.tipo_documento, doc.numero_documento)) throw new HttpError(409, DUP);
  // Registro accesible (personas con discapacidad visual, con el narrador activo): la cuenta se crea y se
  // activa al instante, sin código, y se inicia sesión. El correo queda como NO verificado
  // (email_verificado: false, registro_accesible: true) y se registra en la auditoría.
  if (body.accesible === true) {
    await db.remove('otp', regId(email)).catch(() => {});
    const id = newId();
    await getIdp().create(id, email, pass);
    let user;
    try {
      user = await db.put('user', {
        id, nombre, email, cognito: true, rol: 'cliente', ...doc, telefono,
        avatar_url: null, activo: true, email_verificado: false, registro_accesible: true,
      });
    } catch (e) { await getIdp().remove(id); throw e; }
    await audit(db, user, 'REGISTRO_ACCESIBLE', `Cuenta creada sin código de verificación (registro accesible): ${email}`, { entidad: 'user', entidad_id: user.id });
    await sendMailSafe({ to: email, ...welcomeEmail(user) });
    return ok({ creado: true, activada: true, ...session(user), message: 'Tu cuenta fue creada y activada.' }, 201);
  }
  const prev = await db.get('otp', regId(email));
  if (prev && prev.expires > new Date().toISOString()) checkCooldown(prev);
  // La cuenta se crea ya en Cognito, deshabilitada, y se habilita al verificar el código: así la
  // contraseña nunca se guarda en la base, ni siquiera mientras el registro está pendiente.
  await dropPendingLogins(db, email, prev);
  const userId = newId();
  await getIdp().create(userId, email, pass, { enabled: false });
  await sendRegisterCode(db, { id: regId(email), tipo: 'registro', userId, email, nombre, ...doc, telefono });
  return ok({ pendiente: true, email, expira_min: REG_MIN, message: `Te enviamos un código de 6 caracteres a ${email}.` }, 202);
});

route('POST', '/auth/register/resend', async ({ db, body }) => {
  const email = v.email(body.email);
  const pending = await db.get('otp', regId(email));
  if (!pending) throw bad('Tu solicitud de registro expiró. Vuelve a completar el formulario.');
  checkCooldown(pending);
  await sendRegisterCode(db, pending);
  return ok({ message: `Te enviamos un nuevo código a ${email}.` });
});

route('POST', '/auth/register/verify', async ({ db, body }) => {
  const email = v.email(body.email);
  const code = cleanOtp(body.code);
  const pending = await db.get('otp', regId(email));
  if (!pending || pending.expires < new Date().toISOString()) throw bad('El código expiró. Pide uno nuevo.');
  if (pending.attempts >= 5) throw bad('Demasiados intentos. Pide un nuevo código.');
  if (sha256(`${email}:${code}`) !== pending.hash) {
    await db.put('otp', { ...pending, attempts: pending.attempts + 1 });
    throw bad('Código incorrecto o expirado.');
  }
  if (await findByEmail(db, email) || await findByDocument(db, pending.tipo_documento, pending.numero_documento)) {
    await db.remove('otp', regId(email)); throw new HttpError(409, DUP);
  }
  // Solicitudes guardadas antes de usar Cognito traen el hash: esa cuenta se migra al iniciar sesión.
  if (pending.userId) await getIdp().enable(pending.userId);
  const user = await db.put('user', {
    ...(pending.userId ? { id: pending.userId, cognito: true } : { passHash: pending.passHash }),
    nombre: pending.nombre, email, rol: 'cliente',
    tipo_documento: pending.tipo_documento, numero_documento: pending.numero_documento,
    telefono: pending.telefono, avatar_url: null, activo: true, email_verificado: true,
  });
  await db.remove('otp', regId(email));
  await sendMailSafe({ to: email, ...welcomeEmail(user) });
  return ok({ creado: true, email, message: 'Cuenta creada. Ya puedes iniciar sesión.' }, 201);
});

// modo: 'cliente' (por defecto) o 'empresa' (RF-08: autenticación en modo elevado para el backoffice).
route('POST', '/auth/login', async ({ db, body }) => {
  const email = v.email(body.email);
  const empresa = body.modo === 'empresa';
  const user = await findByEmail(db, email);
  const generic = unauthorized('Correo o contraseña incorrectos.');
  if (!user) { await getIdp().check('000000000000000000000000', String(body.password ?? '')).catch(() => {}); throw generic; } // mismo tiempo de respuesta
  if (user.lockedUntil && user.lockedUntil > new Date().toISOString())
    throw new HttpError(429, `Demasiados intentos. Intenta de nuevo en ${LOCK_MIN} minutos.`);
  const { status, user: cur } = await checkPassword(db, user, String(body.password ?? ''));
  if (status === 'locked') throw new HttpError(429, 'Demasiados intentos. Intenta de nuevo en unos minutos.');
  if (status !== 'ok') {
    const fails = (user.failedLogins || 0) + 1;
    await db.put('user', { ...user, failedLogins: fails % MAX_FAILS === 0 ? 0 : fails,
      lockedUntil: fails % MAX_FAILS === 0 ? new Date(Date.now() + LOCK_MIN * 60000).toISOString() : null });
    throw generic;
  }
  if (user.activo === false) throw new HttpError(403, 'Tu cuenta está desactivada. Contacta al administrador.');
  if (empresa && user.rol !== 'admin') throw forbidden('Esta cuenta no tiene acceso al panel de empresa.');
  if (!empresa && user.rol === 'admin') throw forbidden('Las cuentas de administrador ingresan desde "Acceso empresa".');
  const saved = await db.put('user', { ...cur, failedLogins: 0, lockedUntil: null, ultimo_acceso: new Date().toISOString() });
  if (empresa) await audit(db, saved, 'LOGIN_EMPRESA', 'Inicio de sesión en el panel de empresa', { entidad: 'user', entidad_id: saved.id });
  return ok(session(saved, empresa));
});

route('POST', '/auth/google', async ({ db, body }) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new HttpError(501, 'Inicio de sesión con Google no configurado.');
  const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(String(body.credential || ''))}`);
  if (!r.ok) throw unauthorized('Token de Google inválido.');
  const info = await r.json();
  if (info.aud !== clientId || info.email_verified !== 'true') throw unauthorized('Token de Google inválido.');
  const email = v.email(info.email);
  let user = await findByEmail(db, email);
  if (user && user.activo === false) throw new HttpError(403, 'Tu cuenta está desactivada.');
  if (user?.rol === 'admin') throw forbidden('Las cuentas de administrador ingresan desde "Acceso empresa".');
  if (!user) {
    user = await db.put('user', {
      nombre: v.str(info.name || email.split('@')[0], 120), email, passHash: '!google', rol: 'cliente',
      tipo_documento: 'DNI', numero_documento: NO_DOC, telefono: null, avatar_url: info.picture || null, activo: true,
    });
    await sendMailSafe({ to: email, ...welcomeEmail(user) });
  }
  return ok(session(await db.put('user', { ...user, ultimo_acceso: new Date().toISOString() })));
});

// RF-03: siempre responde igual, exista o no el correo (no revela qué cuentas existen).
// RN-07: un solo código activo por usuario (el nuevo reemplaza al anterior) y sin reutilización.
route('POST', '/auth/forgot-password', async ({ db, body }) => {
  const email = v.email(body.email);
  const user = await findByEmail(db, email);
  if (user && user.activo !== false) {
    const code = newOtp();
    await db.put('otp', {
      id: email, hash: sha256(`${email}:${code}`), attempts: 0,
      expires: new Date(Date.now() + OTP_MIN * 60000).toISOString(),
      ttl: Math.floor(Date.now() / 1000) + 3600, // limpieza automática
    });
    await sendMailSafe({ to: email, ...otpEmail(user, code) });
  }
  return ok({ message: 'Si el correo está registrado, te enviamos un código de 6 caracteres.' });
});

// RF-04: código + nueva contraseña + confirmación. No inicia sesión automáticamente.
route('POST', '/auth/reset-password', async ({ db, body }) => {
  const email = v.email(body.email);
  const pass = v.password(body.password);
  if (body.confirmacion !== undefined && body.confirmacion !== pass) throw bad('Las contraseñas no coinciden.');
  const code = cleanOtp(body.code);
  const otp = await db.get('otp', email);
  const invalid = bad('Código inválido o expirado.');
  if (!otp || otp.expires < new Date().toISOString() || otp.attempts >= 5) throw invalid;
  if (sha256(`${email}:${code}`) !== otp.hash) {
    await db.put('otp', { ...otp, attempts: otp.attempts + 1 });
    throw invalid;
  }
  const user = await findByEmail(db, email);
  if (!user) throw invalid;
  await db.put('user', { ...(await setUserPassword(user, pass)), failedLogins: 0, lockedUntil: null });
  await db.remove('otp', email);
  return ok({ message: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
});

route('GET', '/auth/me', requireAuth, async ({ user, token }) => ok({ user: v.publicUser(user), elev: !!token.elev }));

// RF-06: nombre, teléfono (9 dígitos) y correo editables. El documento NO se modifica después del
// registro; si la cuenta no tiene documento, se puede registrar una sola vez.
route('PUT', '/auth/profile', requireAuth, async ({ db, user, body }) => {
  const upd = { ...user };
  if (body.nombre !== undefined) upd.nombre = v.nombre(body.nombre);
  if (body.telefono !== undefined) upd.telefono = v.telefono(body.telefono);
  if (body.email !== undefined) {
    const email = v.email(body.email);
    if (email !== user.email) {
      if (await findByEmail(db, email)) throw new HttpError(409, 'Ese correo ya está en uso.');
      upd.email = email;
    }
  }
  const emailChanged = upd.email !== user.email;
  const hasDoc = user.numero_documento && user.numero_documento !== NO_DOC;
  const docSent = body.tipo_documento !== undefined || body.numero_documento !== undefined;
  if (docSent) {
    const doc = v.documento(body.tipo_documento ?? user.tipo_documento, body.numero_documento ?? user.numero_documento);
    const same = doc.tipo_documento === user.tipo_documento && doc.numero_documento === user.numero_documento;
    if (hasDoc && !same) throw bad('El documento no se puede modificar después del registro.');
    if (!hasDoc) {
      if (await findByDocument(db, doc.tipo_documento, doc.numero_documento, user.id)) throw new HttpError(409, 'Ese documento ya está registrado en otra cuenta.');
      Object.assign(upd, doc);
    }
  }
  const saved = await db.put('user', upd);
  if (emailChanged && saved.cognito) await getIdp().setEmail(saved.id, saved.email).catch((e) => console.error('[cognito:email]', e.message));
  return ok({ user: v.publicUser(saved) });
});

// RF-05: exige la contraseña actual.
route('POST', '/auth/change-password', requireAuth, async ({ db, user, body }) => {
  const { status, user: cur } = await checkPassword(db, user, String(body.actual ?? ''));
  if (status === 'locked') throw new HttpError(429, 'Demasiados intentos. Intenta de nuevo en unos minutos.');
  if (status !== 'ok') throw bad('La contraseña actual es incorrecta.');
  const next = v.password(body.nueva);
  if (body.confirmacion !== undefined && body.confirmacion !== next) throw bad('Las contraseñas no coinciden.');
  if (next === body.actual) throw bad('La nueva contraseña debe ser distinta.');
  await db.put('user', await setUserPassword(cur, next));
  return ok({ message: 'Contraseña actualizada.' });
});
