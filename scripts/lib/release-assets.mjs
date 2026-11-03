// Shared release for the Workers that have no migrations or secrets of their own
// (web, admin, site, docs): same CI guards as the API, then `wrangler deploy` of an
// already built config in the resolved account.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { accountId, root, wranglerBin } from './cloudflare.mjs';
import { assertReleasable } from './release-guard.mjs';

export function releaseBuiltWorker({ label, config, built, buildCommand }) {
  const sourceCommit = assertReleasable();
  if (!existsSync(`${root}${built}`)) throw new Error(`Build the ${label} with \`${buildCommand}\` before releasing.`);
  console.log(`Releasing ${label} commit ${sourceCommit}`);
  const result = spawnSync(process.execPath, [wranglerBin, 'deploy', '--config', config, '--tag', sourceCommit], {
    cwd: root, stdio: 'inherit', env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId() },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
