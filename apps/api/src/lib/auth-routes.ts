import type { Context } from 'hono';
import { createAuth } from './auth';
import { admitAuthRequest } from './auth-rate-limit';
import { readSetting } from '../admin/settings';

export const signUpPath = '/api/v1/auth/sign-up/email';

// Better Auth behind an explicit endpoint allowlist with per-IP admission. Each
// entry maps `METHOD path` to its per-minute limit. Sign-up also honors the
// runtime registration setting, checked after admission so closed registration
// still counts toward the limit.
export function authHandler(endpoints: Map<string, number>) {
  return async (c: Context<{ Bindings: Env }>) => {
    const max = endpoints.get(`${c.req.method} ${c.req.path}`);
    if (!max) return c.json({ error: 'Not found' }, 404);
    const admission = await admitAuthRequest(c.env.DB, c.req.header('CF-Connecting-IP') ?? 'local', c.req.path, max);
    if (!admission.allowed) {
      c.header('Retry-After', String(admission.retryAfter));
      return c.json({ error: 'Too many attempts. Please try again later.' }, 429);
    }
    if (c.req.path === signUpPath && !(await readSetting(c.env.DB, 'registration_enabled'))) {
      return c.json({ error: 'New accounts are not being accepted right now. Existing accounts can still sign in.', code: 'REGISTRATION_CLOSED' }, 403);
    }
    return createAuth(c.env).handler(c.req.raw);
  };
}
