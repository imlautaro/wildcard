export async function totalUnreadReplies(db: D1Database, userID: string): Promise<number> {
  const result = await db.prepare(`SELECT COUNT(*) AS count FROM chat_turn t
    JOIN contact c ON c.id = t.contact_id AND c.user_id = t.user_id
    WHERE t.user_id = ? AND t.status = 'complete' AND t.sequence > c.last_read_sequence`)
    .bind(userID).first<{ count: number }>();
  return result?.count ?? 0;
}
