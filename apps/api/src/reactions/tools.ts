import { contactModelAllowed } from '../chat/consent';
import type { StoredTurn } from '../chat/data';
import { groupSourceAccess } from '../groups/request-access';
import { isRecord } from '../chat/meta';
import { validEmoji, writeReaction, type ReactionSide } from './data';

export function reactionArguments(args: unknown): args is { messageID: string; side: ReactionSide; emoji: string | null; endTurn?: boolean } {
  return isRecord(args) && Object.keys(args).every((key) => ['messageID', 'side', 'emoji', 'endTurn'].includes(key))
    && typeof args.messageID === 'string' && args.messageID.length <= 160
    && ['user', 'assistant', 'group'].includes(args.side as string) && validEmoji(args.emoji)
    && (args.endTurn === undefined || typeof args.endTurn === 'boolean');
}
export async function privateReaction(env: Env, turn: StoredTurn, agentID: string, args: Record<string, unknown>): Promise<string> {
  if (!reactionArguments(args) || args.side === 'group' || turn.scheduleID || !await contactModelAllowed(env, turn.contactID, turn.userID)) return JSON.stringify({ error: 'Invalid reaction or unavailable conversation' });
  const saved = await writeReaction(env.DB, { id: args.messageID, side: args.side }, { kind: 'agent', id: agentID }, args.emoji, {
    sql: `EXISTS (SELECT 1 FROM chat_turn target JOIN contact c ON c.id = target.contact_id AND c.user_id = target.user_id
      JOIN chat_turn current ON current.contact_id = c.id AND current.user_id = c.user_id
      JOIN agent_attention attention ON attention.turn_id = current.id AND attention.attempt = current.attempt
      WHERE target.id = ? AND c.id = ? AND c.user_id = ? AND c.agent_id = ?
        ${env.META_CHAT_MODEL.includes('contributor') ? `AND EXISTS (SELECT 1 FROM contact_agent agent WHERE agent.id = c.agent_id AND (agent.owner_id = c.user_id OR c.contributor_consent = 1))` : ''}
        AND current.id = ? AND current.attempt = ? AND current.status = 'running' AND target.sequence <= current.sequence
        AND CASE WHEN ? = 'assistant' THEN target.assistant_text IS NOT NULL ELSE target.schedule_id IS NULL AND (target.user_text != '' OR target.attachment_json IS NOT NULL) END)`,
    values: [args.messageID, turn.contactID, turn.userID, agentID, turn.id, turn.attempt, args.side],
  });
  return JSON.stringify(saved ? { saved: true, endTurn: args.endTurn === true && args.emoji !== null } : { error: 'Message unavailable' });
}
export async function groupReaction(env: Env, scope: { agentID: string; groupID?: string; beforeSequence?: number;
  contributor: boolean; reactionJob?: { turnID: string; attempt: number } }, args: unknown): Promise<string> {
  if (!reactionArguments(args) || args.side !== 'group' || !scope.groupID || !scope.reactionJob) return JSON.stringify({ error: 'React only in the current group' });
  const saved = await writeReaction(env.DB, { id: args.messageID, side: 'group' }, { kind: 'agent', id: scope.agentID }, args.emoji, {
    sql: `EXISTS (SELECT 1 FROM group_message target JOIN group_reply reply ON reply.group_id = target.group_id
      JOIN group_agent member ON member.group_id = reply.group_id AND member.agent_id = reply.agent_id
      JOIN contact_agent agent ON agent.id = member.agent_id AND agent.memory_shared = 1
      JOIN contact owner ON owner.agent_id = agent.id AND owner.user_id = agent.owner_id
      JOIN agent_attention attention ON attention.turn_id = reply.id AND attention.attempt = reply.attempt
      WHERE target.id = ? AND target.group_id = ? AND reply.agent_id = ? AND reply.id = ? AND reply.attempt = ?
        AND reply.status = 'running' AND target.sequence < ?
        AND (target.user_id IS NULL OR EXISTS (SELECT 1 FROM group_member author
          WHERE author.group_id = target.group_id AND author.user_id = target.user_id AND author.share_memory = 1))
        AND (target.agent_id IS NULL OR EXISTS (SELECT 1 FROM group_agent author WHERE author.group_id = target.group_id AND author.agent_id = target.agent_id))
        ${scope.contributor ? `AND target.contributor_consent = 1 AND NOT EXISTS (SELECT 1 FROM group_member WHERE group_id = target.group_id AND contributor_consent = 0)` : ''}
        AND ${groupSourceAccess('reply', scope.contributor)})`,
    values: [args.messageID, scope.groupID, scope.agentID, scope.reactionJob.turnID, scope.reactionJob.attempt, scope.beforeSequence ?? 0],
  });
  return JSON.stringify(saved ? { saved: true } : { error: 'Message unavailable' });
}
