import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import * as authService from '../../business/services/auth.service';
import {
  loginWithCredentials,
  registerCustomerAccount,
  loginWithGoogleCredential as googleService,
  InvalidGoogleIdentityError,
  LoginResult,
  forgotPassword as fpService,
  resetPassword as rpService,
  forgotPasswordCode as fpCodeService,
  resetPasswordByCode as rpCodeService
} from '../../business/services/auth.service';
import { sendRegistrationWelcome, sendPasswordReset, sendPasswordResetCode } from '../../business/services/notification.service';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_EMAIL_LENGTH = 320;

function validateDocumento(tipo: string, numero: string): string | null {
  const n = numero.trim();
  if (tipo === 'DNI') {
    if (!/^\d{8}$/.test(n)) return 'El DNI debe tener exactamente 8 dígitos numéricos';
  } else if (tipo === 'RUC') {
    if (!/^\d{11}$/.test(n)) return 'El RUC debe tener exactamente 11 dígitos numéricos';
  } else if (tipo === 'CE') {
    if (n.length < 8 || n.length > 12) return 'El CE debe tener entre 8 y 12 caracteres';
  } else if (tipo === 'Pasaporte') {
    if (n.length < 6 || n.length > 12) return 'El pasaporte debe tener entre 6 y 12 caracteres';
  }
  return null;
}

function validateEmail(email: string): string | null {
  if (email.length > MAX_EMAIL_LENGTH) return 'El correo excede la longitud máxima permitida (320 caracteres)';
  if (!EMAIL_PATTERN.test(email)) return 'Formato de email inválido';
  return null;
}

function buildAuthPayload(user: LoginResult, token: string, mensaje: string) {
  return {
    mensaje,
    token,
    usuario: {
      id:               user.id,
      nombre:           user.nombre,
      email:            user.email,
      rol:              user.rol,
      telefono:         user.telefono         || undefined,
      tipo_documento:   user.tipo_documento   || undefined,
      numero_documento: user.numero_documento || undefined
    }
  };
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as { email?: string; password?: string };
  const jwtSecret = process.env.JWT_SECRET;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email y password son obligatorios' });
  }

  if (typeof password === 'string' && password.trim() === '') {
    return res.status(400).json({ message: 'Email y password son obligatorios' });
  }

  const emailErr = validateEmail(email);
  if (emailErr) return res.status(400).json({ message: emailErr });

  if (!jwtSecret) {
    return res.status(500).json({ message: 'Configuracion incompleta: JWT_SECRET no definido' });
  }

  try {
    const user = await loginWithCredentials(email, password);

    if (!user) {
      return res.status(401).json({ message: 'Correo o contraseña incorrectos' });
    }

    const token = jwt.sign(
      { id: user.id, rol: user.rol, nombre: user.nombre },
      jwtSecret,
      { expiresIn: '8h' }
    );

    return res.json(buildAuthPayload(user, token, 'Login exitoso'));
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message || 'Error en login' });
  }
}

export async function register(req: Request, res: Response) {
  const { nombre, email, password, confirmPassword, tipo_documento, numero_documento } = req.body as {
    nombre?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
    tipo_documento?: string;
    numero_documento?: string;
  };

  const jwtSecret = process.env.JWT_SECRET;

  if (!nombre || !email || !password || !tipo_documento || !numero_documento) {
    return res.status(400).json({ message: 'Nombre, email, password, tipo y número de documento son obligatorios' });
  }

  const nombreTrim = nombre.trim();
  if (nombreTrim.length < 3) {
    return res.status(400).json({ message: 'El nombre debe tener al menos 3 caracteres' });
  }
  if (nombreTrim.length > 120) {
    return res.status(400).json({ message: 'El nombre no puede superar 120 caracteres' });
  }
  if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s-]+$/.test(nombreTrim)) {
    return res.status(400).json({ message: 'El nombre solo puede contener letras' });
  }

  const emailErr = validateEmail(email);
  if (emailErr) return res.status(400).json({ message: emailErr });

  if (password.trim() === '') {
    return res.status(400).json({ message: 'La contraseña no puede estar vacía o contener solo espacios' });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres' });
  }
  if (password.length > 64) {
    return res.status(400).json({ message: 'La contraseña no puede superar 64 caracteres' });
  }
  if (confirmPassword !== undefined && confirmPassword !== password) {
    return res.status(400).json({ message: 'Las contraseñas no coinciden' });
  }

  const docError = validateDocumento(tipo_documento, numero_documento);
  if (docError) {
    return res.status(400).json({ message: docError });
  }

  if (!jwtSecret) {
    return res.status(500).json({ message: 'Configuracion incompleta: JWT_SECRET no definido' });
  }

  try {
    const user = await registerCustomerAccount(nombre, email, password, tipo_documento, numero_documento);

    const token = jwt.sign(
      { id: user.id, rol: user.rol, nombre: user.nombre },
      jwtSecret,
      { expiresIn: '8h' }
    );

    sendRegistrationWelcome(user.nombre, user.email, user.rol).catch(() => {});

    return res.status(201).json(buildAuthPayload(user, token, 'Registro exitoso'));
  } catch (error) {
    const message = (error as Error).message || 'No se pudo completar el registro';

    if (message === 'EMAIL_ALREADY_EXISTS') {
      return res.status(409).json({ message: 'El correo ya está registrado' });
    }
    if (message === 'DOC_ALREADY_EXISTS') {
      const tipoDoc = String(tipo_documento || 'Documento').trim();
      return res.status(409).json({ message: `El ${tipoDoc} ya está registrado` });
    }
    if (message === 'EMAIL_AND_DOC_EXISTS') {
      const tipoDoc = String(tipo_documento || 'documento').trim();
      return res.status(409).json({ message: `El correo y el ${tipoDoc} ya están registrados` });
    }
    if (message === 'INVALID_REGISTER_PAYLOAD') {
      return res.status(400).json({ message: 'Datos inválidos para registro' });
    }

    return res.status(500).json({ message });
  }
}

export async function forgotPassword(req: Request, res: Response) {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email es obligatorio' });
  }

  try {
    const token = await fpService(email);
    sendPasswordReset(email, token).catch(() => {});

    return res.json({ message: 'Si el correo existe, el enlace de recuperación ha sido enviado a tu bandeja.' });
  } catch {
    return res.json({ message: 'Si el correo existe, el enlace de recuperación ha sido enviado a tu bandeja.' });
  }
}

export async function resetPassword(req: Request, res: Response) {
  const { token, password, confirmPassword } = req.body;

  if (!token || !password) {
    return res.status(400).json({ message: 'Token y password son obligatorios' });
  }

  if (/^\s|\s$/.test(password)) {
    return res.status(400).json({ message: 'La contraseña no debe contener espacios al inicio o final' });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres' });
  }
  if (password.length > 64) {
    return res.status(400).json({ message: 'La contraseña no puede superar 64 caracteres' });
  }
  if (confirmPassword !== undefined && confirmPassword !== password) {
    return res.status(400).json({ message: 'Las contraseñas no coinciden' });
  }

  try {
    await rpService(token, password);
    return res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (error: any) {
    return res.status(400).json({ message: error.message || 'Error al restablecer contraseña' });
  }
}

export async function forgotPasswordCode(req: Request, res: Response) {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email es obligatorio' });
  }

  const emailErr = validateEmail(email);
  if (emailErr) return res.status(400).json({ message: emailErr });

  try {
    const code = await fpCodeService(email);
    sendPasswordResetCode(email, code).catch(() => {});
  } catch {
  }

  return res.json({ message: 'Si el correo existe, recibirás el código de recuperación en tu bandeja.' });
}

export async function resetPasswordByCode(req: Request, res: Response) {
  const { email, code, password, confirmPassword } = req.body;

  if (!email || !code || !password) {
    return res.status(400).json({ message: 'Correo, código y nueva contraseña son obligatorios' });
  }

  const codeTrim = String(code).trim();
  if (codeTrim.length !== 6) {
    return res.status(400).json({ message: 'El código debe tener exactamente 6 caracteres' });
  }

  if (/^\s|\s$/.test(password)) {
    return res.status(400).json({ message: 'La contraseña no debe contener espacios al inicio o final' });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres' });
  }
  if (password.length > 64) {
    return res.status(400).json({ message: 'La contraseña no puede superar 64 caracteres' });
  }
  if (confirmPassword !== undefined && confirmPassword !== password) {
    return res.status(400).json({ message: 'Las contraseñas no coinciden' });
  }

  try {
    await rpCodeService(email, codeTrim, password);
    return res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (error: any) {
    const msg = error.message || '';
    if (msg === 'INVALID_CODE') return res.status(400).json({ message: 'Código incorrecto. Verifica e intenta de nuevo.' });
    if (msg === 'CODE_EXPIRED') return res.status(400).json({ message: 'El código expiró. Solicita uno nuevo.' });
    return res.status(400).json({ message: 'Error al restablecer la contraseña' });
  }
}

export async function changePassword(req: any, res: any) {
  const userId = req.user?.id;
  const { passActual, passNueva, passConfirm } = req.body;

  if (!userId || !passActual || !passNueva) {
    return res.status(400).json({ message: 'Datos incompletos' });
  }

  if (typeof passNueva === 'string' && passNueva.trim() === '') {
    return res.status(400).json({ message: 'Datos incompletos' });
  }

  if (/^\s|\s$/.test(passNueva)) {
    return res.status(400).json({ message: 'La contraseña no debe contener espacios al inicio o final' });
  }
  if (passNueva.length < 8) {
    return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 8 caracteres' });
  }
  if (passNueva.length > 64) {
    return res.status(400).json({ message: 'La contraseña no puede superar 64 caracteres' });
  }
  if (passConfirm !== undefined && passConfirm !== passNueva) {
    return res.status(400).json({ message: 'Las contraseñas no coinciden' });
  }

  try {
    const outcome = await authService.changeAccountPassword(userId, passActual, passNueva);
    if (outcome === 'USER_NOT_FOUND') return res.status(404).json({ message: 'Usuario no encontrado' });

    if (outcome === 'INVALID_CURRENT_PASSWORD') return res.status(401).json({ message: 'La contraseña actual es incorrecta' });

    if (outcome === 'PASSWORD_UNCHANGED') {
      return res.status(400).json({ message: 'La nueva contraseña debe ser diferente a la actual' });
    }

    return res.json({ message: 'Contraseña actualizada' });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
}

export async function updateProfile(req: any, res: Response) {
  const userId = req.user?.id;
  const { nombre, telefono, email, tipo_documento, numero_documento } = req.body;

  if (!userId || !nombre || typeof nombre !== 'string') {
    return res.status(400).json({ message: 'El nombre es obligatorio' });
  }

  const nombreTrimP = nombre.trim();
  if (nombreTrimP.length < 3) {
    return res.status(400).json({ message: 'El nombre debe tener al menos 3 caracteres' });
  }
  if (nombreTrimP.length > 120) {
    return res.status(400).json({ message: 'El nombre no puede superar 120 caracteres' });
  }
  if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s-]+$/.test(nombreTrimP)) {
    return res.status(400).json({ message: 'El nombre solo puede contener letras' });
  }

  let telefonoSanitizado: string | null = null;
  if (telefono !== undefined && telefono !== null) {
    const tel = String(telefono).trim();
    if (tel !== '') {
      if (!/^\d{9}$/.test(tel)) {
        return res.status(400).json({ message: 'El teléfono debe tener exactamente 9 dígitos' });
      }
      if (!tel.startsWith('9')) {
        return res.status(400).json({ message: 'El teléfono debe comenzar con 9' });
      }
      telefonoSanitizado = tel;
    }
  }

  try {
    const userRows = await authService.findProfile(userId);
    const currentUser = (userRows as any[])[0];

    let emailTrim: string | null = null;
    if (email && typeof email === 'string' && email.trim().length >= 5) {
      emailTrim = email.trim().toLowerCase();
      const emailErr = validateEmail(emailTrim);
      if (emailErr) return res.status(400).json({ message: emailErr });
      const existing = await authService.findEmailConflict(emailTrim, userId);
      if ((existing as any[]).length > 0) {
        return res.status(409).json({ message: 'El correo ya está en uso por otra cuenta.' });
      }
    }

    let tipoDocSanitizado: string | null = null;
    let numDocSanitizado: string | null = null;
    if (!currentUser?.numero_documento && tipo_documento && numero_documento) {
      const docError = validateDocumento(tipo_documento, numero_documento);
      if (docError) return res.status(400).json({ message: docError });
      tipoDocSanitizado = String(tipo_documento).trim();
      numDocSanitizado  = String(numero_documento).trim();
    }

    const finalEmail = emailTrim ?? currentUser?.email;
    await authService.updateProfile(nombre.trim(), telefonoSanitizado, finalEmail, tipoDocSanitizado, numDocSanitizado, userId);

    return res.json({ message: 'Perfil actualizado' });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
}

export async function googleLogin(req: Request, res: Response) {
  const { credential } = req.body as { credential?: string };
  const jwtSecret  = process.env.JWT_SECRET;
  const clientId   = process.env.GOOGLE_CLIENT_ID;

  if (!credential) {
    return res.status(400).json({ message: 'Credencial de Google requerida' });
  }
  if (!clientId) {
    return res.status(500).json({ message: 'GOOGLE_CLIENT_ID no configurado en el servidor' });
  }
  if (!jwtSecret) {
    return res.status(500).json({ message: 'Configuración de servidor incompleta' });
  }

  try {
    const user = await googleService(credential, clientId);

    const token = jwt.sign(
      { id: user.id, email: user.email, rol: user.rol },
      jwtSecret,
      { expiresIn: '7d' }
    );

    return res.json(buildAuthPayload(user, token, `Bienvenido, ${user.nombre}`));
  } catch (err: any) {
    if (err instanceof InvalidGoogleIdentityError) {
      return res.status(401).json({ message: 'Token de Google inválido o sin email asociado' });
    }
    const msg = err?.message || '';
    if (msg.includes('Token used too late') || msg.includes('Invalid token')) {
      return res.status(401).json({ message: 'El token de Google expiró. Inténtalo de nuevo.' });
    }
    console.error('[googleLogin]', msg);
    return res.status(500).json({ message: 'Error al verificar tu cuenta de Google' });
  }
}
