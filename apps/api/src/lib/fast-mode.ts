// Fast mode (docs/chats.md#fast-mode): skip humanlike pacing, never real work.
// Workflows read it once in a checkpointed step so replays keep the same branch;
// a toggle applies from the next turn.

/** A private chat turn's account. */
export async function turnFastMode(db: D1Database, turnID: string): Promise<boolean> {
  return !!await db.prepare(`SELECT 1 FROM chat_turn turn JOIN user ON user.id = turn.user_id
    WHERE turn.id = ? AND user.fast_mode = 1`).bind(turnID).first();
}

/** The account that owns a private contact (welcomes, proactive messages). */
export async function contactFastMode(db: D1Database, contactID: string): Promise<boolean> {
  return !!await db.prepare(`SELECT 1 FROM contact JOIN user ON user.id = contact.user_id
    WHERE contact.id = ? AND user.fast_mode = 1`).bind(contactID).first();
}

/** A group reply: everyone sees the same pacing, so it is fast only when every person in the group chose it. */
export async function groupFastMode(db: D1Database, replyID: string): Promise<boolean> {
  return !!await db.prepare(`SELECT 1 FROM group_reply reply WHERE reply.id = ?1
    AND EXISTS (SELECT 1 FROM group_member member WHERE member.group_id = reply.group_id)
    AND NOT EXISTS (SELECT 1 FROM group_member member JOIN user ON user.id = member.user_id
      WHERE member.group_id = reply.group_id AND user.fast_mode = 0)`).bind(replyID).first();
}
