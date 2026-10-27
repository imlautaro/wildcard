import { publicAttachment, type PublicAttachment } from '../chat/attachments';
import { isRecord } from '../chat/meta';

export type ReplySide = 'user' | 'assistant' | 'group';
export type ReplyTarget = { messageID: string; side: ReplySide };
// Display data for a quoted message, resolved from current conversation history on
// every read. Private quotes omit sender identity: the side determines the author.
export type ReplyQuote = ReplyTarget & { available: boolean; userID: string | null; agentID: string | null;
  senderName: string | null; text: string; attachment: PublicAttachment | null };
type QuoteRow = { id: string; userID: string | null; agentID: string | null; senderName: string | null;
  userText: string; assistantText: string | null; attachmentJSON: string | null };

const quoteLength = 200;
export function quoteText(text: string, length = quoteLength): string {
  const characters = Array.from(text);
  return characters.length > length ? characters.slice(0, length).join('') + '…' : text;
}

// Same eligibility as reactions: scheduled turns expose only their assistant message.
export const privateTarget = (alias: string, side: string) => `CASE WHEN ${side} = 'assistant' THEN ${alias}.assistant_text IS NOT NULL
  ELSE ${alias}.schedule_id IS NULL AND (${alias}.user_text != '' OR ${alias}.attachment_json IS NOT NULL) END`;

// undefined: absent; null: malformed. Message IDs are opaque and compared verbatim.
export function parsePrivateReply(value: unknown): { messageID: string; side: 'user' | 'assistant' } | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || Object.keys(value).sort().join(',') !== 'messageID,side' || typeof value.messageID !== 'string'
    || !value.messageID || value.messageID.length > 160 || (value.side !== 'user' && value.side !== 'assistant')) return null;
  return { messageID: value.messageID, side: value.side };
}
export function parseGroupReply(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'string' && value && value.length <= 160 ? value : null;
}

function quote(target: ReplyTarget, row: QuoteRow | undefined): ReplyQuote {
  if (!row) return { ...target, available: false, userID: null, agentID: null, senderName: null, text: '', attachment: null };
  const assistant = target.side === 'assistant';
  return { ...target, available: true, userID: row.userID, agentID: row.agentID, senderName: row.senderName,
    text: quoteText(assistant ? row.assistantText ?? '' : row.userText), attachment: assistant ? null : publicAttachment(row) };
}

export async function privateQuotes(db: D1Database, contactID: string, userID: string,
  turns: { replyToID: string | null; replyToSide: string | null }[]): Promise<(turn: { replyToID: string | null; replyToSide: string | null }) => ReplyQuote | null> {
  const ids = [...new Set(turns.flatMap((turn) => turn.replyToID ? [turn.replyToID] : []))];
  const { results } = ids.length ? await db.prepare(`SELECT id, NULL AS userID, NULL AS agentID, NULL AS senderName,
    user_text AS userText, assistant_text AS assistantText, attachment_json AS attachmentJSON
    FROM chat_turn WHERE contact_id = ?1 AND user_id = ?2 AND id IN (SELECT value FROM json_each(?3))`)
    .bind(contactID, userID, JSON.stringify(ids)).all<QuoteRow>() : { results: [] };
  const rows = new Map(results.map((row) => [row.id, row]));
  return (turn) => turn.replyToSide ? quote({ messageID: turn.replyToID ?? '', side: turn.replyToSide as ReplySide },
    turn.replyToID ? rows.get(turn.replyToID) : undefined) : null;
}

export async function groupQuotes(db: D1Database, groupID: string,
  messages: { replyToID: string | null }[]): Promise<(message: { replyToID: string | null }) => ReplyQuote | null> {
  const ids = [...new Set(messages.flatMap((message) => message.replyToID ? [message.replyToID] : []))];
  const { results } = ids.length ? await db.prepare(`SELECT id, user_id AS userID, agent_id AS agentID, sender_name AS senderName,
    text AS userText, NULL AS assistantText, attachment_json AS attachmentJSON
    FROM group_message WHERE group_id = ?1 AND id IN (SELECT value FROM json_each(?2))`)
    .bind(groupID, JSON.stringify(ids)).all<QuoteRow>() : { results: [] };
  const rows = new Map(results.map((row) => [row.id, row]));
  return (message) => message.replyToID ? quote({ messageID: message.replyToID, side: 'group' }, rows.get(message.replyToID)) : null;
}
