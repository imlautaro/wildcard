export async function totalUnreadReplies(db: D1Database, userID: string): Promise<number> {
  const result = await db.prepare(`SELECT COUNT(*) AS count FROM chat_turn t
    JOIN contact c ON c.id = t.contact_id AND c.user_id = t.user_id
    WHERE t.user_id = ? AND t.status = 'complete' AND t.assistant_text IS NOT NULL AND t.sequence > c.last_read_sequence`)
    .bind(userID).first<{ count: number }>();
  return result?.count ?? 0;
}


export async function totalUnreadMessages(db: D1Database, userID: string): Promise<number> {
  const row = await db.prepare(`SELECT
    (SELECT COUNT(*) FROM chat_turn t JOIN contact c ON c.id = t.contact_id AND c.user_id = t.user_id
      WHERE t.user_id = ?1 AND t.status = 'complete' AND t.assistant_text IS NOT NULL AND t.sequence > c.last_read_sequence)
    + (SELECT COUNT(*) FROM group_message gm JOIN group_member m ON m.group_id = gm.group_id
      WHERE m.user_id = ?1 AND gm.sequence > m.last_read_sequence AND gm.user_id IS NOT m.user_id
        AND gm.task_id IS NULL) AS count`)
    .bind(userID).first<{ count: number }>();
  return row?.count ?? 0;
}
