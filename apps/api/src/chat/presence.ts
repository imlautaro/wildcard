import type { ChatJob } from './data';

export type ContactPresence = {
  status: 'offline' | 'online' | 'typing';
  lastSeenAt: number | null;
  expiresAt: number | null;
};

// Conditional expiry cannot disconnect a newer activity lease. Persist the deadline,
// rather than the scheduler's wake-up time, as the end of the last connection.
export async function expirePresence(db: D1Database) {
  await db.prepare(`UPDATE contact_presence SET status = 'offline', last_seen_at = expires_at, expires_at = NULL
    WHERE expires_at <= ?1`).bind(Date.now()).run();
}

export async function readPresence(db: D1Database, contactID: string, userID: string): Promise<ContactPresence> {
  await db.prepare(`UPDATE contact_presence SET status = 'offline', last_seen_at = expires_at, expires_at = NULL
    WHERE contact_id = ?1 AND user_id = ?2 AND expires_at <= ?3`)
    .bind(contactID, userID, Date.now()).run();
  return await db.prepare(`SELECT status, last_seen_at AS lastSeenAt, expires_at AS expiresAt
    FROM contact_presence WHERE contact_id = ?1 AND user_id = ?2`)
    .bind(contactID, userID).first<ContactPresence>() ?? { status: 'offline', lastSeenAt: null, expiresAt: null };
}

export async function markTyping(db: D1Database, job: ChatJob) {
  await db.prepare(`UPDATE contact_presence SET status = 'typing', expires_at = ?1
    WHERE EXISTS (SELECT 1 FROM chat_turn t WHERE t.id = ?2 AND t.attempt = ?3
      AND t.status = 'running' AND t.contact_id = contact_presence.contact_id AND t.user_id = contact_presence.user_id)`)
    .bind(Date.now() + 900_000, job.turnID, job.attempt).run();
}
