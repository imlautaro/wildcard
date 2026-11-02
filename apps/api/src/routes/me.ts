import { Hono } from 'hono';
import debugExport from './debug-export';
import { bodyLimit } from 'hono/body-limit';
import { readBearerSession } from '../lib/session';
import { admitAuthRequest } from '../lib/auth-rate-limit';
import { readPhoto, validPhoto, removePhoto } from '../photos/storage';
import { contributorModel, validChatModel } from '../lib/model-preference';
import { readSetting } from '../admin/settings';
import { voiceRepliesAvailable } from '../voice/catalog';

type Profile = { id: string; name: string; email: string; emailVerified: number; photoVersion: string | null; chatModel: string; onboardingRequired: number; contactsShare: number };
const columns = 'id, name, email, email_verified AS emailVerified, photo_version AS photoVersion, chat_model AS chatModel, onboarding_required AS onboardingRequired, contacts_share AS contactsShare';
const key = (owner: string, version: string) => `users/${owner}/${version}.jpg`;
// While the admin flag `contributor_only` is on, profiles report the effective model
// (Contributor); the stored choice is untouched and returns when the flag is off.
const responseUser = (row: Profile, contributorOnly: boolean) => ({ ...row, chatModel: contributorOnly ? contributorModel : row.chatModel, emailVerified: Boolean(row.emailVerified), onboardingRequired: Boolean(row.onboardingRequired), contactsShare: Boolean(row.contactsShare) });
const me = new Hono<{ Bindings: Env; Variables: { owner: string; contributorOnly: boolean } }>();

me.use('*', async (c, next) => {
  const session = await readBearerSession(c.env, c.req.raw.headers);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  c.set('owner', session.user.id);
  c.set('contributorOnly', await readSetting(c.env.DB, 'contributor_only'));
  await next();
});

me.get('/', async (c) => {
  const row = await c.env.DB.prepare(`SELECT ${columns} FROM user WHERE id = ?`).bind(c.get('owner')).first<Profile>();
  if (!row) return c.json({ error: 'Unauthorized' }, 401);
  // Runtime flags that change client behavior (docs/admin.md).
  return c.json({ user: responseUser(row, c.get('contributorOnly')), features: {
    voiceMessages: await voiceRepliesAvailable(c.env), contributorOnly: c.get('contributorOnly'),
  } });
});

me.route('/debug-export', debugExport);

me.patch('/', bodyLimit({ maxSize: 4096 }), async (c) => {
  const input: unknown = await c.req.json().catch(() => null);
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1 || !('name' in input) || typeof input.name !== 'string') {
    return c.json({ error: 'Provide a name' }, 400);
  }
  const name = input.name.trim();
  if (!name || Array.from(name).length > 100 || /[\u0000-\u001f\u007f-\u009f]/u.test(name)) {
    return c.json({ error: 'Use a name with 1–100 characters and no control characters' }, 422);
  }
  const row = await c.env.DB.prepare(`UPDATE user SET name = ?, updated_at = ? WHERE id = ? RETURNING ${columns}`)
    .bind(name, Date.now(), c.get('owner')).first<Profile>();
  if (!row) return c.json({ error: 'Unauthorized' }, 401);
  return c.json({ user: responseUser(row, c.get('contributorOnly')) });
});

me.put('/model', bodyLimit({ maxSize: 1024 }), async (c) => {
  const input = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!input || !validChatModel(input.chatModel) || Object.keys(input).some((key) => !['chatModel', 'contributorConsent'].includes(key))) {
    return c.json({ error: 'Choose a supported chat model.' }, 422);
  }
  if (c.get('contributorOnly')) {
    return c.json({ error: 'The chat model is set to Contributor for every account right now.', code: 'CONTRIBUTOR_ONLY' }, 409);
  }
  if (input.chatModel === contributorModel && input.contributorConsent !== true) {
    return c.json({ error: "Agree to Meta's Contributor data use before enabling Contributor." }, 422);
  }
  const row = await c.env.DB.prepare(`UPDATE user SET chat_model = ?, updated_at = ? WHERE id = ? RETURNING ${columns}`)
    .bind(input.chatModel, Date.now(), c.get('owner')).first<Profile>();
  if (!row) return c.json({ error: 'Unauthorized' }, 401);
  return c.json({ user: responseUser(row, c.get('contributorOnly')) });
});

// "Contacts share with each other" (docs/privacy.md#contacts-share-with-each-other).
me.put('/privacy', bodyLimit({ maxSize: 1024 }), async (c) => {
  c.header('Cache-Control', 'no-store');
  const input = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!input || Object.keys(input).join(',') !== 'contactsShare' || typeof input.contactsShare !== 'boolean') {
    return c.json({ error: 'Provide only contactsShare as a boolean' }, 400);
  }
  const row = await c.env.DB.prepare(`UPDATE user SET contacts_share = ?, updated_at = ? WHERE id = ? RETURNING ${columns}`)
    .bind(input.contactsShare ? 1 : 0, Date.now(), c.get('owner')).first<Profile>();
  if (!row) return c.json({ error: 'Unauthorized' }, 401);
  return c.json({ user: responseUser(row, c.get('contributorOnly')) });
});

me.get('/photo', async (c) => {
  const row = await c.env.DB.prepare('SELECT photo_version AS version FROM user WHERE id = ?')
    .bind(c.get('owner')).first<{ version: string | null }>();
  if (!row?.version || (c.req.query('version') !== undefined && c.req.query('version') !== row.version)) {
    return c.json({ error: 'Photo not found' }, 404);
  }
  const object = await c.env.CONTACT_PHOTOS.get(key(c.get('owner'), row.version));
  if (!object) return c.json({ error: 'Photo not found' }, 404);
  return new Response(object.body, { headers: {
    'Content-Type': 'image/jpeg', 'Content-Length': String(object.size),
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline; filename="profile.jpg"',
  } });
});

me.on(['PUT', 'DELETE'], '/photo', async (c) => {
  const owner = c.get('owner');
  const admission = await admitAuthRequest(c.env.DB, owner, 'account-photo-write', 12);
  if (!admission.allowed) {
    c.header('Retry-After', String(admission.retryAfter));
    return c.json({ error: 'Too many photo changes' }, 429);
  }
  const previous = await c.env.DB.prepare('SELECT photo_version AS version FROM user WHERE id = ?')
    .bind(owner).first<{ version: string | null }>();
  if (!previous) return c.json({ error: 'Unauthorized' }, 401);
  let version: string | null = null;
  if (c.req.method === 'PUT') {
    if (c.req.header('Content-Type') !== 'image/jpeg') return c.json({ error: 'Use a square JPEG photo' }, 415);
    const bytes = await readPhoto(c.req.raw);
    if (!bytes) return c.json({ error: 'Photo too large' }, 413);
    if (!validPhoto(bytes)) return c.json({ error: 'Use a square JPEG photo between 64 and 1024 pixels' }, 422);
    version = crypto.randomUUID();
    await c.env.CONTACT_PHOTOS.put(key(owner, version), bytes, { httpMetadata: { contentType: 'image/jpeg' } });
  }
  let saved: Profile | null;
  try {
    saved = await c.env.DB.prepare(`UPDATE user SET photo_version = ?, updated_at = ? WHERE id = ? AND photo_version IS ? RETURNING ${columns}`)
      .bind(version, Date.now(), owner, previous.version).first<Profile>();
  } catch (error) {
    if (version) c.executionCtx.waitUntil(removePhoto(c.env, key(owner, version)));
    throw error;
  }
  if (!saved) {
    if (version) c.executionCtx.waitUntil(removePhoto(c.env, key(owner, version)));
    return c.json({ error: 'Your profile changed. Refresh and try again.' }, 409);
  }
  if (previous.version) c.executionCtx.waitUntil(removePhoto(c.env, key(owner, previous.version)));
  return c.json({ user: responseUser(saved, c.get('contributorOnly')) });
});

export default me;
