const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const { Subject, filter } = require('rxjs');

function signal(initial) {
  let value = initial;
  const current = () => value;
  current.set = next => { value = next; };
  current.update = update => { value = update(value); };
  return current;
}

function loadService(filename, className, view) {
  const documentToken = Symbol('DOCUMENT');
  const destroyToken = Symbol('DestroyRef');
  const routerToken = Symbol('Router');
  const dependencies = new Map([
    [documentToken, { defaultView: view }],
    [destroyToken, { onDestroy() {} }],
    [routerToken, { events: new Subject() }]
  ]);
  const modules = {
    '@angular/common': { DOCUMENT: documentToken },
    '@angular/core': {
      DestroyRef: destroyToken,
      inject: token => dependencies.get(token),
      Injectable: () => value => value,
      signal
    },
    '@angular/core/rxjs-interop': { takeUntilDestroyed: () => source => source },
    '@angular/router': { NavigationStart: class {}, Router: routerToken },
    rxjs: { Subject, filter }
  };
  const source = readFileSync(path.join(__dirname, '../src/app/core/services', filename), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      experimentalDecorators: true
    }
  });
  const exports = {};
  vm.runInNewContext(compiled.outputText, {
    exports,
    require: name => {
      if (!(name in modules)) throw new Error(`Unexpected import: ${name}`);
      return modules[name];
    },
    setTimeout,
    clearTimeout,
    SpeechSynthesisUtterance: class {
      constructor(text) { this.text = text; }
    }
  });
  return new exports[className]();
}

function voiceFixture(options = {}) {
  const recognitions = [];
  class Recognition {
    starts = 0;
    aborts = 0;
    constructor() { recognitions.push(this); }
    start() {
      this.starts += 1;
      if (options.startThrows) throw new Error('Audio unavailable');
    }
    abort() { this.aborts += 1; }
  }
  const service = loadService('voice-input.service.ts', 'VoiceInputService', { SpeechRecognition: Recognition });
  const final = [];
  const errors = [];
  let idle = 0;
  const started = service.listen({
    onFinal: text => final.push(text),
    onIdle: () => { idle += 1; },
    onError: code => errors.push(code)
  });
  return { service, recognitions, final, errors, started, get idle() { return idle; } };
}

function heard(recognition, text) {
  recognition.onresult({ results: [[{ transcript: text }]] });
}

test('espera el permiso sin consumir el tiempo de escucha', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fixture = voiceFixture();
  const recognition = fixture.recognitions[0];
  assert.equal(fixture.started, true);
  assert.equal(fixture.service.starting(), true);
  assert.equal(fixture.service.listening(), false);
  t.mock.timers.tick(60_000);
  assert.equal(fixture.idle, 0);
  assert.equal(recognition.aborts, 0);
  recognition.onstart();
  assert.equal(fixture.service.starting(), false);
  assert.equal(fixture.service.listening(), true);
  t.mock.timers.tick(9_999);
  assert.equal(fixture.idle, 0);
  t.mock.timers.tick(1);
  assert.equal(fixture.idle, 1);
  assert.equal(recognition.aborts, 1);
});

test('envía el dictado después de tres segundos de silencio', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fixture = voiceFixture();
  const recognition = fixture.recognitions[0];
  recognition.onstart();
  heard(recognition, 'Busco un monitor');
  t.mock.timers.tick(2_999);
  assert.deepEqual(fixture.final, []);
  t.mock.timers.tick(1);
  assert.deepEqual(fixture.final, ['Busco un monitor']);
  assert.equal(fixture.service.listening(), false);
  assert.equal(fixture.idle, 0);
});

test('un reinicio del navegador mantiene el límite de 45 segundos', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fixture = voiceFixture();
  const recognition = fixture.recognitions[0];
  recognition.onstart();
  for (let elapsed = 0; elapsed < 44_000; elapsed += 2_000) {
    heard(recognition, 'Necesito un monitor');
    t.mock.timers.tick(2_000);
    if (elapsed === 8_000) {
      recognition.onend();
      recognition.onstart();
    }
  }
  heard(recognition, 'para estudiar');
  assert.equal(recognition.starts, 2);
  t.mock.timers.tick(999);
  assert.equal(fixture.final.length, 0);
  t.mock.timers.tick(1);
  assert.equal(fixture.final.length, 1);
  assert.match(fixture.final[0], /para estudiar/);
});

test('denegar permiso cancela la espera y explica cómo habilitarlo', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fixture = voiceFixture();
  fixture.recognitions[0].onerror({ error: 'not-allowed' });
  assert.equal(fixture.service.starting(), false);
  assert.equal(fixture.service.listening(), false);
  assert.match(fixture.service.error(), /permisos junto a la dirección/);
  assert.deepEqual(fixture.errors, ['not-allowed']);
  t.mock.timers.tick(60_000);
  assert.equal(fixture.idle, 0);
});

test('cancelar antes del permiso ignora un inicio tardío', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fixture = voiceFixture();
  fixture.service.stop();
  fixture.recognitions[0].onstart();
  t.mock.timers.tick(60_000);
  assert.equal(fixture.service.starting(), false);
  assert.equal(fixture.service.listening(), false);
  assert.equal(fixture.idle, 0);
});

test('un fallo al iniciar no deja el micrófono marcado como activo', () => {
  const fixture = voiceFixture({ startThrows: true });
  assert.equal(fixture.started, false);
  assert.equal(fixture.service.starting(), false);
  assert.equal(fixture.service.listening(), false);
  assert.match(fixture.service.error(), /No se pudo iniciar/);
  assert.equal(fixture.recognitions[0].aborts, 1);
});

function speechFixture(options = {}) {
  const utterances = [];
  const synth = {
    addEventListener() {},
    removeEventListener() {},
    getVoices: () => [{ name: 'Español', lang: 'es-PE' }],
    cancel() {},
    speak(utterance) {
      if (options.speakThrows) throw new Error('Speech unavailable');
      utterances.push(utterance);
    }
  };
  return {
    service: loadService('speech.service.ts', 'SpeechService', { speechSynthesis: synth }),
    utterances
  };
}

test('un fallo síncrono de voz permite a Nova continuar sin esperar el saludo', () => {
  const fixture = speechFixture({ speakThrows: true });
  assert.equal(fixture.service.converse('Hola'), false);
  assert.equal(fixture.service.conversing(), false);
  assert.equal(fixture.service.manualActive(), false);
  assert.match(fixture.service.error(), /No se pudo iniciar/);
});

test('los errores de voz de la conversación quedan visibles y se limpian al reintentar', () => {
  const fixture = speechFixture();
  assert.equal(fixture.service.converse('Hola'), true);
  fixture.utterances[0].onerror({ error: 'not-allowed' });
  assert.equal(fixture.service.conversing(), false);
  assert.match(fixture.service.error(), /Permite el sonido/);
  assert.equal(fixture.service.converse('Hola de nuevo'), true);
  assert.equal(fixture.service.error(), '');
});

test('detener una respuesta no se presenta como un error de voz', () => {
  const fixture = speechFixture();
  fixture.service.converse('Hola');
  fixture.service.stopConversation();
  fixture.utterances[0].onerror({ error: 'interrupted' });
  assert.equal(fixture.service.error(), '');
  assert.equal(fixture.service.conversing(), false);
});
