import type { StoredTurn } from '../chat/data';
import type { ModelTool } from '../chat/meta';
import { listSchedules, scheduleColumns, validTimeZone, type ContactSchedule, type ScheduleScope } from './data';

const specification = {
  instruction: { type: 'string', description: 'What to write or do at execution time, 1–1000 characters. Preserve the user intent.' },
  runAt: { type: 'string', description: 'First execution as an ISO 8601 timestamp with Z or explicit UTC offset. Must be in the future, within one year.' },
  timeZone: { type: 'string', description: 'User IANA time zone. Use the current message time zone unless explicitly overridden. Ask if unknown.' },
  intervalSeconds: { type: ['integer', 'null'], description: 'Null for one message; 600–2592000 for fixed intervals from runAt. Every ten minutes means 600, starting ten minutes from now unless specified.' },
};
export const scheduleTools: ModelTool[] = [
  { type: 'function', function: { name: 'create_schedule',
    description: 'Schedule a message to the current user from this contact. Only for an explicit current user request. Confirm only after success. Supports one-time or fixed-interval recurrence, not local-calendar daily/weekly recurrence.',
    parameters: { type: 'object', additionalProperties: false, properties: specification, required: Object.keys(specification) } } },
  { type: 'function', function: { name: 'list_schedules', description: 'List up to 20 schedules for this user and contact, active first; long instructions are clipped. Use IDs to identify an edit or cancellation. Never invent an ID.',
    parameters: { type: 'object', additionalProperties: false, properties: {} } } },
  { type: 'function', function: { name: 'update_schedule', description: 'Replace the timing and instruction of an active schedule after the user asks. Supply its current revision from list_schedules. Invalidates unsent work from the previous revision.',
    parameters: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, revision: { type: 'integer' }, ...specification },
      required: ['id', 'revision', ...Object.keys(specification)] } } },
  { type: 'function', function: { name: 'cancel_schedule', description: 'Cancel one schedule explicitly requested by the user. Use list_schedules to resolve its ID. Clarify if ambiguous. Stops future work and unsent notifications.',
    parameters: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' } }, required: ['id'] } } },
];

export async function cancelSchedule(db: D1Database, scope: ScheduleScope, id: string) {
  return db.prepare(`UPDATE contact_schedule SET status = 'cancelled', updated_at = ?
    WHERE id = ? AND contact_id = ? AND user_id = ? RETURNING ${scheduleColumns}`)
    .bind(Date.now(), id, scope.contactID, scope.userID).first<ContactSchedule>();
}

export async function executeScheduleTool(db: D1Database, turn: StoredTurn, name: string, args: Record<string, unknown>) {
  const scope = { contactID: turn.contactID, userID: turn.userID };
  if (name === 'list_schedules') {
    if (Object.keys(args).length) return JSON.stringify({ error: 'No arguments expected.' });
    const schedules = await listSchedules(db, scope);
    return JSON.stringify({ schedules: schedules.slice(0, 20).map((schedule) => ({ ...schedule,
      instruction: Array.from(schedule.instruction).slice(0, 300).join('') })), limit: 20, truncated: schedules.length > 20 });
  }
  // Autonomous turns have no permission to create, change, or perpetuate schedules.
  if (turn.scheduleID || turn.groupRequestID) return JSON.stringify({ error: 'Autonomous messages cannot mutate schedules.' });
  const receiptID = `${turn.id}:${name}:${name === 'create_schedule' ? 'new' : String(args.id)}`;
  const request = JSON.stringify([name, Object.entries(args).sort(([a], [b]) => a.localeCompare(b))]);
  const previous = await db.prepare('SELECT request, result FROM schedule_mutation WHERE id = ? AND turn_id = ?')
    .bind(receiptID, turn.id).first<{ request: string; result: string | null }>();
  if (previous?.result) {
    if (previous.request === request) return previous.result;
    return JSON.stringify({ ...JSON.parse(previous.result), replayed: true,
      note: 'This user message already performed this action. This is its original result; do not perform it again. List schedules to check current state. A new user message is needed for different arguments.' });
  }
  const cancel = name === 'cancel_schedule';
  const create = name === 'create_schedule';
  const expected = cancel ? ['id'] : [...Object.keys(specification), ...(create ? [] : ['id', 'revision'])];
  if (Object.keys(args).sort().join(',') !== expected.sort().join(',')) return JSON.stringify({ error: 'Provide exactly the documented fields.' });
  if (!create && (typeof args.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(args.id))) return JSON.stringify({ error: 'Use a schedule ID from list_schedules.' });
  if (!create && !cancel && (!Number.isSafeInteger(args.revision) || Number(args.revision) < 1)) return JSON.stringify({ error: 'Provide the current revision from list_schedules.' });
  const now = Date.now();
  let runAt = 0;
  if (!cancel) {
    if (typeof args.instruction !== 'string' || !args.instruction.trim() || Array.from(args.instruction.trim()).length > 1000
      || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(args.instruction) || !validTimeZone(args.timeZone)) {
      return JSON.stringify({ error: 'Provide an instruction of 1–1000 characters and a valid IANA time zone.' });
    }
    if (typeof args.runAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(args.runAt)
      || !Number.isFinite(runAt = Date.parse(args.runAt))
      || new Date(`${args.runAt.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !== args.runAt.slice(0, 10)
      || Number(args.runAt.slice(11, 13)) >= 24 || Number(args.runAt.slice(14, 16)) >= 60
      || Number(args.runAt.slice(17, 19)) >= 60 || runAt <= now || runAt > now + 366 * 86400000) {
      return JSON.stringify({ error: 'Choose a future ISO timestamp with an explicit offset, within one year. If the requested time already passed, ask the user; do not silently choose tomorrow.' });
    }
    if (args.intervalSeconds !== null && (!Number.isSafeInteger(args.intervalSeconds)
      || Number(args.intervalSeconds) < 600 || Number(args.intervalSeconds) > 2592000)) {
      return JSON.stringify({ error: 'Use null for one message or an interval of 600–2592000 seconds.' });
    }
  }
  const id = create ? crypto.randomUUID() : args.id as string;
  const pending = `EXISTS (SELECT 1 FROM schedule_mutation WHERE id = ?1 AND result IS NULL AND request = ?2)`;
  const statements = [db.prepare(`INSERT OR IGNORE INTO schedule_mutation (id, turn_id, request, created_at)
    SELECT ?1, ?2, ?3, ?4 FROM chat_turn WHERE id = ?2 AND contact_id = ?5 AND user_id = ?6
      AND schedule_id IS NULL AND status = 'running' AND attempt = ?7`)
    .bind(receiptID, turn.id, request, now, scope.contactID, scope.userID, turn.attempt)];
  if (create) {
    statements.push(db.prepare(`INSERT INTO contact_schedule
      (id, contact_id, user_id, instruction, time_zone, next_at, interval_seconds, last_mutation, created_at, updated_at)
      SELECT ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?1, ?10, ?10 WHERE ${pending}
      AND (SELECT COUNT(*) FROM contact_schedule WHERE user_id = ?5 AND status = 'active') < 20
      AND (SELECT COUNT(*) FROM contact_schedule WHERE contact_id = ?4 AND user_id = ?5 AND status = 'active') < 5`)
      .bind(receiptID, request, id, scope.contactID, scope.userID, (args.instruction as string).trim(), args.timeZone, runAt, args.intervalSeconds, now));
  } else if (cancel) {
    statements.push(db.prepare(`UPDATE contact_schedule SET status = 'cancelled', updated_at = ?6, last_mutation = ?1
      WHERE id = ?3 AND contact_id = ?4 AND user_id = ?5 AND ${pending}`)
      .bind(receiptID, request, id, scope.contactID, scope.userID, now));
  } else {
    statements.push(db.prepare(`UPDATE contact_schedule SET instruction = ?6, time_zone = ?7, next_at = ?8,
      interval_seconds = ?9, revision = revision + 1, last_mutation = ?1, updated_at = ?10
      WHERE id = ?3 AND contact_id = ?4 AND user_id = ?5 AND status = 'active' AND revision = ?11 AND ${pending}`)
      .bind(receiptID, request, id, scope.contactID, scope.userID, (args.instruction as string).trim(), args.timeZone, runAt, args.intervalSeconds, now, args.revision));
  }
  statements.push(db.prepare(`UPDATE schedule_mutation SET result = COALESCE((SELECT json_object('schedule', json_object(
      'id', id, 'instruction', instruction, 'timeZone', time_zone, 'nextAt', next_at,
      'intervalSeconds', interval_seconds, 'status', status, 'revision', revision))
      FROM contact_schedule WHERE id = ?3 AND contact_id = ?4 AND user_id = ?5 AND last_mutation = ?1),
      '{"error":"Schedule unavailable, changed, or active schedule limit reached (5 per contact, 20 per user). List schedules and clarify before retrying."}')
    WHERE id = ?1 AND request = ?2 AND result IS NULL`)
    .bind(receiptID, request, id, scope.contactID, scope.userID));
  await db.batch(statements);
  const receipt = await db.prepare('SELECT result FROM schedule_mutation WHERE id = ? AND turn_id = ?')
    .bind(receiptID, turn.id).first<{ result: string }>();
  return receipt?.result ?? JSON.stringify({ error: 'The source request is no longer active.' });
}
