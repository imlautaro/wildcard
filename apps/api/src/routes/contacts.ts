import { photoKey, photoResponse, removePhoto, validPhoto, readPhoto } from '../photos/storage';
import { totalUnreadReplies } from '../lib/unread';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import chats from './chats';
import { terminateChats } from '../chat/dispatch';
import { admitAuthRequest } from '../lib/auth-rate-limit';
import { readBearerSession } from '../lib/session';

type Contact = { id: string; name: string; photoVersion: string | null; createdAt: number; updatedAt: number; lastMessageText?: string | null; lastMessageAt?: number | null; unreadCount?: number; lastReadSequence?: number };
const columns = 'id, name, photo_version AS photoVersion, created_at AS createdAt, updated_at AS updatedAt, last_read_sequence AS lastReadSequence';
const selection = `${columns}, (SELECT substr(COALESCE(t.assistant_text, t.user_text), 1, 500)
  FROM chat_turn t WHERE t.contact_id = contact.id AND t.user_id = contact.user_id
  ORDER BY t.sequence DESC LIMIT 1) AS lastMessageText,
  (SELECT CASE WHEN t.assistant_text IS NOT NULL THEN t.updated_at ELSE t.created_at END
    FROM chat_turn t WHERE t.contact_id = contact.id AND t.user_id = contact.user_id
    ORDER BY t.sequence DESC LIMIT 1) AS lastMessageAt,
  (SELECT COUNT(*) FROM chat_turn t WHERE t.contact_id = contact.id AND t.user_id = contact.user_id
    AND t.status = 'complete' AND t.sequence > contact.last_read_sequence) AS unreadCount`;
const contacts = new Hono<{ Bindings: Env; Variables: { owner: string } }>();

contacts.use('*', async (c, next) => {
  const session = await readBearerSession(c.env, c.req.raw.headers);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  c.set('owner', session.user.id);
  await next();
});
const contactBody = bodyLimit({ maxSize: 4096, onError: (c) => c.json({ error: 'Request body too large' }, 413) });

function contactName(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const fields = Object.keys(value);
  if (fields.length !== 1 || fields[0] !== 'name') return null;
  const name = (value as { name: unknown }).name;
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (!trimmed || Array.from(trimmed).length > 100 || /[\u0000-\u001f\u007f-\u009f]/u.test(trimmed)) return null;
  return trimmed;
}

contacts.get('/', async (c) => {
  const before = c.req.query('before');
  let timestamp = 0;
  let id = '';
  if (before !== undefined) {
    const cursor = /^(\d{1,16}):([a-f0-9-]{36})$/.exec(before);
    if (!cursor || !Number.isSafeInteger(Number(cursor[1]))) return c.json({ error: 'Invalid cursor' }, 400);
    timestamp = Number(cursor[1]);
    id = cursor[2];
  }
  const query = before === undefined
    ? c.env.DB.prepare(`SELECT ${selection} FROM contact WHERE user_id = ?1 ORDER BY created_at DESC, id DESC LIMIT 51`).bind(c.get('owner'))
    : c.env.DB.prepare(`SELECT ${selection} FROM contact WHERE user_id = ?1
        AND (created_at < ?2 OR (created_at = ?2 AND id < ?3))
        ORDER BY created_at DESC, id DESC LIMIT 51`).bind(c.get('owner'), timestamp, id);
  const { results } = await query.all<Contact>();
  const page = results.slice(0, 50);
  const last = page.at(-1);
  const totalUnreadCount = await totalUnreadReplies(c.env.DB, c.get('owner'));
  return c.json({ contacts: page, totalUnreadCount, nextCursor: results.length > 50 && last ? `${last.createdAt}:${last.id}` : null });
});

contacts.post('/', contactBody, async (c) => {
  const name = contactName(await c.req.json<unknown>().catch(() => null));
  if (!name) return c.json({ error: 'Provide only a name using 1–100 characters without control characters' }, 400);
  const now = Date.now();
  const result = await c.env.DB.prepare(`INSERT INTO contact (id, user_id, name, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?4) RETURNING ${columns}`)
    .bind(crypto.randomUUID(), c.get('owner'), name, now).first<Contact>();
  if (!result) throw new Error('Contact creation failed.');
  return c.json({ contact: result }, 201);
});

contacts.get('/:id', async (c) => {
  const result = await c.env.DB.prepare(`SELECT ${selection} FROM contact WHERE id = ?1 AND user_id = ?2`)
    .bind(c.req.param('id'), c.get('owner')).first<Contact>();
  return result ? c.json({ contact: result }) : c.json({ error: 'Contact not found' }, 404);
});

contacts.patch('/:id', contactBody, async (c) => {
  const name = contactName(await c.req.json<unknown>().catch(() => null));
  if (!name) return c.json({ error: 'Provide only a name using 1–100 characters without control characters' }, 400);
  const result = await c.env.DB.prepare(`UPDATE contact SET name = ?1, updated_at = ?2
    WHERE id = ?3 AND user_id = ?4 RETURNING ${columns}`)
    .bind(name, Date.now(), c.req.param('id'), c.get('owner')).first<Contact>();
  if (!result) return c.json({ error: 'Contact not found' }, 404);
  const updated = await c.env.DB.prepare(`SELECT ${selection} FROM contact WHERE id = ? AND user_id = ?`)
    .bind(result.id, c.get('owner')).first<Contact>();
  return c.json({ contact: updated ?? result });
});

contacts.get('/:id/photo', async (c) => {
  const row = await c.env.DB.prepare('SELECT photo_version AS version FROM contact WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), c.get('owner')).first<{ version: string | null }>();
  if (!row?.version || (c.req.query('version') && c.req.query('version') !== row.version)) return c.body(null, 404);
  return photoResponse(c.env, c.get('owner'), c.req.param('id'), row.version);
});

contacts.put('/:id/photo', async (c) => {
  const id = c.req.param('id');
  const owner = c.get('owner');
  const admission = await admitAuthRequest(c.env.DB, owner, 'contact-photo-upload', 12);
  if (!admission.allowed) {
    c.header('Retry-After', String(admission.retryAfter));
    return c.json({ error: 'Too many photo uploads' }, 429);
  }
  const previous = await c.env.DB.prepare('SELECT photo_version AS version FROM contact WHERE id = ? AND user_id = ?')
    .bind(id, owner).first<{ version: string | null }>();
  if (!previous) return c.json({ error: 'Contact not found' }, 404);
  if (c.req.header('Content-Type') !== 'image/jpeg') return c.json({ error: 'Use a square JPEG photo' }, 415);
  const bytes = await readPhoto(c.req.raw);
  if (!bytes) return c.json({ error: 'Photo too large' }, 413);
  if (!validPhoto(bytes)) return c.json({ error: 'Use a square JPEG photo between 64 and 1024 pixels' }, 422);
  const version = crypto.randomUUID();
  const key = photoKey(owner, id, version);
  await c.env.CONTACT_PHOTOS.put(key, bytes, { httpMetadata: { contentType: 'image/jpeg' } });
  let saved: Contact | null;
  try {
    saved = await c.env.DB.prepare(`UPDATE contact SET photo_version = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND photo_version IS ? RETURNING ${columns}`)
      .bind(version, Date.now(), id, owner, previous.version).first<Contact>();
  } catch (error) {
    c.executionCtx.waitUntil(removePhoto(c.env, key));
    throw error;
  }
  if (!saved) {
    c.executionCtx.waitUntil(removePhoto(c.env, key));
    return c.json({ error: 'Contact changed. Refresh and try again.' }, 409);
  }
  if (previous.version) c.executionCtx.waitUntil(removePhoto(c.env, photoKey(owner, id, previous.version)));
  const result = await c.env.DB.prepare(`SELECT ${selection} FROM contact WHERE id = ? AND user_id = ?`).bind(id, owner).first<Contact>();
  return c.json({ contact: result ?? saved });
});

contacts.delete('/:id/photo', async (c) => {
  // Read the previous version, then compare-and-swap so concurrent uploads are preserved.
  const previous = await c.env.DB.prepare('SELECT photo_version AS version FROM contact WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), c.get('owner')).first<{ version: string | null }>();
  if (!previous) return c.json({ error: 'Contact not found' }, 404);
  const saved = await c.env.DB.prepare(`UPDATE contact SET photo_version = NULL, updated_at = ?
    WHERE id = ? AND user_id = ? AND photo_version IS ? RETURNING ${columns}`)
    .bind(Date.now(), c.req.param('id'), c.get('owner'), previous.version).first<Contact>();
  if (!saved) return c.json({ error: 'Contact changed. Refresh and try again.' }, 409);
  if (previous.version) c.executionCtx.waitUntil(removePhoto(c.env, photoKey(c.get('owner'), saved.id, previous.version)));
  const result = await c.env.DB.prepare(`SELECT ${selection} FROM contact WHERE id = ? AND user_id = ?`).bind(saved.id, c.get('owner')).first<Contact>();
  return c.json({ contact: result ?? saved });
});

contacts.delete('/:id', async (c) => {
  const pending = await c.env.DB.prepare("SELECT workflow_id AS id FROM chat_turn WHERE contact_id = ? AND user_id = ? AND status IN ('queued','running')").bind(c.req.param('id'), c.get('owner')).all<{ id: string }>();
  const result = await c.env.DB.prepare('DELETE FROM contact WHERE id = ?1 AND user_id = ?2 RETURNING id, photo_version AS photoVersion')
    .bind(c.req.param('id'), c.get('owner')).first<{ id: string; photoVersion: string | null }>();
  if (result?.photoVersion) c.executionCtx.waitUntil(removePhoto(c.env, photoKey(c.get('owner'), result.id, result.photoVersion)));
  if (result) c.executionCtx.waitUntil(terminateChats(c.env, pending.results.map((row) => row.id)));
  return result ? c.body(null, 204) : c.json({ error: 'Contact not found' }, 404);
});

contacts.route('/:id/chat', chats);

export default contacts;
