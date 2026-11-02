import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Publishes the prerendered marketing site built by `npm run build:site`. The site
// Worker has static assets only: no script, binding, migration or secret.
const root = fileURLToPath(new URL('../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const productionBranch = process.env.WILDCARD_PRODUCTION_BRANCH || 'main';
const sourceCommit = process.env.WORKERS_CI_COMMIT_SHA;
const config = 'apps/site/wrangler.jsonc';

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
if (!existsSync(fileURLToPath(new URL('../apps/site/.output/public/index.html', import.meta.url)))) {
  throw new Error('Build the site with `npm run build:site` before releasing.');
}

const executable = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
console.log(`Releasing site commit ${sourceCommit}`);
const result = spawnSync(process.execPath, [executable, 'deploy', '--config', config, '--tag', sourceCommit], {
  cwd: root, stdio: 'inherit', env: process.env,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
