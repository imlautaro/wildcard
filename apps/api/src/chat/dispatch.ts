import { discardWorkflow } from './cleanup';
import { enqueueReply } from '../push/delivery';
import { storedColumns, type StoredTurn } from './data';
import { normalizedWorkflowID, validWorkflowID } from './workflow-ids';

async function normalizeClaim(env: Env, claim: { id: string; workflowID: string; attempt: number; isGroup: number }) {
  if (validWorkflowID(claim.workflowID)) return;
  const workflowID = await normalizedWorkflowID(claim.workflowID);
  const source = claim.isGroup ? 'group_reply' : 'chat_turn';
  // An invalid ID could never have started a provider instance. Rename its
  // registry entry, queued turn and claim together, preserving the attempt and
  // task budget. A concurrent clear either removes all three first or sees the
  // new registered ID. Never revive a running, canceled or superseded turn.
  await env.DB.batch([
    env.DB.prepare(`UPDATE chat_workflow_instance SET id = ?1 WHERE id = ?2
      AND EXISTS (SELECT 1 FROM ${source} WHERE id = ?3 AND attempt = ?4 AND workflow_id = ?2 AND status = 'queued')
      AND EXISTS (SELECT 1 FROM agent_attention WHERE turn_id = ?3 AND attempt = ?4 AND workflow_id = ?2)`)
      .bind(workflowID, claim.workflowID, claim.id, claim.attempt),
    env.DB.prepare(`UPDATE ${source} SET workflow_id = ?1
      WHERE id = ?3 AND attempt = ?4 AND workflow_id = ?2 AND status = 'queued'
        AND EXISTS (SELECT 1 FROM chat_workflow_instance WHERE id = ?1)`)
      .bind(workflowID, claim.workflowID, claim.id, claim.attempt),
    env.DB.prepare(`UPDATE agent_attention SET workflow_id = ?1 WHERE turn_id = ?3 AND attempt = ?4 AND workflow_id = ?2
      AND EXISTS (SELECT 1 FROM ${source} WHERE id = ?3 AND attempt = ?4 AND workflow_id = ?1 AND status = 'queued')`)
      .bind(workflowID, claim.workflowID, claim.id, claim.attempt),
  ]);
}

export async function dispatchChat(env: Env, turn: StoredTurn) {
  const agent = await env.DB.prepare('SELECT agent_id AS id FROM contact WHERE id = ? AND user_id = ?')
    .bind(turn.contactID, turn.userID).first<{ id: string }>();
  if (!agent) return;
  await dispatchAgent(env, agent.id);
}

export async function dispatchAgent(env: Env, agentID: string) {
  // Private chats and group rounds share one atomic claim per agent.
  await env.DB.prepare(`INSERT INTO agent_attention (agent_id, turn_id, attempt, workflow_id, acquired_at)
    SELECT ?1, id, attempt, workflowID, ?2 FROM (
      SELECT t.id, t.attempt, t.workflow_id AS workflowID, t.created_at AS createdAt, t.sequence AS sequence
      FROM chat_turn t JOIN contact c ON c.id = t.contact_id WHERE c.agent_id = ?1 AND t.status = 'queued'
      UNION ALL SELECT r.id, r.attempt, r.workflow_id, r.created_at, r.sequence FROM group_reply r
      WHERE r.agent_id = ?1 AND r.status = 'queued' AND NOT EXISTS (
        SELECT 1 FROM group_reply prior WHERE prior.group_id = r.group_id
          AND prior.status IN ('queued','running') AND prior.sequence < r.sequence)
    ) ORDER BY createdAt, sequence, id LIMIT 1 ON CONFLICT(agent_id) DO NOTHING`).bind(agentID, Date.now()).run();
  const readClaim = () => env.DB.prepare(`SELECT a.turn_id AS id, a.workflow_id AS workflowID, a.attempt,
    (SELECT COALESCE(contact_id,group_id,agent_id) FROM chat_workflow_instance WHERE id=a.workflow_id) AS cleanupScope,
    EXISTS (SELECT 1 FROM group_reply r WHERE r.id = a.turn_id) AS isGroup
    FROM agent_attention a WHERE a.agent_id = ?`).bind(agentID)
    .first<{ id: string; workflowID: string; attempt: number; isGroup: number; cleanupScope: string | null }>();
  let turn = await readClaim();
  if (turn && !validWorkflowID(turn.workflowID)) {
    await normalizeClaim(env, turn);
    turn = await readClaim();
  }
  if (!turn) return;
  if (!validWorkflowID(turn.workflowID)) {
    console.error(JSON.stringify({ event: 'chat_invalid_workflow_claim', turnID: turn.id }));
    return;
  }
  try {
    const registered = await env.DB.prepare('SELECT id FROM chat_workflow_instance WHERE id=?').bind(turn.workflowID).first();
    if (!registered) return;
    await env.CHAT_WORKFLOW.create({ id: turn.workflowID, params: turn.isGroup ? { kind: 'group', turnID: turn.id, attempt: turn.attempt } : { turnID: turn.id, attempt: turn.attempt } });
    if (!await env.DB.prepare('SELECT id FROM chat_workflow_instance WHERE id=?').bind(turn.workflowID).first()) await discardWorkflow(env,turn.workflowID,turn.cleanupScope ?? turn.id);
  } catch {
    // The service may have created the instance even when its acknowledgement was
    // lost. A clear can already have drained the original deletion job by then.
    if (!await env.DB.prepare('SELECT id FROM chat_workflow_instance WHERE id=?').bind(turn.workflowID).first()) {
      await discardWorkflow(env,turn.workflowID,turn.cleanupScope ?? turn.id);
      return;
    }
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
          await env.DB.prepare(`UPDATE chat_turn SET status = CASE WHEN assistant_text IS NULL THEN 'failed' ELSE 'complete' END,
            error_code = CASE WHEN assistant_text IS NULL THEN 'GENERATION_INTERRUPTED' ELSE NULL END, updated_at = ?
            WHERE id = ? AND attempt = ? AND status IN ('queued', 'running')`)
            .bind(now, claim.turnID, claim.attempt).run();
          await enqueueReply(env.DB, claim.turnID, claim.attempt, now).run();
          await env.DB.prepare(`UPDATE group_reply SET status = 'failed' WHERE id = ? AND attempt = ? AND status IN ('queued','running')`)
            .bind(claim.turnID, claim.attempt).run();
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
          await env.DB.prepare(`UPDATE chat_turn SET status = CASE WHEN assistant_text IS NULL THEN 'failed' ELSE 'complete' END,
            error_code = CASE WHEN assistant_text IS NULL THEN 'GENERATION_INTERRUPTED' ELSE NULL END, updated_at = ?1
            WHERE id = ?2 AND attempt = ?3 AND status IN ('queued', 'running')`)
            .bind(now, turn.id, turn.attempt).run();
          await enqueueReply(env.DB, turn.id, turn.attempt, now).run();
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
