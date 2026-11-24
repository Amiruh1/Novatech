// Proveedor de identidad: las contraseñas viven en Amazon Cognito, nunca en MongoDB.
//
// El backend usa las APIs de administrador de Cognito (flujo ADMIN_USER_PASSWORD_AUTH), así el
// frontend no cambia y se mantienen los correos con código, el registro accesible y el bloqueo propio.
// El nombre de usuario en Cognito es el id del usuario en MongoDB (24 hex): no cambia aunque cambie el
// correo, que se guarda como atributo solo para reconocer la cuenta en la consola de AWS.
//
// Variables: COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID y COGNITO_REGION (por defecto, la de AWS_REGION).
// Sin ellas, en pruebas (NODE_ENV=test o IDP=memory) se usa un proveedor en memoria con el mismo contrato.
import {
  CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand, AdminInitiateAuthCommand,
  AdminEnableUserCommand, AdminDisableUserCommand, AdminDeleteUserCommand, AdminUpdateUserAttributesCommand, ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import bcrypt from 'bcryptjs';
import { HttpError } from './http.js';

/**
 * Contrato:
 *   create(id, email, password, { enabled })  crea la cuenta (enabled: false = pendiente de verificar el correo)
 *   check(id, password) → 'ok' | 'bad' | 'locked'
 *   setPassword(id, password) · enable(id) · disable(id) · remove(id) · setEmail(id, email)
 *   findByEmail(email) → [{ id, enabled }]
 */
function cognitoIdp({ poolId, clientId, region }) {
  const client = new CognitoIdentityProviderClient({ region });
  const send = (cmd) => client.send(cmd);
  const name = (e) => e?.name || e?.__type || '';
  // Errores de Cognito → mensajes para el usuario (la contraseña la valida antes validate.js, así que
  // InvalidPasswordException solo aparece si la política del grupo de usuarios es más estricta).
  const wrap = (e) => {
    if (name(e) === 'InvalidPasswordException') return new HttpError(400, 'La contraseña no cumple la política de seguridad.');
    console.error('[cognito]', name(e), e?.message);
    return new HttpError(502, 'El servicio de cuentas no respondió. Inténtalo de nuevo en unos minutos.');
  };
  const safe = async (fn) => { try { return await fn(); } catch (e) { throw wrap(e); } };
  const ignoreMissing = async (fn) => { try { await fn(); } catch (e) { if (name(e) !== 'UserNotFoundException') throw wrap(e); } };

  return {
    kind: 'cognito',
    async create(id, email, password, { enabled = true } = {}) {
      await safe(async () => {
        try {
          await send(new AdminCreateUserCommand({
            UserPoolId: poolId, Username: id, MessageAction: 'SUPPRESS', // sin correo de Cognito: los enviamos nosotros
            UserAttributes: [{ Name: 'email', Value: email }, { Name: 'email_verified', Value: 'true' }],
          }));
        } catch (e) { if (name(e) !== 'UsernameExistsException') throw e; }
        await send(new AdminSetUserPasswordCommand({ UserPoolId: poolId, Username: id, Password: password, Permanent: true }));
        if (!enabled) await send(new AdminDisableUserCommand({ UserPoolId: poolId, Username: id }));
      });
    },
    async check(id, password) {
      try {
        await send(new AdminInitiateAuthCommand({
          UserPoolId: poolId, ClientId: clientId, AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
          AuthParameters: { USERNAME: id, PASSWORD: password },
        }));
        return 'ok';
      } catch (e) {
        if (name(e) === 'NotAuthorizedException') return /attempts exceeded/i.test(e.message || '') ? 'locked' : 'bad';
        if (name(e) === 'UserNotFoundException' || name(e) === 'UserNotConfirmedException') return 'bad';
        throw wrap(e);
      }
    },
    setPassword: (id, password) => safe(() => send(new AdminSetUserPasswordCommand({ UserPoolId: poolId, Username: id, Password: password, Permanent: true }))),
    enable: (id) => safe(() => send(new AdminEnableUserCommand({ UserPoolId: poolId, Username: id }))),
    disable: (id) => ignoreMissing(() => send(new AdminDisableUserCommand({ UserPoolId: poolId, Username: id }))),
    remove: (id) => ignoreMissing(() => send(new AdminDeleteUserCommand({ UserPoolId: poolId, Username: id }))),
    setEmail: (id, email) => ignoreMissing(() => send(new AdminUpdateUserAttributesCommand({
      UserPoolId: poolId, Username: id, UserAttributes: [{ Name: 'email', Value: email }, { Name: 'email_verified', Value: 'true' }],
    }))),
    async findByEmail(email) {
      const r = await safe(() => send(new ListUsersCommand({ UserPoolId: poolId, Filter: `email = "${email.replace(/["\\]/g, '')}"`, Limit: 10 })));
      return (r.Users || []).map((u) => ({ id: u.Username, enabled: u.Enabled !== false }));
    },
  };
}

/** Solo para pruebas y desarrollo sin AWS: guarda bcrypt en memoria del proceso (nada en la base). */
export function memoryIdp() {
  const users = new Map(); // id → { email, hash, enabled }
  return {
    kind: 'memory',
    async create(id, email, password, { enabled = true } = {}) { users.set(id, { email, hash: await bcrypt.hash(password, 4), enabled }); },
    async check(id, password) {
      const u = users.get(id);
      return u && u.enabled && (await bcrypt.compare(password, u.hash)) ? 'ok' : 'bad';
    },
    async setPassword(id, password) { const u = users.get(id); if (u) u.hash = await bcrypt.hash(password, 4); },
    async enable(id) { const u = users.get(id); if (u) u.enabled = true; },
    async disable(id) { const u = users.get(id); if (u) u.enabled = false; },
    async remove(id) { users.delete(id); },
    async setEmail(id, email) { const u = users.get(id); if (u) u.email = email; },
    async findByEmail(email) { return [...users].filter(([, u]) => u.email === email).map(([id, u]) => ({ id, enabled: u.enabled })); },
    has: (id) => users.has(id),
  };
}

let current = null;
/** El proveedor configurado. Sin Cognito, fuera de pruebas, falla con un mensaje claro. */
export function getIdp() {
  if (current) return current;
  const poolId = process.env.COGNITO_USER_POOL_ID, clientId = process.env.COGNITO_CLIENT_ID;
  if (poolId && clientId) {
    const region = process.env.COGNITO_REGION || poolId.split('_')[0] || process.env.AWS_REGION;
    current = cognitoIdp({ poolId, clientId, region });
  } else if (process.env.NODE_ENV === 'test' || process.env.IDP === 'memory') {
    current = memoryIdp();
  } else {
    throw new HttpError(500, 'Cognito no está configurado (COGNITO_USER_POOL_ID y COGNITO_CLIENT_ID).');
  }
  return current;
}
export function setIdp(idp) { current = idp; } // para pruebas
