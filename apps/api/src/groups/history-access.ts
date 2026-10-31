import { agentDisplayName } from '../contacts/alias';

// Dependency-free SQL helpers for membership notices and past-history access. Keep
// this module free of workflow/context imports: retrieval.ts uses these helpers
// while modules initialize. See docs/groups.md#join-banners-and-welcomes.

/** Quiet period after the latest join before contacts welcome everyone at once. */
export const welcomeDelayMs = 120_000;

export type MembershipEvent = { kind: 'member_joined'; memberKind: 'user' | 'agent'; memberID: string;
  actorID: string; includesHistory: boolean; invitedByID?: string };

export function parseMembershipEvent(json: string | null | undefined): MembershipEvent | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as Partial<MembershipEvent>;
    if (value?.kind !== 'member_joined' || (value.memberKind !== 'user' && value.memberKind !== 'agent')
      || typeof value.memberID !== 'string' || typeof value.actorID !== 'string') return null;
    return { kind: 'member_joined', memberKind: value.memberKind, memberID: value.memberID, actorID: value.actorID,
      includesHistory: value.includesHistory !== false, ...(typeof value.invitedByID === 'string' ? { invitedByID: value.invitedByID } : {}) };
  } catch { return null; }
}

/**
 * SQL for the first sequence a member may read in a group, or 0 for full history.
 * `group` and `id` are trusted SQL expressions supplied by code.
 */
export const userHistoryStart = (group: string, user: string) =>
  `COALESCE((SELECT hm.history_start FROM group_member hm WHERE hm.group_id = ${group} AND hm.user_id = ${user}), 0)`;
export const agentHistoryStart = (group: string, agent: string) =>
  `COALESCE((SELECT ha.history_start FROM group_agent ha WHERE ha.group_id = ${group} AND ha.agent_id = ${agent}), 0)`;

/**
 * Display text for a notice, resolved for the viewer (contact aliases, current
 * names). Columns: event_json AS eventJSON plus the stored text as fallback.
 */
export const eventTextColumn = (message: string, viewer: string) => `CASE WHEN ${message}.event_json IS NULL THEN NULL
  WHEN json_extract(${message}.event_json, '$.memberKind') = 'agent' THEN
    COALESCE((SELECT name FROM user WHERE id = json_extract(${message}.event_json, '$.actorID')), ${message}.sender_name)
    || ' added ' || COALESCE((SELECT ${agentDisplayName('ea.id', 'ea.name', viewer)} FROM contact_agent ea
      WHERE ea.id = json_extract(${message}.event_json, '$.memberID')), 'a contact')
  ELSE COALESCE((SELECT name FROM user WHERE id = json_extract(${message}.event_json, '$.memberID')), ${message}.sender_name)
    || ' joined' || COALESCE(' · invited by ' || (SELECT name FROM user WHERE id = json_extract(${message}.event_json, '$.invitedByID')), '') END`;

/**
 * Notices that one welcome round covers: those after the last human message and
 * after the last notice that already started a welcome, up to `through`.
 */
export const welcomeBatch = `SELECT gm.id, gm.sequence, gm.event_json AS eventJSON FROM group_message gm
  WHERE gm.group_id = ?1 AND gm.event_json IS NOT NULL AND gm.sequence <= ?2
    AND gm.sequence > COALESCE((SELECT MAX(prior.sequence) FROM group_message prior WHERE prior.group_id = ?1 AND prior.sequence < ?2
      AND (prior.user_id IS NOT NULL OR (prior.event_json IS NOT NULL AND prior.round_enqueued = 1))), 0)
  ORDER BY gm.sequence LIMIT 24`;
