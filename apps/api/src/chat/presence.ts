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
  // Typing belongs to the attended conversation; connectivity remains global.
  return await db.prepare(`SELECT CASE WHEN p.status = 'typing' AND NOT EXISTS (
      SELECT 1 FROM agent_attention a JOIN chat_turn t ON t.id = a.turn_id AND t.attempt = a.attempt
      WHERE a.agent_id = p.agent_id AND t.contact_id = ?1 AND t.user_id = ?2 AND t.status = 'running'
    ) THEN 'online' ELSE p.status END AS status,
    p.last_seen_at AS lastSeenAt, p.expires_at AS expiresAt
    FROM agent_presence p JOIN contact c ON c.agent_id = p.agent_id
    WHERE c.id = ?1 AND c.user_id = ?2`)
    .bind(contactID, userID).first<ContactPresence>() ?? { status: 'offline', lastSeenAt: null, expiresAt: null };
}

export async function markTyping(db: D1Database, job: ChatJob) {
  await db.prepare(`UPDATE agent_presence SET status = 'typing', expires_at = ?1
    WHERE EXISTS (SELECT 1 FROM chat_turn t JOIN contact c ON c.id = t.contact_id
      JOIN agent_attention a ON a.agent_id = c.agent_id AND a.turn_id = t.id AND a.attempt = t.attempt
      WHERE t.id = ?2 AND t.attempt = ?3 AND t.status = 'running' AND c.agent_id = agent_presence.agent_id)`)
    .bind(Date.now() + 900_000, job.turnID, job.attempt).run();
}
