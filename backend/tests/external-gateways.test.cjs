const { test } = require('node:test');
const assert = require('node:assert/strict');
const gateway = require('../dist/src/access-data/integrations/openai.gateway');
const nova = require('../dist/src/business/services/ai-model.service');

const input = { messages: [{ role: 'user', content: 'Consulta de prueba' }],
  schemaName: 'example', schema: { type: 'object' } };
const interpretation = { intent: 'general', soloOferta: false, soloDisponibles: false, respuesta: 'Texto de prueba' };
const completion = (content, extra = {}) => new Response(JSON.stringify({ choices: [{
  finish_reason: 'stop', message: { content }, ...extra
}] }), { headers: { 'Content-Type': 'application/json' } });

async function withTestEnvironment(run) {
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  const fetchBefore = global.fetch;
  const warnBefore = console.warn;
  const warnings = [];
  process.env.OPENAI_API_KEY = 'unit-test-not-a-real-key';
  process.env.OPENAI_MODEL = 'gpt-4.1-mini';
  global.fetch = async () => { throw new Error('Unexpected network call'); };
  console.warn = message => warnings.push(message);
  try { await run(warnings); }
  finally {
    if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key;
    if (model === undefined) delete process.env.OPENAI_MODEL; else process.env.OPENAI_MODEL = model;
    global.fetch = fetchBefore;
    console.warn = warnBefore;
  }
}

test('OpenAI transport keeps structured-output request and cancellation', () => withTestEnvironment(async () => {
  let requestBody;
  const controller = new AbortController();
  const output = await gateway.requestStructuredCompletion(input, controller.signal, async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer unit-test-not-a-real-key');
    requestBody = JSON.parse(options.body);
    controller.abort();
    assert.equal(options.signal.aborted, true);
    return completion('{"ok":true}');
  });
  assert.equal(output, '{"ok":true}');
  assert.equal(requestBody.model, 'gpt-4.1-mini');
  assert.equal(requestBody.max_completion_tokens, 400);
  assert.equal(requestBody.temperature, 0);
  assert.deepEqual(requestBody.messages, input.messages);
  assert.deepEqual(requestBody.response_format, {
    type: 'json_schema', json_schema: { name: 'example', strict: true, schema: input.schema }
  });
}));

test('missing key skips the transport entirely', () => withTestEnvironment(async () => {
  delete process.env.OPENAI_API_KEY;
  let calls = 0;
  assert.equal(gateway.isOpenAIConfigured(), false);
  assert.equal(await gateway.requestStructuredCompletion(input, undefined, async () => { calls++; }), null);
  assert.equal(calls, 0);
}));

test('partial completions and refusals are not accepted', () => withTestEnvironment(async () => {
  assert.equal(await gateway.requestStructuredCompletion(input, undefined,
    async () => completion('{"ok":true}', { finish_reason: 'length' })), null);
  assert.equal(await gateway.requestStructuredCompletion(input, undefined,
    async () => completion(null, { message: { refusal: 'No disponible' } })), null);
}));

test('provider errors return null without logging the error body or credentials', () => withTestEnvironment(async warnings => {
  assert.equal(await gateway.requestStructuredCompletion(input, undefined, async () =>
    new Response(JSON.stringify({ error: { code: 'rate_limit_exceeded', message: 'private error detail' } }), { status: 429 })), null);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /429.*rate_limit_exceeded/);
  assert.doesNotMatch(warnings[0], /private error detail|unit-test-not-a-real-key/);
}));

test('timeout remains a quiet fallback', () => withTestEnvironment(async warnings => {
  assert.equal(await gateway.requestStructuredCompletion(input, undefined, async () => {
    throw new DOMException('test timeout', 'TimeoutError');
  }), null);
  assert.equal(warnings.length, 0);
}));

test('business redacts personal data and validates model interpretation', () => withTestEnvironment(async () => {
  let body;
  global.fetch = async (_url, options) => {
    body = JSON.parse(options.body);
    return completion(JSON.stringify(interpretation));
  };
  const context = { message: 'Escribe a ana@example.test o 999 888 777',
    history: [{ role: 'user', text: 'Mi correo era old@example.test' }],
    topics: [], categories: [], subcategories: [], brands: [], list: [] };
  assert.deepEqual(await nova.interpretMessage(context), interpretation);
  assert.match(body.messages.at(-1).content, /\[correo\].*\[número\]/);
  assert.doesNotMatch(JSON.stringify(body.messages), /ana@example|old@example|999 888 777/);
  global.fetch = async () => completion('{"intent":"inventado","soloOferta":false,"soloDisponibles":false}');
  assert.equal(await nova.interpretMessage(context), null);
  global.fetch = async () => completion('invalid json');
  assert.equal(await nova.interpretMessage(context), null);
}));
