// Ejecutar después de npm run build. No se conecta a SMTP, Google ni MySQL.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const mailGateway = require('../dist/src/access-data/integrations/email.gateway');
const templates = require('../dist/src/business/templates/email.templates');
const notifications = require('../dist/src/business/services/notification.service');

async function captureMail(run) {
  const originalSend = mailGateway.sendEmail;
  const originalAttachment = mailGateway.sendEmailWithAttachment;
  const messages = [];
  mailGateway.sendEmail = async (to, subject, html) => { messages.push({ to, subject, html }); };
  mailGateway.sendEmailWithAttachment = async (to, subject, html, attachments) => {
    messages.push({ to, subject, html, attachments });
  };
  try { await run(messages); }
  finally {
    mailGateway.sendEmail = originalSend;
    mailGateway.sendEmailWithAttachment = originalAttachment;
  }
}

test('registration welcome keeps the role and does not use it as an activation link', async () => {
  const originalTemplate = templates.buildWelcomeEmail;
  let argumentsUsed;
  templates.buildWelcomeEmail = (...args) => { argumentsUsed = args; return originalTemplate(...args); };
  try {
    await captureMail(async messages => {
      await notifications.sendRegistrationWelcome('Ana', 'ana@example.test', 'cliente');
      assert.deepEqual(argumentsUsed, ['Ana', 'ana@example.test', 'cliente', '']);
      assert.equal(messages[0].to, 'ana@example.test');
      assert.match(messages[0].html, /Tu cuenta est[aá] activa/);
      assert.doesNotMatch(messages[0].html, /href="cliente"|Establecer mi contrase/);
    });
  } finally { templates.buildWelcomeEmail = originalTemplate; }
});

test('administrative invitation constructs the existing password setup URL', async () => {
  const originalUrl = process.env.FRONTEND_URL;
  process.env.FRONTEND_URL = 'https://store.example.test';
  try {
    await captureMail(async messages => {
      await notifications.sendAccountActivation('Ana', 'ana@example.test', 'admin', 'setup-token');
      assert.match(messages[0].subject, /Activa tu cuenta/);
      assert.match(messages[0].html, /href="https:\/\/store\.example\.test\/reset-password\?token=setup-token"/);
    });
  } finally {
    if (originalUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalUrl;
  }
});

test('order notification keeps the receipt attachment and calculated amounts', async () => {
  await captureMail(async messages => {
    const receipt = Buffer.from('receipt');
    await notifications.sendOrderConfirmation({ email: 'ana@example.test', clientName: 'Ana', saleId: 25,
      total: 120, items: [{ id: 1, nombre: 'Teclado', cantidad: 1, precio: 100 }],
      methodLabel: 'Tarjeta', shippingCost: 20, receipt });
    assert.match(messages[0].subject, /Pedido #25 confirmado/);
    assert.match(messages[0].html, /Teclado/);
    assert.equal(messages[0].attachments[0].filename, 'Comprobante_NovaTech_25.pdf');
    assert.equal(messages[0].attachments[0].content, receipt);
    assert.equal(messages[0].attachments[0].contentType, 'application/pdf');
  });
});

const dbPath = require.resolve('../dist/src/access-data/config/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true,
  exports: { __esModule: true, default: { query: () => { throw new Error('Unexpected database access'); } } } };
const googleGateway = require('../dist/src/access-data/integrations/google-identity.gateway');
const authRepository = require('../dist/src/access-data/repositories/auth.repository');
const auth = require('../dist/src/business/services/auth.service');

test('Google gateway supplies token and audience to the verifier and returns only identity fields', async () => {
  const { OAuth2Client } = require('google-auth-library');
  const originalVerify = OAuth2Client.prototype.verifyIdToken;
  let parameters;
  OAuth2Client.prototype.verifyIdToken = async function (input) {
    parameters = input;
    return { getPayload: () => ({ sub: 'subject', email: 'ana@example.test', name: 'Ana', aud: 'hidden-extra' }) };
  };
  try {
    const identity = await googleGateway.verifyGoogleCredential('credential-test', 'client-test');
    assert.deepEqual(parameters, { idToken: 'credential-test', audience: 'client-test' });
    assert.deepEqual(identity, { sub: 'subject', email: 'ana@example.test', name: 'Ana' });
  } finally { OAuth2Client.prototype.verifyIdToken = originalVerify; }
});

test('Google login applies business validation and looks up the normalized verified email', async () => {
  const originalVerify = googleGateway.verifyGoogleCredential;
  const originalFind = authRepository.findGoogleUser;
  const knownUser = { id: 3, nombre: 'Ana', email: 'ana@example.test', rol: 'cliente' };
  let queries = 0;
  googleGateway.verifyGoogleCredential = async () => ({ email: ' ANA@example.test ', name: 'Ana', sub: 'subject' });
  authRepository.findGoogleUser = async email => {
    queries++; assert.equal(email, 'ana@example.test'); return [knownUser];
  };
  try {
    assert.equal(await auth.loginWithGoogleCredential('credential-test', 'client-test'), knownUser);
    googleGateway.verifyGoogleCredential = async () => ({ sub: 'subject' });
    await assert.rejects(auth.loginWithGoogleCredential('credential-test', 'client-test'), auth.InvalidGoogleIdentityError);
    assert.equal(queries, 1, 'Invalid identity must not access user data');
  } finally {
    googleGateway.verifyGoogleCredential = originalVerify;
    authRepository.findGoogleUser = originalFind;
  }
});
