import { admitAuthRequest } from '../lib/auth-rate-limit';
import { agentDisplayName } from '../contacts/alias';
import { eventTextColumn, parseMembershipEvent, userHistoryStart } from '../groups/history-access';
import { publicMetadata, storedAttachment, type Attachment, type PublicAttachment } from './attachments';
import { isVoice } from '../voice/speech';
import { turnColumns, type AssistantMessage, type ChatTurn } from './data';

// Readable per-chat JSON transcript (docs/chat-export.md). It mirrors what the
// conversation's own read routes show this viewer: no raw *_json fields, workflow
// IDs, storage keys or media bytes. The debug export (routes/debug-export.ts)
// remains the place for internals.

type Sender = { kind: 'user' | 'contact' | 'system'; id: string | null; name: string };
type ExportedReaction = { emoji: string; by: Sender };
type ExportedMessage = {
  id: string;
  sentAt: string;
  sender: Sender;
  text: string;
  voice: { durationMs: number; transcript: string | null } | null;
  attachments: PublicAttachment[];
  replyTo: { messageID: string; side?: string } | null;
  reactions: ExportedReaction[];
  // Private chats only: the turn that holds this message, which replies and reactions target.
  turnID?: string;
  side?: 'user' | 'assistant';
  status?: 'failed';
  event?: { kind: string; memberKind: string; memberID: string } | null;
};
export type ChatExport = {
  format: 'wildcard-chat-export';
  schemaVersion: 1;
  exportedAt: string;
  chat: { kind: 'private' | 'group'; id: string; name: string };
  participants: Sender[];
  notes: string[];
  messageCount: number;
  messages: ExportedMessage[];
};
export class ExportFailure extends Error {
  constructor(message: string, readonly status: 404 | 409 | 413) { super(message); }
}

// Pages stay small like other history reads: turns carry assistant_messages_json payloads.
const pageSize = 100;
// Bounds the Worker's memory: the document is assembled before the response so a
// failure can still return an error status instead of a truncated file.
const byteLimit = 20 * 1024 * 1024;
const notes = [
  'Times are ISO 8601 in UTC.',
  'Attachments list metadata only; files, images and audio are not included.',
  'Live export, not a backup: messages that changed while exporting may differ. It cannot be imported.',
  'Contains private conversation text. Review it before sharing it with anyone or with an AI.',
];
const iso = (ms: number) => new Date(ms).toISOString();
const parseJSON = <T>(value: string | null | undefined): T | null => {
  if (!value) return null;
  try { return JSON.parse(value) as T; } catch { return null; }
};

class Budget {
  private bytes = 0;
  add(value: unknown) {
    this.bytes += JSON.stringify(value).length;
    if (this.bytes > byteLimit) throw new ExportFailure('This chat is too large to export as one file.', 413);
  }
}

function attachmentList(attachment: Attachment | null | undefined, album?: Attachment[] | null): PublicAttachment[] {
  if (album && album.length > 1) return album.map(publicMetadata);
  return attachment && !isVoice(attachment) ? [publicMetadata(attachment)] : [];
}

type ReactionRow = { messageID: string; side: string; userID: string | null; agentID: string | null; name: string | null; emoji: string };
function groupReactions(rows: ReactionRow[], self: string) {
  const map = new Map<string, ExportedReaction[]>();
  for (const row of rows) {
    const key = `${row.messageID}/${row.side}`;
    const by: Sender = row.userID
      ? { kind: 'user', id: row.userID, name: row.name ?? (row.userID === self ? 'You' : 'Someone') }
      : { kind: 'contact', id: row.agentID, name: row.name ?? 'Contact' };
    map.set(key, [...(map.get(key) ?? []), { emoji: row.emoji, by }]);
  }
  return map;
}

// Reactions are viewer-facing, so contacts appear under this user's private alias.
const reactionSelect = (target: string) => `SELECT ${target} AS messageID, r.side, r.user_id AS userID, r.agent_id AS agentID,
  COALESCE(u.name, ${agentDisplayName('a.id', 'a.name', '?2')}) AS name, r.emoji
  FROM message_reaction r LEFT JOIN user u ON u.id = r.user_id LEFT JOIN contact_agent a ON a.id = r.agent_id`;

type PrivateRow = ChatTurn & { attachmentJSON: string | null; scheduleID: string | null };

export async function privateChatExport(db: D1Database, contactID: string, owner: string): Promise<ChatExport> {
  const meta = await db.prepare(`SELECT c.history_revision AS revision, c.clearing, c.agent_id AS agentID,
      COALESCE(c.alias, c.name) AS name, (SELECT name FROM user WHERE id = ?2) AS ownName
    FROM contact c WHERE c.id = ?1 AND c.user_id = ?2`)
    .bind(contactID, owner).first<{ revision: number; clearing: number; agentID: string | null; name: string; ownName: string | null }>();
  if (!meta) throw new ExportFailure('Contact not found', 404);
  if (meta.clearing) throw new ExportFailure('Chat cleanup is in progress. Try the export again shortly.', 409);
  const you: Sender = { kind: 'user', id: owner, name: meta.ownName ?? 'You' };
  const contact: Sender = { kind: 'contact', id: meta.agentID, name: meta.name };
  const budget = new Budget();
  const messages: (ExportedMessage & { rank: number; sequence: number })[] = [];
  let after = 0;
  for (;;) {
    const { results } = await db.prepare(`SELECT ${turnColumns}, attachment_json AS attachmentJSON FROM chat_turn
      WHERE contact_id = ?1 AND user_id = ?2 AND sequence > ?3 ORDER BY sequence LIMIT ${pageSize}`)
      .bind(contactID, owner, after).all<PrivateRow>();
    if (!results.length) break;
    after = results.at(-1)!.sequence;
    const ids = JSON.stringify(results.map(turn => turn.id));
    const { results: reactionRows } = await db.prepare(`${reactionSelect('r.turn_id')}
      WHERE r.turn_id IN (SELECT value FROM json_each(?1)) ORDER BY r.rowid`).bind(ids, owner).all<ReactionRow>();
    const reactions = groupReactions(reactionRows, owner);
    for (const turn of results) {
      const stored = storedAttachment(turn);
      // Same rule as the chat views: scheduled turns have no visible human message.
      if (turn.scheduleID === null && (turn.userText || stored)) {
        const voice = isVoice(stored);
        const message = {
          id: turn.id, turnID: turn.id, side: 'user' as const, sentAt: iso(turn.createdAt), sender: you,
          // A person's own voice transcript is shown only after they reveal it.
          text: voice ? '' : turn.userText,
          voice: voice ? { durationMs: stored.durationMs, transcript: turn.voiceTranscribedAt ? turn.userText : null } : null,
          attachments: attachmentList(stored),
          replyTo: turn.replyToID ? { messageID: turn.replyToID, side: turn.replyToSide ?? 'user' } : null,
          reactions: reactions.get(`${turn.id}/user`) ?? [],
          // A batched message was answered by a later reply; the chat views show no failure for it.
          ...(turn.status === 'failed' && turn.assistantText === null && turn.errorCode !== 'MESSAGE_BATCHED' ? { status: 'failed' as const } : {}),
          rank: 0, sequence: turn.sequence,
        };
        budget.add(message);
        messages.push(message);
      }
      const parts = parseJSON<AssistantMessage[]>(turn.assistantMessagesJSON)
        ?? (turn.assistantText !== null ? [{ id: `${turn.id}-assistant`, text: turn.assistantText, createdAt: turn.updatedAt }] : []);
      parts.forEach((part, index) => {
        const attachment = part.attachment as Attachment | null | undefined;
        const voice = isVoice(attachment);
        const reply = part.replyTo as { messageID: string; side: string } | null | undefined;
        const message = {
          id: part.id, turnID: turn.id, side: 'assistant' as const, sentAt: iso(Number.isFinite(part.createdAt) ? part.createdAt : turn.updatedAt), sender: contact,
          // A contact's voice message keeps its text, which is also its transcript.
          text: part.text,
          voice: voice ? { durationMs: attachment.durationMs, transcript: part.text } : null,
          attachments: attachmentList(attachment, part.attachments as Attachment[] | null | undefined),
          replyTo: reply ? { messageID: reply.messageID, side: reply.side } : null,
          // Private reactions target the whole reply turn; list them once, on its first message.
          reactions: index === 0 ? reactions.get(`${turn.id}/assistant`) ?? [] : [],
          rank: 1, sequence: turn.sequence,
        };
        budget.add(message);
        messages.push(message);
      });
    }
    if (results.length < pageSize) break;
  }
  const current = await db.prepare('SELECT history_revision AS revision, clearing FROM contact WHERE id = ?1 AND user_id = ?2')
    .bind(contactID, owner).first<{ revision: number; clearing: number }>();
  if (!current || current.clearing || current.revision !== meta.revision) {
    throw new ExportFailure('The chat changed during the export. Please try again.', 409);
  }
  // Replies can be created after a later human message, so order by time like the chat views.
  messages.sort((a, b) => a.sentAt.localeCompare(b.sentAt) || a.rank - b.rank || a.sequence - b.sequence);
  const ordered = messages.map(({ rank: _rank, sequence: _sequence, ...message }) => message);
  return {
    format: 'wildcard-chat-export', schemaVersion: 1, exportedAt: new Date().toISOString(),
    chat: { kind: 'private', id: contactID, name: meta.name }, participants: [you, contact], notes,
    messageCount: ordered.length, messages: ordered,
  };
}

type GroupRow = { sequence: number; id: string; userID: string | null; agentID: string | null; senderName: string; text: string;
  createdAt: number; attachmentJSON: string | null; attachmentsJSON: string | null; replyToID: string | null;
  voiceTranscribedAt: number | null; eventJSON: string | null; eventText: string | null };

export async function groupChatExport(db: D1Database, groupID: string, owner: string): Promise<ChatExport> {
  const meta = await db.prepare(`SELECT g.history_revision AS revision, g.clearing, g.name, ${userHistoryStart('?1', '?2')} AS historyStart
    FROM chat_group g JOIN group_member m ON m.group_id = g.id WHERE g.id = ?1 AND m.user_id = ?2`)
    .bind(groupID, owner).first<{ revision: number; clearing: number; name: string; historyStart: number }>();
  if (!meta) throw new ExportFailure('Group unavailable', 404);
  if (meta.clearing) throw new ExportFailure('Chat cleanup is in progress. Try the export again shortly.', 409);
  const { results: members } = await db.prepare(`SELECT 'user' AS kind, u.id, u.name FROM group_member m JOIN user u ON u.id = m.user_id
      WHERE m.group_id = ?1
    UNION ALL SELECT 'contact', a.id, ${agentDisplayName('a.id', 'a.name', '?2')} FROM group_agent ga
      JOIN contact_agent a ON a.id = ga.agent_id WHERE ga.group_id = ?1`)
    .bind(groupID, owner).all<Sender>();
  const budget = new Budget();
  const messages: ExportedMessage[] = [];
  // Same visibility as GET /groups/:id/messages: history since this member's start, no task work.
  let after = Math.max(meta.historyStart - 1, 0);
  for (;;) {
    const { results } = await db.prepare(`SELECT sequence, id, user_id AS userID, agent_id AS agentID,
        ${agentDisplayName('group_message.agent_id', 'group_message.sender_name', '?3')} AS senderName, text, created_at AS createdAt,
        attachment_json AS attachmentJSON, attachments_json AS attachmentsJSON, reply_to_id AS replyToID,
        voice_transcribed_at AS voiceTranscribedAt, event_json AS eventJSON, ${eventTextColumn('group_message', '?3')} AS eventText
      FROM group_message WHERE group_id = ?1 AND sequence > ?2 AND task_id IS NULL AND sequence >= ${userHistoryStart('?1', '?3')}
      ORDER BY sequence LIMIT ${pageSize}`)
      .bind(groupID, after, owner).all<GroupRow>();
    if (!results.length) break;
    after = results.at(-1)!.sequence;
    const { results: reactionRows } = await db.prepare(`${reactionSelect('r.group_message_id')}
      WHERE r.group_message_id IN (SELECT value FROM json_each(?1)) ORDER BY r.rowid`)
      .bind(JSON.stringify(results.map(row => row.id)), owner).all<ReactionRow>();
    const reactions = groupReactions(reactionRows, owner);
    for (const row of results) {
      const base = { id: row.id, sentAt: iso(row.createdAt), reactions: reactions.get(`${row.id}/group`) ?? [] };
      let message: ExportedMessage;
      if (row.eventJSON) {
        const event = parseMembershipEvent(row.eventJSON);
        message = { ...base, sender: { kind: 'system', id: null, name: 'Wildcard' }, text: row.eventText ?? row.text,
          voice: null, attachments: [], replyTo: null,
          event: event ? { kind: event.kind, memberKind: event.memberKind, memberID: event.memberID } : null };
      } else {
        const stored = storedAttachment(row);
        const voice = isVoice(stored);
        const fromContact = !!row.agentID;
        // Contacts' voice messages keep their spoken text; people's transcripts only once revealed.
        const transcript = fromContact || row.voiceTranscribedAt ? row.text : null;
        message = { ...base,
          sender: { kind: fromContact ? 'contact' : 'user', id: row.agentID ?? row.userID, name: row.senderName },
          text: voice && !fromContact ? '' : row.text,
          voice: voice ? { durationMs: stored.durationMs, transcript } : null,
          attachments: voice ? [] : attachmentList(stored, parseJSON<Attachment[]>(row.attachmentsJSON)),
          replyTo: row.replyToID ? { messageID: row.replyToID } : null };
      }
      budget.add(message);
      messages.push(message);
    }
    if (results.length < pageSize) break;
  }
  const current = await db.prepare(`SELECT g.history_revision AS revision, g.clearing FROM chat_group g
    JOIN group_member m ON m.group_id = g.id WHERE g.id = ?1 AND m.user_id = ?2`)
    .bind(groupID, owner).first<{ revision: number; clearing: number }>();
  if (!current || current.clearing || current.revision !== meta.revision) {
    throw new ExportFailure('The group changed during the export. Please try again.', 409);
  }
  return {
    format: 'wildcard-chat-export', schemaVersion: 1, exportedAt: new Date().toISOString(),
    chat: { kind: 'group', id: groupID, name: meta.name }, participants: members,
    notes: [...notes, 'Includes every member\'s messages that you can read in this group.'],
    messageCount: messages.length, messages,
  };
}

// Shared by GET /contacts/:id/chat/export and GET /groups/:id/export. Each export
// reads the whole history, so it has its own small per-account rate limit.
export async function exportResult(env: Env, owner: string, build: () => Promise<ChatExport>):
  Promise<{ status: 200 | 404 | 409 | 413 | 429; body: ChatExport | { error: string }; retryAfter?: number }> {
  const admission = await admitAuthRequest(env.DB, owner, 'chat-export', 6);
  if (!admission.allowed) return { status: 429, body: { error: 'Too many exports. Please wait a minute and try again.' }, retryAfter: admission.retryAfter };
  try { return { status: 200, body: await build() }; }
  catch (error) {
    if (error instanceof ExportFailure) return { status: error.status, body: { error: error.message } };
    throw error;
  }
}
