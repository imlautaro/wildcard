// Releases the API and then the web app from one CI build (npm run deploy). This is the
// deploy command of the single Workers Builds project the Deploy to Cloudflare button
// creates; the GitHub Actions workflow runs the same steps one by one. The API goes
// first because the web app's service binding targets it.
import { spawnSync } from 'node:child_process';
import { root } from './lib/cloudflare.mjs';

const steps = [
  ['API', process.execPath, ['scripts/release-worker.mjs']],
  ['web build', 'npm', ['run', 'build:web']],
  ['web', process.execPath, ['scripts/release-web.mjs']],
];
for (const [label, command, args] of steps) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env: process.env, shell: process.platform === 'win32' && command === 'npm' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error(`Release stopped: the ${label} step failed (exit ${result.status}).`);
    process.exit(result.status ?? 1);
  }
}
