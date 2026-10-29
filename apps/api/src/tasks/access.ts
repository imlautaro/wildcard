// Internal SQL aliases only. Completion may publish its result, but cancellation,
// pause, blocking, reassignment and resume invalidate earlier work generations.
export function taskWorkAccess(workID: string, taskID: string, agentID: string, scope = '1') {
  return `EXISTS (SELECT 1 FROM task work_task JOIN task_list work_list ON work_list.id = work_task.list_id
    JOIN task_work work_receipt ON work_receipt.task_id = work_task.id
    WHERE work_receipt.id = ${workID} AND work_task.id = ${taskID}
      AND work_receipt.generation = work_task.work_generation AND work_task.work_state = 'active'
      AND work_task.status != 'canceled' AND work_list.status = 'active' AND ${scope}
      AND work_task.assignee_kind = 'agent' AND work_task.assignee_id = ${agentID}
      AND work_receipt.agent_id = ${agentID}
      AND NOT EXISTS (SELECT 1 FROM task_dependency work_dependency JOIN task work_blocker ON work_blocker.id = work_dependency.blocked_by_id
        WHERE work_dependency.task_id = work_task.id AND work_blocker.status IN ('open', 'in_progress')))`;
}

export function privateTaskAccess(turn: string) {
  return `(${turn}.task_id IS NULL OR ${taskWorkAccess(`${turn}.id`, `${turn}.task_id`,
    `(SELECT agent_id FROM contact WHERE id = ${turn}.contact_id AND user_id = ${turn}.user_id)`,
    `work_list.contact_id = ${turn}.contact_id AND work_list.user_id = ${turn}.user_id`)})`;
}
