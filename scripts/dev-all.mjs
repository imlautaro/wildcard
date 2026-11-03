// Runs the API (http://localhost:8787) and the web app (http://localhost:3000)
// together (npm run dev:all). Output is prefixed per app; Ctrl+C stops both.
// API_PORT and WEB_PORT choose other ports; the web app's API origin follows API_PORT.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertPortFree, configuredPort, portFrom } from './lib/ports.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const apiPort = portFrom(configuredPort('API_PORT'), 8787, 'API_PORT');
const webPort = portFrom(configuredPort('WEB_PORT'), 3000, 'WEB_PORT');
await assertPortFree(apiPort, { name: 'API', variable: 'API_PORT' });
await assertPortFree(webPort, { name: 'web app', variable: 'WEB_PORT' });
const apps = [
  { name: 'api', args: ['run', 'dev'], color: 36 },
  { name: 'web', args: ['run', 'dev:web'], color: 35 },
];
const env = { ...process.env, FORCE_COLOR: '1', API_PORT: String(apiPort), NUXT_PORT: String(webPort), PORT: String(webPort), NUXT_API_ORIGIN: `http://localhost:${apiPort}` };

const children = apps.map(({ name, args, color }) => {
  const child = spawn('npm', args, { cwd: root, shell: process.platform === 'win32', env });
  const prefix = `\x1b[${color}m[${name}]\x1b[0m `;
  for (const stream of [child.stdout, child.stderr]) {
    let buffered = '';
    stream.on('data', (chunk) => {
      const lines = (buffered + chunk).split(/\r?\n/);
      buffered = lines.pop();
      for (const line of lines) process.stdout.write(`${prefix}${line}\n`);
    });
  }
  child.on('exit', (code) => {
    console.log(`${prefix}exited with code ${code ?? 0}`);
    stop(code ?? 0);
  });
  return child;
});

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null) continue;
    // On Windows, kill() only stops the shell; taskkill /T also stops workerd and Nuxt.
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill();
  }
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
