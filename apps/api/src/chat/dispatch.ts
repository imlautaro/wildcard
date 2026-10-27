import { storedColumns, type StoredTurn } from './data';

export async function dispatchChat(env: Env, turn: StoredTurn) {
  const agent = await env.DB.prepare('SELECT agent_id AS id FROM contact WHERE id = ? AND user_id = ?')
    .bind(turn.contactID, turn.userID).first<{ id: string }>();
  if (!agent) return;
  await dispatchAgent(env, agent.id);
}

export async function dispatchAgent(env: Env, agentID: string) {
  // Claim the oldest waiting conversation atomically. Queued messages are not read
  // by a Workflow until the previous reply and its memory maintenance finish.
  await env.DB.prepare(`INSERT INTO agent_attention (agent_id, turn_id, attempt, workflow_id, acquired_at)
    SELECT c.agent_id, t.id, t.attempt, t.workflow_id, ?2 FROM chat_turn t
    JOIN contact c ON c.id = t.contact_id WHERE c.agent_id = ?1 AND t.status = 'queued'
    ORDER BY t.sequence LIMIT 1 ON CONFLICT(agent_id) DO NOTHING`).bind(agentID, Date.now()).run();
  const turn = await env.DB.prepare(`SELECT turn_id AS id, workflow_id AS workflowID, attempt
    FROM agent_attention WHERE agent_id = ?`).bind(agentID)
    .first<{ id: string; workflowID: string; attempt: number }>();
  if (!turn) return;
  try {
    await env.CHAT_WORKFLOW.create({ id: turn.workflowID, params: { turnID: turn.id, attempt: turn.attempt } });
  } catch {
    try {
      const instance = await env.CHAT_WORKFLOW.get(turn.workflowID);
      await instance.status();
    } catch {
      console.error(JSON.stringify({ event: 'chat_dispatch_deferred', turnID: turn.id }));
    }
  }
}

export async function releaseAttention(env: Env, job: { turnID: string; attempt: number }) {
  const row = await env.DB.prepare(`DELETE FROM agent_attention WHERE turn_id = ? AND attempt = ?
    RETURNING agent_id AS id`).bind(job.turnID, job.attempt).first<{ id: string }>();
  if (row) await dispatchAgent(env, row.id);
}

export async function recoverChats(env: Env) {
  const now = Date.now();
  const { results: claims } = await env.DB.prepare(`SELECT agent_id AS agentID, turn_id AS turnID,
    attempt, workflow_id AS workflowID FROM agent_attention WHERE checked_at < ?
    ORDER BY checked_at, acquired_at LIMIT 50`).bind(now - 60_000)
    .all<{ agentID: string; turnID: string; attempt: number; workflowID: string }>();
  for (let offset = 0; offset < claims.length; offset += 5) {
    const outcomes = await Promise.allSettled(claims.slice(offset, offset + 5).map(async (claim) => {
      await env.DB.prepare('UPDATE agent_attention SET checked_at = ? WHERE turn_id = ? AND attempt = ?')
        .bind(now, claim.turnID, claim.attempt).run();
      try {
        const instance = await env.CHAT_WORKFLOW.get(claim.workflowID);
        const { status } = await instance.status();
        if (['complete', 'errored', 'terminated'].includes(status)) {
          await env.DB.prepare(`UPDATE chat_turn SET status = 'failed', error_code = 'GENERATION_INTERRUPTED', updated_at = ?
            WHERE id = ? AND attempt = ? AND status IN ('queued', 'running')`)
            .bind(now, claim.turnID, claim.attempt).run();
          await releaseAttention(env, claim);
        }
      } catch { await dispatchAgent(env, claim.agentID); }
    }));
    if (outcomes.some((outcome) => outcome.status === 'rejected')) {
      console.error(JSON.stringify({ event: 'agent_recovery_deferred' }));
    }
  }
  const { results } = await env.DB.prepare(`SELECT ${storedColumns} FROM chat_turn
    WHERE status IN ('queued', 'running') AND checked_at < ?1
    ORDER BY checked_at, sequence LIMIT 50`).bind(now - 60_000).all<StoredTurn>();
  // Bound control-plane concurrency and rotate checks fairly across active turns.
  for (let offset = 0; offset < results.length; offset += 5) {
    const outcomes = await Promise.allSettled(results.slice(offset, offset + 5).map(async (turn) => {
      await env.DB.prepare('UPDATE chat_turn SET checked_at = ?1 WHERE id = ?2 AND attempt = ?3')
        .bind(now, turn.id, turn.attempt).run();
      try {
        const instance = await env.CHAT_WORKFLOW.get(turn.workflowID);
        const { status } = await instance.status();
        if (status === 'complete' || status === 'errored' || status === 'terminated') {
          await env.DB.prepare(`UPDATE chat_turn SET status = 'failed', error_code = 'GENERATION_INTERRUPTED', updated_at = ?1
            WHERE id = ?2 AND attempt = ?3 AND status IN ('queued', 'running')`)
            .bind(now, turn.id, turn.attempt).run();
          await releaseAttention(env, { turnID: turn.id, attempt: turn.attempt });
        }
      } catch {
        if (turn.status === 'queued') await dispatchChat(env, turn);
        else console.error(JSON.stringify({ event: 'chat_status_check_deferred', turnID: turn.id }));
      }
    }));
    if (outcomes.some((outcome) => outcome.status === 'rejected')) {
      console.error(JSON.stringify({ event: 'chat_recovery_deferred' }));
    }
  }
}

export async function terminateChats(env: Env, workflowIDs: string[]) {
  await Promise.all(workflowIDs.map(async (id) => {
    try { await (await env.CHAT_WORKFLOW.get(id)).terminate(); }
    catch { console.error(JSON.stringify({ event: 'chat_termination_deferred' })); }
  }));
}
