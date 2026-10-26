export type ChatState = 'queued' | 'running' | 'complete' | 'failed';
export type ChatTurn = {
  sequence: number;
  id: string;
  userText: string;
  assistantText: string | null;
  status: ChatState;
  attempt: number;
  createdAt: number;
  updatedAt: number;
};
export type StoredTurn = ChatTurn & { contactID: string; userID: string; workflowID: string };
export type ChatJob = { turnID: string; attempt: number };
export const turnColumns = `sequence, id, user_text AS userText, assistant_text AS assistantText,
  status, attempt, created_at AS createdAt, updated_at AS updatedAt`;
export const storedColumns = `${turnColumns}, contact_id AS contactID, user_id AS userID, workflow_id AS workflowID`;

export function publicTurn(turn: StoredTurn): ChatTurn {
  const { sequence, id, userText, assistantText, status, attempt, createdAt, updatedAt } = turn;
  return { sequence, id, userText, assistantText, status, attempt, createdAt, updatedAt };
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
