// Shared to-do lists. Humans (routes) and contacts (tools) use the same mutations, so
// membership, dependency and work-scheduling rules are enforced in one place.
export type TaskScope = { kind: 'contact'; contactID: string; userID: string } | { kind: 'group'; groupID: string };
export type TaskActor = { kind: 'user' | 'agent'; id: string };
export type TaskStatus = 'open' | 'in_progress' | 'done' | 'canceled';
export type TaskAssignee = { kind: 'user' | 'agent'; id: string } | null;
export type TaskInput = { id?: string; title: string; notes?: string | null; assignee?: TaskAssignee; blockedBy?: string[] };
export type TaskWorkState = 'active' | 'paused' | 'blocked';
export type TaskPatch = { workState?: TaskWorkState; nextStep?: string | null; evidence?: string | null; blockedReason?: string | null; title?: string; notes?: string | null; status?: TaskStatus; assignee?: TaskAssignee; result?: string | null; blockedBy?: string[] };

export class TaskError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 = 400) { super(message); }
}

export const taskLimits = { lists: 20, tasks: 50, title: 300, listTitle: 200, notes: 2000, blockers: 10,
  // Contact work turns: each task gets at most this many over its lifetime, with
  // a proactive review this long after each turn while it stays open.
  workPerTask: 6, reviewDelay: 30 * 60_000, agentDaily: 30 };
const statuses: TaskStatus[] = ['open', 'in_progress', 'done', 'canceled'];
const open = `status IN ('open', 'in_progress')`;

type Row = { id: string; listID: string; position: number; title: string; notes: string | null; status: TaskStatus;
  assigneeKind: 'user' | 'agent' | null; assigneeID: string | null; result: string | null; createdByKind: string; createdByID: string;
  version: number; createdAt: number; updatedAt: number; completedAt: number | null; workDueAt: number | null; workState: TaskWorkState; nextStep: string | null; evidence: string | null; blockedReason: string | null; workUsed: number; blockedByJSON: string };
type ListRow = { id: string; title: string; status: 'active' | 'canceled'; createdByKind: string; createdByID: string; createdAt: number; updatedAt: number };

const scopeWhere = (scope: TaskScope, alias = 'l') => scope.kind === 'group'
  ? { sql: `${alias}.group_id = ?`, binds: [scope.groupID] }
  : { sql: `${alias}.contact_id = ? AND ${alias}.user_id = ?`, binds: [scope.contactID, scope.userID] };

/** Members who can own a task: the person and the contact in a private chat, or group members. */
export async function taskMembers(db: D1Database, scope: TaskScope) {
  const { results } = scope.kind === 'group'
    ? await db.prepare(`SELECT 'user' AS kind, u.id, u.name FROM group_member m JOIN user u ON u.id = m.user_id WHERE m.group_id = ?1
        UNION ALL SELECT 'agent', a.id, a.name FROM group_agent ga JOIN contact_agent a ON a.id = ga.agent_id WHERE ga.group_id = ?1`)
      .bind(scope.groupID).all<{ kind: 'user' | 'agent'; id: string; name: string }>()
    : await db.prepare(`SELECT 'user' AS kind, u.id, u.name FROM user u WHERE u.id = ?2
        UNION ALL SELECT 'agent', c.agent_id, c.name FROM contact c WHERE c.id = ?1 AND c.user_id = ?2 AND c.agent_id IS NOT NULL`)
      .bind(scope.contactID, scope.userID).all<{ kind: 'user' | 'agent'; id: string; name: string }>();
  return results;
}

export async function readTaskLists(db: D1Database, scope: TaskScope, includeCanceled = true) {
  const where = scopeWhere(scope);
  const { results: lists } = await db.prepare(`SELECT l.id, l.title, l.status, l.created_by_kind AS createdByKind,
    l.created_by_id AS createdByID, l.created_at AS createdAt, l.updated_at AS updatedAt FROM task_list l
    WHERE ${where.sql} ${includeCanceled ? '' : `AND l.status = 'active'`} ORDER BY l.status = 'active' DESC, l.updated_at DESC LIMIT ${taskLimits.lists}`)
    .bind(...where.binds).all<ListRow>();
  if (!lists.length) return [];
  const { results: tasks } = await db.prepare(`SELECT t.id, t.list_id AS listID, t.position, t.title, t.notes, t.status,
    t.assignee_kind AS assigneeKind, t.assignee_id AS assigneeID, t.result, t.created_by_kind AS createdByKind, t.created_by_id AS createdByID,
    t.version, t.created_at AS createdAt, t.updated_at AS updatedAt, t.completed_at AS completedAt, t.work_due_at AS workDueAt, t.work_state AS workState, t.next_step AS nextStep, t.evidence, t.blocked_reason AS blockedReason, t.work_count AS workUsed,
    COALESCE((SELECT json_group_array(d.blocked_by_id) FROM task_dependency d WHERE d.task_id = t.id), '[]') AS blockedByJSON
    FROM task t WHERE t.list_id IN (SELECT value FROM json_each(?)) ORDER BY t.position`)
    .bind(JSON.stringify(lists.map(list => list.id))).all<Row>();
  const members = new Map((await taskMembers(db, scope)).map(member => [`${member.kind}:${member.id}`, member.name]));
  const byID = new Map(tasks.map(task => [task.id, task]));
  return lists.map(list => ({ ...list, tasks: tasks.filter(task => task.listID === list.id).map(({ blockedByJSON, workDueAt, ...task }) => {
    const blockedBy = JSON.parse(blockedByJSON) as string[];
    return { ...task, blockedBy,
      blocked: blockedBy.some(id => ['open', 'in_progress'].includes(byID.get(id)?.status ?? 'done')),
      assigneeName: task.assigneeKind ? members.get(`${task.assigneeKind}:${task.assigneeID}`) ?? 'Former member' : null,
      createdByName: members.get(`${task.createdByKind}:${task.createdByID}`) ?? 'Former member',
      workScheduled: workDueAt !== null && task.workState === 'active' && task.workUsed < taskLimits.workPerTask,
      workLimit: taskLimits.workPerTask };
  }) }));
}
export type TaskList = Awaited<ReturnType<typeof readTaskLists>>[number];

function text(value: unknown, max: number, label: string, optional: true): string | null | undefined;
function text(value: unknown, max: number, label: string, optional?: false): string;
function text(value: unknown, max: number, label: string, optional = false) {
  if (optional && (value === undefined || value === null)) return value as null | undefined;
  if (typeof value !== 'string' || !value.trim() || [...value.trim()].length > max || value.includes('\0')) {
    throw new TaskError(`${label} must be 1–${max} characters.`);
  }
  return value.trim();
}

export function parseAssignee(value: unknown): TaskAssignee | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new TaskError('assignee must be {kind, id} or null.');
  const { kind, id } = value as Record<string, unknown>;
  if ((kind !== 'user' && kind !== 'agent') || typeof id !== 'string' || !id || id.length > 100) throw new TaskError('assignee must be {kind: "user" | "agent", id}.');
  return { kind, id };
}
function parseBlockers(value: unknown) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > taskLimits.blockers || !value.every(id => typeof id === 'string' && id.length <= 100)) {
    throw new TaskError(`blockedBy must list up to ${taskLimits.blockers} task IDs.`);
  }
  return [...new Set(value as string[])];
}
export function parseTaskInput(value: unknown): TaskInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TaskError('Each task must be an object.');
  const input = value as Record<string, unknown>;
  if (input.id !== undefined && (typeof input.id !== 'string' || !/^[A-Za-z0-9:_-]{8,100}$/.test(input.id))) throw new TaskError('Invalid task id.');
  return { id: input.id as string | undefined, title: text(input.title, taskLimits.title, 'Task title'),
    notes: text(input.notes, taskLimits.notes, 'Notes', true), assignee: parseAssignee(input.assignee), blockedBy: parseBlockers(input.blockedBy) };
}
export function parseTaskPatch(value: Record<string, unknown>): TaskPatch {
  if (value.status !== undefined && !statuses.includes(value.status as TaskStatus)) throw new TaskError('status must be open, in_progress, done or canceled.');
  if (value.workState !== undefined && !['active', 'paused', 'blocked'].includes(value.workState as string)) throw new TaskError('workState must be active, paused or blocked.');
  return { workState: value.workState as TaskWorkState | undefined, nextStep: text(value.nextStep, taskLimits.notes, 'Next step', true),
    evidence: text(value.evidence, taskLimits.notes, 'Evidence', true), blockedReason: text(value.blockedReason, taskLimits.notes, 'Blocked reason', true),
    title: value.title === undefined ? undefined : text(value.title, taskLimits.title, 'Task title'),
    notes: text(value.notes, taskLimits.notes, 'Notes', true), status: value.status as TaskStatus | undefined,
    assignee: parseAssignee(value.assignee), result: text(value.result, taskLimits.notes, 'Result', true), blockedBy: parseBlockers(value.blockedBy) };
}

async function requireMember(db: D1Database, scope: TaskScope, assignee: TaskAssignee | undefined) {
  if (!assignee) return;
  if (!(await taskMembers(db, scope)).some(member => member.kind === assignee.kind && member.id === assignee.id)) {
    throw new TaskError('The assignee must be a current member of this chat. Use list_tasks to see members.');
  }
}

async function findList(db: D1Database, scope: TaskScope, listID: string) {
  const where = scopeWhere(scope);
  const list = await db.prepare(`SELECT l.id, l.status FROM task_list l WHERE l.id = ? AND ${where.sql}`)
    .bind(listID, ...where.binds).first<{ id: string; status: string }>();
  if (!list) throw new TaskError('Task list not found in this chat.', 404);
  return list;
}

// Blockers must belong to the same list and must not create a cycle.
async function checkBlockers(db: D1Database, listID: string, taskID: string, blockers: string[]) {
  if (!blockers.length) return;
  if (blockers.includes(taskID)) throw new TaskError('A task cannot block itself.');
  const { results } = await db.prepare(`SELECT id FROM task WHERE list_id = ? AND id IN (SELECT value FROM json_each(?))`)
    .bind(listID, JSON.stringify(blockers)).all<{ id: string }>();
  if (results.length !== blockers.length) throw new TaskError('Every blocker must be a task in the same list.');
  const cycle = await db.prepare(`WITH RECURSIVE upstream(id) AS (
      SELECT value FROM json_each(?1)
      UNION SELECT d.blocked_by_id FROM task_dependency d JOIN upstream u ON d.task_id = u.id)
    SELECT 1 FROM upstream WHERE id = ?2 LIMIT 1`).bind(JSON.stringify(blockers), taskID).first();
  if (cycle) throw new TaskError('Those blockers would create a dependency cycle.');
}

/**
 * Work scheduling after a change: an open task newly assigned to a contact by
 * someone else is due now; one a contact assigned to itself is reviewed later.
 * Tasks that are no longer open or assigned to a contact stop.
 */
function workStatement(db: D1Database, taskID: string, actor: TaskActor, assigned: boolean, now: number, token: string | null = null, resumed = false) {
  return db.prepare(`UPDATE task SET
      work_due_at = CASE WHEN status NOT IN ('open', 'in_progress') OR assignee_kind IS NOT 'agent' OR work_count >= ${taskLimits.workPerTask} THEN NULL
        WHEN work_state != 'active' THEN NULL
        WHEN ?2 = 1 OR ?8 = 1 THEN CASE WHEN assignee_id = ?3 AND ?4 = 'agent' THEN ?5 + ?6 ELSE ?5 END ELSE work_due_at END,
      work_reason = CASE WHEN status NOT IN ('open', 'in_progress') OR assignee_kind IS NOT 'agent' OR work_state != 'active' THEN NULL
        WHEN ?2 = 1 OR ?8 = 1 THEN CASE WHEN assignee_id = ?3 AND ?4 = 'agent' THEN 'review' ELSE 'assigned' END ELSE work_reason END
    WHERE id = ?1 AND (?7 IS NULL OR mutation_token = ?7)`)
    .bind(taskID, assigned ? 1 : 0, actor.id, actor.kind, now, taskLimits.reviewDelay, token, resumed ? 1 : 0);
}
// Contact-owned tasks whose last blocker just finished become due now.
function unblockStatement(db: D1Database, taskID: string, now: number, token: string | null = null) {
  return db.prepare(`UPDATE task SET work_due_at = ?2, work_reason = 'unblocked'
    WHERE id IN (SELECT task_id FROM task_dependency WHERE blocked_by_id = ?1)
    AND ${open} AND assignee_kind = 'agent' AND work_state = 'active' AND work_count < ${taskLimits.workPerTask}
    AND (SELECT status FROM task WHERE id = ?1 AND (?3 IS NULL OR mutation_token = ?3)) IN ('done', 'canceled')
    AND NOT EXISTS (SELECT 1 FROM task_dependency d JOIN task blocker ON blocker.id = d.blocked_by_id
      WHERE d.task_id = task.id AND blocker.status IN ('open', 'in_progress'))`).bind(taskID, now, token);
}

export async function createTaskList(db: D1Database, scope: TaskScope, actor: TaskActor, id: string, title: unknown, rawTasks: unknown) {
  const listTitle = text(title, taskLimits.listTitle, 'List title');
  if (rawTasks !== undefined && (!Array.isArray(rawTasks) || rawTasks.length > taskLimits.tasks)) throw new TaskError(`tasks must be an array of up to ${taskLimits.tasks}.`);
  const inputs = ((rawTasks ?? []) as unknown[]).map(parseTaskInput);
  const where = scopeWhere(scope);
  const existing = await db.prepare(`SELECT l.id FROM task_list l WHERE l.id = ? AND ${where.sql}`).bind(id, ...where.binds).first();
  if (existing) return id;
  const count = await db.prepare(`SELECT COUNT(*) AS count FROM task_list l WHERE ${where.sql} AND l.status = 'active'`)
    .bind(...where.binds).first<{ count: number }>();
  if ((count?.count ?? 0) >= taskLimits.lists) throw new TaskError(`This chat already has ${taskLimits.lists} active lists. Cancel one first.`, 409);
  for (const input of inputs) await requireMember(db, scope, input.assignee);
  // In a new list, blockers may name earlier tasks by their 1-based position ("1", "2"…).
  const ids = inputs.map((input, index) => input.id ?? `${id}:${index + 1}`);
  const blockers = inputs.map((input, index) => (input.blockedBy ?? []).map(ref => /^\d+$/.test(ref) ? ids[Number(ref) - 1] : ref)
    .map(ref => { if (!ref || ids.indexOf(ref) < 0 || ids.indexOf(ref) >= index) throw new TaskError('In a new list, blockedBy may only name earlier tasks by position (e.g. "1").'); return ref; }));
  const now = Date.now();
  await db.batch([
    db.prepare(`INSERT INTO task_list (id, group_id, contact_id, user_id, title, created_by_kind, created_by_id, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)`).bind(id, scope.kind === 'group' ? scope.groupID : null,
      scope.kind === 'contact' ? scope.contactID : null, scope.kind === 'contact' ? scope.userID : null, listTitle, actor.kind, actor.id, now),
    ...inputs.flatMap((input, index) => [
      db.prepare(`INSERT INTO task (id, list_id, position, title, notes, assignee_kind, assignee_id, created_by_kind, created_by_id, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)`).bind(ids[index], id, index + 1, input.title, input.notes ?? null,
        input.assignee?.kind ?? null, input.assignee?.id ?? null, actor.kind, actor.id, now),
      ...blockers[index]!.map(blocker => db.prepare('INSERT INTO task_dependency (task_id, blocked_by_id) VALUES (?, ?)').bind(ids[index], blocker)),
      workStatement(db, ids[index]!, actor, !!input.assignee, now),
    ]),
  ]);
  return id;
}

export async function addTask(db: D1Database, scope: TaskScope, actor: TaskActor, listID: string, input: TaskInput, id: string) {
  const list = await findList(db, scope, listID);
  if (list.status !== 'active') throw new TaskError('This list was canceled.', 409);
  if (await db.prepare('SELECT id FROM task WHERE id = ? AND list_id = ?').bind(id, listID).first()) return id;
  const count = await db.prepare('SELECT COUNT(*) AS count, COALESCE(MAX(position), 0) AS last FROM task WHERE list_id = ?').bind(listID).first<{ count: number; last: number }>();
  if ((count?.count ?? 0) >= taskLimits.tasks) throw new TaskError(`A list holds up to ${taskLimits.tasks} tasks.`, 409);
  await requireMember(db, scope, input.assignee);
  await checkBlockers(db, listID, id, input.blockedBy ?? []);
  const now = Date.now();
  await db.batch([
    db.prepare(`INSERT INTO task (id, list_id, position, title, notes, assignee_kind, assignee_id, created_by_kind, created_by_id, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)`).bind(id, listID, (count?.last ?? 0) + 1, input.title, input.notes ?? null,
      input.assignee?.kind ?? null, input.assignee?.id ?? null, actor.kind, actor.id, now),
    ...(input.blockedBy ?? []).map(blocker => db.prepare('INSERT INTO task_dependency (task_id, blocked_by_id) VALUES (?, ?)').bind(id, blocker)),
    workStatement(db, id, actor, !!input.assignee, now),
    db.prepare('UPDATE task_list SET updated_at = ? WHERE id = ?').bind(now, listID),
  ]);
  return id;
}

/** Applies a patch with optimistic concurrency when `version` is given (humans); tools pass none. */
export async function updateTask(db: D1Database, scope: TaskScope, actor: TaskActor, taskID: string, patch: TaskPatch, version?: number) {
  const where = scopeWhere(scope);
  const task = await db.prepare(`SELECT t.id, t.list_id AS listID, t.status, t.version, t.assignee_kind AS assigneeKind, t.assignee_id AS assigneeID, t.work_state AS workState, t.blocked_reason AS blockedReason, l.status AS listStatus
    FROM task t JOIN task_list l ON l.id = t.list_id WHERE t.id = ? AND ${where.sql}`).bind(taskID, ...where.binds)
    .first<{ id: string; listID: string; status: TaskStatus; version: number; assigneeKind: string | null; assigneeID: string | null; workState: TaskWorkState; blockedReason: string | null; listStatus: string }>();
  if (!task) throw new TaskError('Task not found in this chat.', 404);
  if (task.listStatus !== 'active') throw new TaskError('This list was canceled.', 409);
  if (version !== undefined && version !== task.version) throw new TaskError('This task changed. Refresh and try again.', 409);
  if (actor.kind === 'agent' && patch.workState !== undefined && patch.workState !== 'blocked') throw new TaskError('Only people can pause or resume task work.');
  if (actor.kind === 'agent' && patch.workState === 'blocked' && (task.assigneeKind !== 'agent' || task.assigneeID !== actor.id)) throw new TaskError('Only the assignee can block its work.');
  if ((patch.workState ?? task.workState) === 'blocked' && !(patch.blockedReason === undefined ? task.blockedReason : patch.blockedReason)) throw new TaskError('Provide the reason this work is blocked.');
  await requireMember(db, scope, patch.assignee);
  if (patch.blockedBy) await checkBlockers(db, task.listID, taskID, patch.blockedBy);
  const assigned = patch.assignee !== undefined
    && ((patch.assignee?.kind ?? null) !== task.assigneeKind || (patch.assignee?.id ?? null) !== task.assigneeID);
  const reopened = patch.status !== undefined && ['open', 'in_progress'].includes(patch.status) && ['done', 'canceled'].includes(task.status);
  const now = Date.now(), token = crypto.randomUUID();
  const authorityChanged = assigned || reopened || (patch.workState !== undefined && patch.workState !== task.workState) || patch.status === 'canceled'
    || (actor.kind === 'user' && (patch.status === 'done' || patch.title !== undefined || patch.notes !== undefined || patch.blockedBy !== undefined));
  const updated = await db.batch([
    db.prepare(`UPDATE task SET title = COALESCE(?3, title), notes = CASE WHEN ?4 = 1 THEN ?5 ELSE notes END,
        status = COALESCE(?6, status), assignee_kind = CASE WHEN ?7 = 1 THEN ?8 ELSE assignee_kind END,
        assignee_id = CASE WHEN ?7 = 1 THEN ?9 ELSE assignee_id END, result = CASE WHEN ?10 = 1 THEN ?11 ELSE result END,
        completed_at = CASE WHEN COALESCE(?6, status) = 'done' THEN COALESCE(completed_at, ?12) WHEN ?6 IS NOT NULL THEN NULL ELSE completed_at END,
        work_state = COALESCE(?13, work_state), next_step = CASE WHEN ?14 = 1 THEN ?15 ELSE next_step END,
        evidence = CASE WHEN ?16 = 1 THEN ?17 ELSE evidence END,
        blocked_reason = CASE WHEN COALESCE(?13, work_state) != 'blocked' THEN NULL WHEN ?18 = 1 THEN ?19 ELSE blocked_reason END,
        work_generation = work_generation + ?20, mutation_token = ?21,
        version = version + 1, updated_at = ?12 WHERE id = ?1 AND version = ?2
          AND EXISTS (SELECT 1 FROM task_list WHERE id = task.list_id AND status = 'active')`)
      .bind(taskID, task.version, patch.title ?? null, patch.notes !== undefined ? 1 : 0, patch.notes ?? null, patch.status ?? null,
        patch.assignee !== undefined ? 1 : 0, patch.assignee?.kind ?? null, patch.assignee?.id ?? null,
        patch.result !== undefined ? 1 : 0, patch.result ?? null, now, patch.workState ?? null, patch.nextStep !== undefined ? 1 : 0, patch.nextStep ?? null,
        patch.evidence !== undefined ? 1 : 0, patch.evidence ?? null, patch.blockedReason !== undefined ? 1 : 0, patch.blockedReason ?? null, authorityChanged ? 1 : 0, token),
    ...(patch.blockedBy ? [db.prepare('DELETE FROM task_dependency WHERE task_id = ?1 AND EXISTS (SELECT 1 FROM task WHERE id = ?1 AND mutation_token = ?2)').bind(taskID, token),
      ...patch.blockedBy.map(blocker => db.prepare('INSERT INTO task_dependency (task_id, blocked_by_id) SELECT ?1, ?2 WHERE EXISTS (SELECT 1 FROM task WHERE id = ?1 AND mutation_token = ?3)').bind(taskID, blocker, token))] : []),
    workStatement(db, taskID, actor, assigned || reopened, now, token, patch.workState === 'active' && task.workState !== 'active'),
    unblockStatement(db, taskID, now, token),
    db.prepare('UPDATE task_list SET updated_at = ?1 WHERE id = ?2 AND EXISTS (SELECT 1 FROM task WHERE id = ?3 AND mutation_token = ?4)').bind(now, task.listID, taskID, token),
  ]);
  if (!updated[0]!.meta.changes) throw new TaskError('This task changed. Refresh and try again.', 409);
}

/** Cancels a list and every unfinished task in it; finished tasks keep their result. */
export async function cancelTaskList(db: D1Database, scope: TaskScope, listID: string) {
  await findList(db, scope, listID);
  const now = Date.now();
  await db.batch([
    db.prepare(`UPDATE task_list SET status = 'canceled', updated_at = ? WHERE id = ?`).bind(now, listID),
    db.prepare(`UPDATE task SET status = 'canceled', work_due_at = NULL, work_reason = NULL, work_generation = work_generation + 1, version = version + 1, updated_at = ?
      WHERE list_id = ? AND ${open}`).bind(now, listID),
  ]);
}

export async function renameTaskList(db: D1Database, scope: TaskScope, listID: string, title: unknown) {
  await findList(db, scope, listID);
  await db.prepare('UPDATE task_list SET title = ?, updated_at = ? WHERE id = ?').bind(text(title, taskLimits.listTitle, 'List title'), Date.now(), listID).run();
}
