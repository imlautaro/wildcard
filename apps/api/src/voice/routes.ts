import { Hono } from 'hono';
import { readBearerSession } from '../lib/session';
import { admitAuthRequest } from '../lib/auth-rate-limit';
import { listVoices, voiceRepliesAvailable } from './catalog';

// Contact voice catalog for the voice picker (docs/voice.md).
const voices = new Hono<{ Bindings: Env; Variables: { owner: string } }>();

voices.use('*', async (c, next) => {
  const session = await readBearerSession(c.env, c.req.raw.headers);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  c.set('owner', session.user.id);
  if (!await voiceRepliesAvailable(c.env)) return c.json({ error: 'Voice messages are unavailable' }, 503);
  await next();
});

voices.get('/', async (c) => {
  try {
    const catalog = await listVoices(c.env);
    return c.json({ voices: catalog.map(({ previewURL: _previewURL, ...voice }) => voice) });
  } catch { return c.json({ error: 'Voices are unavailable right now' }, 503); }
});

// Samples are proxied so clients need no third-party media origin.
voices.get('/:voiceID/preview', async (c) => {
  const admission = await admitAuthRequest(c.env.DB, c.get('owner'), 'voice-preview', 60);
  if (!admission.allowed) {
    c.header('Retry-After', String(admission.retryAfter));
    return c.json({ error: 'Too many previews' }, 429);
  }
  let url: string | null | undefined;
  try { url = (await listVoices(c.env)).find(voice => voice.id === c.req.param('voiceID'))?.previewURL; }
  catch { return c.json({ error: 'Voices are unavailable right now' }, 503); }
  if (!url) return c.json({ error: 'Voice not found' }, 404);
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
  const size = Number(response.headers.get('Content-Length') ?? '0');
  if (!response.ok || !response.body || size > 2 * 1024 * 1024) {
    await response.body?.cancel();
    return c.json({ error: 'Preview unavailable' }, 502);
  }
  return new Response(response.body, { headers: {
    'Content-Type': 'audio/mpeg', ...(size ? { 'Content-Length': String(size) } : {}),
    'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff',
  } });
});

export default voices;
