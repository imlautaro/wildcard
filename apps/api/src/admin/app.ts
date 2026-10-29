import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { authHandler } from '../lib/auth-routes';
import admin from './routes';

// Served only by the AdminAPI entrypoint in src/index.ts, which the admin panel
// Worker reaches through a service binding; the public origin never routes here.
// Sign-up is deliberately absent: the panel signs in to existing accounts only.
const app = new Hono<{ Bindings: Env }>();
const authEndpoints = new Map([
  ['POST /api/v1/auth/sign-in/email', 10],
  ['POST /api/v1/auth/sign-out', 30],
]);

app.use('/api/v1/*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  await next();
});
app.use('/api/v1/auth/*', bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.json({ error: 'Request body too large' }, 413) }));
app.on(['GET', 'POST'], '/api/v1/auth/*', authHandler(authEndpoints));
app.route('/api/v1/admin', admin);

app.notFound((c) => c.json({ error: 'Not found' }, 404));
app.onError((_error, c) => {
  console.error(JSON.stringify({ event: 'unhandled_admin_request_error' }));
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
