import type { ChatJob } from './data';

export type ContactPresence = {
  status: 'offline' | 'online' | 'typing';
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
  // Typing belongs to the attended conversation (or a follow-up being written
  // there); connectivity remains global.
  return await db.prepare(`SELECT CASE WHEN p.status = 'typing' AND p.typing_contact_id IS NOT ?1 AND NOT EXISTS (
      SELECT 1 FROM agent_attention a JOIN chat_turn t ON t.id = a.turn_id AND t.attempt = a.attempt
      WHERE a.agent_id = p.agent_id AND t.contact_id = ?1 AND t.user_id = ?2 AND t.status = 'running'
    ) THEN 'online' ELSE p.status END AS status,
    p.last_seen_at AS lastSeenAt, p.expires_at AS expiresAt
    FROM agent_presence p JOIN contact c ON c.agent_id = p.agent_id
    WHERE c.id = ?1 AND c.user_id = ?2`)
    .bind(contactID, userID).first<ContactPresence>() ?? { status: 'offline', lastSeenAt: null, expiresAt: null };
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
  await db.prepare(`UPDATE agent_presence SET status = 'typing', typing_contact_id = NULL, expires_at = ?1
    WHERE EXISTS (SELECT 1 FROM chat_turn t JOIN contact c ON c.id = t.contact_id
      JOIN agent_attention a ON a.agent_id = c.agent_id AND a.turn_id = t.id AND a.attempt = t.attempt
      WHERE t.id = ?2 AND t.attempt = ?3 AND t.status = 'running' AND c.agent_id = agent_presence.agent_id
        AND t.read_at IS NOT NULL)`)
    .bind(Date.now() + 900_000, job.turnID, job.attempt).run();
}
