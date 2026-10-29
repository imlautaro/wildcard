import { dispatchChat } from '../chat/dispatch';
import { storedColumns, type StoredTurn } from '../chat/data';
import { dispatchGroup } from '../groups/workflow';
import { taskLimits } from './data';

const reasons: Record<string, string> = { assigned: 'assigned to', unblocked: 'unblocked for', review: 'still open for' };

/**
 * Starts contact work turns for due tasks. Runs from the minute Cron and right after
 * task mutations. Each turn pushes the task's next review back, so an open task
 * gets a proactive turn at most every `reviewDelay`, up to `workPerTask` turns
 * in total, and each contact at most `agentDaily` per 24 hours.
 * Blocked tasks wait without turns until their last blocker is done or canceled.
 */
export async function dispatchTasks(env: Env) {
  if (!env.META_API_KEY?.trim()) return;
  const now = Date.now();
  const { results } = await env.DB.prepare(`SELECT t.id, t.title, t.assignee_id AS agentID, t.work_reason AS reason, t.work_count AS count, t.work_generation AS generation,
      l.group_id AS groupID, l.contact_id AS contactID, l.user_id AS userID, t.created_by_kind AS creatorKind, t.created_by_id AS creatorID,
      l.created_by_kind AS listCreatorKind, l.created_by_id AS listCreatorID
    FROM task t JOIN task_list l ON l.id = t.list_id
    WHERE t.work_due_at <= ?1 AND t.status IN ('open', 'in_progress') AND t.assignee_kind = 'agent' AND l.status = 'active' AND t.work_state = 'active'
      AND NOT EXISTS (SELECT 1 FROM task_dependency d JOIN task blocker ON blocker.id = d.blocked_by_id
        WHERE d.task_id = t.id AND blocker.status IN ('open', 'in_progress'))
    ORDER BY t.work_due_at LIMIT 10`).bind(now)
    .all<{ id: string; title: string; agentID: string; reason: string | null; count: number; generation: number; groupID: string | null; contactID: string | null;
      userID: string | null; creatorKind: string; creatorID: string; listCreatorKind: string; listCreatorID: string }>();
  for (const task of results) {
    try {
      // Only defers the snapshot this run saw, so a concurrent run's scheduled review survives.
      const defer = (delay: number, stop = false) => env.DB.prepare(`UPDATE task SET work_due_at = ?2 WHERE id = ?1 AND work_count = ?3 AND work_generation = ?4 AND work_state = 'active'`)
        .bind(task.id, stop ? null : now + delay, task.count, task.generation).run();
      if (task.count >= taskLimits.workPerTask) { await defer(0, true); continue; }
      const daily = await env.DB.prepare('SELECT COUNT(*) AS count FROM task_work WHERE agent_id = ? AND created_at > ?')
        .bind(task.agentID, now - 86_400_000).first<{ count: number }>();
      if ((daily?.count ?? 0) >= taskLimits.agentDaily) { await defer(taskLimits.reviewDelay); continue; }
      // Unique per execution generation; ordinary progress edits keep the same authority.
      const workID = `task-${task.id}-g${task.generation}-${task.count + 1}`;
      // Budget and next review are recorded in the same batch as the turn, only if it was created.
      const recorded = (source: string) => [
        env.DB.prepare(`INSERT INTO task_work (id, task_id, agent_id, reason, created_at, generation) SELECT ?1, ?2, ?3, ?4, ?5, ?6
          WHERE EXISTS (SELECT 1 FROM ${source} WHERE id = ?1) ON CONFLICT(id) DO NOTHING`)
          .bind(workID, task.id, task.agentID, task.reason ?? 'review', now, task.generation),
        env.DB.prepare(`UPDATE task SET work_count = work_count + 1, work_due_at = ?2, work_reason = 'review'
          WHERE id = ?1 AND work_count = ?3 AND work_generation = ?5 AND work_state = 'active' AND EXISTS (SELECT 1 FROM ${source} WHERE id = ?4)`)
          .bind(task.id, now + taskLimits.reviewDelay, task.count, workID, task.generation),
      ];
      // Admission is rechecked inside the insertion transaction, including the daily
      // ledger, so simultaneous dispatchers cannot overspend from stale snapshots.
      const admission = `EXISTS (SELECT 1 FROM task current_task JOIN task_list current_list ON current_list.id = current_task.list_id
        WHERE current_task.id = ?4 AND current_task.work_count = ${task.count} AND current_task.work_generation = ${task.generation}
          AND current_task.work_state = 'active' AND current_task.status IN ('open', 'in_progress')
          AND current_task.assignee_kind = 'agent' AND current_task.assignee_id = ?7 AND current_list.status = 'active'
          AND current_task.work_count < ${taskLimits.workPerTask}
          AND NOT EXISTS (SELECT 1 FROM task_dependency d JOIN task blocker ON blocker.id = d.blocked_by_id
            WHERE d.task_id = current_task.id AND blocker.status IN ('open', 'in_progress')))
        AND (SELECT COUNT(*) FROM task_work WHERE agent_id = ?7 AND created_at > ${now - 86_400_000}) < ${taskLimits.agentDaily}`;
      if (task.contactID && task.userID) {
        const [inserted] = await env.DB.batch([
          env.DB.prepare(`INSERT INTO chat_turn (id, contact_id, user_id, user_text, status, workflow_id, created_at, updated_at, time_zone, task_id)
            SELECT ?1, c.id, c.user_id, '', 'queued', ?2, ?3, ?3,
              (SELECT time_zone FROM chat_turn WHERE contact_id = c.id AND user_id = c.user_id AND time_zone IS NOT NULL ORDER BY sequence DESC LIMIT 1), ?4
            FROM contact c WHERE c.id = ?5 AND c.user_id = ?6 AND c.agent_id = ?7 AND ${admission}
              AND NOT EXISTS (SELECT 1 FROM chat_turn WHERE contact_id = c.id AND status IN ('queued', 'running'))
              AND (SELECT COUNT(*) FROM chat_turn WHERE user_id = c.user_id AND status IN ('queued', 'running')) < 10
            ON CONFLICT DO NOTHING RETURNING ${storedColumns}`)
            .bind(workID, `chat-${workID}-a1`, now, task.id, task.contactID, task.userID, task.agentID),
          ...recorded('chat_turn'),
        ]);
        const turn = (inserted!.results as StoredTurn[])[0];
        if (!turn) { await defer(60_000); continue; }
        await dispatchChat(env, turn);
      } else if (task.groupID) {
        // An internal "Tasks" notice from no member gives the assignee one reply opportunity.
        // It names a responsible human (task creator, list creator or group owner) so the
        // existing membership and consent checks apply to it.
        const [message] = await env.DB.batch([
          env.DB.prepare(`INSERT INTO group_message (id, group_id, sender_name, text, created_at, contributor_consent, exchange_id, requester_id, round_enqueued, task_id)
            SELECT ?1, g.id, 'Tasks', ?3 || a.name || ': ' || ?4, ?5, m.contributor_consent, ?1, m.user_id, 1, ?6
            FROM chat_group g JOIN group_agent ga ON ga.group_id = g.id AND ga.agent_id = ?7 JOIN contact_agent a ON a.id = ga.agent_id
            JOIN group_member m ON m.group_id = g.id AND m.user_id = COALESCE(
              (SELECT user_id FROM group_member WHERE group_id = g.id AND user_id = ?8 AND ?9 = 'user'),
              (SELECT user_id FROM group_member WHERE group_id = g.id AND user_id = ?10 AND ?11 = 'user'), g.owner_id)
            WHERE g.id = ?2 AND ${admission.replaceAll('?4', '?6')}
              AND m.share_memory = 1 AND a.memory_shared = 1
              AND (EXISTS (SELECT 1 FROM mcp_private_group WHERE group_id = g.id) OR COALESCE((SELECT chat_model FROM user WHERE id = m.user_id), '') NOT LIKE '%contributor%' OR NOT EXISTS (SELECT 1 FROM group_member consent WHERE consent.group_id = g.id AND consent.contributor_consent = 0))
              AND (SELECT COUNT(*) FROM group_reply WHERE group_id = g.id AND status IN ('queued', 'running')) < 64
            ON CONFLICT(id) DO NOTHING`)
            .bind(workID, task.groupID, `Task ${reasons[task.reason ?? 'review'] ?? 'for'} `, task.title, now, task.id, task.agentID,
              task.creatorID, task.creatorKind, task.listCreatorID, task.listCreatorKind),
          env.DB.prepare(`INSERT INTO group_reply (id, group_id, agent_id, source_id, workflow_id, created_at)
            SELECT 'group-' || gm.id || '-' || ?3, gm.group_id, ?3, gm.id, 'group-' || gm.id || '-' || ?3 || '-1', gm.created_at
            FROM group_message gm WHERE gm.id = ?1 AND gm.group_id = ?2 ON CONFLICT(source_id, agent_id) DO NOTHING`)
            .bind(workID, task.groupID, task.agentID),
          ...recorded('group_message'),
        ]);
        if (!message!.meta.changes) {
          // The contact left the group or the queue is full; retry later.
          await defer(5 * 60_000);
          continue;
        }
        await dispatchGroup(env, task.groupID);
      }
    } catch { console.error(JSON.stringify({ event: 'task_dispatch_deferred' })); }
  }
}
