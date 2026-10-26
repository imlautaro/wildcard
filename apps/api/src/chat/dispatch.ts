import { storedColumns, type StoredTurn } from './data';

export async function dispatchChat(env: Env, turn: StoredTurn) {
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

export async function recoverChats(env: Env) {
  const now = Date.now();
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
