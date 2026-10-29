import { dispatchTasks } from '../tasks/dispatch';
import { fetchMonitor, monitorActive, monitorDiff, monitorLimits, monitorTerms } from './check';

type Due = { id: string; url: string; keywords: string | null; interval: number; dueAt: number; generation: number;
  stateURL: string | null; hash: string | null; recentHashes: string | null; snapshot: string | null };

/**
 * Runs from the minute Cron. Checks are code only: fetching, extracting text,
 * hashing and diffing never call a model. Only a new relevant change marks the
 * task for a contact turn, which `dispatchTasks` admits under the monitor budget.
 */
export async function dispatchMonitors(env: Env) {
  const now = Date.now();
  const { results } = await env.DB.prepare(`SELECT t.id, t.monitor_url AS url, t.monitor_keywords AS keywords, t.monitor_interval AS interval,
      t.monitor_due_at AS dueAt, t.work_generation AS generation, s.url AS stateURL, s.hash, s.recent_hashes AS recentHashes, s.snapshot
    FROM task t JOIN task_list l ON l.id = t.list_id LEFT JOIN task_monitor_state s ON s.task_id = t.id
    WHERE t.monitor_due_at <= ? AND ${monitorActive} ORDER BY t.monitor_due_at LIMIT ${monitorLimits.checksPerRun}`).bind(now).all<Due>();
  let changed = false;
  for (const task of results) {
    try {
      // Claim this occurrence before fetching, so concurrent Cron runs check once.
      const claimed = await env.DB.prepare(`UPDATE task SET monitor_due_at = ? WHERE id = ? AND monitor_due_at = ? AND monitor_url = ?`)
        .bind(now + task.interval * 60_000, task.id, task.dueAt, task.url).run();
      if (!claimed.meta.changes) continue;
      const fetched = await fetchMonitor(task.url);
      const known = task.stateURL === task.url && task.hash !== null && task.snapshot !== null;
      const recent = known ? JSON.parse(task.recentHashes ?? '[]') as string[] : [];
      let outcome: string, excerpt: string | null = null;
      if (fetched.outcome === 'failed') outcome = 'failed';
      else if (!known) outcome = 'baseline';
      else if (fetched.hash === task.hash) outcome = 'unchanged';
      // Content that alternates between recent versions (rotating banners, A/B pages) is not news.
      else if (recent.includes(fetched.hash)) outcome = 'repeated';
      else {
        const diff = monitorDiff(task.snapshot!, fetched.text, monitorTerms(task.keywords));
        outcome = diff.relevant ? 'changed' : 'ignored';
        excerpt = diff.excerpt;
      }
      // Every write requires the URL and execution generation this check was based on,
      // so a revoked, changed or paused grant cannot receive a late result.
      const current = 'EXISTS (SELECT 1 FROM task WHERE id = ?1 AND monitor_url = ?2 AND work_generation = ?3)';
      const hashes = fetched.outcome === 'fetched' && known && task.hash !== fetched.hash
        ? [task.hash!, ...recent.filter(hash => hash !== task.hash && hash !== fetched.hash)].slice(0, monitorLimits.recentHashes) : recent;
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO task_monitor_check (id, task_id, url, generation, outcome, http_status, error_code, excerpt, checked_at)
          SELECT ?4, ?1, ?2, ?3, ?5, ?6, ?7, ?8, ?9 WHERE ${current}`)
          .bind(task.id, task.url, task.generation, crypto.randomUUID(), outcome, fetched.httpStatus,
            fetched.outcome === 'failed' ? fetched.errorCode : null, excerpt, now),
        ...(fetched.outcome === 'fetched' ? [env.DB.prepare(`INSERT INTO task_monitor_state (task_id, url, hash, recent_hashes, snapshot, checked_at, changed_at)
          SELECT ?1, ?2, ?4, ?5, ?6, ?7, CASE WHEN ?8 = 1 THEN ?7 END WHERE ${current}
          ON CONFLICT(task_id) DO UPDATE SET url = excluded.url, hash = excluded.hash, recent_hashes = excluded.recent_hashes,
            snapshot = excluded.snapshot, checked_at = excluded.checked_at, changed_at = COALESCE(excluded.changed_at, task_monitor_state.changed_at)`)
          .bind(task.id, task.url, task.generation, fetched.hash, JSON.stringify(hashes), fetched.text, now,
            ['repeated', 'ignored', 'changed'].includes(outcome) ? 1 : 0)] : []),
        ...(outcome === 'changed' ? [env.DB.prepare(`UPDATE task SET monitor_pending_at = COALESCE(monitor_pending_at, ?4)
          WHERE id = ?1 AND monitor_url = ?2 AND work_generation = ?3`).bind(task.id, task.url, task.generation, now)] : []),
        env.DB.prepare(`DELETE FROM task_monitor_check WHERE task_id = ?1 AND id NOT IN
          (SELECT id FROM task_monitor_check WHERE task_id = ?1 ORDER BY checked_at DESC LIMIT ${monitorLimits.checksKept})`).bind(task.id),
      ]);
      changed ||= outcome === 'changed';
      console.log(JSON.stringify({ event: 'task_monitor_checked', outcome }));
    } catch { console.error(JSON.stringify({ event: 'task_monitor_deferred' })); }
  }
  if (changed) await dispatchTasks(env);
}
