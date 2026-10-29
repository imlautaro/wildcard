import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { admitAuthRequest } from '../lib/auth-rate-limit';
import { addTask, cancelTaskList, createTaskList, parseTaskInput, parseTaskPatch, readTaskLists, renameTaskList, taskMembers,
  TaskError, updateTask, type TaskScope } from './data';
import { dispatchTasks } from './dispatch';

type Variables = { owner: string; taskScope: TaskScope };
type TaskContext = Context<{ Bindings: Env; Variables: Variables }>;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/**
 * Human task routes under `/contacts/:id/tasks` (your private chat with that contact)
 * and `/groups/:id/tasks` (membership is checked by the parent router).
 * Client UUIDs make creation idempotent; task edits carry the version they were based on.
 */
export function taskRoutes(kind: 'contact' | 'group') {
  const routes = new Hono<{ Bindings: Env; Variables: Variables }>();
  routes.use('*', bodyLimit({ maxSize: 32 * 1024, onError: c => c.json({ error: 'Request body too large' }, 413) }));
  routes.use('*', async (c, next) => {
    const id = c.req.param('id')!, owner = c.get('owner');
    if (kind === 'contact' && !await c.env.DB.prepare('SELECT id FROM contact WHERE id = ? AND user_id = ?').bind(id, owner).first()) {
      return c.json({ error: 'Contact not found' }, 404);
    }
    if (c.req.method !== 'GET' && !(await admitAuthRequest(c.env.DB, owner, 'task-write', 60)).allowed) return c.json({ error: 'Too many requests' }, 429);
    c.set('taskScope', kind === 'contact' ? { kind, contactID: id, userID: owner } : { kind, groupID: id });
    await next();
  });
  routes.onError((error, c) => {
    if (error instanceof TaskError) return c.json({ error: error.message }, error.status);
    throw error;
  });
  const body = async (c: TaskContext) => {
    const value = await c.req.json<Record<string, unknown>>().catch(() => null);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TaskError('Expected a JSON object.');
    return value;
  };
  const board = async (env: Env, scope: TaskScope) => ({ lists: await readTaskLists(env.DB, scope), members: await taskMembers(env.DB, scope) });
  // Assignments may be due now; start those turns without waiting for the Cron.
  const respond = async (c: TaskContext) => {
    c.executionCtx.waitUntil(dispatchTasks(c.env).catch(() => undefined));
    return c.json(await board(c.env, c.get('taskScope')));
  };
  const actor = (c: TaskContext) => ({ kind: 'user' as const, id: c.get('owner') });

  routes.get('/', async c => c.json(await board(c.env, c.get('taskScope'))));
  routes.post('/lists', async c => {
    const value = await body(c);
    if (typeof value.id !== 'string' || !uuid.test(value.id)) throw new TaskError('Provide a list UUID.');
    await createTaskList(c.env.DB, c.get('taskScope'), actor(c), value.id.toLowerCase(), value.title, value.tasks);
    return respond(c);
  });
  routes.patch('/lists/:listID', async c => {
    const value = await body(c), scope = c.get('taskScope'), listID = c.req.param('listID');
    if (value.status !== undefined && value.status !== 'canceled') throw new TaskError('A list can only be canceled.');
    if (value.title !== undefined) await renameTaskList(c.env.DB, scope, listID, value.title);
    if (value.status === 'canceled') await cancelTaskList(c.env.DB, scope, listID);
    return respond(c);
  });
  routes.post('/lists/:listID/tasks', async c => {
    const value = await body(c);
    if (typeof value.id !== 'string' || !uuid.test(value.id)) throw new TaskError('Provide a task UUID.');
    await addTask(c.env.DB, c.get('taskScope'), actor(c), c.req.param('listID'), parseTaskInput({ ...value, id: undefined }), value.id.toLowerCase());
    return respond(c);
  });
  routes.patch('/items/:taskID', async c => {
    const { version, ...value } = await body(c);
    if (typeof version !== 'number' || !Number.isSafeInteger(version)) throw new TaskError('Provide the task version you edited.');
    await updateTask(c.env.DB, c.get('taskScope'), actor(c), c.req.param('taskID'), parseTaskPatch(value), version);
    return respond(c);
  });
  return routes;
}
