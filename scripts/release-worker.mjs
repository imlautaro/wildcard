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
  const updates = {};
  if (!secrets.some((secret) => secret.name === 'BETTER_AUTH_SECRET')) {
    updates.BETTER_AUTH_SECRET = randomBytes(48).toString('base64url');
  }
  if (process.env.META_API_KEY !== undefined) {
    if (!process.env.META_API_KEY.trim()) throw new Error('META_API_KEY must not be empty.');
    updates.META_API_KEY = process.env.META_API_KEY.trim();
  } else if (!secrets.some((secret) => secret.name === 'META_API_KEY')) {
    throw new Error('Set the encrypted META_API_KEY secret in Workers Builds before releasing.');
  }
  // Optional voice provider (docs/voice.md): copied when the build supplies it,
  // otherwise any existing runtime key is preserved.
  if (process.env.ELEVENLABS_API_KEY?.trim()) updates.ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY.trim();
  const pushNames = ['APNS_PRIVATE_KEY', 'APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_TOPIC'];
  const suppliedPush = pushNames.some((name) => process.env[name] !== undefined);
  if (suppliedPush) {
    for (const name of pushNames) {
      if (!process.env[name]?.trim()) throw new Error(`Configure all four APNs build secrets; ${name} is missing or empty.`);
      updates[name] = process.env[name].trim();
    }
  }
  // Optional browser Web Push (docs/notifications.md#browser-web-push): all three or none.
  const webPushNames = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'];
  if (webPushNames.some((name) => process.env[name] !== undefined)) {
    for (const name of webPushNames) {
      if (!process.env[name]?.trim()) throw new Error(`Configure all three VAPID build secrets; ${name} is missing or empty.`);
      updates[name] = process.env[name].trim();
    }
  }
  if (Object.keys(updates).length) {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'wildcard-release-'));
    const secretFile = join(temporaryDirectory, 'secrets.json');
    writeFileSync(secretFile, JSON.stringify(updates), { mode: 0o600 });
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
