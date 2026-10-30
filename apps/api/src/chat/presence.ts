import type { ChatJob } from './data';

export type ContactPresence = {
  status: 'offline' | 'online' | 'typing';
  isRecording?: boolean;
  // Researching keeps status typing for older clients, which show Typing.
  isResearching?: boolean;
  lastSeenAt: number | null;
  expiresAt: number | null;
};

// Conditional expiry cannot disconnect a newer activity lease. Persist the deadline,
// rather than the scheduler's wake-up time, as the end of the last connection.
export async function expirePresence(db: D1Database) {
  await db.prepare(`UPDATE agent_presence SET status = 'offline', last_seen_at = expires_at, expires_at = NULL
    WHERE expires_at <= ?1`).bind(Date.now()).run();
  await db.prepare('DELETE FROM chat_visit WHERE expires_at < ?1').bind(Date.now() - 86_400_000).run();
}

export async function readPresence(db: D1Database, contactID: string, userID: string): Promise<ContactPresence> {
  await db.prepare(`UPDATE agent_presence SET status = 'offline', last_seen_at = expires_at, expires_at = NULL
    WHERE agent_id = (SELECT agent_id FROM contact WHERE id = ?1 AND user_id = ?2) AND expires_at <= ?3`)
    .bind(contactID, userID, Date.now()).run();
  const presence = await db.prepare(`SELECT ${privatePresenceStatus('c')} AS status,
    p.last_seen_at AS lastSeenAt, p.expires_at AS expiresAt
    FROM agent_presence p JOIN contact c ON c.agent_id = p.agent_id
    WHERE c.id = ?1 AND c.user_id = ?2`)
    .bind(contactID, userID).first<{ status: ContactPresence['status'] | 'recording' | 'researching'; lastSeenAt: number | null; expiresAt: number | null }>();
  if (!presence) return { status: 'offline', lastSeenAt: null, expiresAt: null };
  return { ...presence, status: presence.status === 'recording' || presence.status === 'researching' ? 'typing' : presence.status,
    isRecording: presence.status === 'recording', isResearching: presence.status === 'researching' };
}

// The person has this chat open (a live visit) while the contact is still online
// from their conversation: the contact is "in the chat", so delivery and reading
// are immediate instead of the offline connect/read choreography.
export async function attendedChat(db: D1Database, job: ChatJob) {
  return !!await db.prepare(`SELECT 1 FROM chat_turn t JOIN contact c ON c.id = t.contact_id AND c.user_id = t.user_id
    JOIN agent_presence p ON p.agent_id = c.agent_id AND p.status != 'offline' AND p.expires_at > ?3
    JOIN chat_visit v ON v.contact_id = c.id AND v.user_id = c.user_id AND v.closed = 0 AND v.expires_at > ?3
    WHERE t.id = ?1 AND t.attempt = ?2 LIMIT 1`).bind(job.turnID, job.attempt, Date.now()).first();
}

// While the person keeps the chat open, a contact they are actively talking with
// stays online instead of dropping offline thirty seconds after its last reply.
// Polling the open chat renews the visit and the lease; it never connects an
// offline contact, and lingering ends a few minutes after the last exchange.
export const conversationLingerMs = 180_000;
export function lingerInChat(db: D1Database, contactID: string, userID: string) {
  const now = Date.now();
  return [
    db.prepare(`UPDATE chat_visit SET expires_at = ?3 WHERE contact_id = ?1 AND user_id = ?2
      AND closed = 0 AND expires_at > ?4 AND expires_at < ?4 + 10000`).bind(contactID, userID, now + 20_000, now),
    db.prepare(`UPDATE agent_presence SET expires_at = ?3
      WHERE agent_id = (SELECT agent_id FROM contact WHERE id = ?1 AND user_id = ?2)
        AND status != 'offline' AND expires_at > ?4 AND expires_at < ?4 + 10000
        AND EXISTS (SELECT 1 FROM chat_visit v WHERE v.contact_id = ?1 AND v.user_id = ?2 AND v.closed = 0 AND v.expires_at > ?4)
        AND (SELECT MAX(MAX(t.created_at, t.updated_at)) FROM chat_turn t WHERE t.contact_id = ?1 AND t.user_id = ?2) > ?4 - ?5`)
      .bind(contactID, userID, now + 20_000, now, conversationLingerMs),
  ];
}

// Connect without interrupting typing or shortening a longer lease.
export function connectAgent(db: D1Database, agentID: string, expiresAt: number) {
  return db.prepare(`INSERT INTO agent_presence (agent_id, status, expires_at) VALUES (?1, 'online', ?2)
    ON CONFLICT(agent_id) DO UPDATE SET status = CASE WHEN status = 'typing' THEN 'typing' ELSE 'online' END,
      expires_at = MAX(COALESCE(expires_at, 0), excluded.expires_at)`).bind(agentID, expiresAt);
}

// The contact reads the delivered message (and any earlier batched burst) only
// once the running turn has connected it. Typing may start only after this.
export async function markRead(db: D1Database, job: ChatJob) {
  const now = Date.now();
  await db.prepare(`UPDATE chat_turn SET read_at = COALESCE(read_at, ?1)
    WHERE read_at IS NULL AND EXISTS (SELECT 1 FROM chat_turn current
      JOIN agent_attention a ON a.turn_id = current.id AND a.attempt = current.attempt
      JOIN agent_presence p ON p.agent_id = a.agent_id AND p.status != 'offline'
      WHERE current.id = ?2 AND current.attempt = ?3 AND current.status = 'running'
        AND chat_turn.contact_id = current.contact_id AND chat_turn.user_id = current.user_id
        AND (chat_turn.id = current.id OR (chat_turn.error_code = 'MESSAGE_BATCHED' AND chat_turn.sequence < current.sequence)))`)
    .bind(now, job.turnID, job.attempt).run();
  return now;
}

export async function markTyping(db: D1Database, job: ChatJob) {
  await db.prepare(`UPDATE agent_presence SET status = 'typing', recording_until = NULL, typing_contact_id = NULL, expires_at = ?1
    WHERE EXISTS (SELECT 1 FROM chat_turn t JOIN contact c ON c.id = t.contact_id
      JOIN agent_attention a ON a.agent_id = c.agent_id AND a.turn_id = t.id AND a.attempt = t.attempt
      WHERE t.id = ?2 AND t.attempt = ?3 AND t.status = 'running' AND c.agent_id = agent_presence.agent_id
        AND t.read_at IS NOT NULL)`)
    .bind(Date.now() + 900_000, job.turnID, job.attempt).run();
}

// Recording overlays the attended typing lease once a reply is known to be a voice note,
// so it never shows Typing first. Bounded to two minutes; a new typing phase resets it.
export function markRecording(db: D1Database, turnID: string, attempt: number, until = Date.now() + 120_000) {
  return db.prepare(`UPDATE agent_presence SET recording_until = ?1
    WHERE status = 'typing' AND EXISTS (SELECT 1 FROM agent_attention a
      WHERE a.agent_id = agent_presence.agent_id AND a.turn_id = ?2 AND a.attempt = ?3)`)
    .bind(until, turnID, attempt).run();
}

// Database time keeps list and detail reads consistent without extra per-row requests.
export function privatePresenceStatus(contact: string) {
  return `CASE WHEN p.expires_at <= unixepoch('subsec') * 1000 OR p.status = 'offline' THEN 'offline'
    WHEN p.researching_until > unixepoch('subsec') * 1000 AND EXISTS (
      SELECT 1 FROM agent_attention a JOIN chat_turn t ON t.id = a.turn_id AND t.attempt = a.attempt
      WHERE a.agent_id = p.agent_id AND t.contact_id = ${contact}.id AND t.user_id = ${contact}.user_id AND t.status = 'running'
    ) THEN 'researching'
    WHEN p.status = 'typing' AND (p.typing_contact_id = ${contact}.id OR EXISTS (
      SELECT 1 FROM agent_attention a JOIN chat_turn t ON t.id = a.turn_id AND t.attempt = a.attempt
      WHERE a.agent_id = p.agent_id AND t.contact_id = ${contact}.id AND t.user_id = ${contact}.user_id AND t.status = 'running'
    )) THEN CASE WHEN p.recording_until > unixepoch('subsec') * 1000 THEN 'recording' ELSE 'typing' END
    ELSE 'online' END`;
}
