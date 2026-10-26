import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(readFileSync(new URL('../apps/api/wrangler.jsonc', import.meta.url), 'utf8'));
const bucket = config.r2_buckets?.find((item) => item.binding === 'CONTACT_PHOTOS')?.bucket_name;
if (!config.account_id || !bucket) throw new Error('Configure account_id and CONTACT_PHOTOS before provisioning.');
const run = (...args) => execFileSync(process.execPath, [
  fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url)),
  ...args, '--config', 'apps/api/wrangler.jsonc',
], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

// Explicit creation keeps authentication failures from being treated as missing resources.
if (process.argv.includes('--create')) {
  console.log(`Creating private R2 bucket ${bucket} in account ${config.account_id}.`);
  console.log(run('r2', 'bucket', 'create', bucket));
}
const result = JSON.parse(run('r2', 'bucket', 'info', bucket, '--json'));
if (result.name !== bucket) throw new Error('R2 bucket verification failed.');
console.log(`Verified CONTACT_PHOTOS: ${bucket}. No public access or deployment was enabled.`);
