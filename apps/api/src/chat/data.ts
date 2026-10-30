import { publicAttachment, storedAttachment, type PublicAttachment, type Attachment } from './attachments';
import { isVoice, publicVoice, type PublicVoice } from '../voice/speech';
import type { ReplyQuote, ReplyTarget } from '../replies/data';
export type ChatState = 'queued' | 'running' | 'complete' | 'failed';
export type AssistantMessage = { id: string; text: string; createdAt: number; attachment?: Attachment | PublicAttachment | null; replyTo?: ReplyQuote | ReplyTarget | null };
export type ChatTurn = {
  assistantVoiceListenedJSON?: string;
  assistantMessagesJSON?: string | null;
  voiceListenedAt?: number | null;
  voiceTranscribedAt?: number | null;
  readAt: number | null;
  attachment?: PublicAttachment | null;
  scheduleID: string | null;
  groupRequestID: string | null;
  // Set on contact work turns for a task; they have no human text and no manual retry.
  taskID?: string | null;
  errorCode: string | null;
  sequence: number;
  id: string;
  userText: string;
  assistantText: string | null;
  status: ChatState;
  attempt: number;
  createdAt: number;
  updatedAt: number;
  replyToID: string | null;
  replyToSide: 'user' | 'assistant' | null;
};
export type PublicTurn = Omit<ChatTurn, 'replyToID' | 'replyToSide' | 'assistantMessagesJSON' | 'voiceListenedAt' | 'voiceTranscribedAt' | 'assistantVoiceListenedJSON'> & { assistantMessages: (AssistantMessage & { voice: PublicVoice | null })[]; replyTo: ReplyQuote | null; voice: PublicVoice | null };
export type StoredTurn = ChatTurn & { nativeContextJSON?: string | null; attachmentJSON: string | null; contactID: string; userID: string; workflowID: string; timeZone: string | null; scheduleInstruction: string | null };
export type ChatJob = { turnID: string; attempt: number };
export const turnColumns = `assistant_voice_listened_json AS assistantVoiceListenedJSON, assistant_messages_json AS assistantMessagesJSON, sequence, id, read_at AS readAt, user_text AS userText, assistant_text AS assistantText,
  status, attempt, created_at AS createdAt, updated_at AS updatedAt, schedule_id AS scheduleID, group_request_id AS groupRequestID, error_code AS errorCode,
  reply_to_id AS replyToID, reply_to_side AS replyToSide, task_id AS taskID, voice_listened_at AS voiceListenedAt, voice_transcribed_at AS voiceTranscribedAt`;
export const storedColumns = `${turnColumns}, attachment_json AS attachmentJSON, contact_id AS contactID, user_id AS userID, workflow_id AS workflowID, time_zone AS timeZone, schedule_instruction AS scheduleInstruction, native_context_json AS nativeContextJSON`;

export function publicTurn(turn: ChatTurn & { attachmentJSON: string | null }, replyTo: ReplyQuote | null, resolveQuote?: (target: { replyToID: string | null; replyToSide: string | null }) => ReplyQuote | null): PublicTurn {
  const { sequence, id, readAt, userText, assistantText, status, attempt, createdAt, updatedAt, scheduleID, groupRequestID, errorCode, taskID } = turn;
  const ownListened = JSON.parse(turn.assistantVoiceListenedJSON ?? '{}') as Record<string, number>;
  const assistantMessages = turn.assistantMessagesJSON
    ? (JSON.parse(turn.assistantMessagesJSON) as AssistantMessage[]).map((message, part) => {
      const voice = publicVoice(message.attachment as Attachment | null | undefined, null, message.text);
      return {
        ...message,
        // A contact voice message keeps its text, which is also its transcript.
        voice: voice ? { ...voice, ownListenedAt: ownListened[part] ?? null } : null,
        attachment: message.attachment && !isVoice(message.attachment) ? {
          name: message.attachment.name, mimeType: message.attachment.mimeType, size: message.attachment.size,
        } : null,
        replyTo: message.replyTo && resolveQuote
          ? resolveQuote({ replyToID: message.replyTo.messageID, replyToSide: message.replyTo.side }) : null,
      };
    }) : [];
  const stored = storedAttachment(turn);
  const voice = publicVoice(stored, turn.voiceListenedAt ?? null, turn.voiceTranscribedAt ? userText : null);
  return { assistantMessages, attachment: voice ? null : publicAttachment(turn), voice, sequence, id, readAt, userText: voice ? '' : userText, assistantText,
    status: errorCode === 'MESSAGE_BATCHED' ? 'complete' : status, attempt, createdAt, updatedAt, scheduleID,
    groupRequestID, taskID: taskID ?? null, errorCode: errorCode === 'MESSAGE_BATCHED' ? null : errorCode, replyTo };
}

export function findTurn(db: D1Database, id: string, contactID: string, userID: string) {
  return db.prepare(`SELECT ${storedColumns} FROM chat_turn WHERE id = ?1 AND contact_id = ?2 AND user_id = ?3`)
    .bind(id, contactID, userID).first<StoredTurn>();
}

export function activeTurn(db: D1Database, job: ChatJob) {
  return db.prepare(`SELECT ${storedColumns.split(',').map((part) => `t.${part.trim()}`).join(',')}
    FROM chat_turn t JOIN contact c ON c.id = t.contact_id AND c.user_id = t.user_id
    WHERE t.id = ?1 AND t.attempt = ?2`)
    .bind(job.turnID, job.attempt).first<StoredTurn>();
}
