const { spawn } = require('node:child_process');
const path = require('node:path');

// Keep local Novatech separate from other projects that use port 3000.
const child = spawn(process.execPath, [
  require.resolve('ts-node-dev/lib/bin.js'), '--respawn', '--transpile-only', 'index.ts'
], {
  cwd: path.resolve(__dirname, '..'),
  stdio: 'inherit',
  windowsHide: true,
  env: {
    ...process.env,
    PORT: '3001',
    FRONTEND_URL: 'http://localhost:4200,http://127.0.0.1:4200'
  }
});

child.on('error', error => { console.error('No se pudo iniciar Novatech:', error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 0; });
