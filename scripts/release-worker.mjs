import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const productionBranch = process.env.WILDCARD_PRODUCTION_BRANCH || 'main';
const sourceCommit = process.env.WORKERS_CI_COMMIT_SHA;

if (process.env.WORKERS_CI !== '1') {
  throw new Error('Releases must run through Cloudflare Workers Builds.');
}
if (process.env.WORKERS_CI_BRANCH !== productionBranch) {
  throw new Error(`Releases are only allowed from ${productionBranch}.`);
}
if (!sourceCommit || !/^[a-f0-9]{40}$/.test(sourceCommit) || git('rev-parse', 'HEAD') !== sourceCommit) {
  throw new Error('The checkout must match WORKERS_CI_COMMIT_SHA. Push a commit to trigger a release with source metadata.');
}
if (git('status', '--porcelain')) {
  throw new Error('Releases require a clean checkout.');
}

const executable = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const configArgs = ['--config', 'apps/api/wrangler.jsonc'];
const run = (...args) => execFileSync(process.execPath, [executable, ...args, ...configArgs], {
  cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], env: process.env,
});

console.log(`Applying migrations for pushed commit ${sourceCommit}`);
console.log(run('d1', 'migrations', 'apply', 'DB', '--remote'));
const secrets = JSON.parse(run('secret', 'list', '--format', 'json'));
let temporaryDirectory;
try {
  const secretArgs = [];
  if (!secrets.some((secret) => secret.name === 'BETTER_AUTH_SECRET')) {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'wildcard-release-'));
    const secretFile = join(temporaryDirectory, 'secrets.json');
    writeFileSync(secretFile, JSON.stringify({ BETTER_AUTH_SECRET: randomBytes(48).toString('base64url') }), { mode: 0o600 });
    secretArgs.push('--secrets-file', secretFile);
  }
  console.log(`Releasing pushed commit ${sourceCommit}`);
  const result = spawnSync(process.execPath, [
    executable, 'deploy', ...configArgs, '--tag', sourceCommit, ...secretArgs,
  ], { cwd: root, stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
}
