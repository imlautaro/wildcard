import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { admitAuthRequest } from '../lib/auth-rate-limit';
import { terminateChats } from '../chat/dispatch';

const sharing = new Hono<{ Bindings: Env; Variables: { owner: string } }>();
sharing.use('*', bodyLimit({ maxSize: 2048, onError: (c) => c.json({ error: 'Request body too large' }, 413) }));
sharing.use('*', async (c, next) => {
  const admission = await admitAuthRequest(c.env.DB, c.get('owner'), 'contact-sharing', 40);
  if (!admission.allowed) return c.json({ error: 'Too many sharing requests' }, 429);
  await next();
});

const consent = (body: Record<string, unknown> | null, contributor: boolean) =>
  body?.shareMemory === true && (!contributor || body.contributorConsent === true);
const contributorModel = (env: Env) => env.META_CHAT_MODEL.includes('contributor');
const ownerAgent = (db: D1Database, id: string, owner: string) => db.prepare(`SELECT a.id FROM contact_agent a
  JOIN contact c ON c.agent_id = a.id WHERE c.id = ? AND c.user_id = ? AND a.owner_id = c.user_id`)
  .bind(id, owner).first<{ id: string }>();

// Invitation capabilities travel in request bodies, not URLs or access logs.
async function tokenHash(value: unknown): Promise<string | null> {
  if (typeof value !== 'string' || !/^[a-f0-9-]{36}$/i.test(value)) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value.toLowerCase()));
  return Buffer.from(digest).toString('hex');
}

sharing.post('/preview', async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  const hash = await tokenHash(body?.code);
  if (!hash) return c.json({ error: 'Invalid invitation code' }, 400);
  const invite = await c.env.DB.prepare(`SELECT a.name, i.expires_at AS expiresAt FROM contact_invite i
    JOIN contact_agent a ON a.id = i.agent_id WHERE i.token = ? AND i.expires_at > ? AND i.accepted_by IS NULL
      AND (i.recipient_id IS NULL OR i.recipient_id = ?)`)
    .bind(hash, Date.now(), c.get('owner')).first<{ name: string; expiresAt: number }>();
  return invite ? c.json({ ...invite, contributorModel: contributorModel(c.env) })
    : c.json({ error: 'Invitation expired, revoked, or already used' }, 404);
});

sharing.post('/accept', async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  const directed = body?.invitationID !== undefined;
  const hash = directed
    ? (typeof body.invitationID === 'string' && /^[a-f0-9]{64}$/.test(body.invitationID) && body.code === undefined ? body.invitationID : null)
    : await tokenHash(body?.code);
  if (!hash || !consent(body, contributorModel(c.env))) {
    return c.json({ error: 'Accept shared memory and, when applicable, Contributor model data use' }, 400);
  }
  const owner = c.get('owner');
  const now = Date.now();
  // Membership and one-use consumption commit together. Concurrent recipients
  // cannot consume the same capability, and retries by its recipient are safe.
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO contact (id, agent_id, user_id, name, photo_version, created_at, updated_at, contributor_consent)
      SELECT ?1, a.id, ?2, a.name, a.photo_version, ?3, ?3, ?5
      FROM contact_invite i JOIN contact_agent a ON a.id = i.agent_id
      WHERE i.token = ?4 AND i.expires_at > ?3 AND i.accepted_by IS NULL AND a.memory_shared = 1
        AND (i.recipient_id IS NULL OR i.recipient_id = ?2) AND (?6 = 0 OR i.recipient_id = ?2)
        AND ((SELECT COUNT(*) FROM contact WHERE agent_id = a.id) < 4
          OR EXISTS (SELECT 1 FROM contact WHERE agent_id = a.id AND user_id = ?2))
      ON CONFLICT(agent_id, user_id) DO UPDATE SET contributor_consent = MAX(contact.contributor_consent, excluded.contributor_consent)`)
      .bind(crypto.randomUUID(), owner, now, hash, body?.contributorConsent === true ? 1 : 0, directed ? 1 : 0),
    c.env.DB.prepare(`UPDATE contact_invite SET accepted_by = ?1, contributor_consent = ?4
      WHERE token = ?2 AND accepted_by IS NULL AND expires_at > ?3
      AND (recipient_id IS NULL OR recipient_id = ?1) AND (?5 = 0 OR recipient_id = ?1)
      AND EXISTS (SELECT 1 FROM contact WHERE agent_id = contact_invite.agent_id AND user_id = ?1)`)
      .bind(owner, hash, now, body?.contributorConsent === true ? 1 : 0, directed ? 1 : 0),
  ]);
  const member = await c.env.DB.prepare(`SELECT c.id AS contactID FROM contact c JOIN contact_invite i ON i.agent_id = c.agent_id
    WHERE i.token = ?1 AND i.accepted_by = ?2 AND c.user_id = ?2
      AND (i.recipient_id IS NULL OR i.recipient_id = ?2) AND (?3 = 0 OR i.recipient_id = ?2)`)
    .bind(hash, owner, directed ? 1 : 0).first<{ contactID: string }>();
  return member ? c.json(member) : c.json({ error: 'Invitation unavailable or the four-participant limit was reached' }, 409);
});

sharing.get('/inbox', async (c) => {
  const { results: invitations } = await c.env.DB.prepare(`SELECT i.token AS id, a.name AS contactName,
    u.name AS senderName, i.expires_at AS expiresAt FROM contact_invite i
    JOIN contact_agent a ON a.id = i.agent_id JOIN user u ON u.id = a.owner_id
    WHERE i.recipient_id = ? AND i.accepted_by IS NULL AND i.expires_at > ? AND a.memory_shared = 1
    ORDER BY i.expires_at, i.token LIMIT 100`).bind(c.get('owner'), Date.now()).all();
  return c.json({ invitations, contributorModel: contributorModel(c.env) });
});

sharing.delete('/inbox/:inviteID', async (c) => {
  // Idempotent decline: never remove another recipient's request or membership.
  await c.env.DB.prepare('DELETE FROM contact_invite WHERE token = ? AND recipient_id = ? AND accepted_by IS NULL')
    .bind(c.req.param('inviteID'), c.get('owner')).run();
  return c.body(null, 204);
});

sharing.get('/:id', async (c) => {
  const agent = await ownerAgent(c.env.DB, c.req.param('id'), c.get('owner'));
  if (!agent) return c.json({ error: 'Contact not found' }, 404);
  const { results: members } = await c.env.DB.prepare(`SELECT c.id, u.name, CASE WHEN u.id = a.owner_id THEN 'owner' ELSE 'member' END AS role
    FROM contact c JOIN user u ON u.id = c.user_id JOIN contact_agent a ON a.id = c.agent_id
    WHERE c.agent_id = ? ORDER BY c.created_at, c.id`).bind(agent.id).all();
  const { results: invitations } = await c.env.DB.prepare(`SELECT i.token AS id, i.expires_at AS expiresAt,
    u.email AS recipientEmail FROM contact_invite i LEFT JOIN user u ON u.id = i.recipient_id
    WHERE i.agent_id = ? AND i.accepted_by IS NULL AND i.expires_at > ? ORDER BY i.expires_at`)
    .bind(agent.id, Date.now()).all();
  return c.json({ members, invitations, contributorModel: contributorModel(c.env) });
});

sharing.post('/:id/invitations', async (c) => {
  const agent = await ownerAgent(c.env.DB, c.req.param('id'), c.get('owner'));
  if (!agent) return c.json({ error: 'Contact not found' }, 404);
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!consent(body, contributorModel(c.env))) return c.json({ error: 'Confirm sharing existing and future memories' }, 400);
  if (body?.email !== undefined) {
    if (typeof body.email !== 'string' || body.email.trim().length > 254
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
      return c.json({ error: 'Provide a valid email address for an existing account' }, 400);
    }
    const admission = await admitAuthRequest(c.env.DB, c.get('owner'), 'contact-invite-email', 10);
    if (!admission.allowed) {
      c.header('Retry-After', String(admission.retryAfter));
      return c.json({ error: 'Too many email invitations. Try again later.' }, 429);
    }
    const recipient = await c.env.DB.prepare('SELECT id, email FROM user WHERE email = ? COLLATE NOCASE')
      .bind(body.email.trim().toLowerCase()).first<{ id: string; email: string }>();
    if (!recipient) return c.json({ error: 'No existing account uses this email address' }, 404);
    if (recipient.id === c.get('owner')) return c.json({ error: 'You cannot invite your own account' }, 400);
    const member = await c.env.DB.prepare('SELECT contributor_consent AS consent FROM contact WHERE agent_id = ? AND user_id = ?')
      .bind(agent.id, recipient.id).first<{ consent: number }>();
    if (member && (!contributorModel(c.env) || member.consent === 1)) return c.json({ error: 'This user already has access to the contact' }, 409);
    const now = Date.now();
    const hash = await tokenHash(crypto.randomUUID());
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM contact_invite WHERE agent_id = ? AND recipient_id = ? AND accepted_by IS NULL AND expires_at <= ?')
        .bind(agent.id, recipient.id, now),
      c.env.DB.prepare('UPDATE contact_agent SET memory_shared = 1 WHERE id = ? AND owner_id = ?').bind(agent.id, c.get('owner')),
      c.env.DB.prepare(`INSERT OR IGNORE INTO contact_invite (token, agent_id, expires_at, recipient_id)
        SELECT ?1, a.id, ?3, u.id FROM contact_agent a JOIN user u ON u.id = ?5
        WHERE a.id = ?2 AND a.owner_id = ?4
          AND (SELECT COUNT(*) FROM contact_invite WHERE agent_id = ?2 AND accepted_by IS NULL AND expires_at > ?6) < 10`)
        .bind(hash, agent.id, now + 86_400_000, c.get('owner'), recipient.id, now),
    ]);
    const invitation = await c.env.DB.prepare(`SELECT token AS invitationID, expires_at AS expiresAt FROM contact_invite
      WHERE agent_id = ? AND recipient_id = ? AND accepted_by IS NULL AND expires_at > ?`)
      .bind(agent.id, recipient.id, now).first<{ invitationID: string; expiresAt: number }>();
    return invitation ? c.json({ ...invitation, recipientEmail: recipient.email })
      : c.json({ error: 'The active invitation limit was reached. Refresh and try again.' }, 409);
  }
  const code = crypto.randomUUID();
  const expiresAt = Date.now() + 86_400_000;
  const hash = await tokenHash(code);
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE contact_agent SET memory_shared = 1 WHERE id = ? AND owner_id = ?').bind(agent.id, c.get('owner')),
    c.env.DB.prepare(`INSERT INTO contact_invite (token, agent_id, expires_at)
      SELECT ?1, id, ?3 FROM contact_agent WHERE id = ?2 AND owner_id = ?4
      AND (SELECT COUNT(*) FROM contact_invite WHERE agent_id = ?2 AND accepted_by IS NULL AND expires_at > ?5) < 10`)
      .bind(hash, agent.id, expiresAt, c.get('owner'), Date.now()),
  ]);
  const saved = await c.env.DB.prepare('SELECT token FROM contact_invite WHERE token = ?').bind(hash).first();
  return saved ? c.json({ code, expiresAt }, 201) : c.json({ error: 'Participant or active invitation limit reached' }, 409);
});

sharing.delete('/:id/invitations/:inviteID', async (c) => {
  const agent = await ownerAgent(c.env.DB, c.req.param('id'), c.get('owner'));
  if (!agent) return c.json({ error: 'Contact not found' }, 404);
  await c.env.DB.prepare('DELETE FROM contact_invite WHERE token = ? AND agent_id = ? AND accepted_by IS NULL')
    .bind(c.req.param('inviteID'), agent.id).run();
  return c.body(null, 204);
});

sharing.delete('/:id/members/:memberID', async (c) => {
  const agent = await ownerAgent(c.env.DB, c.req.param('id'), c.get('owner'));
  if (!agent) return c.json({ error: 'Contact not found' }, 404);
  const pending = await c.env.DB.prepare(`SELECT workflow_id AS id FROM chat_turn WHERE contact_id = ?
    AND contact_id IN (SELECT id FROM contact WHERE agent_id = ? AND user_id != ?)
    AND status IN ('queued','running')`).bind(c.req.param('memberID'), agent.id, c.get('owner')).all<{ id: string }>();
  const removed = await c.env.DB.prepare('DELETE FROM contact WHERE id = ? AND agent_id = ? AND user_id != ? RETURNING id')
    .bind(c.req.param('memberID'), agent.id, c.get('owner')).first();
  if (removed) c.executionCtx.waitUntil(terminateChats(c.env, pending.results.map((row) => row.id)));
  return removed ? c.body(null, 204) : c.json({ error: 'Participant not found' }, 404);
});

export default sharing;
