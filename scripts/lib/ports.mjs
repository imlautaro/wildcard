// Local port helpers for npm run dev / dev:all. Wrangler and Nuxt silently move to
// another port when theirs is taken, which leaves the web proxy, BETTER_AUTH_URL and
// the local cron talking to whatever else holds the port. Fail early instead.
import { existsSync, readFileSync } from 'node:fs';
import { connect } from 'node:net';

// API_PORT and WEB_PORT may also live in the ignored root .env (see .env.example).
const envFile = new URL('../../.env', import.meta.url);
const fileValues = existsSync(envFile) ? Object.fromEntries(readFileSync(envFile, 'utf8').split(/\r?\n/)
  .map((line) => line.match(/^\s*(API_PORT|WEB_PORT)\s*=\s*(\d+)\s*$/)).filter(Boolean).map(([, key, value]) => [key, value])) : {};
export const configuredPort = (variable) => process.env[variable] || fileValues[variable];

const reachable = (host, port) => new Promise((resolve) => {
  const socket = connect({ host, port });
  socket.setTimeout(500);
  socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('timeout', () => { socket.destroy(); resolve(false); });
  socket.once('error', () => resolve(false));
});

export async function assertPortFree(port, { name, variable }) {
  if ((await reachable('127.0.0.1', port)) || (await reachable('::1', port))) {
    console.error(`Port ${port} for the ${name} is already in use (another Wildcard checkout or app?).\n`
      + `Stop it, or choose another port, for example: ${variable}=${port + 10} npm run dev:all`);
    process.exit(1);
  }
}

export function portFrom(value, fallback, variable) {
  if (value === undefined || value === '') return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`${variable} must be a port number, got "${value}".`);
    process.exit(1);
  }
  return port;
}
