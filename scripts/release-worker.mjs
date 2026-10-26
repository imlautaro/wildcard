import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

console.log(`Releasing pushed commit ${sourceCommit}`);
const result = spawnSync(process.execPath, [
  fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url)),
  'deploy', '--config', 'apps/api/wrangler.jsonc', '--tag', sourceCommit,
], { cwd: root, stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
