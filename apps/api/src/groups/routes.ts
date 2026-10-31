import { agentDisplayName } from '../contacts/alias';
import { plainMessageMarkdown } from '../../../../shared/messageMarkdown';
import { replyActivityLabel, type ReplyActivityEntry } from '../../../../shared/activity';
import { learningRoutes } from '../chat/learning-routes';
import { accountEnvironment } from '../lib/model-preference';
import { reactionRoutes } from '../reactions/routes';
import { groupQuotes, parseGroupReply } from '../replies/data';
import { receiptState } from './receipts';
import { deliverGroupPush } from './push';
import media from './media';
import { taskRoutes } from '../tasks/routes';
import { documentRoutes } from '../documents/routes';
import { parseAttachment, sameAttachment, publicAttachment, publicMetadata, storedAttachment, type Attachment } from '../chat/attachments';
import { registerChatObject, discardChatObject } from '../chat/object-storage';
import { isVoice, parseVoice, publicVoice } from '../voice/speech';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { readBearerSession } from '../lib/session';
import { admitAuthRequest } from '../lib/auth-rate-limit';
import { photoResponse } from '../photos/storage';
import { dispatchGroup } from './workflow';
import { groupSourceAccess } from './request-access';
import { miniAppRoutes } from '../miniapps/routes';
import { agentJoinStatements, userJoinStatements } from './membership';
import { eventTextColumn, parseMembershipEvent, userHistoryStart } from './history-access';

import { clearGroup, cleanResources, cleanupPending } from '../chat/cleanup';

const groups = new Hono<{ Bindings: Env; Variables: { owner: string } }>();
const contributor = (env: Env) => env.META_CHAT_MODEL.includes('contributor');
const accepted = (b: Record<string, unknown> | null, env: Env) => b?.shareMemory === true && (!contributor(env) || b.contributorConsent === true);
const validName = (v: unknown) => typeof v === 'string' && v.trim().length > 0 && Array.from(v.trim()).length <= 100 && !/[\u0000-\u001f\u007f-\u009f]/u.test(v);
function membershipEvent(json: string) {
  const event = parseMembershipEvent(json);
  return event ? { kind: event.kind, memberKind: event.memberKind, memberID: event.memberID, actorID: event.actorID,
    invitedByID: event.invitedByID ?? null, includesHistory: event.includesHistory } : null;
}
const membership = (db: D1Database, id: string, user: string) => db.prepare(`SELECT m.can_invite AS canInvite,
  g.owner_id AS ownerID FROM group_member m JOIN chat_group g ON g.id = m.group_id
  WHERE m.group_id = ? AND m.user_id = ?`).bind(id, user).first<{ canInvite: number; ownerID: string }>();
const mayInvite = `EXISTS (SELECT 1 FROM group_member m JOIN chat_group g ON g.id = m.group_id
  WHERE m.group_id = ?1 AND m.user_id = ?2 AND (m.can_invite = 1 OR g.owner_id = ?2))`;
type GroupSummary = Record<string, unknown> & { lastMessageText: string | null; lastMessageUserID: string | null };
function groupPreview(row: GroupSummary) {
  const source = row.lastMessageText;
  const { lastMessageVoiceJSON, replyActivityJSON, ...fields } = row;
  return { ...fields, lastMessageVoice: typeof lastMessageVoiceJSON === 'string' ? JSON.parse(lastMessageVoiceJSON) : null,
    replyActivity: replyActivityLabel(typeof replyActivityJSON === 'string' ? JSON.parse(replyActivityJSON) as ReplyActivityEntry[] : []),
    lastMessagePreview: source == null ? null : [...(row.lastMessageUserID == null ? plainMessageMarkdown(source) : source)].slice(0, 500).join('') };
}
// Task work triggers (task_id set, no sender) are internal: the assignee's own reply is
// the visible event, so they never count as unread, preview or history. Membership
// notices (event_json) appear in history only: no unread count, preview or push.
const summary = `
  (SELECT CASE WHEN json_extract(gm.attachment_json, '$.mimeType') LIKE 'audio/%' THEN
    json_object('durationMs', json_extract(gm.attachment_json, '$.durationMs'), 'listenedAt', gm.voice_listened_at,
      'ownListenedAt', (SELECT listened_at FROM group_voice_playback WHERE message_id = gm.id AND user_id = m.user_id), 'transcript', NULL) END
    FROM group_message gm WHERE gm.group_id = g.id AND gm.task_id IS NULL AND gm.event_json IS NULL ORDER BY gm.sequence DESC LIMIT 1) AS lastMessageVoiceJSON,
g.history_revision AS historyRevision,g.clearing,m.archived_at AS archivedAt, (SELECT json_group_array(json_object('name', name, 'activity', activity)) FROM (
    SELECT ${agentDisplayName('a.id', 'a.name', 'm.user_id')} AS name, CASE WHEN p.researching_until > unixepoch('subsec') * 1000 THEN 'researching'
      WHEN p.recording_until > unixepoch('subsec') * 1000 THEN 'recording' ELSE 'typing' END AS activity
    FROM group_reply r JOIN agent_attention attention ON attention.turn_id = r.id AND attention.attempt = r.attempt AND attention.agent_id = r.agent_id
    JOIN agent_presence p ON p.agent_id = r.agent_id JOIN contact_agent a ON a.id = r.agent_id
    WHERE r.group_id = g.id AND r.status = 'running' AND p.expires_at > unixepoch('subsec') * 1000
      AND (p.status = 'typing' OR p.researching_until > unixepoch('subsec') * 1000)
    ORDER BY r.sequence LIMIT 50)) AS replyActivityJSON,
  m.last_read_sequence AS lastReadSequence,
  (SELECT COUNT(*) FROM group_message gm WHERE gm.group_id = g.id AND gm.sequence > m.last_read_sequence
    AND gm.user_id IS NOT m.user_id AND gm.task_id IS NULL AND gm.event_json IS NULL) AS unreadCount, g.id, g.name, g.owner_id AS ownerID,
  (SELECT id FROM group_message WHERE group_id = g.id AND task_id IS NULL AND event_json IS NULL ORDER BY sequence DESC LIMIT 1) AS lastMessageID,
  (SELECT user_id FROM group_message WHERE group_id = g.id AND task_id IS NULL AND event_json IS NULL ORDER BY sequence DESC LIMIT 1) AS lastMessageUserID,
  (SELECT ${receiptState('gm')} FROM group_message gm WHERE gm.group_id = g.id AND gm.task_id IS NULL AND gm.event_json IS NULL ORDER BY gm.sequence DESC LIMIT 1) AS lastMessageReceiptState, g.created_at AS createdAt, g.photo_version AS photoVersion,
  (SELECT CASE WHEN json_extract(attachment_json, '$.mimeType') LIKE 'audio/%' THEN 'Voice message' WHEN text = '' AND attachments_json IS NOT NULL THEN json_array_length(attachments_json) || ' photos' WHEN text = '' AND attachment_json IS NOT NULL THEN 'Attachment: ' || json_extract(attachment_json, '$.name') ELSE text END FROM group_message WHERE group_id = g.id AND task_id IS NULL AND event_json IS NULL ORDER BY sequence DESC LIMIT 1) AS lastMessageText,
  (SELECT created_at FROM group_message WHERE group_id = g.id AND task_id IS NULL AND event_json IS NULL ORDER BY sequence DESC LIMIT 1) AS lastMessageAt,
  (SELECT ${agentDisplayName('lm.agent_id', 'lm.sender_name', 'm.user_id')} FROM group_message lm WHERE lm.group_id = g.id AND lm.task_id IS NULL AND lm.event_json IS NULL ORDER BY lm.sequence DESC LIMIT 1) AS lastMessageSenderName,
  COALESCE((SELECT created_at FROM group_message WHERE group_id = g.id AND task_id IS NULL AND event_json IS NULL ORDER BY sequence DESC LIMIT 1), g.created_at) AS updatedAt`;

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
    g.name AS groupName, ${agentDisplayName('gm.agent_id', 'gm.sender_name', 'm.user_id')} AS senderName, gm.agent_id AS agentID, gm.created_at AS sentAt,
    CASE WHEN json_extract(gm.attachment_json, '$.mimeType') LIKE 'audio/%' THEN 'Voice message' WHEN gm.text = '' AND gm.attachments_json IS NOT NULL THEN json_array_length(gm.attachments_json) || ' photos' WHEN gm.text = '' AND gm.attachment_json IS NOT NULL THEN 'Attachment: ' || json_extract(gm.attachment_json, '$.name') ELSE gm.text END AS text
    FROM group_message gm JOIN group_member m ON m.group_id = gm.group_id JOIN chat_group g ON g.id = gm.group_id
    WHERE m.user_id = ? AND gm.sequence > m.last_read_sequence AND gm.user_id IS NOT m.user_id AND gm.task_id IS NULL AND gm.event_json IS NULL
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
  const { results } = await c.env.DB.prepare(`SELECT i.id, g.name AS groupName, u.name AS senderName, i.expires_at AS expiresAt, (i.include_history = 1) AS includeHistory
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
  const invite = await c.env.DB.prepare(`SELECT group_id AS id, sender_id AS senderID FROM group_invite WHERE id = ? AND recipient_id = ? AND expires_at > ?`)
    .bind(inviteID, owner, now).first<{ id: string; senderID: string }>();
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
    // The notice and history floor read the invitation, so they run before it is deleted.
    ...userJoinStatements(c.env.DB, { groupID: invite.id, userID: owner, inviterID: invite.senderID, inviteID, now }),
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
    m.can_invite AS canInvite, NULL AS addedBy, (m.history_start IS NULL) AS includesHistory FROM group_member m JOIN user u ON u.id = m.user_id WHERE m.group_id = ?1
    UNION ALL SELECT a.id, 'agent', ${agentDisplayName('a.id', 'a.name', '?2')}, a.photo_version, 0, ga.added_by, (ga.history_start IS NULL) FROM group_agent ga
    JOIN contact_agent a ON a.id = ga.agent_id WHERE ga.group_id = ?1`).bind(id, owner).all();
  const { results: replies } = await c.env.DB.prepare(`SELECT r.id, r.agent_id AS agentID, ${agentDisplayName('a.id', 'a.name', '?3')} AS name, r.status,
    r.source_id AS sourceID, source.sequence AS sourceSequence, r.attempt,
    source.task_id AS taskID, (SELECT title FROM task WHERE id = source.task_id) AS taskTitle,
    EXISTS (SELECT 1 FROM agent_attention attention JOIN agent_presence presence ON presence.agent_id = attention.agent_id
      WHERE attention.agent_id = r.agent_id AND attention.turn_id = r.id AND attention.attempt = r.attempt
        AND r.status = 'running' AND presence.expires_at > ?2
        AND (presence.status = 'typing' OR presence.researching_until > ?2)) AS isTyping,
    (SELECT CASE WHEN p.researching_until > ?2 THEN 'researching' WHEN p.recording_until > ?2 THEN 'recording' ELSE 'typing' END
      FROM agent_presence p WHERE p.agent_id = r.agent_id) AS replyActivity
    FROM group_reply r
    JOIN group_message source ON source.id = r.source_id
    JOIN contact_agent a ON a.id = r.agent_id WHERE r.group_id = ?1 AND r.status IN ('queued', 'running', 'failed')
    AND (r.status != 'failed' OR NOT EXISTS (SELECT 1 FROM group_message later
      WHERE later.group_id = r.group_id AND later.agent_id = r.agent_id AND later.sequence > source.sequence))
    ORDER BY (r.status = 'failed'), r.sequence DESC LIMIT 80`).bind(id, Date.now(), owner).all();
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
  if (b.includeHistory !== undefined && typeof b.includeHistory !== 'boolean') return c.json({ error: 'includeHistory must be a boolean' }, 400);
  const agent = await c.env.DB.prepare(`SELECT a.id FROM contact c JOIN contact_agent a ON a.id = c.agent_id
    WHERE c.id = ? AND c.user_id = ? AND a.owner_id = ?`).bind(b.contactID, owner, owner).first<{ id: string }>();
  if (!agent) return c.json({ error: 'Only the contact creator can add it to a group' }, 403);
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO group_agent (group_id, agent_id, added_by, joined_at)
      SELECT ?1, ?3, ?2, ?4 WHERE ${mayInvite} AND (SELECT COUNT(*) FROM group_agent WHERE group_id = ?1) < 8
      ON CONFLICT(group_id, agent_id) DO NOTHING`).bind(id, owner, agent.id, now),
    ...agentJoinStatements(c.env.DB, { groupID: id, agentID: agent.id, actorID: owner, now, includeHistory: b.includeHistory !== false }),
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
  if (b.includeHistory !== undefined && typeof b.includeHistory !== 'boolean') return c.json({ error: 'includeHistory must be a boolean' }, 400);
  const recipient = await c.env.DB.prepare('SELECT id FROM user WHERE email = ? COLLATE NOCASE')
    .bind(b.email.trim()).first<{ id: string }>();
  if (!recipient) return c.json({ error: 'No existing account uses this email' }, 404);
  if (await membership(c.env.DB, id, recipient.id)) return c.json({ error: 'This user is already a member' }, 409);
  const result = await c.env.DB.prepare(`INSERT INTO group_invite (id, group_id, sender_id, recipient_id, expires_at, include_history)
    SELECT ?3, ?1, ?2, ?4, ?5, ?7 WHERE ${mayInvite}
    AND (SELECT COUNT(*) FROM group_invite WHERE group_id = ?1 AND expires_at > ?6) < 20
    ON CONFLICT(group_id, recipient_id) DO UPDATE SET sender_id = excluded.sender_id, expires_at = excluded.expires_at,
      include_history = excluded.include_history
    RETURNING id`).bind(id, owner, crypto.randomUUID(), recipient.id, Date.now() + 86_400_000, Date.now(), b.includeHistory === false ? 0 : 1).first();
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
groups.post('/:id/clear', bodyLimit({maxSize:1024}), async c => {
  const body=await c.req.json<Record<string,unknown>>().catch(()=>null);
  if (!body || Object.keys(body).sort().join(',')!=='clearMemory,historyRevision' || (typeof body.clearMemory!=='boolean' || typeof body.historyRevision!=='number' || !Number.isSafeInteger(body.historyRevision) || body.historyRevision<0)) return c.json({error:'Choose whether to clear memory'},400);
  const group=await c.env.DB.prepare('SELECT id,clearing,history_revision AS revision FROM chat_group WHERE id=? AND owner_id=?').bind(c.req.param('id'),c.get('owner')).first<{id:string;clearing:number;revision:number}>();
  if (!group) return c.json({error:'Only the owner can clear this group for everyone'},403);
  if (group.revision>body.historyRevision) {
    const pending=await cleanupPending(c.env.DB,group.id);
    return c.json({cleared:true,cleanup:pending?'pending':'complete'},202);
  }
  if (group.revision!==body.historyRevision) return c.json({error:'Refresh before clearing this chat'},409);
  const admission=await admitAuthRequest(c.env.DB,c.get('owner'),'chat-clear',6);
  if (!admission.allowed) return c.json({error:'Too many clear requests. Please wait a minute.'},429);
  try { if (!group.clearing) await clearGroup(c.env,group.id,body.clearMemory,body.historyRevision); }
  catch (error) {
    const latest=await c.env.DB.prepare('SELECT history_revision AS revision FROM chat_group WHERE id=?').bind(group.id).first<{revision:number}>();
    if (!latest || latest.revision<=body.historyRevision) throw error;
  }
  c.executionCtx.waitUntil(cleanResources(c.env,group.id));
  const pending=await cleanupPending(c.env.DB,group.id);
  return c.json({cleared:true,cleanup:pending ? 'pending' : 'complete'},202);
});
groups.put('/:id/archive', bodyLimit({maxSize:1024}), async c => {
  const body = await c.req.json<Record<string,unknown>>().catch(()=>null);
  if (!body || Object.keys(body).join(',') !== 'archived' || typeof body.archived !== 'boolean') return c.json({error:'Provide archived as a boolean'},400);
  const row = await c.env.DB.prepare('UPDATE group_member SET archived_at=? WHERE group_id=? AND user_id=? RETURNING group_id')
    .bind(body.archived ? Date.now() : null,c.req.param('id'),c.get('owner')).first();
  return row ? c.body(null,204) : c.json({error:'Group not found'},404);
});
groups.delete('/:id', async (c) => {
  const row = await c.env.DB.prepare('DELETE FROM chat_group WHERE id = ? AND owner_id = ? RETURNING photo_version AS photoVersion')
    .bind(c.req.param('id'), c.get('owner')).first<{ photoVersion: string | null }>();
  if (row) c.executionCtx.waitUntil(cleanResources(c.env));
  return row ? c.body(null, 204) : c.json({ error: 'Only the owner can delete this group' }, 403);
});
groups.route('/:id/reactions', reactionRoutes(true));
groups.get('/:id/messages', async (c) => {
  const epoch=await c.env.DB.prepare('SELECT history_revision AS value FROM chat_group WHERE id=?').bind(c.req.param('id')).first<{value:number}>();
  const before = Number(c.req.query('before') ?? Number.MAX_SAFE_INTEGER);
  if (!Number.isSafeInteger(before) || before < 1) return c.json({ error: 'Invalid history cursor' }, 400);
  const { results } = await c.env.DB.prepare(`SELECT ${receiptState('group_message')} AS receiptState, sequence, id, user_id AS userID, agent_id AS agentID,
    ${agentDisplayName('group_message.agent_id', 'group_message.sender_name', '?3')} AS senderName, text, created_at AS createdAt, attachment_json AS attachmentJSON, attachments_json AS attachmentsJSON, reply_to_id AS replyToID,
    (SELECT listened_at FROM group_voice_playback WHERE message_id = group_message.id AND user_id = ?3) AS ownListenedAt,
    voice_listened_at AS voiceListenedAt, voice_transcribed_at AS voiceTranscribedAt, event_json AS eventJSON,
    ${eventTextColumn('group_message', '?3')} AS eventText FROM group_message
    WHERE group_id = ?1 AND sequence < ?2 AND task_id IS NULL AND sequence >= ${userHistoryStart('?1', '?3')}
    ORDER BY sequence DESC LIMIT 51`).bind(c.req.param('id'), before, c.get('owner'))
    .all<{ ownListenedAt: number | null; sequence: number; attachmentJSON: string | null; attachmentsJSON: string | null; replyToID: string | null; text: string; agentID: string | null; voiceListenedAt: number | null; voiceTranscribedAt: number | null; eventJSON: string | null; eventText: string | null }>();
  const page = results.slice(0, 50);
  // A member without past history still sees what a reply quotes (the replier chose to
  // surface it), flagged beforeJoin so clients neither scroll to nor download it.
  const historyStart = (await c.env.DB.prepare(`SELECT ${userHistoryStart('?1', '?2')} AS value`).bind(c.req.param('id'), c.get('owner')).first<{ value: number }>())?.value ?? 0;
  const quotes = await groupQuotes(c.env.DB, c.req.param('id'), c.get('owner'), page, historyStart);
  const current=await c.env.DB.prepare('SELECT history_revision AS value FROM chat_group WHERE id=?').bind(c.req.param('id')).first<{value:number}>();
  if (!epoch || epoch.value!==current?.value) return c.json({error:'Group was cleared. Refresh history.'},409);
  return c.json({ historyRevision:epoch.value, historyStart: historyStart || null, messages: page.reverse().map(({ attachmentJSON, attachmentsJSON, replyToID, voiceListenedAt, voiceTranscribedAt, ownListenedAt, eventJSON, eventText, ...message }) => {
    // Membership notices render as centered banners with viewer-resolved names.
    if (eventJSON) return { ...message, text: eventText ?? message.text, event: membershipEvent(eventJSON), attachment: null, attachments: null, voice: null, replyTo: null };
    // Contacts' voice messages keep their spoken text; people's transcripts stay behind long press.
    const voice = publicVoice(storedAttachment({ attachmentJSON }), message.agentID ? null : voiceListenedAt,
      message.agentID ? message.text : voiceTranscribedAt ? message.text : null);
    return { ...message, text: voice && !message.agentID ? '' : message.text,
      attachment: voice ? null : publicAttachment({ attachmentJSON }),
      // Contact-generated album: every image in order, including the first.
      attachments: !voice && attachmentsJSON ? (JSON.parse(attachmentsJSON) as Attachment[]).map(publicMetadata) : null, voice: voice ? { ...voice, ownListenedAt } : null, replyTo: quotes({ replyToID }), event: null };
  }), nextBefore: results.length > 50 ? page[0].sequence : null });
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

// A message's immutable recipient snapshot, visible only to current group members.
groups.get('/:id/message-info', async c => {
  const groupID = c.req.param('id'), messageID = c.req.query('messageID'), owner = c.get('owner');
  if (!messageID || messageID.length > 160) return c.json({ error: 'Provide a message ID' }, 400);
  const message = await c.env.DB.prepare(`SELECT gm.receipts_tracked AS tracked FROM group_message gm
    WHERE gm.group_id = ?1 AND gm.id = ?2 AND gm.task_id IS NULL
      AND EXISTS (SELECT 1 FROM group_member WHERE group_id = ?1 AND user_id = ?3)`)
    .bind(groupID, messageID, owner).first<{ tracked: number }>();
  if (!message) return c.json({ error: 'Message unavailable' }, 404);
  const { results } = await c.env.DB.prepare(`SELECT r.recipient_kind AS kind, r.recipient_id AS id,
    COALESCE(u.name, ${agentDisplayName('a.id', 'a.name', '?3')}, 'Former member') AS name, r.delivered_at AS deliveredAt, r.read_at AS readAt
    FROM group_message_receipt r JOIN group_message gm ON gm.id = r.message_id
    LEFT JOIN user u ON r.recipient_kind = 'user' AND u.id = r.recipient_id
    LEFT JOIN contact_agent a ON r.recipient_kind = 'agent' AND a.id = r.recipient_id
    WHERE gm.group_id = ?1 AND r.message_id = ?2
      AND EXISTS (SELECT 1 FROM group_member WHERE group_id = ?1 AND user_id = ?3)
    ORDER BY (r.read_at IS NULL), r.read_at, r.recipient_kind, r.recipient_id`)
    .bind(groupID, messageID, owner).all();
  // Membership/history can be revoked between reads; never return a stale snapshot.
  if (!await c.env.DB.prepare(`SELECT 1 FROM group_message gm JOIN group_member member ON member.group_id = gm.group_id
    WHERE gm.group_id = ?1 AND gm.id = ?2 AND member.user_id = ?3`).bind(groupID, messageID, owner).first()) {
    return c.json({ error: 'Message unavailable' }, 404);
  }
  c.header('Cache-Control', 'private, no-store');
  return c.json({ tracked: message.tracked === 1, recipients: results });
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
    AND sequence > ? AND user_id IS NOT ? AND task_id IS NULL AND event_json IS NULL`).bind(id, member.lastReadSequence, owner).first<{ count: number }>();
  return c.json({ ...member, unreadCount: unread?.count ?? 0 });
});
groups.post('/:id/messages', async (c) => {
  const id = c.req.param('id'), owner = c.get('owner');
  const b = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (typeof b?.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(b.id)
    || typeof b.text !== 'string' || (!b.text.trim() && b.attachment === undefined && b.voice === undefined) || b.text.includes('\0')
    || Array.from(b.text.trim()).length > 4000 || Object.keys(b).some((key) => !['id','text','attachment','voice','replyToID','historyRevision'].includes(key))
    || (b.voice !== undefined && (b.text.trim() || b.attachment !== undefined))) {
    return c.json({ error: 'Use a message up to 4,000 characters, an attachment or a voice message, with a UUID' }, 400);
  }
  const epoch=await c.env.DB.prepare('SELECT history_revision AS revision,clearing FROM chat_group WHERE id=?').bind(id).first<{revision:number;clearing:number}>();
  if (!epoch || epoch.clearing || (b.historyRevision??0)!==epoch.revision) return c.json({error:'Group was cleared. Refresh before sending a new message.'},409);
  b.id = b.id.toLowerCase();
  const replyToID = parseGroupReply(b.replyToID) ?? null;
  if (b.replyToID !== undefined && !replyToID) return c.json({ error: 'Choose a message from this group to reply to' }, 400);
  const attachment = b.voice !== undefined ? await parseVoice(b.voice)
    : b.attachment === undefined ? null : await parseAttachment(b.attachment);
  if (b.voice !== undefined && !attachment) return c.json({ error: 'Use a mono 16-bit 16 kHz WAV lasting 0.25–60 seconds' }, 400);
  if (b.attachment !== undefined && !attachment) return c.json({ error: 'Choose a JPEG, PNG, GIF, WebP, or PDF up to 5 MB' }, 400);
  // A transcribed voice message has text; the audio digest alone identifies the send.
  const sameText = (saved: { text: string; attachmentJSON: string | null }) => saved.text === (b.text as string).trim()
    || (b.voice !== undefined && isVoice(storedAttachment(saved)));
  const existing = await c.env.DB.prepare('SELECT text, attachment_json AS attachmentJSON, reply_to_id AS replyToID FROM group_message WHERE id = ? AND group_id = ? AND user_id = ?')
    .bind(b.id, id, owner).first<{ text: string; attachmentJSON: string | null; replyToID: string | null }>();
  if (existing) {
    if (!sameText(existing) || !sameAttachment(existing, attachment?.metadata) || existing.replyToID !== replyToID) return c.json({ error: 'Message ID already used' }, 409);
    c.executionCtx.waitUntil(dispatchGroup(c.env, id));
    return c.json({ id: b.id });
  }
  // Quotes stay inside this group; membership was checked by the route middleware.
  if (replyToID && !await c.env.DB.prepare(`SELECT 1 FROM group_message WHERE id = ?1 AND group_id = ?2 AND event_json IS NULL
    AND sequence >= ${userHistoryStart('?2', '?3')}`).bind(replyToID, id, owner).first()) {
    return c.json({ error: 'The message you are replying to is no longer available' }, 400);
  }
  const now = Date.now();
  const key = attachment ? `group-attachments/${id}/${owner}/${b.id}/${crypto.randomUUID()}` : null;
  const attachmentJSON = attachment && key ? JSON.stringify({ ...attachment.metadata, key }) : null;
  if (attachment && key) {
    await registerChatObject(c.env,key,id);
    await c.env.CONTACT_PHOTOS.put(key, attachment.bytes, { httpMetadata: { contentType: attachment.metadata.mimeType } });
  }
  // Snapshot the human round. Subsequent bot replies share its bounded exchange.
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO group_message (id, group_id, user_id, sender_name, text, created_at, contributor_consent, attachment_json, exchange_id, requester_id, reply_to_id)
      SELECT ?3, ?1, u.id, u.name, ?4, ?5, m.contributor_consent, ?7, ?3, ?2, ?8 FROM user u JOIN group_member m ON m.user_id = u.id AND m.group_id = ?1
      WHERE u.id = ?2 AND EXISTS(SELECT 1 FROM chat_group WHERE id=?1 AND history_revision=?9 AND clearing=0) AND (?6 = 0 OR NOT EXISTS (SELECT 1 FROM group_member WHERE group_id = ?1 AND contributor_consent = 0))
      AND (?8 IS NULL OR EXISTS (SELECT 1 FROM group_message quoted WHERE quoted.id = ?8 AND quoted.group_id = ?1))
      AND (SELECT COUNT(*) FROM group_reply WHERE group_id = ?1 AND status IN ('queued', 'running')) < 64
      ON CONFLICT(id) DO NOTHING`).bind(id, owner, b.id, b.text.trim(), now, contributor(c.env) ? 1 : 0, attachmentJSON, replyToID,epoch.revision),
    c.env.DB.prepare(`INSERT INTO group_reply (id, group_id, agent_id, source_id, workflow_id, created_at)
      SELECT 'group-' || gm.id || '-' || ga.agent_id, ga.group_id, ga.agent_id, gm.id,
        'group-' || gm.id || '-' || ga.agent_id || '-1', gm.created_at
      FROM group_message gm JOIN group_agent ga ON ga.group_id = gm.group_id
      WHERE gm.id = ? AND gm.group_id = ? AND gm.user_id = ? AND gm.round_enqueued = 0 ORDER BY ga.joined_at, ga.agent_id
      ON CONFLICT(source_id, agent_id) DO NOTHING`).bind(b.id, id, owner),
    c.env.DB.prepare('UPDATE group_message SET round_enqueued = 1 WHERE id = ? AND group_id = ? AND user_id = ?').bind(b.id, id, owner),
    // A new human message supersedes reply slots that have not started yet:
    // the new round sees that history (earlier unanswered human messages are
    // folded into it), so nobody answers stale messages minutes later.
    // Directed requests and task notices keep their designated responders.
    c.env.DB.prepare(`UPDATE group_reply SET status = 'complete' WHERE group_id = ?1 AND status = 'queued'
      AND source_id IN (SELECT old.id FROM group_message old WHERE old.group_id = ?1 AND old.request_id IS NULL
        AND old.task_id IS NULL AND old.sequence < (SELECT sequence FROM group_message WHERE id = ?2 AND group_id = ?1 AND user_id = ?3))`)
      .bind(id, b.id, owner),
  ]);
  const saved = await c.env.DB.prepare('SELECT id, text, attachment_json AS attachmentJSON, reply_to_id AS replyToID FROM group_message WHERE id = ? AND group_id = ? AND user_id = ?')
    .bind(b.id, id, owner).first<{ id: string; text: string; attachmentJSON: string | null; replyToID: string | null }>();
  if (!saved && key) await discardChatObject(c.env,key,id);
  if (!saved || !sameText(saved) || !sameAttachment(saved, attachment?.metadata) || saved.replyToID !== replyToID) return c.json({ error: 'The group queue is full or model consent is required' }, 409);
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
groups.route('/:id/learning', learningRoutes('group'));
groups.route('/:id/mini-apps', miniAppRoutes('group'));
groups.route('/:id', media);
export default groups;
