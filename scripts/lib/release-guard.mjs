// Production releases only run from CI on the production branch, from a clean checkout
// whose HEAD is the commit CI was triggered for. Two CI systems are supported:
// - Cloudflare Workers Builds (WORKERS_CI, WORKERS_CI_BRANCH, WORKERS_CI_COMMIT_SHA)
// - GitHub Actions (.github/workflows/deploy.yml: GITHUB_ACTIONS, GITHUB_REF_NAME, GITHUB_SHA)
import { execFileSync } from 'node:child_process';
import { root } from './cloudflare.mjs';

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

export function ciContext() {
  if (process.env.WORKERS_CI === '1') {
    return { system: 'Workers Builds', branch: process.env.WORKERS_CI_BRANCH, commit: process.env.WORKERS_CI_COMMIT_SHA };
  }
  if (process.env.GITHUB_ACTIONS === 'true') {
    const branch = process.env.GITHUB_REF_TYPE === 'branch' ? process.env.GITHUB_REF_NAME : undefined;
    return { system: 'GitHub Actions', branch, commit: process.env.GITHUB_SHA };
  }
  return null;
}

// Returns the source commit, or throws with the reason the release is refused.
// With `dryRun`, only reports what would block a real release.
export function assertReleasable({ dryRun = false } = {}) {
  const productionBranch = process.env.WILDCARD_PRODUCTION_BRANCH || 'main';
  const ci = ciContext();
  const problems = [];
  const notices = [];
  const head = git('rev-parse', 'HEAD');
  const validCommit = /^[a-f0-9]{40}$/.test(ci?.commit ?? '');
  if (!ci) problems.push('Releases must run in CI: Cloudflare Workers Builds or the GitHub Actions deploy workflow.');
  else {
    if (ci.branch !== productionBranch) problems.push(`Releases are only allowed from ${productionBranch} (got ${ci.branch ?? 'no branch'}).`);
    // Workers Builds controls its own checkout and only builds pushed commits, so a
    // mismatch there is reported, not fatal. The first build of a Deploy to Cloudflare
    // project runs on the seed repository's clone with the form's files written over
    // it, before the imported commit exists in the new repository.
    const checks = ci.system === 'Workers Builds' ? notices : problems;
    if (!validCommit || head !== ci.commit) {
      checks.push(`The checkout (${head.slice(0, 7)}) does not match the commit CI was triggered for (${ci.commit?.slice(0, 7) ?? 'none'}).${checks === problems ? ' Push a commit to trigger a release.' : ''}`);
    }
    if (git('status', '--porcelain')) checks.push(`The checkout has uncommitted changes.${checks === problems ? ' Releases require a clean checkout.' : ''}`);
  }
  if (!ci && git('status', '--porcelain')) problems.push('Releases require a clean checkout.');
  if (dryRun) {
    for (const problem of problems) console.warn(`[dry run] A real release would stop here: ${problem}`);
    for (const notice of notices) console.warn(`[dry run] Notice: ${notice}`);
    return validCommit ? ci.commit : head;
  }
  if (problems.length) throw new Error(problems[0]);
  for (const notice of notices) console.warn(`Notice (${ci.system} owns the checkout): ${notice}`);
  const commit = validCommit ? ci.commit : head;
  console.log(`Releasing ${commit} from ${ci.system}.`);
  return commit;
}
