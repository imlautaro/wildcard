import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createAuth } from './lib/auth';
import { admitAuthRequest } from './lib/auth-rate-limit';
import { readBearerSession } from './lib/session';
import contacts from './routes/contacts';
import push from './routes/push';
import pushPhotos from './photos/push-access';

const app = new Hono<{ Bindings: Env }>();
const authEndpoints = new Map([
  ['POST /api/v1/auth/sign-up/email', 5],
  ['POST /api/v1/auth/sign-in/email', 10],
  ['POST /api/v1/auth/sign-out', 30],
  ['GET /api/v1/auth/get-session', 120],
]);

app.use('/api/v1/*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  await next();
});
app.use('/api/v1/auth/*', bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.json({ error: 'Request body too large' }, 413) }));

app.on(['GET', 'POST'], '/api/v1/auth/*', async (c) => {
  const max = authEndpoints.get(`${c.req.method} ${c.req.path}`);
  if (!max) return c.json({ error: 'Not found' }, 404);
  const admission = await admitAuthRequest(c.env.DB, c.req.header('CF-Connecting-IP') ?? 'local', c.req.path, max);
  if (!admission.allowed) {
    c.header('Retry-After', String(admission.retryAfter));
    return c.json({ error: 'Too many attempts. Please try again later.' }, 429);
  }
  return createAuth(c.env).handler(c.req.raw);
});

app.get('/api/v1/me', async (c) => {
  const result = await readBearerSession(c.env, c.req.raw.headers);
  if (!result) return c.json({ error: 'Unauthorized' }, 401);
  const { id, name, email, emailVerified } = result.user;
  return c.json({ user: { id, name, email, emailVerified } });
});

app.route('/api/v1/contacts', contacts);
app.route('/api/v1/push', push);
app.route('/api/v1/push-photos', pushPhotos);

app.notFound((c) => c.json({ error: 'Not found' }, 404));
app.onError((_error, c) => {
  console.error(JSON.stringify({ event: 'unhandled_request_error' }));
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
