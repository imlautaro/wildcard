import type { GroupJob } from './workflow';

// A newer group message after a reply's watermark, excluding the reply's own
// bubbles and those of earlier-ranked speakers of the same planned round: their
// drafts were part of this reply's context, so publishing them changes nothing.
// `r` is the group_reply alias; the watermark is a SQL expression or parameter.
export const newerGroupMessage = (watermark: string) => `SELECT 1 FROM group_message newer
  WHERE newer.group_id = r.group_id AND newer.sequence > ${watermark}
    AND NOT EXISTS (SELECT 1 FROM group_reply peer WHERE peer.source_id = r.source_id
      AND (peer.id = r.id OR (peer.plan_rank IS NOT NULL AND r.plan_rank IS NOT NULL AND peer.plan_rank < r.plan_rank))
      AND (newer.id = peer.id OR substr(newer.id, 1, length(peer.id) + 6) = peer.id || '/part/'))`;

// Shared actions run in turn order: plan rank within a planned round (rank 1 may
// have joined the group later), arrival order otherwise. Aliases: current, prior.
export const earlierTurn = `(CASE WHEN current.plan_rank IS NOT NULL AND prior.source_id = current.source_id
  THEN prior.plan_rank < current.plan_rank ELSE prior.sequence < current.sequence END)`;

// Presence belongs to the current attempt and its exclusive attention claim.
export async function setGroupPresence(env: Env, job: GroupJob, status: 'online' | 'typing', throughSequence: number | null = null) {
  const result = await env.DB.prepare(`UPDATE agent_presence SET status = ?3, recording_until = NULL, typing_contact_id = NULL, expires_at = ?4
    WHERE agent_id IN (SELECT r.agent_id FROM group_reply r JOIN agent_attention attention
      ON attention.agent_id = r.agent_id AND attention.turn_id = r.id AND attention.attempt = r.attempt
      WHERE r.id = ?1 AND r.attempt = ?2 AND r.status = 'running'
        AND (?5 IS NULL OR NOT EXISTS (${newerGroupMessage('?5')})))`)
    .bind(job.turnID, job.attempt, status, Date.now() + 900_000, throughSequence).run();
  return result.meta.changes > 0;
}
