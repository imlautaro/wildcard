// One-time local setup (npm run setup): checks Node.js, writes the ignored
// apps/api/.dev.vars from the versioned template, and applies every migration to
// Wrangler's local D1. Safe to re-run: existing values are never overwritten.
//
// API keys are copied without printing them, from environment variables or from
// an ignored `.env` file at the repository root:
//   META_API_KEY        chat replies, contact generation, images (required for AI)
//   ELEVENLABS_API_KEY  optional contact voices; also turns on the local
//                       "Contact voice messages" setting unless it was set before
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const apiDir = `${root}apps/api/`;
const devVarsPath = `${apiDir}.dev.vars`;
const keys = ['META_API_KEY', 'ELEVENLABS_API_KEY'];

// Node.js: the repository targets 24 (.nvmrc). Recent 22.x releases still run the
// local stack, with engine warnings from npm and Nuxt.
const major = Number(process.versions.node.split('.')[0]);
if (major < 22) {
  console.error(`Node.js ${process.versions.node} is too old. Install Node.js 24 (see .nvmrc), e.g. \`nvm install 24 && nvm use 24\`.`);
  process.exit(1);
}
if (major < 24) console.warn(`Warning: Node.js ${process.versions.node} is unsupported and may print engine warnings. Node.js 24 is recommended (see .nvmrc).\n`);

const parseEnv = (text) => Object.fromEntries(text.split(/\r?\n/)
  .map((line) => line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
  .filter(Boolean)
  .map(([, key, value]) => [key, value.replace(/^(['"])(.*)\1$/, '$2')]));

// Windows PowerShell 5.1 `echo … > .env` writes UTF-16 with a byte order mark.
const readText = (path) => {
  const bytes = readFileSync(path);
  return (bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.toString('utf16le') : bytes.toString('utf8')).replace(/^﻿/, '');
};
const rootEnv = existsSync(`${root}.env`) ? parseEnv(readText(`${root}.env`)) : {};
const created = !existsSync(devVarsPath);
let devVars = created
  ? readFileSync(`${apiDir}.dev.vars.example`, 'utf8')
    .replace(/^BETTER_AUTH_SECRET=.*$/m, `BETTER_AUTH_SECRET=${randomBytes(48).toString('base64url')}`)
  : readFileSync(devVarsPath, 'utf8');

const current = (key) => devVars.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1].trim() ?? '';
const imported = [];
for (const key of keys) {
  const value = (process.env[key] ?? rootEnv[key] ?? '').trim();
  if (!value || current(key)) continue;
  const line = new RegExp(`^#?\\s*${key}=.*$`, 'm');
  devVars = line.test(devVars) ? devVars.replace(line, () => `${key}=${value}`) : `${devVars.trimEnd()}\n${key}=${value}\n`;
  imported.push(key);
}

writeFileSync(devVarsPath, devVars, { mode: 0o600 });
chmodSync(devVarsPath, 0o600);
console.log(created ? 'Created apps/api/.dev.vars (ignored by Git).' : 'Kept the existing apps/api/.dev.vars.');
if (imported.length) console.log(`Copied ${imported.join(' and ')} into apps/api/.dev.vars. No values were printed.`);

const wrangler = (...args) => {
  const result = spawnSync('npx', ['wrangler', ...args], { cwd: apiDir, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

console.log('\nApplying migrations to the local D1...');
wrangler('d1', 'migrations', 'apply', 'DB', '--local');

if (current('ELEVENLABS_API_KEY')) {
  // Same row the admin panel writes; DO NOTHING keeps a value someone already chose.
  // A file avoids shell quoting differences between platforms.
  const sql = join(mkdtempSync(join(tmpdir(), 'wildcard-setup-')), 'voice.sql');
  writeFileSync(sql, `INSERT INTO app_setting (key, value, updated_at) VALUES ('voice_messages_enabled', 'true', ${Date.now()}) ON CONFLICT(key) DO NOTHING;\n`);
  wrangler('d1', 'execute', 'DB', '--local', '--yes', '--file', sql);
  rmSync(dirname(sql), { recursive: true, force: true });
  console.log('Contact voice messages are enabled locally.');
}

console.log(`\nSetup complete.${current('META_API_KEY') ? '' : `

META_API_KEY is not set, so chat replies will return 503. Add it to
apps/api/.dev.vars (or to a .env at the repository root and run npm run setup again).`}

Start the API and web app with:  npm run dev:all
Then open http://localhost:3000 and create an account.`);
