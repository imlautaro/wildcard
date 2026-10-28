import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(readFileSync(new URL('../apps/api/wrangler.jsonc', import.meta.url), 'utf8'));
const id = config.vars?.AI_GATEWAY_ID || 'wildcard';
if (!/^[a-f0-9]{32}$/.test(config.account_id) || !/^[a-z0-9-]{1,64}$/.test(id ?? '')) {
  throw new Error('Configure account_id and AI_GATEWAY_ID first.');
}
let token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) {
  try {
    const credentials = JSON.parse(execFileSync(process.execPath, [
      fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url)), 'auth', 'token', '--json',
    ], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    token = credentials.token;
  } catch { throw new Error('Wrangler authentication unavailable. Use an authenticated host or a scoped CLOUDFLARE_API_TOKEN.'); }
}
if (!token) throw new Error('No Cloudflare credential available.');

const base = `https://api.cloudflare.com/client/v4/accounts/${config.account_id}/ai-gateway`;
async function request(path, method = 'GET', body) {
  const response = await fetch(`${base}${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000), redirect: 'error',
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`AI Gateway management failed (HTTP ${response.status}); check account and AI Gateway Read/Edit permissions.`);
  }
  const data = await response.json();
  if (!data.success) throw new Error('AI Gateway management did not succeed.');
  return data.result;
}

let gateway = await request(`/gateways/${id}`);
if (!gateway && process.argv.includes('--create')) {
  gateway = await request('/gateways', 'POST', {
    id, authentication: true, byok_only: true, collect_logs: false,
    cache_invalidate_on_update: true, cache_ttl: 0, rate_limiting_interval: 0, rate_limiting_limit: 0,
  });
}
if (!gateway) throw new Error('Gateway missing. Run again with --create after checking the target account.');
const providers = await request('/custom-providers?search=meta&per_page=100');
if (!Array.isArray(providers)) throw new Error('Could not list custom providers.');
let provider = providers.find((item) => item.slug === 'meta');
if (!provider && process.argv.includes('--create')) {
  provider = await request('/custom-providers', 'POST', {
    name: 'Meta', slug: 'meta', base_url: 'https://api.meta.ai', enable: true,
  });
}
if (!provider || provider.base_url !== 'https://api.meta.ai' || provider.enable !== true) {
  throw new Error('Create or enable custom-meta with exactly https://api.meta.ai. Existing providers are never overwritten.');
}
if (gateway.authentication !== true || gateway.collect_logs !== false || gateway.cache_ttl !== 0) {
  throw new Error('Gateway settings differ: require authentication, disable default payload logs and response caching. Review the dashboard.');
}
console.log(`Verified authenticated gateway ${id} and custom-meta in account ${config.account_id}. No inference or deployment performed.`);
