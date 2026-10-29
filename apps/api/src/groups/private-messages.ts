import type { ModelTool } from '../chat/meta';
import { deliverPush, enqueueReply } from '../push/delivery';

// A contact can move a group topic into one member's existing private chat with it:
// when that person asks ("let's talk about this privately") or when something
// clearly concerns only them. Nothing is created when there is no private chat.
export const privateMessageInstruction = 'You can write to one human member privately with message_privately, in their existing private chat with you. '
  + 'Do it when that person asks you to talk privately, or on your own only when something clearly concerns just them and would be better said one-to-one (personal or sensitive, a follow-up only they need, a correction meant for them). '
  + 'Never to continue banter, never to more than one person per turn, never as a substitute for answering the group. members marks who has privateChat with you; you cannot write to anyone else. '
  + 'The private message must stand on its own: say which group and topic it continues, because the person reads it outside the group. Private messages cost no energy. '
  + 'Your group decision is still required: briefly say in the group that you wrote privately when that helps, or skip when silence fits better.';

export const privateMessageTool: ModelTool = { type: 'function', function: {
  name: 'message_privately',
  description: 'Send one private message to a human member of THIS group, in their existing private chat with you (members[].privateChat must be true). '
    + 'Use when they ask to talk privately, or when something clearly concerns only them. At most one person and one message per turn; it is delivered immediately with a notification. '
    + 'Write it self-contained, in their language, mentioning the group topic it continues. Never claim it was sent unless this tool returns sent: true.',
  parameters: { type: 'object', additionalProperties: false, required: ['userID', 'message'], properties: {
    userID: { type: 'string', maxLength: 64 }, message: { type: 'string', minLength: 1, maxLength: 2000 },
  } },
} };

export type PrivateMessageScope = { groupID: string; agentID: string; turnID: string; attempt: number; contributor: boolean };
const dayMS = 86_400_000;

export async function messagePrivately(env: Env, scope: PrivateMessageScope, args: Record<string, unknown>): Promise<string> {
  const text = typeof args.message === 'string' ? args.message.trim() : '';
  if (Object.keys(args).some(key => !['userID', 'message'].includes(key)) || typeof args.userID !== 'string'
    || !text || Array.from(text).length > 2000 || text.includes('\0')) return JSON.stringify({ error: 'Provide userID and a message of up to 2,000 characters.' });
  // One private message per group reply, whoever it went to: a replayed step returns the first outcome.
  const id = `${scope.turnID}:private`, now = Date.now();
  const sent = await env.DB.prepare('SELECT user_id AS userID FROM chat_turn WHERE id = ?').bind(id).first<{ userID: string }>();
  if (sent) return JSON.stringify(sent.userID === args.userID ? { sent: true } : { error: 'You already wrote to someone privately in this turn.' });
  const target = await env.DB.prepare(`SELECT c.id AS contactID, u.name,
      ${scope.contributor ? '(c.user_id = a.owner_id OR c.contributor_consent = 1)' : '1'} AS allowed,
      EXISTS (SELECT 1 FROM chat_turn active WHERE active.contact_id = c.id AND active.status IN ('queued', 'running')) AS busy,
      (SELECT COUNT(*) FROM chat_turn WHERE user_id = m.user_id AND origin_group_id IS NOT NULL AND updated_at > ?4) AS today,
      (SELECT COUNT(*) FROM chat_turn WHERE contact_id = c.id AND origin_group_id IS NOT NULL AND updated_at > ?4) AS fromYouToday
    FROM group_member m JOIN user u ON u.id = m.user_id JOIN contact_agent a ON a.id = ?2
    LEFT JOIN contact c ON c.agent_id = a.id AND c.user_id = m.user_id
    WHERE m.group_id = ?1 AND m.user_id = ?3`).bind(scope.groupID, scope.agentID, args.userID, now - dayMS)
    .first<{ contactID: string | null; name: string; allowed: number; busy: number; today: number; fromYouToday: number }>();
  if (!target) return JSON.stringify({ error: 'That userID is not a human member of this group.' });
  if (!target.contactID) return JSON.stringify({ error: `${target.name} has no private chat with you, so you cannot write to them privately. Talk in the group instead.` });
  if (!target.allowed) return JSON.stringify({ error: `${target.name} has not allowed this model in your private chat. Talk in the group instead.` });
  if (target.busy) return JSON.stringify({ error: `${target.name} is in the middle of a private conversation with you. Talk in the group or wait.` });
  if (target.fromYouToday >= 3 || target.today >= 12) return JSON.stringify({ error: 'Private message limit from groups reached for today. Talk in the group instead.' });
  // The same checks guard the insert itself, together with this reply still being live.
  const inserted = await env.DB.prepare(`INSERT OR IGNORE INTO chat_turn
      (id, contact_id, user_id, user_text, assistant_text, status, workflow_id, created_at, updated_at, time_zone, origin_group_id)
    SELECT ?1, c.id, c.user_id, '', ?2, 'complete', ?1, ?3, ?3,
      (SELECT last.time_zone FROM chat_turn last WHERE last.contact_id = c.id ORDER BY last.sequence DESC LIMIT 1), r.group_id
    FROM group_reply r JOIN agent_attention attention ON attention.turn_id = r.id AND attention.attempt = r.attempt
    JOIN group_member m ON m.group_id = r.group_id AND m.user_id = ?4
    JOIN contact_agent a ON a.id = r.agent_id JOIN contact c ON c.agent_id = a.id AND c.user_id = m.user_id
    WHERE r.id = ?5 AND r.attempt = ?6 AND r.status = 'running' AND r.group_id = ?7 AND r.agent_id = ?8
      AND (?9 = 0 OR c.user_id = a.owner_id OR c.contributor_consent = 1)
      AND NOT EXISTS (SELECT 1 FROM chat_turn active WHERE active.contact_id = c.id AND active.status IN ('queued', 'running'))
      AND (SELECT COUNT(*) FROM chat_turn WHERE user_id = c.user_id AND origin_group_id IS NOT NULL AND updated_at > ?3 - ${dayMS}) < 12
      AND (SELECT COUNT(*) FROM chat_turn WHERE contact_id = c.id AND origin_group_id IS NOT NULL AND updated_at > ?3 - ${dayMS}) < 3
    RETURNING id`).bind(id, text, now, args.userID, scope.turnID, scope.attempt, scope.groupID, scope.agentID, scope.contributor ? 1 : 0).first();
  if (!inserted) return JSON.stringify({ error: 'The private message could not be sent. Talk in the group instead.' });
  try {
    await enqueueReply(env.DB, id, 1, now).run();
    await deliverPush(env, id);
  } catch { console.error(JSON.stringify({ event: 'group_private_message_push_deferred' })); }
  return JSON.stringify({ sent: true, to: target.name });
}
