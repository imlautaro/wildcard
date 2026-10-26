import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { readBearerSession } from '../lib/session';
import { admitAuthRequest } from '../lib/auth-rate-limit';

const push = new Hono<{ Bindings: Env }>();
push.use('*', bodyLimit({ maxSize: 2048, onError: (c) => c.json({ error: 'Request body too large' }, 413) }));
push.on(['PUT', 'DELETE'], '/device', async (c) => {
  const auth = await readBearerSession(c.env, c.req.raw.headers);
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);
  const admission = await admitAuthRequest(c.env.DB, auth.session.id, 'push-device', 30);
  if (!admission.allowed) return c.json({ error: 'Too many requests' }, 429);
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).sort().join(',') !== 'environment,token' ||
      typeof body.token !== 'string' || !/^[a-f0-9]{32,200}$/.test(body.token) ||
      !['development', 'production'].includes(String(body.environment))) {
    return c.json({ error: 'Invalid device registration' }, 400);
  }
  if (c.req.method === 'DELETE') {
    await c.env.DB.prepare('DELETE FROM push_device WHERE token = ? AND environment = ? AND session_id = ?')
      .bind(body.token, body.environment, auth.session.id).run();
  } else {
    // Bound active devices per session; updating the same token remains idempotent.
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO push_device (id, token, environment, session_id, updated_at)
        VALUES (?, ?, ?, ?, ?) ON CONFLICT (token, environment)
        DO UPDATE SET session_id = excluded.session_id, updated_at = excluded.updated_at`)
        .bind(crypto.randomUUID(), body.token, body.environment, auth.session.id, Date.now()),
      c.env.DB.prepare(`DELETE FROM push_device WHERE session_id = ? AND id NOT IN
        (SELECT id FROM push_device WHERE session_id = ? ORDER BY updated_at DESC, id LIMIT 10)`)
        .bind(auth.session.id, auth.session.id),
    ]);
  }
  return c.body(null, 204);
});
export default push;
