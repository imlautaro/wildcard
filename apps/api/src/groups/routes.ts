import { plainMessageMarkdown } from '../../../../shared/messageMarkdown';
import { accountEnvironment } from '../lib/model-preference';
import { reactionRoutes } from '../reactions/routes';
import { groupQuotes, parseGroupReply } from '../replies/data';
import { receiptState } from './receipts';
import { deliverGroupPush } from './push';
import media, { groupPhotoKey } from './media';
import { taskRoutes } from '../tasks/routes';
import { documentRoutes } from '../documents/routes';
import { removePhoto } from '../photos/storage';
import { parseAttachment, sameAttachment, publicAttachment } from '../chat/attachments';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { readBearerSession } from '../lib/session';
import { admitAuthRequest } from '../lib/auth-rate-limit';
import { photoResponse } from '../photos/storage';
import { dispatchGroup } from './workflow';
import { groupSourceAccess } from './request-access';

const groups = new Hono<{ Bindings: Env; Variables: { owner: string } }>();
const contributor = (env: Env) => env.META_CHAT_MODEL.includes('contributor');
const accepted = (b: Record<string, unknown> | null, env: Env) => b?.shareMemory === true && (!contributor(env) || b.contributorConsent === true);
const validName = (v: unknown) => typeof v === 'string' && v.trim().length > 0 && Array.from(v.trim()).length <= 100 && !/[\u0000-\u001f\u007f-\u009f]/u.test(v);
const membership = (db: D1Database, id: string, user: string) => db.prepare(`SELECT m.can_invite AS canInvite,
  g.owner_id AS ownerID FROM group_member m JOIN chat_group g ON g.id = m.group_id
  WHERE m.group_id = ? AND m.user_id = ?`).bind(id, user).first<{ canInvite: number; ownerID: string }>();
const mayInvite = `EXISTS (SELECT 1 FROM group_member m JOIN chat_group g ON g.id = m.group_id
  WHERE m.group_id = ?1 AND m.user_id = ?2 AND (m.can_invite = 1 OR g.owner_id = ?2))`;
type GroupSummary = Record<string, unknown> & { lastMessageText: string | null; lastMessageUserID: string | null };
function groupPreview(row: GroupSummary) {
  const source = row.lastMessageText;
  return { ...row,
    lastMessagePreview: source == null ? null : [...(row.lastMessageUserID == null ? plainMessageMarkdown(source) : source)].slice(0, 500).join('') };
}
const summary = `m.last_read_sequence AS lastReadSequence,
  (SELECT COUNT(*) FROM group_message gm WHERE gm.group_id = g.id AND gm.sequence > m.last_read_sequence
    AND gm.user_id IS NOT m.user_id) AS unreadCount, g.id, g.name, g.owner_id AS ownerID,
  (SELECT id FROM group_message WHERE group_id = g.id ORDER BY sequence DESC LIMIT 1) AS lastMessageID,
  (SELECT user_id FROM group_message WHERE group_id = g.id ORDER BY sequence DESC LIMIT 1) AS lastMessageUserID,
  (SELECT ${receiptState('gm')} FROM group_message gm WHERE gm.group_id = g.id ORDER BY gm.sequence DESC LIMIT 1) AS lastMessageReceiptState, g.created_at AS createdAt, g.photo_version AS photoVersion,
  (SELECT CASE WHEN text = '' AND attachment_json IS NOT NULL THEN 'Attachment: ' || json_extract(attachment_json, '$.name') ELSE text END FROM group_message WHERE group_id = g.id ORDER BY sequence DESC LIMIT 1) AS lastMessageText,
  (SELECT created_at FROM group_message WHERE group_id = g.id ORDER BY sequence DESC LIMIT 1) AS lastMessageAt,
  (SELECT sender_name FROM group_message WHERE group_id = g.id ORDER BY sequence DESC LIMIT 1) AS lastMessageSenderName,
  COALESCE((SELECT created_at FROM group_message WHERE group_id = g.id ORDER BY sequence DESC LIMIT 1), g.created_at) AS updatedAt`;

groups.use('*', async (c, next) => {
  const session = await readBearerSession(c.env, c.req.raw.headers);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  c.set('owner', session.user.id);
  c.env = await accountEnvironment(c.env, session.user.id);
  const groupID = c.req.path.split('/')[4];
  if (groupID && await c.env.DB.prepare('SELECT group_id FROM mcp_private_group WHERE group_id = ?').bind(groupID).first()) c.env = { ...c.env, META_CHAT_MODEL: 'muse-spark-1.3' };
  await next();
});
groups.use('*', async (c, next) => {
  const maxSize = c.req.method === 'POST' && c.req.path.endsWith('/messages') ? 7 * 1024 * 1024 + 32768
    : c.req.path.endsWith('/transcriptions') ? 2 * 1024 * 1024
    : c.req.path.endsWith('/photo') ? 512 * 1024 : c.req.path.includes('/documents') ? 256 * 1024 : 24 * 1024;
  return bodyLimit({ maxSize, onError: (c) => c.json({ error: 'File or request is too large' }, 413) })(c, next);
});
groups.use('*', async (c, next) => {
  if (c.req.method !== 'GET' && !c.req.path.endsWith('/read') && !c.req.path.endsWith('/receipts')) {
    const admission = await admitAuthRequest(c.env.DB, c.get('owner'), 'group-write', 40);
    if (!admission.allowed) return c.json({ error: 'Too many requests. Please wait a minute.' }, 429);
  }
  await next();
});

groups.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT ${summary} FROM chat_group g JOIN group_member m ON m.group_id = g.id
    WHERE m.user_id = ? ORDER BY updatedAt DESC, g.id LIMIT 100`).bind(c.get('owner')).all<GroupSummary>();
  const { results: activity } = await c.env.DB.prepare(`SELECT gm.id AS messageID, gm.sequence, gm.group_id AS groupID,
    g.name AS groupName, gm.sender_name AS senderName, gm.agent_id AS agentID, gm.created_at AS sentAt,
    CASE WHEN gm.text = '' AND gm.attachment_json IS NOT NULL THEN 'Attachment: ' || json_extract(gm.attachment_json, '$.name') ELSE gm.text END AS text
    FROM group_message gm JOIN group_member m ON m.group_id = gm.group_id JOIN chat_group g ON g.id = gm.group_id
    WHERE m.user_id = ? AND gm.sequence > m.last_read_sequence AND gm.user_id IS NOT m.user_id
    ORDER BY gm.sequence DESC LIMIT 50`).bind(c.get('owner')).all<Record<string, unknown> & { text: string; agentID: string | null }>();
  return c.json({ groups: results.map(groupPreview), activity: activity.map((item) => ({ ...item,
    text: [...item.text].slice(0, 500).join(''), previewText: [...(item.agentID ? plainMessageMarkdown(item.text) : item.text)].slice(0, 500).join('') })), contributorModel: contributor(c.env) });
});
groups.post('/', async (c) => {
  const b = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!validName(b?.name) || !accepted(b, c.env)) return c.json({ error: 'Provide a name and accept shared memory and model data use' }, 400);
  const id = crypto.randomUUID(), now = Date.now(), owner = c.get('owner');
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO chat_group (id, owner_id, name, created_at)
      SELECT ?1, ?2, ?3, ?4 WHERE (SELECT COUNT(*) FROM group_member WHERE user_id = ?2) < 100`)
      .bind(id, owner, (b!.name as string).trim(), now),
    c.env.DB.prepare(`INSERT INTO group_member (group_id, user_id, can_invite, share_memory, contributor_consent, joined_at)
      SELECT id, ?2, 1, 1, ?3, ?4 FROM chat_group WHERE id = ?1 AND owner_id = ?2`)
      .bind(id, owner, b?.contributorConsent === true ? 1 : 0, now),
  ]);
  return await membership(c.env.DB, id, owner) ? c.json({ id }, 201) : c.json({ error: 'Group limit reached' }, 409);
});
groups.get('/invitations', async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT i.id, g.name AS groupName, u.name AS senderName, i.expires_at AS expiresAt
    FROM group_invite i JOIN chat_group g ON g.id = i.group_id JOIN user u ON u.id = i.sender_id
    JOIN group_member m ON m.group_id = i.group_id AND m.user_id = i.sender_id
    WHERE i.recipient_id = ?1 AND i.expires_at > ?2 AND (m.can_invite = 1 OR g.owner_id = i.sender_id)
    ORDER BY i.expires_at LIMIT 100`).bind(c.get('owner'), Date.now()).all();
  return c.json({ invitations: results, contributorModel: contributor(c.env) });
});
groups.post('/invitations/:inviteID/accept', async (c) => {
  const b = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!accepted(b, c.env)) return c.json({ error: 'Accept shared memory and model data use' }, 400);
  const owner = c.get('owner'), inviteID = c.req.param('inviteID'), now = Date.now();
  const invite = await c.env.DB.prepare(`SELECT group_id AS id FROM group_invite WHERE id = ? AND recipient_id = ? AND expires_at > ?`)
    .bind(inviteID, owner, now).first<{ id: string }>();
  if (!invite) return c.json({ error: 'Invitation unavailable' }, 404);
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO group_member (group_id, user_id, share_memory, contributor_consent, joined_at)
      SELECT i.group_id, ?2, 1, ?4, ?3 FROM group_invite i JOIN chat_group g ON g.id = i.group_id
      JOIN group_member m ON m.group_id = i.group_id AND m.user_id = i.sender_id
      WHERE i.id = ?1 AND i.recipient_id = ?2 AND i.expires_at > ?3 AND (m.can_invite = 1 OR g.owner_id = i.sender_id)
      AND (SELECT COUNT(*) FROM group_member WHERE group_id = i.group_id) < 16
      AND (SELECT COUNT(*) FROM group_member WHERE user_id = ?2) < 100
      ON CONFLICT(group_id, user_id) DO NOTHING`)
      .bind(inviteID, owner, now, b?.contributorConsent === true ? 1 : 0),
    c.env.DB.prepare(`DELETE FROM group_invite WHERE id = ?1 AND recipient_id = ?2
      AND EXISTS (SELECT 1 FROM group_member WHERE group_id = group_invite.group_id AND user_id = ?2)`)
      .bind(inviteID, owner),
  ]);
  return await membership(c.env.DB, invite.id, owner) ? c.json({ id: invite.id }) : c.json({ error: 'Invitation unavailable or group full' }, 409);
});
groups.delete('/invitations/:inviteID', async (c) => {
  await c.env.DB.prepare('DELETE FROM group_invite WHERE id = ? AND recipient_id = ?').bind(c.req.param('inviteID'), c.get('owner')).run();
  return c.body(null, 204);
});

// One bounded acknowledgement for previews received across the Home list.
groups.put('/receipts', async (c) => {
  const admission = await admitAuthRequest(c.env.DB, c.get('owner'), 'group-receipt', 120);
  if (!admission.allowed) return c.json({ error: 'Too many receipt updates' }, 429);
  const b = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!Array.isArray(b?.messageIDs) || b.messageIDs.length < 1 || b.messageIDs.length > 100
    || !b.messageIDs.every((id) => typeof id === 'string' && id.length <= 160)) {
    return c.json({ error: 'Provide up to 100 message IDs' }, 400);
  }
  await c.env.DB.prepare(`UPDATE group_message_receipt SET delivered_at = COALESCE(delivered_at, ?1)
    WHERE recipient_kind = 'user' AND recipient_id = ?2 AND message_id IN (SELECT value FROM json_each(?3))
    AND EXISTS (SELECT 1 FROM group_message gm JOIN group_member m ON m.group_id = gm.group_id
      WHERE gm.id = message_id AND m.user_id = ?2)`)
    .bind(Date.now(), c.get('owner'), JSON.stringify(b.messageIDs)).run();
  return c.body(null, 204);
});

// Every group read and mutation requires current membership, including photo access.
groups.use('/:id/*', async (c, next) => {
  if (!await membership(c.env.DB, c.req.param('id')!, c.get('owner'))) return c.json({ error: 'Group unavailable' }, 404);
  await next();
});
groups.get('/:id', async (c) => {
  const id = c.req.param('id'), owner = c.get('owner');
  const member = await membership(c.env.DB, id, owner);
  if (!member) return c.json({ error: 'Group unavailable' }, 404);
  const group = await c.env.DB.prepare(`SELECT ${summary} FROM chat_group g JOIN group_member m ON m.group_id = g.id
    WHERE g.id = ? AND m.user_id = ?`).bind(id, owner).first<GroupSummary>();
  const { results: members } = await c.env.DB.prepare(`SELECT u.id, 'user' AS kind, u.name, u.photo_version AS photoVersion,
    m.can_invite AS canInvite, NULL AS addedBy FROM group_member m JOIN user u ON u.id = m.user_id WHERE m.group_id = ?
    UNION ALL SELECT a.id, 'agent', a.name, a.photo_version, 0, ga.added_by FROM group_agent ga
    JOIN contact_agent a ON a.id = ga.agent_id WHERE ga.group_id = ?`).bind(id, id).all();
  const { results: replies } = await c.env.DB.prepare(`SELECT r.id, r.agent_id AS agentID, a.name, r.status,
    r.source_id AS sourceID, source.sequence AS sourceSequence, r.attempt,
    EXISTS (SELECT 1 FROM agent_attention attention JOIN agent_presence presence ON presence.agent_id = attention.agent_id
      WHERE attention.agent_id = r.agent_id AND attention.turn_id = r.id AND attention.attempt = r.attempt
        AND r.status = 'running' AND presence.status = 'typing' AND presence.expires_at > ?2) AS isTyping
    FROM group_reply r
    JOIN group_message source ON source.id = r.source_id
    JOIN contact_agent a ON a.id = r.agent_id WHERE r.group_id = ?1 AND r.status IN ('queued', 'running', 'failed')
    AND (r.status != 'failed' OR NOT EXISTS (SELECT 1 FROM group_message later
      WHERE later.group_id = r.group_id AND later.agent_id = r.agent_id AND later.sequence > source.sequence))
    ORDER BY (r.status = 'failed'), r.sequence DESC LIMIT 80`).bind(id, Date.now()).all();
  const { results: privateSharing } = await c.env.DB.prepare(`SELECT ga.agent_id AS agentID,
    EXISTS (SELECT 1 FROM group_private_sharing s WHERE s.group_id = ga.group_id
      AND s.agent_id = ga.agent_id AND s.user_id = ?2) AS enabled,
    (c.id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mcp_private_contact p WHERE p.contact_id = c.id)) AS available
    FROM group_agent ga LEFT JOIN contact c ON c.agent_id = ga.agent_id AND c.user_id = ?2
    WHERE ga.group_id = ?1 ORDER BY ga.agent_id`).bind(id, owner).all();
  return c.json({ group: group ? groupPreview(group) : group, members, replies, privateSharing, canInvite: member.canInvite === 1 || member.ownerID === owner, contributorModel: contributor(c.env) });
});
// A group owner cannot grant another participant's private conversation.
groups.put('/:id/private-sharing/:agentID', async (c) => {
  const b = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (typeof b?.enabled !== 'boolean') return c.json({ error: 'Provide enabled' }, 400);
  const id = c.req.param('id'), agentID = c.req.param('agentID'), userID = c.get('owner');
  if (!b.enabled) {
    await c.env.DB.prepare('DELETE FROM group_private_sharing WHERE group_id = ? AND agent_id = ? AND user_id = ?')
      .bind(id, agentID, userID).run();
    return c.body(null, 204);
  }
  const saved = await c.env.DB.prepare(`INSERT INTO group_private_sharing (group_id, agent_id, user_id, contact_id, created_at)
    SELECT ga.group_id, ga.agent_id, c.user_id, c.id, ?4 FROM group_agent ga
    JOIN group_member m ON m.group_id = ga.group_id AND m.user_id = ?3 AND m.share_memory = 1
    JOIN contact c ON c.agent_id = ga.agent_id AND c.user_id = m.user_id
    JOIN contact_agent a ON a.id = c.agent_id AND a.memory_shared = 1
    WHERE ga.group_id = ?1 AND ga.agent_id = ?2
      AND NOT EXISTS (SELECT 1 FROM mcp_private_contact p WHERE p.contact_id = c.id)
      AND (?5 = 0 OR (m.contributor_consent = 1 AND (c.user_id = a.owner_id OR c.contributor_consent = 1)))
    ON CONFLICT(group_id, agent_id, user_id) DO NOTHING`)
    .bind(id, agentID, userID, Date.now(), contributor(c.env) ? 1 : 0).run();
  const exists = saved.meta.changes || await c.env.DB.prepare(`SELECT 1 FROM group_private_sharing
    WHERE group_id = ? AND agent_id = ? AND user_id = ?`).bind(id, agentID, userID).first();
  return exists ? c.body(null, 204) : c.json({ error: 'An eligible private conversation and current sharing consent are required' }, 403);
});

groups.patch('/:id', async (c) => {
  const b = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!validName(b?.name)) return c.json({ error: 'Use a name with 1–100 characters' }, 400);
  const row = await c.env.DB.prepare('UPDATE chat_group SET name = ? WHERE id = ? AND owner_id = ? RETURNING id')
    .bind((b!.name as string).trim(), c.req.param('id'), c.get('owner')).first();
  return row ? c.body(null, 204) : c.json({ error: 'Only the group owner can edit the name' }, 403);
});
groups.post('/:id/consent', async (c) => {
  const b = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!accepted(b, c.env)) return c.json({ error: 'Accept shared memory and model data use' }, 400);
  await c.env.DB.prepare(`UPDATE group_member SET share_memory = 1, contributor_consent = ?
    WHERE group_id = ? AND user_id = ?`).bind(b?.contributorConsent === true ? 1 : 0, c.req.param('id'), c.get('owner')).run();
  return c.body(null, 204);
});
groups.post('/:id/agents', async (c) => {
  const id = c.req.param('id'), owner = c.get('owner');
  const b = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (typeof b?.contactID !== 'string' || !accepted(b, c.env)) return c.json({ error: 'Select your own contact and confirm shared memory and model data use' }, 400);
  const agent = await c.env.DB.prepare(`SELECT a.id FROM contact c JOIN contact_agent a ON a.id = c.agent_id
    WHERE c.id = ? AND c.user_id = ? AND a.owner_id = ?`).bind(b.contactID, owner, owner).first<{ id: string }>();
  if (!agent) return c.json({ error: 'Only the contact creator can add it to a group' }, 403);
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO group_agent (group_id, agent_id, added_by, joined_at)
      SELECT ?1, ?3, ?2, ?4 WHERE ${mayInvite} AND (SELECT COUNT(*) FROM group_agent WHERE group_id = ?1) < 8
      ON CONFLICT(group_id, agent_id) DO NOTHING`).bind(id, owner, agent.id, Date.now()),
    c.env.DB.prepare(`UPDATE contact_agent SET memory_shared = 1 WHERE id = ?3 AND owner_id = ?2
      AND EXISTS (SELECT 1 FROM group_agent WHERE group_id = ?1 AND agent_id = ?3)`)
      .bind(id, owner, agent.id),
  ]);
  const saved = await c.env.DB.prepare('SELECT agent_id FROM group_agent WHERE group_id = ? AND agent_id = ?').bind(id, agent.id).first();
  return saved ? c.body(null, 204) : c.json({ error: 'Invitation permission required or contact limit reached' }, 403);
});
groups.post('/:id/invitations', async (c) => {
  const id = c.req.param('id'), owner = c.get('owner');
  const member = await membership(c.env.DB, id, owner);
  if (!member || (!member.canInvite && member.ownerID !== owner)) return c.json({ error: 'Invitation permission required' }, 403);
  const b = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (typeof b?.email !== 'string' || b.email.length > 254) return c.json({ error: 'Provide an existing account email' }, 400);
  const recipient = await c.env.DB.prepare('SELECT id FROM user WHERE email = ? COLLATE NOCASE')
    .bind(b.email.trim()).first<{ id: string }>();
  if (!recipient) return c.json({ error: 'No existing account uses this email' }, 404);
  if (await membership(c.env.DB, id, recipient.id)) return c.json({ error: 'This user is already a member' }, 409);
  const result = await c.env.DB.prepare(`INSERT INTO group_invite (id, group_id, sender_id, recipient_id, expires_at)
    SELECT ?3, ?1, ?2, ?4, ?5 WHERE ${mayInvite}
    AND (SELECT COUNT(*) FROM group_invite WHERE group_id = ?1 AND expires_at > ?6) < 20
    ON CONFLICT(group_id, recipient_id) DO UPDATE SET sender_id = excluded.sender_id, expires_at = excluded.expires_at
    RETURNING id`).bind(id, owner, crypto.randomUUID(), recipient.id, Date.now() + 86_400_000, Date.now()).first();
  return result ? c.body(null, 204) : c.json({ error: 'Invitation unavailable or limit reached' }, 409);
});
groups.patch('/:id/members/:userID', async (c) => {
  const b = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (typeof b?.canInvite !== 'boolean') return c.json({ error: 'Provide canInvite' }, 400);
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE group_member SET can_invite = ?4 WHERE group_id = ?1 AND user_id = ?3
      AND user_id != ?2 AND EXISTS (SELECT 1 FROM chat_group WHERE id = ?1 AND owner_id = ?2)`)
      .bind(c.req.param('id'), c.get('owner'), c.req.param('userID'), b.canInvite ? 1 : 0),
    c.env.DB.prepare(`DELETE FROM group_invite WHERE group_id = ?1 AND sender_id = ?3 AND ?4 = 0
      AND EXISTS (SELECT 1 FROM chat_group WHERE id = ?1 AND owner_id = ?2)`)
      .bind(c.req.param('id'), c.get('owner'), c.req.param('userID'), b.canInvite ? 1 : 0),
  ]);
  const member = await membership(c.env.DB, c.req.param('id'), c.get('owner'));
  return member?.ownerID === c.get('owner') ? c.body(null, 204) : c.json({ error: 'Only the group owner can grant permissions' }, 403);
});
groups.delete('/:id/members/:userID', async (c) => {
  const id = c.req.param('id'), owner = c.get('owner'), target = c.req.param('userID');
  const row = await c.env.DB.prepare(`DELETE FROM group_member WHERE group_id = ?1 AND user_id = ?3
    AND EXISTS (SELECT 1 FROM chat_group WHERE id = ?1 AND owner_id != ?3 AND (owner_id = ?2 OR ?2 = ?3)) RETURNING user_id`)
    .bind(id, owner, target).first();
  return row ? c.body(null, 204) : c.json({ error: 'Cannot remove this member. Owners must delete the group to leave.' }, 403);
});
groups.delete('/:id/agents/:agentID', async (c) => {
  const row = await c.env.DB.prepare(`DELETE FROM group_agent WHERE group_id = ?1 AND agent_id = ?3
    AND (added_by = ?2 OR EXISTS (SELECT 1 FROM chat_group WHERE id = ?1 AND owner_id = ?2)) RETURNING agent_id`)
    .bind(c.req.param('id'), c.get('owner'), c.req.param('agentID')).first();
  return row ? c.body(null, 204) : c.json({ error: 'Cannot remove this contact' }, 403);
});
groups.delete('/:id', async (c) => {
  const row = await c.env.DB.prepare('DELETE FROM chat_group WHERE id = ? AND owner_id = ? RETURNING photo_version AS photoVersion')
    .bind(c.req.param('id'), c.get('owner')).first<{ photoVersion: string | null }>();
  if (row?.photoVersion) c.executionCtx.waitUntil(removePhoto(c.env, groupPhotoKey(c.req.param('id'), row.photoVersion)));
  return row ? c.body(null, 204) : c.json({ error: 'Only the owner can delete this group' }, 403);
});
groups.route('/:id/reactions', reactionRoutes(true));
groups.get('/:id/messages', async (c) => {
  const before = Number(c.req.query('before') ?? Number.MAX_SAFE_INTEGER);
  if (!Number.isSafeInteger(before) || before < 1) return c.json({ error: 'Invalid history cursor' }, 400);
  const { results } = await c.env.DB.prepare(`SELECT ${receiptState('group_message')} AS receiptState, sequence, id, user_id AS userID, agent_id AS agentID,
    sender_name AS senderName, text, created_at AS createdAt, attachment_json AS attachmentJSON, reply_to_id AS replyToID FROM group_message
    WHERE group_id = ? AND sequence < ? ORDER BY sequence DESC LIMIT 51`).bind(c.req.param('id'), before).all<{ sequence: number; attachmentJSON: string | null; replyToID: string | null }>();
  const page = results.slice(0, 50);
  const quotes = await groupQuotes(c.env.DB, c.req.param('id'), page);
  return c.json({ messages: page.reverse().map(({ attachmentJSON, replyToID, ...message }) => ({ ...message,
    attachment: publicAttachment({ attachmentJSON }), replyTo: quotes({ replyToID }) })), nextBefore: results.length > 50 ? page[0].sequence : null });
});
// Aggregate-only refresh for retained history; recheck membership in the query.
groups.get('/:id/receipts', async (c) => {
  let ids: unknown;
  try { ids = JSON.parse(c.req.query('messageIDs') ?? '[]'); } catch { ids = null; }
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100
    || !ids.every((id) => typeof id === 'string' && id.length <= 160)) {
    return c.json({ error: 'Provide up to 100 message IDs' }, 400);
  }
  const { results } = await c.env.DB.prepare(`SELECT gm.id, ${receiptState('gm')} AS receiptState FROM group_message gm
    WHERE gm.group_id = ?1 AND gm.id IN (SELECT value FROM json_each(?2))
    AND EXISTS (SELECT 1 FROM group_member WHERE group_id = ?1 AND user_id = ?3)`)
    .bind(c.req.param('id'), JSON.stringify(ids), c.get('owner')).all();
  return c.json({ receipts: results });
});

// Explicit client acknowledgement; HTTP/APNs acceptance alone does not confirm delivery.
groups.put('/:id/receipts', async (c) => {
  const admission = await admitAuthRequest(c.env.DB, c.get('owner'), 'group-receipt', 120);
  if (!admission.allowed) return c.json({ error: 'Too many receipt updates' }, 429);
  const b = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!Array.isArray(b?.messageIDs) || b.messageIDs.length < 1 || b.messageIDs.length > 100
    || !b.messageIDs.every((id) => typeof id === 'string' && id.length <= 160)
    || !['received', 'read'].includes(String(b.state))) return c.json({ error: 'Provide up to 100 message IDs and received/read state' }, 400);
  await c.env.DB.prepare(`UPDATE group_message_receipt
    SET delivered_at = COALESCE(delivered_at, ?1), read_at = CASE WHEN ?2 = 'read' THEN COALESCE(read_at, ?1) ELSE read_at END
    WHERE recipient_kind = 'user' AND recipient_id = ?3 AND message_id IN (SELECT value FROM json_each(?4))
    AND EXISTS (SELECT 1 FROM group_member WHERE group_id = ?5 AND user_id = ?3)
    AND EXISTS (SELECT 1 FROM group_message gm WHERE gm.id = message_id AND gm.group_id = ?5)`)
    .bind(Date.now(), b.state, c.get('owner'), JSON.stringify(b.messageIDs), c.req.param('id')).run();
  return c.body(null, 204);
});

groups.put('/:id/read', async (c) => {
  const admission = await admitAuthRequest(c.env.DB, c.get('owner'), 'group-read', 120);
  if (!admission.allowed) return c.json({ error: 'Too many read updates' }, 429);
  const b = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (typeof b?.sequence !== 'number' || !Number.isSafeInteger(b.sequence) || b.sequence < 1) {
    return c.json({ error: 'Provide the last displayed message sequence' }, 400);
  }
  const id = c.req.param('id'), owner = c.get('owner');
  const member = await c.env.DB.prepare(`UPDATE group_member SET last_read_sequence = MAX(last_read_sequence,
    COALESCE((SELECT MAX(sequence) FROM group_message WHERE group_id = ?1 AND sequence <= ?3), 0))
    WHERE group_id = ?1 AND user_id = ?2 RETURNING last_read_sequence AS lastReadSequence`)
    .bind(id, owner, b.sequence).first<{ lastReadSequence: number }>();
  if (!member) return c.json({ error: 'Group unavailable' }, 404);
  await c.env.DB.prepare(`DELETE FROM group_push_delivery WHERE group_id = ? AND user_id = ? AND message_id IN (
    SELECT id FROM group_message WHERE group_id = ? AND sequence <= ?)`)
    .bind(id, owner, id, member.lastReadSequence).run();
  const unread = await c.env.DB.prepare(`SELECT COUNT(*) AS count FROM group_message WHERE group_id = ?
    AND sequence > ? AND user_id IS NOT ?`).bind(id, member.lastReadSequence, owner).first<{ count: number }>();
  return c.json({ ...member, unreadCount: unread?.count ?? 0 });
});
groups.post('/:id/messages', async (c) => {
  const id = c.req.param('id'), owner = c.get('owner');
  const b = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (typeof b?.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(b.id)
    || typeof b.text !== 'string' || (!b.text.trim() && b.attachment === undefined) || b.text.includes('\0')
    || Array.from(b.text.trim()).length > 4000 || Object.keys(b).some((key) => !['id','text','attachment','replyToID'].includes(key))) {
    return c.json({ error: 'Use a message up to 4,000 characters or an attachment, with a UUID' }, 400);
  }
  b.id = b.id.toLowerCase();
  const replyToID = parseGroupReply(b.replyToID) ?? null;
  if (b.replyToID !== undefined && !replyToID) return c.json({ error: 'Choose a message from this group to reply to' }, 400);
  const attachment = b.attachment === undefined ? null : await parseAttachment(b.attachment);
  if (b.attachment !== undefined && !attachment) return c.json({ error: 'Choose a JPEG, PNG, GIF, WebP, or PDF up to 5 MB' }, 400);
  const existing = await c.env.DB.prepare('SELECT text, attachment_json AS attachmentJSON, reply_to_id AS replyToID FROM group_message WHERE id = ? AND group_id = ? AND user_id = ?')
    .bind(b.id, id, owner).first<{ text: string; attachmentJSON: string | null; replyToID: string | null }>();
  if (existing) {
    if (existing.text !== b.text.trim() || !sameAttachment(existing, attachment?.metadata) || existing.replyToID !== replyToID) return c.json({ error: 'Message ID already used' }, 409);
    c.executionCtx.waitUntil(dispatchGroup(c.env, id));
    return c.json({ id: b.id });
  }
  // Quotes stay inside this group; membership was checked by the route middleware.
  if (replyToID && !await c.env.DB.prepare('SELECT 1 FROM group_message WHERE id = ? AND group_id = ?').bind(replyToID, id).first()) {
    return c.json({ error: 'The message you are replying to is no longer available' }, 400);
  }
  const now = Date.now();
  const key = attachment ? `group-attachments/${id}/${owner}/${b.id}/${crypto.randomUUID()}` : null;
  const attachmentJSON = attachment && key ? JSON.stringify({ ...attachment.metadata, key }) : null;
  if (attachment && key) {
    await c.env.DB.prepare('INSERT INTO chat_attachment_object (object_key, created_at) VALUES (?, ?)').bind(key, now).run();
    await c.env.CONTACT_PHOTOS.put(key, attachment.bytes, { httpMetadata: { contentType: attachment.metadata.mimeType } });
  }
  // Snapshot the human round. Subsequent bot replies share its bounded exchange.
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO group_message (id, group_id, user_id, sender_name, text, created_at, contributor_consent, attachment_json, exchange_id, requester_id, reply_to_id)
      SELECT ?3, ?1, u.id, u.name, ?4, ?5, m.contributor_consent, ?7, ?3, ?2, ?8 FROM user u JOIN group_member m ON m.user_id = u.id AND m.group_id = ?1
      WHERE u.id = ?2 AND (?6 = 0 OR NOT EXISTS (SELECT 1 FROM group_member WHERE group_id = ?1 AND contributor_consent = 0))
      AND (?8 IS NULL OR EXISTS (SELECT 1 FROM group_message quoted WHERE quoted.id = ?8 AND quoted.group_id = ?1))
      AND (SELECT COUNT(*) FROM group_reply WHERE group_id = ?1 AND status IN ('queued', 'running')) < 64
      ON CONFLICT(id) DO NOTHING`).bind(id, owner, b.id, b.text.trim(), now, contributor(c.env) ? 1 : 0, attachmentJSON, replyToID),
    c.env.DB.prepare(`INSERT INTO group_reply (id, group_id, agent_id, source_id, workflow_id, created_at)
      SELECT 'group-' || gm.id || '-' || ga.agent_id, ga.group_id, ga.agent_id, gm.id,
        'group-' || gm.id || '-' || ga.agent_id || '-1', gm.created_at
      FROM group_message gm JOIN group_agent ga ON ga.group_id = gm.group_id
      WHERE gm.id = ? AND gm.group_id = ? AND gm.user_id = ? AND gm.round_enqueued = 0 ORDER BY ga.joined_at, ga.agent_id
      ON CONFLICT(source_id, agent_id) DO NOTHING`).bind(b.id, id, owner),
    c.env.DB.prepare('UPDATE group_message SET round_enqueued = 1 WHERE id = ? AND group_id = ? AND user_id = ?').bind(b.id, id, owner),
  ]);
  const saved = await c.env.DB.prepare('SELECT id, text, attachment_json AS attachmentJSON, reply_to_id AS replyToID FROM group_message WHERE id = ? AND group_id = ? AND user_id = ?')
    .bind(b.id, id, owner).first<{ id: string; text: string; attachmentJSON: string | null; replyToID: string | null }>();
  if (!saved || saved.text !== b.text.trim() || !sameAttachment(saved, attachment?.metadata) || saved.replyToID !== replyToID) return c.json({ error: 'The group queue is full or model consent is required' }, 409);
  c.executionCtx.waitUntil(dispatchGroup(c.env, id));
  c.executionCtx.waitUntil(deliverGroupPush(c.env, saved.id));
  return c.json({ id: saved.id }, 202);
});
groups.post('/:id/replies/:replyID/retry', async (c) => {
  const id = c.req.param('id'), replyID = c.req.param('replyID');
  const result = await c.env.DB.prepare(`UPDATE group_reply SET status = 'queued', attempt = attempt + 1,
    workflow_id = id || '-' || (attempt + 1) WHERE id = ? AND group_id = ? AND status = 'failed'
    AND ${groupSourceAccess('group_reply', contributor(c.env))}
    AND NOT EXISTS (SELECT 1 FROM group_message later WHERE later.group_id = group_reply.group_id
      AND later.agent_id = group_reply.agent_id AND later.sequence > (SELECT sequence FROM group_message WHERE id = group_reply.source_id))
    AND NOT EXISTS (SELECT 1 FROM agent_attention WHERE turn_id = group_reply.id)
    AND NOT EXISTS (SELECT 1 FROM group_reply other WHERE other.group_id = group_reply.group_id AND other.status IN ('queued','running'))`)
    .bind(replyID, id).run();
  if (!result.meta.changes) return c.json({ error: 'This reply is no longer available to retry. Refresh the conversation.' }, 409);
  c.executionCtx.waitUntil(dispatchGroup(c.env, id));
  return c.body(null, 204);
});
groups.get('/:id/photos/:kind/:memberID', async (c) => {
  const id = c.req.param('id'), memberID = c.req.param('memberID');
  if (c.req.param('kind') === 'agent') {
    const row = await c.env.DB.prepare(`SELECT a.owner_id AS owner, a.photo_version AS version FROM group_agent ga
      JOIN contact_agent a ON a.id = ga.agent_id WHERE ga.group_id = ? AND ga.agent_id = ?`).bind(id, memberID)
      .first<{ owner: string; version: string | null }>();
    return row?.version ? photoResponse(c.env, row.owner, memberID, row.version) : c.body(null, 404);
  }
  if (c.req.param('kind') !== 'user') return c.body(null, 404);
  const row = await c.env.DB.prepare(`SELECT u.photo_version AS version FROM group_member m JOIN user u ON u.id = m.user_id
    WHERE m.group_id = ? AND m.user_id = ?`).bind(id, memberID).first<{ version: string | null }>();
  if (!row?.version) return c.body(null, 404);
  const photo = await c.env.CONTACT_PHOTOS.get(`users/${memberID}/${row.version}.jpg`);
  return photo ? new Response(photo.body, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } }) : c.body(null, 404);
});
groups.route('/:id/tasks', taskRoutes('group'));
groups.route('/:id/documents', documentRoutes('group'));
groups.route('/:id', media);
export default groups;
