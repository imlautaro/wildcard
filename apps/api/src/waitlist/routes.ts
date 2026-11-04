import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { admitAuthRequest } from '../lib/auth-rate-limit';
import { readSetting } from '../admin/settings';

// Early-access waitlist (docs/authentication.md#early-access-waitlist). Public and
// unauthenticated: clients read whether registration is open, and while it is
// closed people can leave their details. The response never says whether an
// email was already on the list or already has an account.
const waitlist = new Hono<{ Bindings: Env }>();
const platforms = new Set(['ios', 'web', 'both']);
const controlCharacters = /[\u0000-\u001f\u007f-\u009f]/u;
// Same shape the clients validate; Better Auth accepts more, but the list only needs reachable addresses.
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

waitlist.get('/', async (c) => {
  const admission = await admitAuthRequest(c.env.DB, c.req.header('CF-Connecting-IP') ?? 'local', 'waitlist-status', 60);
  if (!admission.allowed) {
    c.header('Retry-After', String(admission.retryAfter));
    return c.json({ error: 'Too many attempts. Please try again later.' }, 429);
  }
  return c.json({ registrationOpen: await readSetting(c.env.DB, 'registration_enabled') });
});

waitlist.post('/', bodyLimit({ maxSize: 4 * 1024, onError: (c) => c.json({ error: 'Request body too large' }, 413) }), async (c) => {
  const admission = await admitAuthRequest(c.env.DB, c.req.header('CF-Connecting-IP') ?? 'local', 'waitlist', 5);
  if (!admission.allowed) {
    c.header('Retry-After', String(admission.retryAfter));
    return c.json({ error: 'Too many attempts. Please try again later.' }, 429);
  }
  const input = await c.req.json<Record<string, unknown>>().catch(() => null);
  const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  const note = typeof input?.note === 'string' ? input.note.trim() : '';
  const platform = input?.platform;
  const locale = input?.locale === 'es' ? 'es' : 'en';
  if (!emailPattern.test(email) || email.length > 254) return c.json({ error: 'Enter a valid email address.', code: 'INVALID_EMAIL' }, 422);
  if (!name || [...name].length > 100 || controlCharacters.test(name)) return c.json({ error: 'Use a name with 1–100 characters.', code: 'INVALID_NAME' }, 422);
  if (typeof platform !== 'string' || !platforms.has(platform)) return c.json({ error: 'Choose where you want to use Wildcard.', code: 'INVALID_PLATFORM' }, 422);
  if ([...note].length > 500 || /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/u.test(note)) {
    return c.json({ error: 'Keep your note under 500 characters.', code: 'INVALID_NOTE' }, 422);
  }
  const now = Date.now();
  // Joining again keeps the original position (created_at) and refreshes the details.
  await c.env.DB.prepare(`INSERT INTO waitlist_entry (id, email, name, platform, note, locale, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET name = excluded.name, platform = excluded.platform, note = excluded.note,
        locale = excluded.locale, updated_at = excluded.updated_at`)
    .bind(crypto.randomUUID(), email, name, platform, note || null, locale, now, now).run();
  return c.json({ joined: true }, 202);
});

export default waitlist;
