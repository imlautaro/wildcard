import type { Attachment } from '../chat/attachments';
import type { StoredTurn } from '../chat/data';
import { agentLibrary, copyToMessage } from './data';

// Copies the contact's chosen sticker into the reply message at publication time. The key is
// derived from the turn and attempt, so a retried publication reuses the same object. Returns
// null when the sticker has been deleted since it was chosen; the emoji text still goes out.
export async function publishedSticker(env: Env, turn: Pick<StoredTurn, 'id' | 'userID' | 'contactID'>, job: { turnID: string; attempt: number }, stickerID: string): Promise<Attachment | null> {
  const agent = await env.DB.prepare('SELECT agent_id AS id FROM contact WHERE id = ? AND user_id = ?').bind(turn.contactID, turn.userID).first<{ id: string }>();
  if (!agent) return null;
  const row = (await agentLibrary(env.DB, agent.id, turn.userID)).find(item => item.id === stickerID);
  if (!row) return null;
  try { return await copyToMessage(env, row, `attachments/${turn.userID}/${turn.contactID}/${job.turnID}/sticker-a${job.attempt}`, turn.contactID); }
  catch { return null; }
}
