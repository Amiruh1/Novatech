const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8');
const origin = 'https://develop-cesar.d1efa17935e6qe.amplifyapp.com';

function worker({ hostname = new URL(origin).hostname, network = async () => new Response('new html'), failCacheWrite = false } = {}) {
  const listeners = new Map();
  const stores = new Map();
  const networkCalls = [];
  const state = { unregistered: false, claimed: false, skippedWaiting: false };
  const key = request => typeof request === 'string' ? new URL(request, origin).href : request.url;
  const cacheApi = name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name);
    return {
      async put(request, response) {
        if (failCacheWrite) throw new Error('Quota exceeded');
        store.set(key(request), response.clone());
      },
      async addAll(requests) {
        for (const request of requests) store.set(key(request), new Response('installed'));
      }
    };
  };
  vm.runInNewContext(source, {
    URL,
    Response,
    self: {
      location: { hostname },
      addEventListener: (type, listener) => listeners.set(type, listener),
      skipWaiting: () => { state.skippedWaiting = true; },
      clients: { claim: () => { state.claimed = true; } },
      registration: { unregister: async () => { state.unregistered = true; } }
    },
    caches: {
      open: async name => cacheApi(name),
      keys: async () => [...stores.keys()],
      delete: async name => stores.delete(name),
      async match(request) {
        for (const store of stores.values()) {
          const response = store.get(key(request));
          if (response) return response.clone();
        }
      }
    },
    fetch: async (request, options) => {
      networkCalls.push({ request, options });
      return network(request, options);
    }
  });
  return {
    state,
    stores,
    networkCalls,
    async seed(name, pathname, body) {
      stores.set(name, stores.get(name) || new Map());
      stores.get(name).set(new URL(pathname, origin).href, new Response(body));
    },
    async fetch(pathname, { method = 'GET', mode = 'navigate' } = {}) {
      let response;
      listeners.get('fetch')({
        request: { url: new URL(pathname, origin).href, method, mode },
        respondWith: promise => { response = promise; }
      });
      return response;
    },
    async lifecycle(type) {
      let completion;
      listeners.get(type)({ waitUntil: promise => { completion = promise; } });
      await completion;
    }
  };
}

test('la navegacion entrega HTML nuevo y actualiza la copia sin servir el HTML viejo', async () => {
  const sw = worker();
  await sw.seed('novatech-v4', '/tienda', 'old html');
  const response = await sw.fetch('/tienda');
  assert.equal(await response.text(), 'new html');
  assert.equal(sw.networkCalls.length, 1);
  assert.equal(sw.networkCalls[0].options.cache, 'no-cache');
  assert.equal(await sw.stores.get('novatech-v4').get(`${origin}/tienda`).text(), 'new html');
});

test('sin conexion recupera el HTML guardado', async () => {
  const sw = worker({ network: async () => { throw new TypeError('Failed to fetch'); } });
  await sw.seed('novatech-v4', '/tienda', 'offline html');
  const response = await sw.fetch('/tienda');
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'offline html');
});

test('sin conexion ni copia devuelve 503', async () => {
  const sw = worker({ network: async () => { throw new TypeError('Failed to fetch'); } });
  const response = await sw.fetch('/tienda');
  assert.equal(response.status, 503);
});

test('un error HTTP no se oculta con HTML antiguo ni reemplaza la copia', async () => {
  const sw = worker({ network: async () => new Response('server error', { status: 500 }) });
  await sw.seed('novatech-v4', '/tienda', 'old html');
  const response = await sw.fetch('/tienda');
  assert.equal(response.status, 500);
  assert.equal(await sw.stores.get('novatech-v4').get(`${origin}/tienda`).text(), 'old html');
});

test('si no se puede guardar la cache conserva la respuesta nueva de red', async () => {
  const sw = worker({ failCacheWrite: true });
  await sw.seed('novatech-v4', '/tienda', 'old html');
  const response = await sw.fetch('/tienda');
  assert.equal(await response.text(), 'new html');
});

test('la API y las escrituras siguen fuera del service worker', async () => {
  const sw = worker();
  assert.equal(await sw.fetch('/api/productos', { mode: 'cors' }), undefined);
  assert.equal(await sw.fetch('/tienda', { method: 'POST' }), undefined);
  assert.equal(sw.networkCalls.length, 0);
});

test('los recursos estaticos conservan la estrategia de cache', async () => {
  const sw = worker();
  await sw.seed('novatech-v4', '/media/primeicons.woff2', 'font bytes');
  const response = await sw.fetch('/media/primeicons.woff2', { mode: 'cors' });
  assert.equal(await response.text(), 'font bytes');
  assert.equal(sw.networkCalls.length, 0);
});

test('activar la version nueva borra caches antiguas de NovaTech y conserva otras', async () => {
  const sw = worker();
  await sw.seed('novatech-v2', '/tienda', 'v2');
  await sw.seed('novatech-v3', '/tienda', 'v3');
  await sw.seed('novatech-v4', '/tienda', 'v4');
  await sw.seed('another-app', '/', 'other');
  await sw.lifecycle('activate');
  assert.deepEqual([...sw.stores.keys()], ['novatech-v4', 'another-app']);
  assert.equal(sw.state.claimed, true);
  assert.equal(sw.state.unregistered, false);
});

test('instalar guarda los recursos en la cache nueva', async () => {
  const sw = worker();
  await sw.lifecycle('install');
  assert.equal(sw.stores.has('novatech-v4'), true);
  assert.equal(sw.stores.get('novatech-v4').has(`${origin}/tienda`), true);
  assert.equal(sw.state.skippedWaiting, true);
});

test('en localhost no intercepta y elimina el registro y caches de NovaTech', async () => {
  const sw = worker({ hostname: 'localhost' });
  await sw.seed('novatech-v3', '/tienda', 'old html');
  await sw.seed('novatech-v4', '/tienda', 'new html');
  await sw.seed('another-app', '/', 'other');
  assert.equal(await sw.fetch('/tienda'), undefined);
  await sw.lifecycle('install');
  await sw.lifecycle('activate');
  assert.equal(sw.networkCalls.length, 0);
  assert.deepEqual([...sw.stores.keys()], ['another-app']);
  assert.equal(sw.state.unregistered, true);
});
