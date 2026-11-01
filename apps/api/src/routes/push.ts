import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { readBearerSession } from '../lib/session';
import { admitAuthRequest } from '../lib/auth-rate-limit';
import { allowedPushEndpoint, webPushConfigured } from '../push/web';
import type { PushEnvironment } from '../push/delivery';

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

// Browser Web Push. The public VAPID key is not secret; the browser needs it to subscribe.
push.get('/web-key', async (c) => {
  const auth = await readBearerSession(c.env, c.req.raw.headers);
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);
  const env = c.env as PushEnvironment;
  if (!webPushConfigured(env)) return c.json({ error: 'Browser notifications are not configured' }, 503);
  return c.json({ publicKey: env.VAPID_PUBLIC_KEY });
});
const base64url = (length: number) => new RegExp(`^[A-Za-z0-9_-]{${length}}$`);
push.on(['PUT', 'DELETE'], '/web-device', async (c) => {
  const auth = await readBearerSession(c.env, c.req.raw.headers);
  if (!auth) return c.json({ error: 'Unauthorized' }, 401);
  const admission = await admitAuthRequest(c.env.DB, auth.session.id, 'push-device', 30);
  if (!admission.allowed) return c.json({ error: 'Too many requests' }, 429);
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  const keys = body?.keys as Record<string, unknown> | undefined;
  const isDelete = c.req.method === 'DELETE';
  const valid = body && typeof body === 'object' && !Array.isArray(body) && typeof body.endpoint === 'string' && allowedPushEndpoint(body.endpoint)
    && (isDelete ? Object.keys(body).join(',') === 'endpoint'
      : Object.keys(body).sort().join(',') === 'endpoint,keys' && keys && typeof keys === 'object' && !Array.isArray(keys)
        && Object.keys(keys).sort().join(',') === 'auth,p256dh'
        && typeof keys.p256dh === 'string' && base64url(87).test(keys.p256dh) && typeof keys.auth === 'string' && base64url(22).test(keys.auth));
  if (!valid) return c.json({ error: 'Invalid browser registration' }, 400);
  const endpoint = body.endpoint as string;
  // The device token is the endpoint's digest, so one browser has one device row.
  const token = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint))).toString('hex');
  if (isDelete) {
    await c.env.DB.prepare(`DELETE FROM push_device WHERE token = ? AND environment = 'production' AND session_id = ?
      AND EXISTS (SELECT 1 FROM web_push_subscription w WHERE w.device_id = push_device.id)`).bind(token, auth.session.id).run();
    return c.body(null, 204);
  }
  const id = crypto.randomUUID();
  await c.env.DB.batch([
    // A browser signing in as another account moves to that account's session.
    c.env.DB.prepare(`INSERT INTO push_device (id, token, environment, session_id, updated_at)
      VALUES (?, ?, 'production', ?, ?) ON CONFLICT (token, environment)
      DO UPDATE SET session_id = excluded.session_id, updated_at = excluded.updated_at`)
      .bind(id, token, auth.session.id, Date.now()),
    c.env.DB.prepare(`INSERT INTO web_push_subscription (device_id, endpoint, p256dh, auth)
      SELECT id, ?3, ?4, ?5 FROM push_device WHERE token = ?1 AND environment = 'production' AND session_id = ?2
      ON CONFLICT (device_id) DO UPDATE SET endpoint = excluded.endpoint, p256dh = excluded.p256dh, auth = excluded.auth`)
      .bind(token, auth.session.id, endpoint, (keys as Record<string, string>).p256dh, (keys as Record<string, string>).auth),
    c.env.DB.prepare(`DELETE FROM push_device WHERE session_id = ? AND id NOT IN
      (SELECT id FROM push_device WHERE session_id = ? ORDER BY updated_at DESC, id LIMIT 10)`)
      .bind(auth.session.id, auth.session.id),
  ]);
  return c.body(null, 204);
});
export default push;
