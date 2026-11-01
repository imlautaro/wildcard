import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Creates or updates the Worker Preview of the Nuxt web app built by `npm run build:web`,
// one per branch (docs/infrastructure.md#previews). This is the Workers Builds "Preview
// command" for non-production branches; it also runs locally. Like the release it deploys
// the generated config, which carries `main`, `assets` and the `previews` block. A Preview
// never touches the production deployment, and its API binding calls wildcard-api in production.
const root = fileURLToPath(new URL('../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const productionBranch = process.env.WILDCARD_PRODUCTION_BRANCH || 'main';
const branch = process.env.WORKERS_CI_BRANCH || git('rev-parse', '--abbrev-ref', 'HEAD');
const sourceCommit = process.env.WORKERS_CI_COMMIT_SHA || git('rev-parse', 'HEAD');
const config = 'apps/web/.output/server/wrangler.json';

if (!branch || branch === 'HEAD' || branch === productionBranch) {
  throw new Error(`Previews are for branches other than ${productionBranch}; use the release for it.`);
}
if (!existsSync(fileURLToPath(new URL(`../${config}`, import.meta.url)))) {
  throw new Error('Build the web app with `npm run build:web` before creating a Preview.');
}

// The Preview URL is <name>-wildcard-web.<subdomain>.workers.dev, one DNS label of at most
// 63 characters, so the branch becomes lowercase letters, digits and single hyphens.
const name = branch.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '');
if (!name) throw new Error(`Branch ${branch} has no characters usable in a Preview name.`);

const executable = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
console.log(`Previewing web branch ${branch} (${sourceCommit}) as ${name}`);
const result = spawnSync(process.execPath, [executable, 'preview', '--config', config, '--name', name,
  '--tag', sourceCommit.slice(0, 40), '--message', `${branch} ${sourceCommit.slice(0, 7)}`], {
  cwd: root, stdio: 'inherit', env: process.env,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
