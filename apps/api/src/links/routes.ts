import { Hono } from 'hono';
import { readBearerSession } from '../lib/session';
import { admitAuthRequest } from '../lib/auth-rate-limit';
import { cachedPreview, imageKey, loadPreview, previewImage, previewLimits, previewURL, urlHash } from './preview';

// Link cards for message URLs (docs/link-previews.md). Any signed-in person can
// preview a public URL; uncached fetches have their own per-account budget.
const links = new Hono<{ Bindings: Env; Variables: { owner: string } }>();

links.use('*', async (c, next) => {
  const session = await readBearerSession(c.env, c.req.raw.headers);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  c.set('owner', session.user.id);
  await next();
});

links.get('/', async (c) => {
  const url = previewURL(c.req.query('url') ?? '');
  if (!url) return c.json({ error: 'Use a public http(s) URL' }, 400);
  const owner = c.get('owner');
  const reads = await admitAuthRequest(c.env.DB, owner, 'link-preview-read', previewLimits.readsPerMinute);
  if (!reads.allowed) { c.header('Retry-After', String(reads.retryAfter)); return c.json({ error: 'Too many link previews' }, 429); }
  const cached = await cachedPreview(c.env.DB, await urlHash(url));
  if (cached) return c.json({ preview: cached });
  const fetches = await admitAuthRequest(c.env.DB, owner, 'link-preview-fetch', previewLimits.fetchesPerMinute);
  if (!fetches.allowed) { c.header('Retry-After', String(fetches.retryAfter)); return c.json({ error: 'Too many link previews' }, 429); }
  return c.json({ preview: await loadPreview(c.env, url) });
});

links.get('/:hash/image', async (c) => {
  const hash = c.req.param('hash');
  if (!/^[0-9a-f]{64}$/.test(hash)) return c.body(null, 404);
  const row = await previewImage(c.env.DB, hash);
  const object = row ? await c.env.CONTACT_PHOTOS.get(imageKey(hash)) : null;
  if (!row || !object) return c.body(null, 404);
  // Versioned by the client URL; public page imagery, but served only to signed-in people.
  return new Response(object.body, { headers: { 'Content-Type': row.imageType, 'Content-Length': String(object.size),
    'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' } });
});

export default links;
