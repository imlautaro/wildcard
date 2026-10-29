import { remoteSettings } from '../native/remote-routes';
import nativeActions from '../native/routes';
import miniApps from '../miniapps/routes';
import { taskRoutes } from '../tasks/routes';
import { documentRoutes } from '../documents/routes';
import { plainMessageMarkdown } from '../../../../shared/messageMarkdown';
import { accountEnvironment } from '../lib/model-preference';
import { readEnergy } from '../groups/energy';
import { photoKey, photoResponse, removePhoto, validPhoto, readPhoto } from '../photos/storage';
import { totalUnreadReplies } from '../lib/unread';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import chats from './chats';
import schedules from './schedules';
import { terminateChats } from '../chat/dispatch';
import { admitAuthRequest } from '../lib/auth-rate-limit';
import { readBearerSession } from '../lib/session';
import sharing from './sharing';
import personality from '../personality/routes';

type Contact = { onboardingChat?: number; initiativeEnabled: number; id: string; agentID: string | null; role: 'owner' | 'member'; name: string; photoVersion: string | null; createdAt: number; updatedAt: number; lastMessageText?: string | null; lastMessageFromUser?: number | null; lastMessageAt?: number | null; unreadCount?: number; lastReadSequence?: number };
const columns = `onboarding_chat AS onboardingChat, initiative_enabled AS initiativeEnabled, id, agent_id AS agentID, name, photo_version AS photoVersion, created_at AS createdAt, updated_at AS updatedAt, last_read_sequence AS lastReadSequence,
  CASE WHEN user_id = (SELECT owner_id FROM contact_agent WHERE id = contact.agent_id) THEN 'owner' ELSE 'member' END AS role`;
const managesAgent = `EXISTS (SELECT 1 FROM contact_agent a WHERE a.id = contact.agent_id AND a.owner_id = contact.user_id)`;
const selection = `${columns},
  (SELECT CASE WHEN t.assistant_text IS NULL AND t.schedule_id IS NULL AND t.group_request_id IS NULL AND t.task_id IS NULL THEN 1 ELSE 0 END
    FROM chat_turn t WHERE t.contact_id = contact.id AND t.user_id = contact.user_id ORDER BY t.sequence DESC LIMIT 1) AS lastMessageFromUser,
  (SELECT t.read_at FROM chat_turn t WHERE t.contact_id = contact.id AND t.user_id = contact.user_id ORDER BY t.sequence DESC LIMIT 1) AS lastMessageReadAt, (SELECT COALESCE(t.assistant_text, CASE WHEN t.schedule_id IS NOT NULL THEN 'Scheduled message' WHEN t.group_request_id IS NOT NULL THEN 'Group response' WHEN t.task_id IS NOT NULL THEN 'Working on a task' WHEN t.user_text = '' AND t.attachment_json IS NOT NULL THEN 'Attachment: ' || json_extract(t.attachment_json, '$.name') ELSE t.user_text END)
  FROM chat_turn t WHERE t.contact_id = contact.id AND t.user_id = contact.user_id
  ORDER BY t.sequence DESC LIMIT 1) AS lastMessageText,
  (SELECT CASE WHEN t.assistant_text IS NOT NULL THEN t.updated_at ELSE t.created_at END
    FROM chat_turn t WHERE t.contact_id = contact.id AND t.user_id = contact.user_id
    ORDER BY t.sequence DESC LIMIT 1) AS lastMessageAt,
  (SELECT COUNT(*) FROM chat_turn t WHERE t.contact_id = contact.id AND t.user_id = contact.user_id
    AND t.status = 'complete' AND t.assistant_text IS NOT NULL AND t.sequence > contact.last_read_sequence) AS unreadCount`;
// Parse the complete source before clipping, keeping the legacy raw summary intact.
function contactPreview(row: Contact) {
  const source = row.lastMessageText;
  return { ...row, lastMessageText: source == null ? source : [...source].slice(0, 500).join(''),
    lastMessagePreview: source == null ? null : [...(row.lastMessageFromUser === 0 ? plainMessageMarkdown(source) : source)].slice(0, 500).join('') };
}
const contacts = new Hono<{ Bindings: Env; Variables: { owner: string } }>();

contacts.use('*', async (c, next) => {
  const session = await readBearerSession(c.env, c.req.raw.headers);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  c.set('owner', session.user.id);
  c.env = await accountEnvironment(c.env, session.user.id);
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
  // Use the same message timestamp for row display, ordering, and keyset pagination.
  const recentContacts = `WITH recent_contacts AS (SELECT ${selection} FROM contact WHERE user_id = ?1)`;
  const query = before === undefined
    ? c.env.DB.prepare(`${recentContacts} SELECT * FROM recent_contacts
        ORDER BY COALESCE(lastMessageAt, createdAt) DESC, id DESC LIMIT 51`).bind(c.get('owner'))
    : c.env.DB.prepare(`${recentContacts} SELECT * FROM recent_contacts
        WHERE COALESCE(lastMessageAt, createdAt) < ?2
          OR (COALESCE(lastMessageAt, createdAt) = ?2 AND id < ?3)
        ORDER BY COALESCE(lastMessageAt, createdAt) DESC, id DESC LIMIT 51`).bind(c.get('owner'), timestamp, id);
  const { results } = await query.all<Contact>();
  const page = results.slice(0, 50);
  const last = page.at(-1);
  const totalUnreadCount = await totalUnreadReplies(c.env.DB, c.get('owner'));
  return c.json({ contacts: page.map(contactPreview), totalUnreadCount, nextCursor: results.length > 50 && last ? `${last.lastMessageAt ?? last.createdAt}:${last.id}` : null });
});

contacts.post('/', contactBody, async (c) => {
  const name = contactName(await c.req.json<unknown>().catch(() => null));
  if (!name) return c.json({ error: 'Provide only a name using 1–100 characters without control characters' }, 400);
  const now = Date.now();
  const result = await c.env.DB.prepare(`INSERT INTO contact (id, user_id, name, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?4) RETURNING ${columns}`)
    .bind(crypto.randomUUID(), c.get('owner'), name, now).first<Contact>();
  if (!result) throw new Error('Contact creation failed.');
  const created = await c.env.DB.prepare(`SELECT ${columns} FROM contact WHERE id = ? AND user_id = ?`)
    .bind(result.id, c.get('owner')).first<Contact>();
  return c.json({ contact: created }, 201);
});

contacts.get('/:id', async (c) => {
  const result = await c.env.DB.prepare(`SELECT ${selection} FROM contact WHERE id = ?1 AND user_id = ?2`)
    .bind(c.req.param('id'), c.get('owner')).first<Contact>();
  return result ? c.json({ contact: contactPreview(result) }) : c.json({ error: 'Contact not found' }, 404);
});

async function energyOwner(db: D1Database, id: string, userID: string) {
  return db.prepare(`SELECT a.id FROM contact c JOIN contact_agent a ON a.id = c.agent_id
    WHERE c.id = ? AND c.user_id = ? AND a.owner_id = c.user_id`).bind(id, userID).first<{ id: string }>();
}

contacts.get('/:id/energy', async (c) => {
  c.header('Cache-Control', 'no-store');
  const agent = await energyOwner(c.env.DB, c.req.param('id'), c.get('owner'));
  if (!agent) return c.json({ error: 'Contact not found or creator access required' }, 404);
  return c.json({ energy: await readEnergy(c.env.DB, agent.id) });
});

contacts.post('/:id/energy/reset', async (c) => {
  c.header('Cache-Control', 'no-store');
  const agent = await energyOwner(c.env.DB, c.req.param('id'), c.get('owner'));
  if (!agent) return c.json({ error: 'Contact not found or creator access required' }, 404);
  const admission = await admitAuthRequest(c.env.DB, c.get('owner'), 'agent-energy-reset', 12);
  if (!admission.allowed) {
    c.header('Retry-After', String(admission.retryAfter));
    return c.json({ error: 'Too many energy resets' }, 429);
  }
  const updated = await c.env.DB.prepare(`UPDATE contact_agent SET energy = 50, energy_updated_at = ?
    WHERE id = ? AND owner_id = ? AND EXISTS (SELECT 1 FROM contact WHERE id = ? AND user_id = ? AND agent_id = contact_agent.id)
    RETURNING id`).bind(Date.now(), agent.id, c.get('owner'), c.req.param('id'), c.get('owner')).first();
  if (!updated) return c.json({ error: 'Contact no longer available' }, 404);
  return c.json({ energy: await readEnergy(c.env.DB, agent.id) });
});

contacts.put('/:id/initiative', contactBody, async (c) => {
  c.header('Cache-Control', 'no-store');
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body || Object.keys(body).join(',') !== 'enabled' || typeof body.enabled !== 'boolean') {
    return c.json({ error: 'Provide only enabled as a boolean' }, 400);
  }
  await c.env.DB.prepare('UPDATE contact SET initiative_enabled = ? WHERE id = ? AND user_id = ?')
    .bind(body.enabled ? 1 : 0, c.req.param('id'), c.get('owner')).run();
  const contact = await c.env.DB.prepare(`SELECT ${selection} FROM contact WHERE id = ? AND user_id = ?`)
    .bind(c.req.param('id'), c.get('owner')).first<Contact>();
  return contact ? c.json({ contact: contactPreview(contact) }) : c.json({ error: 'Contact not found' }, 404);
});

contacts.patch('/:id', contactBody, async (c) => {
  const name = contactName(await c.req.json<unknown>().catch(() => null));
  if (!name) return c.json({ error: 'Provide only a name using 1–100 characters without control characters' }, 400);
  const result = await c.env.DB.prepare(`UPDATE contact SET name = ?1, updated_at = ?2
    WHERE id = ?3 AND user_id = ?4 AND ${managesAgent} RETURNING ${columns}`)
    .bind(name, Date.now(), c.req.param('id'), c.get('owner')).first<Contact>();
  if (!result) return c.json({ error: 'Contact not found' }, 404);
  const updated = await c.env.DB.prepare(`SELECT ${selection} FROM contact WHERE id = ? AND user_id = ?`)
    .bind(result.id, c.get('owner')).first<Contact>();
  return c.json({ contact: updated ?? result });
});

contacts.get('/:id/photo', async (c) => {
  const row = await c.env.DB.prepare('SELECT photo_version AS version, agent_id AS agentID, (SELECT owner_id FROM contact_agent WHERE id = contact.agent_id) AS photoOwner FROM contact WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), c.get('owner')).first<{ version: string | null; agentID: string; photoOwner: string }>();
  if (!row?.version || (c.req.query('version') && c.req.query('version') !== row.version)) return c.body(null, 404);
  return photoResponse(c.env, row.photoOwner, row.agentID, row.version);
});

contacts.put('/:id/photo', async (c) => {
  const id = c.req.param('id');
  const owner = c.get('owner');
  const admission = await admitAuthRequest(c.env.DB, owner, 'contact-photo-upload', 12);
  if (!admission.allowed) {
    c.header('Retry-After', String(admission.retryAfter));
    return c.json({ error: 'Too many photo uploads' }, 429);
  }
  const previous = await c.env.DB.prepare('SELECT photo_version AS version, agent_id AS agentID, (SELECT owner_id FROM contact_agent WHERE id = contact.agent_id) AS photoOwner FROM contact WHERE id = ? AND user_id = ?')
    .bind(id, owner).first<{ version: string | null; agentID: string; photoOwner: string }>();
  if (!previous) return c.json({ error: 'Contact not found' }, 404);
  if (previous.photoOwner !== c.get('owner')) return c.json({ error: 'Only the creator can edit this contact' }, 403);
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
      WHERE id = ? AND user_id = ? AND photo_version IS ? AND ${managesAgent} RETURNING ${columns}`)
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
  const previous = await c.env.DB.prepare('SELECT photo_version AS version, agent_id AS agentID, (SELECT owner_id FROM contact_agent WHERE id = contact.agent_id) AS photoOwner FROM contact WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), c.get('owner')).first<{ version: string | null; agentID: string; photoOwner: string }>();
  if (!previous) return c.json({ error: 'Contact not found' }, 404);
  if (previous.photoOwner !== c.get('owner')) return c.json({ error: 'Only the creator can edit this contact' }, 403);
  const saved = await c.env.DB.prepare(`UPDATE contact SET photo_version = NULL, updated_at = ?
    WHERE id = ? AND user_id = ? AND photo_version IS ? AND ${managesAgent} RETURNING ${columns}`)
    .bind(Date.now(), c.req.param('id'), c.get('owner'), previous.version).first<Contact>();
  if (!saved) return c.json({ error: 'Contact changed. Refresh and try again.' }, 409);
  if (previous.version) c.executionCtx.waitUntil(removePhoto(c.env, photoKey(c.get('owner'), saved.id, previous.version)));
  const result = await c.env.DB.prepare(`SELECT ${selection} FROM contact WHERE id = ? AND user_id = ?`).bind(saved.id, c.get('owner')).first<Contact>();
  return c.json({ contact: result ?? saved });
});

contacts.delete('/:id', async (c) => {
  const member = await c.env.DB.prepare(`SELECT c.agent_id AS agentID, a.owner_id AS ownerID, a.photo_version AS photoVersion
    FROM contact c JOIN contact_agent a ON a.id = c.agent_id WHERE c.id = ? AND c.user_id = ?`)
    .bind(c.req.param('id'), c.get('owner')).first<{ agentID: string; ownerID: string; photoVersion: string | null }>();
  if (!member) return c.json({ error: 'Contact not found' }, 404);
  const isOwner = member.ownerID === c.get('owner');
  const pending = await c.env.DB.prepare(`SELECT t.workflow_id AS id FROM chat_turn t JOIN contact c ON c.id = t.contact_id
    WHERE c.agent_id = ?1 AND (?2 = 1 OR c.user_id = ?3) AND t.status IN ('queued','running')`)
    .bind(member.agentID, isOwner ? 1 : 0, c.get('owner')).all<{ id: string }>();
  if (isOwner) {
    await c.env.DB.prepare('DELETE FROM contact_agent WHERE id = ? AND owner_id = ?')
      .bind(member.agentID, c.get('owner')).run();
    if (member.photoVersion) c.executionCtx.waitUntil(removePhoto(c.env, photoKey(member.ownerID, member.agentID, member.photoVersion)));
  } else {
    await c.env.DB.prepare('DELETE FROM contact WHERE id = ? AND user_id = ?')
      .bind(c.req.param('id'), c.get('owner')).run();
  }
  c.executionCtx.waitUntil(terminateChats(c.env, pending.results.map((row) => row.id)));
  return c.body(null, 204);
});

contacts.route('/:id/native-actions', nativeActions);
contacts.route('/:id/personality', personality);
contacts.route('/:id/mini-apps', miniApps);
contacts.route('/:id/tasks', taskRoutes('contact'));
contacts.route('/:id/documents', documentRoutes('contact'));
contacts.route('/:id/native-remote', remoteSettings);
contacts.route('/sharing', sharing);

contacts.route('/:id/chat', chats);
contacts.route('/:id/schedules', schedules);

export default contacts;
