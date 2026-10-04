import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const reservation = createServer().listen(0, '127.0.0.1');
await once(reservation, 'listening');
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const server = spawn(process.execPath, ['scripts/start-server.mjs'], {
  cwd: root, env: { ...process.env, HOST: '0.0.0.0', PORT: String(port) },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const serverExited = once(server, 'exit');
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Hosted server did not start')), 15000);
    let output = '';
    server.stdout.on('data', data => {
      output += data;
      if (output.includes(`http://0.0.0.0:${port}`)) { clearTimeout(timer); resolve(); }
    });
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited early: ${code}`)); });
  });
  const check = spawn(process.execPath, ['scripts/verify-demo.mjs'], {
    cwd: root, env: { ...process.env, DEMO_BASE_URL: `http://127.0.0.1:${port}` }, stdio: 'inherit',
  });
  const [code] = await once(check, 'exit');
  if (code !== 0) throw new Error(`HTTP demo verification failed: ${code}`);
  console.log('PASS: public hosting entry point honours PORT and serves the complete app over HTTP.');
} finally {
  server.kill();
  await serverExited;
}
