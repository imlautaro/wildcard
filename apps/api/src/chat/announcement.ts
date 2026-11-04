import { messageDelay } from './messages';
import { turnFastMode } from '../lib/fast-mode';

// A contact about to research or build a mini app tells the person first, as the turn's first bubble
// (`<turn>/assistant/0`). The turn stays running; the final reply follows it.
// `announcement: true` lets reply recovery tell it apart from a real reply (clients ignore it).
// It is only written while this attempt still holds attention and before any
// other reply bubble exists, so a replayed tool call cannot announce twice.
export async function announcePrivateResearch(env: Env, turnID: string, attempt: number, text: string) {
  // Typing was already visible during generation; a short beat keeps it natural
  // unless the person chose fast mode (docs/chats.md#fast-mode).
  if (!await turnFastMode(env.DB, turnID)) await new Promise(resolve => setTimeout(resolve, Math.min(messageDelay(text, turnID), 3000)));
  const now = Date.now();
  const result = await env.DB.prepare(`UPDATE chat_turn SET assistant_text = ?3, assistant_messages_json = ?4, updated_at = ?5
    WHERE id = ?1 AND attempt = ?2 AND status = 'running' AND assistant_text IS NULL
      AND json_array_length(COALESCE(assistant_messages_json, '[]')) = 0
      AND EXISTS (SELECT 1 FROM agent_attention WHERE turn_id = ?1 AND attempt = ?2)`)
    .bind(turnID, attempt, text, JSON.stringify([{ id: `${turnID}/assistant/0`, text, createdAt: now, announcement: true }]), now).run();
  return result.meta.changes > 0;
}

/** The same first bubble for any long-running private tool (mini app building). */
export const announcePrivateMessage = announcePrivateResearch;
