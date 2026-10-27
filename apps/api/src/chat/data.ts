import { publicAttachment, type PublicAttachment } from './attachments';
export type ChatState = 'queued' | 'running' | 'complete' | 'failed';
export type ChatTurn = {
  readAt: number | null;
  attachment?: PublicAttachment | null;
  scheduleID: string | null;
  groupRequestID: string | null;
  errorCode: string | null;
  sequence: number;
  id: string;
  userText: string;
  assistantText: string | null;
  status: ChatState;
  attempt: number;
  createdAt: number;
  updatedAt: number;
};
export type StoredTurn = ChatTurn & { attachmentJSON: string | null; contactID: string; userID: string; workflowID: string; timeZone: string | null; scheduleInstruction: string | null };
export type ChatJob = { turnID: string; attempt: number };
export const turnColumns = `sequence, id, read_at AS readAt, user_text AS userText, assistant_text AS assistantText,
  status, attempt, created_at AS createdAt, updated_at AS updatedAt, schedule_id AS scheduleID, group_request_id AS groupRequestID, error_code AS errorCode`;
export const storedColumns = `${turnColumns}, attachment_json AS attachmentJSON, contact_id AS contactID, user_id AS userID, workflow_id AS workflowID, time_zone AS timeZone, schedule_instruction AS scheduleInstruction`;

export function publicTurn(turn: ChatTurn & { attachmentJSON: string | null }): ChatTurn {
  const { sequence, id, readAt, userText, assistantText, status, attempt, createdAt, updatedAt, scheduleID, groupRequestID, errorCode } = turn;
  return { attachment: publicAttachment(turn), sequence, id, readAt, userText, assistantText, status, attempt, createdAt, updatedAt, scheduleID, groupRequestID, errorCode };
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
