import type { ModelTool } from '../chat/meta';

export const reactionEmojis = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;
export type ReactionSide = 'user' | 'assistant' | 'group';
export type Reaction = { messageID: string; side: ReactionSide; actorID: string; name: string; emoji: string };
export function validEmoji(value: unknown): value is string | null {
  return value === null || typeof value === 'string' && reactionEmojis.includes(value as typeof reactionEmojis[number]);
}
export const reactionColumns = `COALESCE(r.turn_id, r.group_message_id) AS messageID, r.side,
  CASE WHEN r.user_id IS NOT NULL THEN 'user/' || r.user_id ELSE 'agent/' || r.agent_id END AS actorID,
  COALESCE(u.name, a.name) AS name, r.emoji`;
export const reactionJoins = `LEFT JOIN user u ON u.id = r.user_id LEFT JOIN contact_agent a ON a.id = r.agent_id`;

// Absolute set/remove operations are safe to repeat after a lost response.
export async function writeReaction(db: D1Database, target: { id: string; side: ReactionSide },
  actor: { id: string; kind: 'user' | 'agent' }, emoji: string | null,
  access: { sql: string; values: (string | number)[] }): Promise<boolean> {
  const targetColumn = target.side === 'group' ? 'group_message_id' : 'turn_id';
  const actorColumn = actor.kind === 'user' ? 'user_id' : 'agent_id';
  if (emoji === null) {
    // Check access even if there is no reaction to remove.
    const result = await db.batch([
      db.prepare(`SELECT 1 AS allowed WHERE ${access.sql}`).bind(...access.values),
      db.prepare(`DELETE FROM message_reaction WHERE ${targetColumn} = ? AND side = ? AND ${actorColumn} = ?
        AND (${access.sql})`).bind(target.id, target.side, actor.id, ...access.values),
    ]);
    return result[0].results.length > 0;
  }
  // created_at and the owning conversation feed the chat list preview (migration 0090);
  // changing the emoji counts as new activity, re-choosing the same one does not.
  const conversation = target.side === 'group'
    ? { column: 'group_id', value: '(SELECT group_id FROM group_message WHERE id = ?)' }
    : { column: 'contact_id', value: '(SELECT contact_id FROM chat_turn WHERE id = ?)' };
  const result = await db.prepare(`INSERT INTO message_reaction (${targetColumn}, side, ${actorColumn}, emoji, created_at, ${conversation.column})
    SELECT ?, ?, ?, ?, ?, ${conversation.value} WHERE ${access.sql}
    ON CONFLICT DO UPDATE SET created_at = CASE WHEN emoji = excluded.emoji THEN created_at ELSE excluded.created_at END,
      emoji = excluded.emoji, ${conversation.column} = excluded.${conversation.column} RETURNING emoji`)
    .bind(target.id, target.side, actor.id, emoji, Date.now(), target.id, ...access.values).first();
  return !!result;
}
export const reactionTool: ModelTool = { type: 'function', function: {
  name: 'react_to_message',
  description: 'Set your own emoji reaction to an existing message in THIS conversation, including your own messages. Use null to remove. One reaction per message; changing emoji replaces it. This sends no text and starts no new bot turn. Use actual message/turn IDs from context or retrieval. In private chat choose user or assistant side; in a group choose group. React naturally when useful; do not react to every message or claim success before the tool confirms it.',
  parameters: { type: 'object', additionalProperties: false,
    properties: { messageID: { type: 'string' }, side: { type: 'string', enum: ['user', 'assistant', 'group'] },
      endTurn: { type: 'boolean', description: 'Private chat only: true ends this turn with just the reaction and no text reply. Group turns can choose skip in their final decision.' },
      emoji: { type: ['string', 'null'], enum: [...reactionEmojis, null] } }, required: ['messageID', 'side', 'emoji'] },
} };
