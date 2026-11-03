// Shared helpers for the provisioning and release scripts. Everything that depends on
// the Cloudflare account (account ID, workers.dev subdomain, D1 and R2 resources) is
// resolved here at release time instead of being committed, so a fork deploys without
// editing versioned files. See docs/infrastructure.md#self-hosting.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const wranglerBin = fileURLToPath(new URL('../../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));

// wrangler.jsonc has comments, so it is read with Wrangler's own parser (JSON.parse fails).
export function readWranglerConfig(path) {
  const { experimental_readRawConfig: readRawConfig } = require('wrangler');
  return structuredClone(readRawConfig({ config: path }).rawConfig);
}

// Runs Wrangler and returns stdout. Errors keep Wrangler's own message on stderr.
export function wrangler(args, { env = process.env, inherit = false } = {}) {
  return execFileSync(process.execPath, [wranglerBin, ...args], {
    cwd: root, encoding: 'utf8', env, stdio: ['ignore', inherit ? 'inherit' : 'pipe', 'inherit'],
  });
}

// A scoped CLOUDFLARE_API_TOKEN (CI) or the local Wrangler login, held in memory only.
let cachedToken;
export function apiToken() {
  if (cachedToken) return cachedToken;
  cachedToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!cachedToken) {
    try {
      cachedToken = JSON.parse(execFileSync(process.execPath, [wranglerBin, 'auth', 'token', '--json'], {
        cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      })).token;
    } catch {
      throw new Error('No Cloudflare credential. Run `npx wrangler login` or set a scoped CLOUDFLARE_API_TOKEN.');
    }
  }
  if (!cachedToken) throw new Error('No Cloudflare credential available.');
  return cachedToken;
}

// CLOUDFLARE_ACCOUNT_ID wins; otherwise the only account the credential can see.
let cachedAccount;
export function accountId() {
  if (cachedAccount) return cachedAccount;
  const explicit = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  if (explicit) return (cachedAccount = explicit);
  let accounts = [];
  try {
    accounts = JSON.parse(wrangler(['whoami', '--json'])).accounts ?? [];
  } catch { /* falls through to the error below */ }
  if (accounts.length !== 1) {
    throw new Error(accounts.length
      ? `This credential can access ${accounts.length} accounts. Set CLOUDFLARE_ACCOUNT_ID to choose one.`
      : 'Could not determine the Cloudflare account. Set CLOUDFLARE_ACCOUNT_ID.');
  }
  return (cachedAccount = accounts[0].id);
}

export async function cloudflare(path, { method = 'GET', body } = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId()}${path}`, {
    method, redirect: 'error', signal: AbortSignal.timeout(30_000),
    headers: { Authorization: `Bearer ${apiToken()}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) {
    const reason = data?.errors?.map((error) => error.message).join('; ') || `HTTP ${response.status}`;
    throw new Error(`Cloudflare API ${method} ${path} failed: ${reason}`);
  }
  return data.result;
}

// <subdomain> in https://<worker>.<subdomain>.workers.dev.
export async function workersSubdomain() {
  const result = await cloudflare('/workers/subdomain');
  if (!result?.subdomain) throw new Error('This account has no workers.dev subdomain. Open Workers & Pages once in the dashboard to create it, or set WILDCARD_API_URL and WILDCARD_WEB_URL.');
  return result.subdomain;
}

// True when a Worker script with this name exists in the account.
export async function workerExists(name) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId()}/workers/scripts/${encodeURIComponent(name)}/settings`, {
    headers: { Authorization: `Bearer ${apiToken()}` }, redirect: 'error', signal: AbortSignal.timeout(30_000),
  });
  await response.body?.cancel();
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`Could not check Worker ${name} (HTTP ${response.status}); the credential needs Workers Scripts read.`);
  return true;
}

// Empty strings count as unset: GitHub Actions passes missing secrets as "".
export const envValue = (name) => process.env[name]?.trim() || undefined;
