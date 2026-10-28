const API_URL = 'http://localhost:3000/api/ventas/checkout';

const NUM_REQUESTS = 10;
const AUTH_TOKEN = '';

async function runTest() {
  console.log('Script de QA iniciado. Simular picos de concurrencia...');
  console.log('Para ejecutar una prueba real se necesita un token activo y un payload de carrito válido.');
}

runTest().catch(console.error);
