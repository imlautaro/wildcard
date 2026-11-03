// Starts the API Worker locally with `wrangler dev` (npm run dev).
//
// Two adjustments make local development work without a Cloudflare account:
// - The Workers AI binding is always remote, so Wrangler demands a login for it.
//   Locally it only backs the optional AI Gateway and semantic memory, which are
//   off by default, so the local config drops it and `--local` disables any
//   other remote binding.
// - `secrets.required` in wrangler.jsonc makes Wrangler load only the declared
//   secrets from `.dev.vars`, silently dropping optional ones such as
//   ELEVENLABS_API_KEY, VAPID_* or ADMIN_LOCAL_ROUTES. The ignored
//   `wrangler.local.json` written here omits that block so every `.dev.vars`
//   value reaches the Worker. Deploys keep using wrangler.jsonc unchanged.
//
// It also runs the Worker's cron every minute (see below).
//
// API_PORT (default 8787) picks the port. The script refuses a busy port instead of
// letting Wrangler move elsewhere, and passes BETTER_AUTH_URL=http://localhost:<port>
// so auth and the local cron always match the port actually served.
//
// Set WILDCARD_REMOTE_BINDINGS=1 (after `npx wrangler login`) to keep remote
// bindings, for example to try semantic memory locally.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { assertPortFree, configuredPort, portFrom } from './lib/ports.mjs';

const apiDir = fileURLToPath(new URL('../apps/api/', import.meta.url));
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { experimental_readRawConfig: readRawConfig } = require('wrangler');

const remote = process.env.WILDCARD_REMOTE_BINDINGS === '1';
const { rawConfig } = readRawConfig({ config: `${apiDir}wrangler.jsonc` });
delete rawConfig.secrets;
if (!remote) delete rawConfig.ai;
const localConfig = `${apiDir}wrangler.local.json`;
writeFileSync(localConfig, `${JSON.stringify(rawConfig, null, 2)}\n`);

const devVars = `${apiDir}.dev.vars`;
if (!existsSync(devVars)) {
  console.warn('apps/api/.dev.vars is missing. Run `npm run setup` first.');
} else if (!/^META_API_KEY=\S+/m.test(readFileSync(devVars, 'utf8'))) {
  console.warn('META_API_KEY is empty in apps/api/.dev.vars: sign-up and contacts work, but chat replies return 503.');
}

// A --port argument still wins over API_PORT for compatibility.
const extra = process.argv.slice(2);
const portIndex = extra.findIndex((arg) => arg === '--port' || arg.startsWith('--port='));
const portArg = portIndex < 0 ? undefined : extra[portIndex].split('=')[1] ?? extra[portIndex + 1];
if (portIndex >= 0) extra.splice(portIndex, extra[portIndex].includes('=') ? 1 : 2);
const port = portFrom(portArg ?? configuredPort('API_PORT'), 8787, 'API_PORT');
await assertPortFree(port, { name: 'API', variable: 'API_PORT' });
const args = ['wrangler', 'dev', '--config', 'wrangler.local.json', '--test-scheduled', ...(remote ? [] : ['--local']),
  '--port', String(port), '--var', `BETTER_AUTH_URL:http://localhost:${port}`, ...extra];
const child = spawn('npx', args, { cwd: apiDir, stdio: 'inherit', shell: process.platform === 'win32' });
child.on('exit', (code, signal) => process.exit(signal ? 1 : code ?? 0));

// Wrangler never fires cron triggers locally, but the Worker's every-minute cron
// drives reminders, tasks, monitors, For you, initiative, welcomes and chat
// recovery. Mimic it through `--test-scheduled`. WILDCARD_LOCAL_CRON=0 turns it off.
if (process.env.WILDCARD_LOCAL_CRON !== '0') {
  setInterval(() => {
    fetch(`http://127.0.0.1:${port}/__scheduled?cron=*+*+*+*+*`).catch(() => {});
  }, 60_000).unref();
}
