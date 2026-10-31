import { dispatchGroup } from './workflow';
import { welcomeDelayMs } from './history-access';

// Membership notices ("Lautaro added Mila", "Ana joined") are senderless rows in
// the shared group history. requester_id names the human whose action produced the
// notice so the existing membership/consent checks apply to the welcome round.
// See docs/groups.md#join-banners-and-welcomes.

const eventJSON = (memberKind: 'user' | 'agent', member: string, actor: string, includeHistory: string) =>
  `json_object('kind', 'member_joined', 'memberKind', '${memberKind}', 'memberID', ${member}, 'actorID', ${actor},
    'includesHistory', json(CASE WHEN ${includeHistory} = 1 THEN 'true' ELSE 'false' END))`;

/**
 * Statements appended to the batch that inserted a membership row. They only act
 * when that row was created by this request (joined_at = now), so a duplicate add
 * or a refused insert produces no notice, floor or welcome.
 */
export function agentJoinStatements(db: D1Database, input: { groupID: string; agentID: string; actorID: string; now: number; includeHistory: boolean }) {
  const eventID = crypto.randomUUID();
  const created = `EXISTS (SELECT 1 FROM group_agent WHERE group_id = ?1 AND agent_id = ?2 AND joined_at = ?4 AND added_by = ?3)`;
  return [
    db.prepare(`INSERT INTO group_message (id, group_id, sender_name, text, created_at, contributor_consent, exchange_id, requester_id, event_json)
      SELECT ?5, g.id, u.name, u.name || ' added ' || a.name, ?4, m.contributor_consent, ?5, ?3, ${eventJSON('agent', '?2', '?3', '?6')}
      FROM chat_group g JOIN group_member m ON m.group_id = g.id AND m.user_id = ?3 JOIN user u ON u.id = ?3
      JOIN contact_agent a ON a.id = ?2
      WHERE g.id = ?1 AND g.clearing = 0 AND ${created}`)
      .bind(input.groupID, input.agentID, input.actorID, input.now, eventID, input.includeHistory ? 1 : 0),
    ...followUps(db, input.groupID, eventID, input.now),
    db.prepare(`UPDATE group_agent SET history_start = (SELECT sequence FROM group_message WHERE id = ?3)
      WHERE group_id = ?1 AND agent_id = ?2 AND ?4 = 0 AND EXISTS (SELECT 1 FROM group_message WHERE id = ?3)`)
      .bind(input.groupID, input.agentID, eventID, input.includeHistory ? 1 : 0),
  ];
}

/** The invitee is the actor: accepting is their own action; the inviter is recorded. */
export function userJoinStatements(db: D1Database, input: { groupID: string; userID: string; inviterID: string; inviteID: string; now: number }) {
  const eventID = crypto.randomUUID();
  return [
    db.prepare(`INSERT INTO group_message (id, group_id, sender_name, text, created_at, contributor_consent, exchange_id, requester_id, event_json)
      SELECT ?5, g.id, u.name, u.name || ' joined', ?4, m.contributor_consent, ?5, ?2,
        json_set(${eventJSON('user', '?2', '?2', 'i.include_history')}, '$.invitedByID', ?3)
      FROM chat_group g JOIN group_member m ON m.group_id = g.id AND m.user_id = ?2 AND m.joined_at = ?4
      JOIN user u ON u.id = ?2 JOIN group_invite i ON i.id = ?6 AND i.group_id = g.id
      WHERE g.id = ?1 AND g.clearing = 0`)
      .bind(input.groupID, input.userID, input.inviterID, input.now, eventID, input.inviteID),
    ...followUps(db, input.groupID, eventID, input.now),
    db.prepare(`UPDATE group_member SET history_start = (SELECT sequence FROM group_message WHERE id = ?3)
      WHERE group_id = ?1 AND user_id = ?2 AND EXISTS (SELECT 1 FROM group_message WHERE id = ?3)
      AND EXISTS (SELECT 1 FROM group_invite WHERE id = ?4 AND include_history = 0)`)
      .bind(input.groupID, input.userID, eventID, input.inviteID),
  ];
}

// Every join pushes the shared welcome deadline forward and keeps the first notice.
function followUps(db: D1Database, groupID: string, eventID: string, now: number) {
  return [
    db.prepare(`INSERT INTO group_welcome (group_id, first_sequence, due_at)
      SELECT group_id, sequence, ?3 FROM group_message WHERE id = ?2 AND group_id = ?1
      ON CONFLICT(group_id) DO UPDATE SET due_at = excluded.due_at`)
      .bind(groupID, eventID, now + welcomeDelayMs),
  ];
}

// Cron: start one welcome round per group whose latest join is at least
// welcomeDelayMs old. A human message after the latest notice means people are
// already talking; their own round sees the notices, so no separate welcome runs.
export async function dispatchWelcomes(env: Env) {
  const now = Date.now();
  const { results } = await env.DB.prepare('SELECT group_id AS groupID FROM group_welcome WHERE due_at <= ? ORDER BY due_at LIMIT 20')
    .bind(now).all<{ groupID: string }>();
  for (const { groupID } of results) {
    try {
      // Atomic claim: a join after this read moved due_at forward and keeps the row.
      const claim = await env.DB.prepare('DELETE FROM group_welcome WHERE group_id = ? AND due_at <= ? RETURNING first_sequence AS first')
        .bind(groupID, now).first<{ first: number }>();
      if (!claim) continue;
      const contributor = env.META_CHAT_MODEL.includes('contributor') ? 1 : 0;
      const [, , enqueued] = await env.DB.batch([
        env.DB.prepare(`INSERT INTO group_reply (id, group_id, agent_id, source_id, workflow_id, created_at)
          SELECT 'group-' || gm.id || '-' || ga.agent_id, ga.group_id, ga.agent_id, gm.id,
            'group-' || gm.id || '-' || ga.agent_id || '-1', ?3
          FROM group_message gm JOIN group_agent ga ON ga.group_id = gm.group_id
          JOIN group_member requester ON requester.group_id = gm.group_id AND requester.user_id = gm.requester_id AND requester.share_memory = 1
          JOIN chat_group g ON g.id = gm.group_id AND g.clearing = 0
          WHERE gm.id = (SELECT id FROM group_message WHERE group_id = ?1 AND event_json IS NOT NULL AND sequence >= ?2 ORDER BY sequence DESC LIMIT 1)
            AND gm.round_enqueued = 0
            AND NOT EXISTS (SELECT 1 FROM group_message later WHERE later.group_id = gm.group_id AND later.sequence > gm.sequence AND later.user_id IS NOT NULL)
            AND (?4 = 0 OR (gm.contributor_consent = 1 AND NOT EXISTS (SELECT 1 FROM group_member WHERE group_id = gm.group_id AND contributor_consent = 0)))
            AND (SELECT COUNT(*) FROM group_reply WHERE group_id = gm.group_id AND status IN ('queued', 'running')) < 64
          ORDER BY ga.joined_at, ga.agent_id
          ON CONFLICT(source_id, agent_id) DO NOTHING`).bind(groupID, claim.first, now, contributor),
        env.DB.prepare(`UPDATE group_message SET round_enqueued = 1 WHERE group_id = ?1 AND event_json IS NOT NULL
          AND sequence = (SELECT MAX(sequence) FROM group_message WHERE group_id = ?1 AND event_json IS NOT NULL AND sequence >= ?2)
          AND EXISTS (SELECT 1 FROM group_reply r WHERE r.source_id = group_message.id)`).bind(groupID, claim.first),
        env.DB.prepare('SELECT COUNT(*) AS count FROM group_reply r JOIN group_message gm ON gm.id = r.source_id WHERE gm.group_id = ? AND gm.event_json IS NOT NULL AND r.status = \'queued\'').bind(groupID),
      ]);
      if ((enqueued.results[0] as { count: number } | undefined)?.count) await dispatchGroup(env, groupID);
    } catch (error) {
      console.error(JSON.stringify({ event: 'group_welcome_failed', groupID, message: error instanceof Error ? error.message : 'unknown' }));
    }
  }
}
