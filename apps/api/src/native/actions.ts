import type { PushEnvironment } from '../push/delivery';
import { deliverRemoteNative } from './remote';
import { isRecord, type ModelTool } from '../chat/meta';
import type { StoredTurn } from '../chat/data';

// Legacy kinds remain accepted in old client contexts and historical payloads.
export const nativeKinds = ['focus', 'recipe', 'timer', 'alarm', 'calendar', 'reminder', 'location_reminder', 'speech'] as const;
// Deprecated on 2026-10-30: never advertise or create focus, recipe or speech actions.
const deprecatedNativeKinds: ReadonlySet<string> = new Set(['focus', 'recipe', 'speech']);
export const activeNativeKinds = nativeKinds.filter(kind => !deprecatedNativeKinds.has(kind));
export type NativeContext = { deviceID: string; kinds: string[]; automaticKinds?: string[]; remote?: true };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function parseNativeContext(value: unknown): NativeContext | null {
  if (!isRecord(value) || Object.keys(value).some(key => !['deviceID', 'kinds', 'automaticKinds', 'remote'].includes(key))
    || typeof value.deviceID !== 'string' || !uuid.test(value.deviceID) || !Array.isArray(value.kinds)
    // Filtering legacy-only contexts yields an empty list, which must survive re-parsing.
    || value.kinds.length > nativeKinds.length
    || value.kinds.some(k => typeof k !== 'string' || !nativeKinds.includes(k as typeof nativeKinds[number]))
    || new Set(value.kinds).size !== value.kinds.length) return null;
  if (value.remote !== undefined && value.remote !== true) return null;
  if (value.remote === true && value.kinds.some(k => !['timer', 'alarm'].includes(k))) return null;
  const kinds = value.kinds;
  if (value.automaticKinds !== undefined && (!Array.isArray(value.automaticKinds)
    || value.automaticKinds.some(k => typeof k !== 'string' || !['timer', 'alarm', 'focus', 'recipe', 'reminder', 'speech'].includes(k) || !kinds.includes(k))
    || new Set(value.automaticKinds).size !== value.automaticKinds.length)) return null;
  return { ...(value.remote === true ? { remote: true as const } : {}), ...(Array.isArray(value.automaticKinds) ? { automaticKinds: value.automaticKinds.filter(k => !deprecatedNativeKinds.has(k)).sort() } : {}), deviceID: value.deviceID.toLowerCase(), kinds: value.kinds.filter(k => !deprecatedNativeKinds.has(k)).sort() };
}
export const nativeTools: ModelTool[] = [{ type: 'function', function: {
  name: 'request_native_action',
  description: 'Prepare an iOS action ONLY for this direct human request and enabled device capabilities. This queues a device request; it does NOT execute it on the server. Local automatic requests need the app open. Remote timer/alarm requests use a visible push and the notification extension and may run while locked with the main app closed. Other requests need review. Follow the returned nextStep and never ask for extra confirmation for automatic kinds. Only a device-reported completed receipt confirms the requested operation; scheduling success does not mean an alarm rang. One proposal per kind per human message; replays return the original. Date must be explicit-offset ISO 8601. Never invent coordinates. Omit both coordinates to let the person choose the location on the phone map. Timer/alarm use AlarmKit; calendar opens an editor; reminder saves to Reminders; location_reminder creates an arrival/departure reminder in Reminders.',
  parameters: { type: 'object', additionalProperties: false, required: ['kind', 'title'], properties: {
    kind: { type: 'string', enum: [...activeNativeKinds] }, title: { type: 'string', maxLength: 100 },
    body: { type: 'string', maxLength: 2000 }, durationSeconds: { type: 'integer', minimum: 1, maximum: 28800 },
    date: { type: 'string', description: 'Future explicit-offset ISO 8601 date for alarm/calendar/reminder.' },
    endDate: { type: 'string', description: 'End date for calendar, after date.' },
    // Deprecated schema retained for reference; excluded from advertised tools:
    // steps: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 160 } },
    latitude: { type: 'number', minimum: -90, maximum: 90 }, longitude: { type: 'number', minimum: -180, maximum: 180 },
    radius: { type: 'number', minimum: 100, maximum: 1000 }, trigger: { type: 'string', enum: ['arrival', 'departure'] },
  } },
} }, { type: 'function', function: {
  name: 'list_native_actions', description: 'Read the last 20 native proposals and device-reported execution states for THIS person, private chat and requesting device. Completed means the phone reported success, not that a timer fired or a real-world task was done. No access to calendar contents, location history or other devices.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
} }];
const dateValue = (v: unknown): number | null => typeof v === 'string' && v.length <= 40 && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null;
function validPayload(a: Record<string, unknown>, kinds: string[]): boolean {
  const fields = ['kind','title','body','durationSeconds','date','endDate','steps','latitude','longitude','radius','trigger'];
  if (Object.keys(a).some(k => !fields.includes(k)) || typeof a.kind !== 'string' || !activeNativeKinds.some(kind => kind === a.kind) || !kinds.includes(a.kind)
    || typeof a.title !== 'string' || !a.title.trim() || a.title.length > 100 || /[\u0000-\u001f]/.test(a.title)
    || (a.body !== undefined && (typeof a.body !== 'string' || a.body.length > 2000 || a.body.includes('\0')))) return false;
  const allowed: Record<string, string[]> = {
    focus: ['durationSeconds'], recipe: ['steps'], timer: ['durationSeconds'], alarm: ['date'],
    calendar: ['date','endDate'], reminder: ['date'], location_reminder: ['latitude','longitude','radius','trigger'], speech: [],
  };
  if (Object.keys(a).some(k => !['kind','title','body',...allowed[String(a.kind)]].includes(k))) return false;
  if (['focus','timer'].includes(a.kind) && (typeof a.durationSeconds !== 'number' || !Number.isInteger(a.durationSeconds) || a.durationSeconds < 1 || a.durationSeconds > 28800)) return false;
  if (a.kind === 'recipe' && (!Array.isArray(a.steps) || a.steps.length < 1 || a.steps.length > 12 || a.steps.some(s => typeof s !== 'string' || !s.trim() || s.length > 160 || s.includes('\0')))) return false;
  if (['alarm','calendar'].includes(a.kind) || a.date !== undefined) {
    const date = dateValue(a.date);
    if (date === null || date <= Date.now() || date > Date.now() + 366 * 86400000) return false;
    if (a.kind === 'calendar') { const end = dateValue(a.endDate); if (end === null || end <= date || end - date > 7 * 86400000) return false; }
  }
  if (a.kind === 'location_reminder' && (a.latitude !== undefined || a.longitude !== undefined) && (typeof a.latitude !== 'number' || !Number.isFinite(a.latitude) || Math.abs(a.latitude) > 90
    || typeof a.longitude !== 'number' || !Number.isFinite(a.longitude) || Math.abs(a.longitude) > 180)) return false;
  if (a.kind === 'location_reminder' && (typeof a.radius !== 'number' || !Number.isFinite(a.radius) || a.radius < 100 || a.radius > 1000 || !['arrival','departure'].includes(String(a.trigger)))) return false;
  return true;
}
export async function executeNativeTool(env: PushEnvironment, turn: StoredTurn, name: string, args: Record<string, unknown>): Promise<string> {
  const db = env.DB;
  const context = turn.nativeContextJSON ? parseNativeContext(JSON.parse(turn.nativeContextJSON)) : null;
  if (!context || turn.scheduleID || turn.groupRequestID) return JSON.stringify({ error: 'Native actions require an enabled iOS device and a direct private human request.' });
  if (name === 'list_native_actions') {
    if (Object.keys(args).length) return JSON.stringify({ error: 'No arguments expected.' });
    const { results } = await db.prepare(`SELECT a.id, a.kind, json_extract(a.payload_json, '$.title') AS title,
      CASE WHEN a.status = 'pending' AND a.expires_at <= ?4 THEN 'expired' ELSE a.status END AS status
      FROM native_action a JOIN chat_turn t ON t.id = a.turn_id JOIN contact c ON c.id = t.contact_id AND c.user_id = t.user_id
      WHERE t.contact_id = ?1 AND t.user_id = ?2 AND json_extract(t.native_context_json, '$.deviceID') = ?3
      ORDER BY a.created_at DESC, a.id LIMIT 20`).bind(turn.contactID, turn.userID, context.deviceID, Date.now()).all();
    return JSON.stringify({ actions: results, source: 'device-reported', executedByThisTool: false });
  }
  if (!validPayload(args, context.kinds)) return JSON.stringify({ error: 'Invalid or disabled native action. Use only fields for the chosen kind, explicit future dates, and known coordinates.' });
  if (context.remote && (!env.APNS_PRIVATE_KEY || !env.APNS_KEY_ID || !env.APNS_TEAM_ID || !env.APNS_TOPIC)) return JSON.stringify({ error: 'Remote device push is not configured on this installation.' });
  const now = Date.now();
  const id = `${turn.id}:${args.kind}`;
  const fireAt = context.remote ? (args.kind === 'timer' ? now + Number(args.durationSeconds) * 1000 : Date.parse(String(args.date))) : null;
  const remoteID = context.remote ? `${turn.userID}:${context.deviceID}` : null;
  await db.prepare(`INSERT INTO native_action (id, turn_id, kind, payload_json, created_at, updated_at, expires_at,
      remote_device_id, remote_nonce, fire_at, push_next_at)
    SELECT ?1, t.id, ?2, ?3, ?4, ?4, ?5, ?11, ?12, ?13, ?14 FROM chat_turn t JOIN contact c ON c.id = t.contact_id AND c.user_id = t.user_id
    WHERE t.id = ?6 AND t.contact_id = ?7 AND t.user_id = ?8 AND t.attempt = ?9 AND t.status = 'running'
    AND t.schedule_id IS NULL AND t.group_request_id IS NULL AND t.native_context_json = ?10
    AND (?11 IS NULL OR EXISTS (SELECT 1 FROM native_remote_device d JOIN native_remote_grant g ON g.device_id = d.id
      JOIN push_device p ON p.id = d.push_device_id JOIN session s ON s.id = p.session_id AND s.user_id = d.user_id
      WHERE d.id = ?11 AND d.user_id = t.user_id AND g.contact_id = t.contact_id AND s.expires_at > ?4
      AND EXISTS (SELECT 1 FROM json_each(g.kinds_json) WHERE value = ?2)))
    ON CONFLICT(turn_id, kind) DO NOTHING`).bind(id, args.kind, JSON.stringify(args), now,
      fireAt === null ? now + 86400000 : Math.min(now + 60_000, fireAt),
      turn.id, turn.contactID, turn.userID, turn.attempt, turn.nativeContextJSON,
      remoteID, context.remote ? crypto.randomUUID() : null, fireAt, context.remote ? now : null).run();
  if (context.remote) await deliverRemoteNative(env, id);
  let action = await db.prepare(`SELECT id, kind, CASE WHEN status = 'pending' AND expires_at <= ?3 THEN 'expired' ELSE status END AS status, payload_json AS payloadJSON FROM native_action WHERE id = ?1 AND turn_id = ?2`)
    .bind(id, turn.id, now).first<{ id: string; kind: string; status: string; payloadJSON: string }>();
  // This bounded wait is awaited inside the existing reply Workflow step. It never executes the action.
  if (action && context.automaticKinds?.includes(action.kind)) {
    for (let poll = 0; poll < 10 && ['pending', 'running'].includes(action.status); poll++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const receipt = await db.prepare(`SELECT a.id, a.kind, a.status, a.payload_json AS payloadJSON
        FROM native_action a JOIN chat_turn t ON t.id = a.turn_id
        JOIN contact c ON c.id = t.contact_id AND c.user_id = t.user_id
        WHERE a.id = ?1 AND t.id = ?2 AND t.contact_id = ?3 AND t.user_id = ?4
        AND t.attempt = ?5 AND t.status = 'running' AND t.native_context_json = ?6`)
        .bind(id, turn.id, turn.contactID, turn.userID, turn.attempt, turn.nativeContextJSON)
        .first<{ id: string; kind: string; status: string; payloadJSON: string }>();
      if (!receipt) return JSON.stringify({ error: 'The request is no longer active. Do not execute it again.' });
      action = receipt;
    }
  }
  return JSON.stringify(action ? { id: action.id, kind: action.kind, status: action.status, proposal: JSON.parse(action.payloadJSON), executionConfirmed: action.status === 'completed', nextStep: action.status === 'completed' ? 'The requesting iPhone confirmed completion of this operation. Confirm it naturally; do not ask the person to activate it. For timers/alarms, this means scheduled, not that it rang or is still running.' : ['failed', 'cancelled', 'unknown', 'expired'].includes(action.status) ? 'Report this device outcome accurately. Do not claim success or repeat the action. Unknown requires checking the system app.' : context.automaticKinds?.includes(action.kind) ? 'The requesting iPhone is configured to run new requests of this kind automatically subject to current device settings and iOS permissions. Remote requests use a visible push and the notification extension even if the main app is closed; foreground-only requests require Wildcard open. No extra app confirmation is needed. Pending is not completed; only a completed device receipt confirms execution.' : 'Review and run in the iOS Native experiments screen. Never report pending as completed.' } : { error: 'The request is no longer active.' });
}
