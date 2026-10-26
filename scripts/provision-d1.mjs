import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const configPath = new URL('../apps/api/wrangler.jsonc', import.meta.url);
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const existing = config.d1_databases?.find((binding) => binding.binding === 'DB');
const name = process.env.WILDCARD_DB_NAME || existing?.database_name || 'wildcard-db';
const wrangler = (...args) => execFileSync(process.execPath, [
  fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url)),
  ...args, '--config', 'apps/api/wrangler.jsonc',
], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
const list = () => JSON.parse(wrangler('d1', 'list', '--json'));
let database = list().find((item) => item.name === name);
if (!database) {
  console.log(`Creating D1 database ${name} in account ${config.account_id}.`);
  wrangler('d1', 'create', name);
  database = list().find((item) => item.name === name);
}
if (!database) throw new Error('D1 creation could not be verified.');
if (existing?.database_id && existing.database_id !== '00000000-0000-0000-0000-000000000000' && existing.database_id !== database.uuid) {
  throw new Error('The existing binding points to a different database. Review the configuration before changing it.');
}
config.d1_databases = [{ binding: 'DB', database_name: name, database_id: database.uuid, migrations_dir: 'migrations' }];
writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
console.log(`Verified DB binding: ${name} (${database.uuid}). Commit this configuration before release.`);
