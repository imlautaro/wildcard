// Resolves the deployable API Worker configuration for the current Cloudflare account.
//
// apps/api/wrangler.jsonc is versioned and account-neutral: no account ID, no D1 ID and
// no installation URLs or admin IDs. At release time this module:
// - picks the account (CLOUDFLARE_ACCOUNT_ID or the credential's only account),
// - finds the D1 database by name, creating it on first release,
// - makes sure the private R2 bucket exists, creating it on first release,
// - sets BETTER_AUTH_URL / MCP_WEB_ORIGIN from WILDCARD_API_URL / WILDCARD_WEB_URL, or
//   from the account's workers.dev subdomain when those are unset,
// - sets SUPER_ADMIN_USER_IDS from WILDCARD_SUPER_ADMIN_USER_IDS,
// and writes the result to the ignored apps/api/wrangler.release.json.
import { writeFileSync } from 'node:fs';
import { accountId, apiToken, envValue, readWranglerConfig, root, wrangler, workersSubdomain } from './cloudflare.mjs';

export const apiConfigPath = `${root}apps/api/wrangler.jsonc`;
export const releaseConfigPath = `${root}apps/api/wrangler.release.json`;
const webConfigPath = `${root}apps/web/wrangler.jsonc`;

const origin = (name, value) => {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${name} must be an absolute URL, got "${value}".`); }
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${name} must be an https origin without a path, such as https://api.example.com.`);
  }
  return url.origin;
};

// Wrangler commands need the account when the credential can see several.
export const accountEnv = () => ({ ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId() });

async function bucketExists(name) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId()}/r2/buckets/${encodeURIComponent(name)}`, {
    headers: { Authorization: `Bearer ${apiToken()}` }, redirect: 'error', signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`Could not check R2 bucket ${name} (HTTP ${response.status}); the credential needs R2 read/edit.`);
  return true;
}

export async function resolveApiInstance({ create = true, log = console.log } = {}) {
  const config = readWranglerConfig(apiConfigPath);
  const env = accountEnv();
  config.account_id = env.CLOUDFLARE_ACCOUNT_ID;
  delete config.$schema;
  const missing = [];

  // D1, by name. The versioned database_id is only used by local development.
  const database = config.d1_databases?.find((binding) => binding.binding === 'DB');
  if (!database) throw new Error('apps/api/wrangler.jsonc has no DB binding.');
  database.database_name = envValue('WILDCARD_DB_NAME') ?? database.database_name;
  const findDatabase = () => JSON.parse(wrangler(['d1', 'list', '--json'], { env }))
    .find((item) => item.name === database.database_name);
  let found = findDatabase();
  if (!found && create) {
    log(`Creating D1 database ${database.database_name}.`);
    wrangler(['d1', 'create', database.database_name], { env });
    found = findDatabase();
  }
  if (found) database.database_id = found.uuid;
  else missing.push(`D1 database ${database.database_name}`);

  // R2 stays private: no r2.dev URL or custom domain is ever enabled here.
  const photos = config.r2_buckets?.find((binding) => binding.binding === 'CONTACT_PHOTOS');
  if (!photos) throw new Error('apps/api/wrangler.jsonc has no CONTACT_PHOTOS binding.');
  photos.bucket_name = envValue('WILDCARD_PHOTOS_BUCKET') ?? photos.bucket_name;
  if (!await bucketExists(photos.bucket_name)) {
    if (create) {
      log(`Creating private R2 bucket ${photos.bucket_name}.`);
      wrangler(['r2', 'bucket', 'create', photos.bucket_name], { env });
    } else missing.push(`R2 bucket ${photos.bucket_name}`);
  }

  // Public origins. workers.dev is the default; custom domains are set explicitly.
  const apiURL = envValue('WILDCARD_API_URL');
  const webURL = envValue('WILDCARD_WEB_URL');
  const subdomain = apiURL && webURL ? null : await workersSubdomain();
  const webName = readWranglerConfig(webConfigPath).name;
  config.vars = {
    ...config.vars,
    BETTER_AUTH_URL: origin('WILDCARD_API_URL', apiURL ?? `https://${config.name}.${subdomain}.workers.dev`),
    MCP_WEB_ORIGIN: origin('WILDCARD_WEB_URL', webURL ?? `https://${webName}.${subdomain}.workers.dev`),
    SUPER_ADMIN_USER_IDS: envValue('WILDCARD_SUPER_ADMIN_USER_IDS') ?? config.vars?.SUPER_ADMIN_USER_IDS ?? '',
  };

  writeFileSync(releaseConfigPath, `${JSON.stringify(config, null, 2)}\n`);
  return { config, path: releaseConfigPath, env, missing };
}

export function describeInstance({ config, missing }) {
  const database = config.d1_databases.find((binding) => binding.binding === 'DB');
  const photos = config.r2_buckets.find((binding) => binding.binding === 'CONTACT_PHOTOS');
  const admins = config.vars.SUPER_ADMIN_USER_IDS.split(',').filter(Boolean).length;
  return [
    `Account:        ${config.account_id}`,
    `API Worker:     ${config.name} -> ${config.vars.BETTER_AUTH_URL}`,
    `Web origin:     ${config.vars.MCP_WEB_ORIGIN}`,
    `D1:             ${database.database_name} (${database.database_id && !/^0{8}-/.test(database.database_id) && !missing.some((item) => item.startsWith('D1')) ? database.database_id : 'not created yet'})`,
    `R2:             ${photos.bucket_name}${missing.some((item) => item.startsWith('R2')) ? ' (not created yet)' : ''}`,
    `Super admins:   ${admins || 'none (set WILDCARD_SUPER_ADMIN_USER_IDS)'}`,
  ].join('\n');
}
