// Releases the API Worker (npm run release:ci) from CI: Cloudflare Workers Builds or the
// GitHub Actions deploy workflow. It resolves the account-specific configuration
// (scripts/lib/instance.mjs), creating D1 and R2 on the first release, applies D1
// migrations, uploads secrets and deploys the Worker with its Workflows and Cron.
//
// `npm run release:ci -- --dry-run` runs anywhere with a Wrangler login: it prints the
// resolved installation and what is missing, and never creates, migrates or deploys.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { envValue, root, workerExists, wrangler, wranglerBin } from './lib/cloudflare.mjs';
import { describeInstance, resolveApiInstance } from './lib/instance.mjs';
import { assertReleasable } from './lib/release-guard.mjs';

const dryRun = process.argv.includes('--dry-run');
const sourceCommit = assertReleasable({ dryRun });
const instance = await resolveApiInstance({ create: !dryRun });
const { path: config, env } = instance;
console.log(describeInstance(instance));
const configArgs = ['--config', config];

// Before the first release the Worker does not exist and has no secrets. Once it exists,
// listing must succeed: guessing wrong would rotate BETTER_AUTH_SECRET and sign everyone out.
const secrets = await workerExists(instance.config.name)
  ? JSON.parse(wrangler(['secret', 'list', '--format', 'json', ...configArgs], { env }))
  : [];
const has = (name) => secrets.some((secret) => secret.name === name);

const updates = {};
const problems = [];
if (!has('BETTER_AUTH_SECRET')) updates.BETTER_AUTH_SECRET = randomBytes(48).toString('base64url');
if (envValue('META_API_KEY')) updates.META_API_KEY = envValue('META_API_KEY');
else if (!has('META_API_KEY')) problems.push('Set the META_API_KEY secret in CI (Workers Builds build secret or GitHub Actions secret).');
// Optional voice provider (docs/voice.md): copied when CI supplies it, otherwise an
// existing runtime key is preserved.
if (envValue('ELEVENLABS_API_KEY')) updates.ELEVENLABS_API_KEY = envValue('ELEVENLABS_API_KEY');
// Optional groups: all values or none. Empty values count as unset because GitHub
// Actions passes secrets that were never created as empty strings.
const groups = {
  APNs: ['APNS_PRIVATE_KEY', 'APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_TOPIC'],
  'Web Push (VAPID)': ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'],
};
for (const [label, names] of Object.entries(groups)) {
  const supplied = names.filter((name) => envValue(name));
  if (!supplied.length) continue;
  if (supplied.length !== names.length) {
    problems.push(`Configure all ${label} secrets together; missing ${names.filter((name) => !envValue(name)).join(', ')}.`);
    continue;
  }
  for (const name of names) updates[name] = envValue(name);
}

if (dryRun) {
  for (const item of instance.missing) console.log(`[dry run] First release creates ${item}.`);
  for (const problem of problems) console.warn(`[dry run] ${problem}`);
  console.log(`[dry run] Secrets that would be uploaded: ${Object.keys(updates).join(', ') || 'none'}. No values are printed.`);
  console.log('[dry run] Nothing was created, migrated or deployed.');
  process.exit(problems.length ? 1 : 0);
}
if (problems.length) throw new Error(problems[0]);

console.log(`Applying migrations for ${sourceCommit}`);
console.log(wrangler(['d1', 'migrations', 'apply', 'DB', '--remote', ...configArgs], { env }));
let temporaryDirectory;
try {
  const secretArgs = [];
  if (Object.keys(updates).length) {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'wildcard-release-'));
    const secretFile = join(temporaryDirectory, 'secrets.json');
    writeFileSync(secretFile, JSON.stringify(updates), { mode: 0o600 });
    secretArgs.push('--secrets-file', secretFile);
  }
  console.log(`Releasing ${sourceCommit}`);
  const result = spawnSync(process.execPath, [
    wranglerBin, 'deploy', ...configArgs, '--tag', sourceCommit, ...secretArgs,
  ], { cwd: root, stdio: 'inherit', env });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
}
