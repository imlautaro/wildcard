import { privatePresenceStatus } from '../chat/presence';
import { speechAccent } from '../../../../shared/voice';
import { remoteSettings } from '../native/remote-routes';
import nativeActions from '../native/routes';
import { miniAppRoutes } from '../miniapps/routes';
import { taskRoutes } from '../tasks/routes';
import { linkRoutes } from '../contacts/links';
import { documentRoutes } from '../documents/routes';
import { plainMessageMarkdown } from '../../../../shared/messageMarkdown';
import { aliasBody } from '../contacts/alias';
import { learningRoutes } from '../chat/learning-routes';
import { accountEnvironment } from '../lib/model-preference';
import { readEnergy } from '../groups/energy';
import { photoKey, photoResponse, removePhoto, validPhoto, readPhoto } from '../photos/storage';
import { totalUnreadReplies } from '../lib/unread';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import chats from './chats';
import schedules from './schedules';
import { clearContact, cleanResources, cleanupPending } from '../chat/cleanup';
import { admitAuthRequest } from '../lib/auth-rate-limit';
import { readBearerSession } from '../lib/session';
import sharing from './sharing';
import personality from '../personality/routes';
import generation from '../contacts/generation';
import { listVoices, voiceRepliesAvailable, type Voice } from '../voice/catalog';

type Contact = { archivedAt?: number | null; historyRevision?: number; clearing?: number; speechAccent: string | null; onboardingChat?: number; setupPending?: number; initiativeEnabled: number; voiceMessagesEnabled: number; voiceID: string | null; voiceName: string | null; id: string; agentID: string | null; role: 'owner' | 'member'; name: string; realName: string; alias: string | null; photoVersion: string | null; createdAt: number; updatedAt: number; lastMessageVoiceJSON?: string | null; lastReactionJSON?: string | null; lastMessageText?: string | null; lastMessageFromUser?: number | null; lastMessageAt?: number | null; unreadCount?: number; lastReadSequence?: number };
const columns = `archived_at AS archivedAt, history_revision AS historyRevision, clearing, (SELECT speech_accent FROM contact_agent WHERE id = contact.agent_id) AS speechAccent, onboarding_chat AS onboardingChat, setup_pending AS setupPending, initiative_enabled AS initiativeEnabled, voice_messages_enabled AS voiceMessagesEnabled,
  (SELECT voice_id FROM contact_agent WHERE id = contact.agent_id) AS voiceID, (SELECT voice_name FROM contact_agent WHERE id = contact.agent_id) AS voiceName, id, agent_id AS agentID, COALESCE(alias, name) AS name, name AS realName, alias, photo_version AS photoVersion, created_at AS createdAt, updated_at AS updatedAt, last_read_sequence AS lastReadSequence,
  CASE WHEN user_id = (SELECT owner_id FROM contact_agent WHERE id = contact.agent_id) THEN 'owner' ELSE 'member' END AS role`;
const managesAgent = `EXISTS (SELECT 1 FROM contact_agent a WHERE a.id = contact.agent_id AND a.owner_id = contact.user_id)`;
const selection = `${columns},
  (SELECT CASE WHEN t.assistant_text IS NOT NULL THEN
    CASE WHEN json_extract(t.assistant_messages_json, '$[#-1].attachment.mimeType') LIKE 'audio/%' THEN
      json_object('durationMs', json_extract(t.assistant_messages_json, '$[#-1].attachment.durationMs'), 'listenedAt', NULL,
        'transcript', NULL, 'ownListenedAt', json_extract(t.assistant_voice_listened_json, '$."' || (json_array_length(t.assistant_messages_json) - 1) || '"')) END
    ELSE CASE WHEN json_extract(t.attachment_json, '$.mimeType') LIKE 'audio/%' THEN
      json_object('durationMs', json_extract(t.attachment_json, '$.durationMs'), 'listenedAt', t.voice_listened_at, 'transcript', NULL) END END
    FROM chat_turn t WHERE t.contact_id = contact.id AND t.user_id = contact.user_id ORDER BY t.sequence DESC LIMIT 1) AS lastMessageVoiceJSON,
  (SELECT ${privatePresenceStatus('contact')} FROM agent_presence p WHERE p.agent_id = contact.agent_id) AS replyActivity,
  (SELECT CASE WHEN t.assistant_text IS NULL AND t.schedule_id IS NULL AND t.group_request_id IS NULL AND t.task_id IS NULL THEN 1 ELSE 0 END
    FROM chat_turn t WHERE t.contact_id = contact.id AND t.user_id = contact.user_id ORDER BY t.sequence DESC LIMIT 1) AS lastMessageFromUser,
  (SELECT t.read_at FROM chat_turn t WHERE t.contact_id = contact.id AND t.user_id = contact.user_id ORDER BY t.sequence DESC LIMIT 1) AS lastMessageReadAt, (SELECT CASE WHEN json_extract(t.assistant_messages_json, '$[#-1].attachment.mimeType') LIKE 'audio/%'
    OR (t.assistant_text IS NULL AND json_extract(t.attachment_json, '$.mimeType') LIKE 'audio/%') THEN 'Voice message' ELSE COALESCE(t.assistant_text, CASE WHEN t.schedule_id IS NOT NULL THEN 'Scheduled message' WHEN t.group_request_id IS NOT NULL THEN 'Group response' WHEN t.task_id IS NOT NULL THEN 'Working on a task' WHEN t.user_text = '' AND t.attachment_json IS NOT NULL THEN 'Attachment: ' || json_extract(t.attachment_json, '$.name') ELSE t.user_text END) END
  FROM chat_turn t WHERE t.contact_id = contact.id AND t.user_id = contact.user_id
  ORDER BY t.sequence DESC LIMIT 1) AS lastMessageText,
  (SELECT CASE WHEN t.assistant_text IS NOT NULL THEN t.updated_at ELSE t.created_at END
    FROM chat_turn t WHERE t.contact_id = contact.id AND t.user_id = contact.user_id
    ORDER BY t.sequence DESC LIMIT 1) AS lastMessageAt,
  (SELECT COUNT(*) FROM chat_turn t WHERE t.contact_id = contact.id AND t.user_id = contact.user_id
    AND t.status = 'complete' AND t.assistant_text IS NOT NULL AND t.sequence > contact.last_read_sequence) AS unreadCount,
  (SELECT json_object('at', r.created_at, 'emoji', r.emoji, 'own', CASE WHEN r.user_id IS NOT NULL THEN json('true') ELSE json('false') END)
    FROM message_reaction r WHERE r.contact_id = contact.id AND r.created_at IS NOT NULL
    ORDER BY r.created_at DESC LIMIT 1) AS lastReactionJSON`;
// Parse the complete source before clipping, keeping the legacy raw summary intact.
function contactPreview(row: Contact) {
  const source = row.lastMessageText;
  const { lastMessageVoiceJSON, lastReactionJSON, ...fields } = row;
  return { ...fields, lastMessageVoice: lastMessageVoiceJSON ? JSON.parse(lastMessageVoiceJSON) : null,
    // Newest reaction in this chat (docs/chats.md#chat-list-previews); clients show it when newer than the last message.
    lastReaction: lastReactionJSON ? JSON.parse(lastReactionJSON) as { at: number; emoji: string; own: boolean } : null, lastMessageText: source == null ? source : [...source].slice(0, 500).join(''),
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

contacts.route('/generation', generation);

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

contacts.put('/:id/voice-messages', contactBody, async (c) => {
  c.header('Cache-Control', 'no-store');
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body || Object.keys(body).join(',') !== 'enabled' || typeof body.enabled !== 'boolean') {
    return c.json({ error: 'Provide only enabled as a boolean' }, 400);
  }
  await c.env.DB.prepare('UPDATE contact SET voice_messages_enabled = ? WHERE id = ? AND user_id = ?')
    .bind(body.enabled ? 1 : 0, c.req.param('id'), c.get('owner')).run();
  const contact = await c.env.DB.prepare(`SELECT ${selection} FROM contact WHERE id = ? AND user_id = ?`)
    .bind(c.req.param('id'), c.get('owner')).first<Contact>();
  return contact ? c.json({ contact: contactPreview(contact) }) : c.json({ error: 'Contact not found' }, 404);
});

// The voice is shared identity: only the creator chooses it, from the catalog.
contacts.put('/:id/voice', contactBody, async (c) => {
  c.header('Cache-Control', 'no-store');
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body || Object.keys(body).join(',') !== 'voiceID' || typeof body.voiceID !== 'string') {
    return c.json({ error: 'Provide only voiceID' }, 400);
  }
  const member = await c.env.DB.prepare(`SELECT agent_id AS agentID, ${managesAgent} AS creator FROM contact WHERE id = ? AND user_id = ?`)
    .bind(c.req.param('id'), c.get('owner')).first<{ agentID: string; creator: number }>();
  if (!member) return c.json({ error: 'Contact not found' }, 404);
  if (!member.creator) return c.json({ error: 'Only the creator can edit this contact' }, 403);
  if (!await voiceRepliesAvailable(c.env)) return c.json({ error: 'Voice messages are unavailable' }, 503);
  let voice: Voice | undefined;
  try { voice = (await listVoices(c.env)).find(item => item.id === body.voiceID); }
  catch { return c.json({ error: 'Voices are unavailable right now' }, 503); }
  if (!voice) return c.json({ error: 'Choose an available voice' }, 422);
  await c.env.DB.prepare('UPDATE contact_agent SET voice_id = ?, voice_name = ? WHERE id = ? AND owner_id = ?')
    .bind(voice.id, voice.name, member.agentID, c.get('owner')).run();
  const contact = await c.env.DB.prepare(`SELECT ${selection} FROM contact WHERE id = ? AND user_id = ?`)
    .bind(c.req.param('id'), c.get('owner')).first<Contact>();
  return contact ? c.json({ contact: contactPreview(contact) }) : c.json({ error: 'Contact not found' }, 404);
});

// Accent belongs to the shared agent, never to the listener's account or locale.
contacts.put('/:id/speech-accent', contactBody, async (c) => {
  c.header('Cache-Control', 'no-store');
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body || Object.keys(body).join(',') !== 'speechAccent'
    || (body.speechAccent !== null && !speechAccent(body.speechAccent))) {
    return c.json({ error: 'Choose an available speech accent or null for Voice default' }, 400);
  }
  const member = await c.env.DB.prepare(`SELECT agent_id AS agentID, ${managesAgent} AS creator FROM contact WHERE id = ? AND user_id = ?`)
    .bind(c.req.param('id'), c.get('owner')).first<{ agentID: string; creator: number }>();
  if (!member) return c.json({ error: 'Contact not found' }, 404);
  if (!member.creator) return c.json({ error: 'Only the creator can edit this contact' }, 403);
  const updated = await c.env.DB.prepare(`UPDATE contact_agent SET speech_accent = ?, updated_at = ?
    WHERE id = ? AND owner_id = ? RETURNING id`)
    .bind(body.speechAccent, Date.now(), member.agentID, c.get('owner')).first();
  if (!updated) return c.json({ error: 'Contact no longer available' }, 404);
  const contact = await c.env.DB.prepare(`SELECT ${selection} FROM contact WHERE id = ? AND user_id = ?`)
    .bind(c.req.param('id'), c.get('owner')).first<Contact>();
  return contact ? c.json({ contact: contactPreview(contact) }) : c.json({ error: 'Contact not found' }, 404);
});

contacts.patch('/:id', contactBody, async (c) => {
  const name = contactName(await c.req.json<unknown>().catch(() => null));
  if (!name) return c.json({ error: 'Provide only a name using 1–100 characters without control characters' }, 400);
  // The creator's rename is the shared name: it updates the agent and every holder's copy in
  // one batch (aliases are untouched). Earlier group messages keep their sender_name snapshot.
  const id = c.req.param('id'), owner = c.get('owner'), now = Date.now();
  const [renamed] = await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE contact_agent SET name = ?1, updated_at = ?2
      WHERE owner_id = ?4 AND id = (SELECT agent_id FROM contact WHERE id = ?3 AND user_id = ?4) RETURNING id`)
      .bind(name, now, id, owner),
    c.env.DB.prepare(`UPDATE contact SET name = ?1, updated_at = ?2
      WHERE agent_id = (SELECT agent_id FROM contact WHERE id = ?3 AND user_id = ?4)
        AND EXISTS (SELECT 1 FROM contact_agent a WHERE a.id = contact.agent_id AND a.owner_id = ?4)`)
      .bind(name, now, id, owner),
  ]);
  const result = renamed.results[0] ? await c.env.DB.prepare(`SELECT ${columns} FROM contact WHERE id = ? AND user_id = ?`).bind(id, owner).first<Contact>() : null;
  if (!result) return c.json({ error: 'Contact not found' }, 404);
  const updated = await c.env.DB.prepare(`SELECT ${selection} FROM contact WHERE id = ? AND user_id = ?`)
    .bind(result.id, c.get('owner')).first<Contact>();
  return c.json({ contact: updated ?? result });
});

// The alias is this user's private display name; any account holding the contact may set it.
contacts.patch('/:id/alias', contactBody, async (c) => {
  const body = aliasBody(await c.req.json<unknown>().catch(() => null));
  if (!body) return c.json({ error: 'Provide only an alias using 1–100 characters without control characters, or null to clear it' }, 400);
  const result = await c.env.DB.prepare(`UPDATE contact SET alias = ?1, updated_at = ?2 WHERE id = ?3 AND user_id = ?4 RETURNING id`)
    .bind(body.alias, Date.now(), c.req.param('id'), c.get('owner')).first<{ id: string }>();
  if (!result) return c.json({ error: 'Contact not found' }, 404);
  const updated = await c.env.DB.prepare(`SELECT ${selection} FROM contact WHERE id = ? AND user_id = ?`)
    .bind(result.id, c.get('owner')).first<Contact>();
  return c.json({ contact: updated ? contactPreview(updated) : null });
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
  if (isOwner) {
    await c.env.DB.prepare('DELETE FROM contact_agent WHERE id = ? AND owner_id = ?').bind(member.agentID,c.get('owner')).run();
  } else {
    await c.env.DB.prepare('DELETE FROM contact WHERE id = ? AND user_id = ?').bind(c.req.param('id'),c.get('owner')).run();
  }
  c.executionCtx.waitUntil(cleanResources(c.env));
  return c.body(null, 204);
});

contacts.put('/:id/archive', contactBody, async c => {
  const body = await c.req.json<Record<string,unknown>>().catch(()=>null);
  if (!body || Object.keys(body).join(',') !== 'archived' || typeof body.archived !== 'boolean') return c.json({error:'Provide archived as a boolean'},400);
  const row = await c.env.DB.prepare('UPDATE contact SET archived_at=? WHERE id=? AND user_id=? RETURNING id')
    .bind(body.archived ? Date.now() : null,c.req.param('id'),c.get('owner')).first();
  return row ? c.body(null,204) : c.json({error:'Contact not found'},404);
});
contacts.post('/:id/clear', contactBody, async c => {
  const body = await c.req.json<Record<string,unknown>>().catch(()=>null);
  if (!body || Object.keys(body).sort().join(',') !== 'clearMemory,historyRevision' || (typeof body.clearMemory !== 'boolean' || typeof body.historyRevision !== 'number' || !Number.isSafeInteger(body.historyRevision) || body.historyRevision < 0)) return c.json({error:'Choose whether to clear memory'},400);
  const row = await c.env.DB.prepare('SELECT id,clearing,history_revision AS revision FROM contact WHERE id=? AND user_id=?').bind(c.req.param('id'),c.get('owner')).first<{id:string;clearing:number;revision:number}>();
  if (!row) return c.json({error:'Contact not found'},404);
  if (row.revision>body.historyRevision) {
    const pending=await cleanupPending(c.env.DB,row.id);
    return c.json({cleared:true,cleanup:pending?'pending':'complete'},202);
  }
  if (row.revision!==body.historyRevision) return c.json({error:'Refresh before clearing this chat'},409);
  const admission=await admitAuthRequest(c.env.DB,c.get('owner'),'chat-clear',6);
  if (!admission.allowed) return c.json({error:'Too many clear requests. Please wait a minute.'},429);
  try { if (!row.clearing) await clearContact(c.env,row.id,c.get('owner'),body.clearMemory,body.historyRevision); }
  catch (error) {
    const latest=await c.env.DB.prepare('SELECT history_revision AS revision FROM contact WHERE id=?').bind(row.id).first<{revision:number}>();
    if (!latest || latest.revision<=body.historyRevision) throw error;
  }
  c.executionCtx.waitUntil(cleanResources(c.env,row.id));
  const pending=await cleanupPending(c.env.DB,row.id);
  return c.json({cleared:true,cleanup:pending ? 'pending' : 'complete'},202);
});
contacts.route('/:id/native-actions', nativeActions);
contacts.route('/:id/personality', personality);
contacts.route('/:id/mini-apps', miniAppRoutes('contact'));
contacts.route('/:id/tasks', taskRoutes('contact'));
contacts.route('/:id/links', linkRoutes);
contacts.route('/:id/documents', documentRoutes('contact'));
contacts.route('/:id/learning', learningRoutes('contact'));
contacts.route('/:id/native-remote', remoteSettings);
contacts.route('/sharing', sharing);

contacts.route('/:id/chat', chats);
contacts.route('/:id/schedules', schedules);

export default contacts;
