import { deliverGroupPush } from './push';
import { groupEnergyAvailable } from './energy';
import { groupSourceAccess } from './request-access';
import { messageDelay } from '../chat/messages';
import { setGroupPresence } from './presence';
import type { GroupJob } from './workflow';

// One publication lane per group orders every contact bubble, including the
// short announcement a contact sends before it starts researching.

// The insert trigger offers other bots a turn. Close only opportunities created
// by this terminal message, in the same transaction, before dispatch can see them.
export const closeTerminalContinuations = (db: D1Database, messageID: string) => db.prepare(`UPDATE group_reply SET status = 'complete'
  WHERE source_id = ?1 AND status = 'queued'
    AND EXISTS (SELECT 1 FROM group_message WHERE id = ?1 AND agent_id IS NOT NULL)`)
  .bind(messageID);

export async function claimPublication(env: Env, job: GroupJob) {
  // A terminated/failed attempt must not strand the group's publication lane.
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM group_publication WHERE group_id = (SELECT group_id FROM group_reply WHERE id = ?1)
      AND NOT EXISTS (SELECT 1 FROM group_reply r JOIN agent_attention a ON a.turn_id = r.id AND a.attempt = r.attempt
        WHERE r.id = group_publication.turn_id AND r.attempt = group_publication.attempt AND r.status = 'running')`)
      .bind(job.turnID),
    env.DB.prepare(`INSERT INTO group_publication(group_id, turn_id, attempt, acquired_at)
      SELECT r.group_id, r.id, r.attempt, ?3 FROM group_reply r JOIN agent_attention a ON a.turn_id = r.id AND a.attempt = r.attempt
      WHERE r.id = ?1 AND r.attempt = ?2 AND r.status = 'running'
        -- Planned speakers publish in rank order, and a bot-to-bot continuation
        -- waits for an earlier planned round to finish instead of interleaving.
        AND NOT EXISTS (SELECT 1 FROM group_reply peer WHERE peer.source_id = r.source_id
          AND peer.plan_rank < r.plan_rank AND peer.status IN ('queued', 'running'))
        AND NOT EXISTS (SELECT 1 FROM group_message source JOIN group_reply peer ON peer.group_id = source.group_id
          JOIN group_message peer_source ON peer_source.id = peer.source_id
          WHERE source.id = r.source_id AND source.agent_id IS NOT NULL AND peer.plan_rank IS NOT NULL
            AND peer.status IN ('queued', 'running') AND peer_source.sequence < source.sequence)
      ON CONFLICT DO NOTHING`)
      .bind(job.turnID, job.attempt, Date.now()),
  ]);
  return !!await env.DB.prepare('SELECT 1 FROM group_publication WHERE turn_id = ? AND attempt = ?')
    .bind(job.turnID, job.attempt).first();
}

export async function releasePublication(env: Env, job: GroupJob) {
  await env.DB.prepare('DELETE FROM group_publication WHERE turn_id = ? AND attempt = ?')
    .bind(job.turnID, job.attempt).run();
}

// Recheck attention, source-author access, shared-agent consent and Contributor
// eligibility at publication, not just before a potentially slow model request.
export const publicationAccess = (contributor: boolean) => `EXISTS (SELECT 1 FROM group_publication lane
    WHERE lane.turn_id = r.id AND lane.attempt = r.attempt AND lane.group_id = r.group_id) AND EXISTS (SELECT 1 FROM agent_attention attention
    WHERE attention.agent_id = r.agent_id AND attention.turn_id = r.id AND attention.attempt = r.attempt)
  AND EXISTS (SELECT 1 FROM group_agent member WHERE member.group_id = r.group_id AND member.agent_id = r.agent_id)
  AND ${groupSourceAccess('r', contributor)}
  AND EXISTS (SELECT 1 FROM contact_agent agent JOIN contact owner_contact
    ON owner_contact.agent_id = agent.id AND owner_contact.user_id = agent.owner_id
    WHERE agent.id = r.agent_id AND agent.memory_shared = 1)
  AND NOT EXISTS (SELECT 1 FROM group_member member WHERE member.group_id = r.group_id
    AND ?5 = 1 AND member.contributor_consent = 0)`;

// Publish a contact's "looking it up" bubble (`<reply>/part/0`) before its search.
// Bounded: if the lane stays busy, the Researching indicator alone informs people.
export async function announceGroupResearch(env: Env, job: GroupJob, text: string) {
  let claimed = false;
  for (let wait = 0; wait < 8 && !claimed; wait++) {
    claimed = await claimPublication(env, job);
    if (!claimed) await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!claimed) return false;
  const id = `${job.turnID}/part/0`;
  try {
    if (await setGroupPresence(env, job, 'typing')) await new Promise(resolve => setTimeout(resolve, Math.min(messageDelay(text, job.turnID), 3000)));
    const contributor = env.META_CHAT_MODEL.includes('contributor');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO group_message (id, group_id, agent_id, sender_name, text, created_at, contributor_consent, exchange_id, requester_id)
        SELECT ?3, r.group_id, r.agent_id, agent.name, ?4, ?6, ?5, source.exchange_id, source.requester_id
        FROM group_reply r JOIN contact_agent agent ON agent.id = r.agent_id JOIN group_message source ON source.id = r.source_id
        WHERE r.id = ?1 AND r.attempt = ?2 AND r.status = 'running' AND ${publicationAccess(contributor)} AND ${groupEnergyAvailable('r')}
          AND NOT EXISTS (SELECT 1 FROM group_message own WHERE own.id = r.id) ON CONFLICT(id) DO NOTHING`)
        .bind(job.turnID, job.attempt, id, text, contributor ? 1 : 0, Date.now()),
      closeTerminalContinuations(env.DB, id),
    ]);
  } finally { await releasePublication(env, job); }
  const published = !!await env.DB.prepare('SELECT 1 FROM group_message WHERE id = ?').bind(id).first();
  if (published) {
    try { await deliverGroupPush(env, id); }
    catch { console.error(JSON.stringify({ event: 'group_push_deferred' })); }
  }
  return published;
}
