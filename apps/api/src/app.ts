import links from './links/routes';
import onboarding from './onboarding/routes';
import { remoteExecution } from './native/remote-routes';
import { oauthPublic } from './mcp/oauth';
import mcp from './mcp/routes';
import { contactAccess, groupAccess } from './mcp/access';
import groups from './groups/routes';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { authHandler } from './lib/auth-routes';
import admin from './admin/routes';
import me from './routes/me';
import contacts from './routes/contacts';
import push from './routes/push';
import pushPhotos from './photos/push-access';
import voices from './voice/routes';
import home from './home/routes';
import stickers from './stickers/routes';
import waitlist from './waitlist/routes';

const app = new Hono<{ Bindings: Env }>();
const authEndpoints = new Map([
  ['POST /api/v1/auth/sign-in/email', 10],
  ['POST /api/v1/auth/sign-up/email', 5],
  ['POST /api/v1/auth/sign-out', 30],
  ['GET /api/v1/auth/get-session', 120],
]);

app.use('/api/v1/*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  await next();
});
app.use('/api/v1/auth/*', bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.json({ error: 'Request body too large' }, 413) }));

app.on(['GET', 'POST'], '/api/v1/auth/*', authHandler(authEndpoints));

// Admin routes are served by the AdminAPI entrypoint (src/admin/app.ts), which only
// a service binding can reach. `wrangler dev` cannot expose that entrypoint over
// HTTP, so a local .dev.vars may opt in to mounting them here; never set it in
// wrangler.jsonc.
app.use('/api/v1/admin/*', async (c, next) => {
  if ((c.env as Env & { ADMIN_LOCAL_ROUTES?: string }).ADMIN_LOCAL_ROUTES !== 'true') return c.json({ error: 'Not found' }, 404);
  await next();
});
app.route('/api/v1/admin', admin);

app.route('/api/v1/waitlist', waitlist);
app.route('/api/v1/mcp/oauth', oauthPublic);
app.route('/api/v1/onboarding', onboarding);
app.route('/api/v1/me', me);
app.route('/api/v1/groups', groups);

app.route('/api/v1/me/mcp', mcp);
app.route('/api/v1/contacts/:contactID/mcp', contactAccess);
app.route('/api/v1/groups/:groupID/mcp', groupAccess);
app.route('/api/v1/contacts', contacts);
app.route('/api/v1/push', push);
app.route('/api/v1/native-execution', remoteExecution);
app.route('/api/v1/push-photos', pushPhotos);
app.route('/api/v1/voices', voices);
app.route('/api/v1/link-previews', links);
app.route('/api/v1/home', home);
app.route('/api/v1/stickers', stickers);

app.notFound((c) => c.json({ error: 'Not found' }, 404));
app.onError((_error, c) => {
  if (_error.message.includes('Chat cleanup is in progress')) return c.json({error:'Chat cleanup is in progress. Please try again shortly.'},409);
  console.error(JSON.stringify({ event: 'unhandled_request_error' }));
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
