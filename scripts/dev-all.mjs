// Runs the API (http://localhost:8787) and the web app (http://localhost:3000)
// together (npm run dev:all). Output is prefixed per app; Ctrl+C stops both.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const apps = [
  { name: 'api', script: 'dev', color: 36 },
  { name: 'web', script: 'dev:web', color: 35 },
];

const children = apps.map(({ name, script, color }) => {
  const child = spawn('npm', ['run', script], { cwd: root, shell: process.platform === 'win32', env: { ...process.env, FORCE_COLOR: '1' } });
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
