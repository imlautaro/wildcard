import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';

const path = new URL('../apps/api/.dev.vars', import.meta.url);
if (existsSync(path)) {
  console.log('Keeping the existing ignored apps/api/.dev.vars file.');
} else {
  writeFileSync(path, `BETTER_AUTH_URL=http://localhost:8787\nBETTER_AUTH_SECRET=${randomBytes(48).toString('base64url')}\n`, { mode: 0o600, flag: 'wx' });
  console.log('Created ignored local auth configuration. No secret values were printed.');
}
