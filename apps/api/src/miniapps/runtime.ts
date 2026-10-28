import { isRecord } from '../chat/meta';
import { catalog, connectionColumns, remote, size, validator, type Connection, type RemoteTool } from '../mcp/client';
import { evaluate, parseSpec, present, StepError, toolData, transform, type Context, type ResolvedComponent, type Spec, type ToolUse } from './spec';

export type GrantedTool = ToolUse & { fingerprint: string };
export type MiniAppRow = { id: string; contactID: string; userID: string; turnID: string | null; revision: number; title: string; specJSON: string; toolsJSON: string; approvedRevision: number | null; lastError: string | null; createdAt: number; updatedAt: number };
export const miniAppColumns = `id, contact_id AS contactID, user_id AS userID, turn_id AS turnID, revision, title, spec_json AS specJSON,
  tools_json AS toolsJSON, approved_revision AS approvedRevision, last_error AS lastError, created_at AS createdAt, updated_at AS updatedAt`;

// Current connectors assigned to this contact with their approved tool catalogs.
export async function contactConnectors(db: D1Database, contactID: string, userID: string) {
  const { results } = await db.prepare(`SELECT ${connectionColumns.split(',').map(c => `m.${c.trim()}`).join(',')}
    FROM mcp_connector m JOIN mcp_contact_access ca ON ca.connection_id = m.id
    JOIN contact ct ON ct.id = ca.contact_id AND ct.user_id = m.user_id
    WHERE ca.contact_id = ?1 AND m.user_id = ?2`).bind(contactID, userID).all<Connection>();
  return results;
}
// Binds each referenced tool to its currently allowed definition; fails closed otherwise.
export function bindTools(tools: ToolUse[], connectors: Connection[]): GrantedTool[] | string {
  const bound: GrantedTool[] = [];
  for (const use of tools) {
    const connection = connectors.find(c => c.id === use.connectionID);
    if (!connection) return `Connection ${use.connectionID} is not assigned to this contact.`;
    const tool = (JSON.parse(connection.toolsJSON) as RemoteTool[]).find(t => t.name === use.toolName && t.allowed);
    if (!tool) return `${use.toolName} is not an enabled tool of ${connection.name}.`;
    bound.push({ ...use, fingerprint: tool.fingerprint });
  }
  return bound;
}
// A grant covers one revision and the exact tool definitions it was approved with.
export function grantValid(app: MiniAppRow, connectors: Connection[]): boolean {
  if (app.approvedRevision !== app.revision) return false;
  const stored = JSON.parse(app.toolsJSON) as GrantedTool[];
  const current = bindTools(stored, connectors);
  return typeof current !== 'string' && current.every((tool, index) => tool.fingerprint === stored[index].fingerprint);
}

const failureCode = (error: unknown) => error instanceof StepError ? error.message
  : error instanceof Error && error.message === 'MCP_AUTH' || error instanceof Error && error.message.startsWith('MCP_OAUTH') ? 'AUTHORIZATION_REQUIRED' : 'CONNECTION_UNAVAILABLE';
async function call(env: Env, connection: Connection, tool: GrantedTool, args: Record<string, unknown>) {
  return remote(env, connection, async (client, signal) => {
    // Rediscover so a changed remote definition can never run under an older grant.
    const current = (await catalog(client, signal)).find(t => t.name === tool.toolName);
    if (!current || current.fingerprint !== tool.fingerprint) throw new StepError('TOOL_CHANGED');
    if (!validator(current.inputSchema)(args)) throw new StepError('INVALID_ARGUMENTS');
    return client.callTool({ name: tool.toolName, arguments: args }, undefined, { signal, timeout: 20_000 });
  });
}

export function validInputs(spec: Spec, raw: unknown): Record<string, string> | null {
  if (raw !== undefined && !isRecord(raw)) return null;
  const values: Record<string, string> = {};
  for (const input of spec.inputs) {
    const value = isRecord(raw) ? raw[input.id] : undefined;
    if (value === undefined) { values[input.id] = input.default; continue; }
    if (typeof value !== 'string' || value.length > 200) return null;
    if (input.type === 'segmented' && !input.options.some(o => o.value === value)) return null;
    values[input.id] = value;
  }
  return isRecord(raw) && Object.keys(raw).some(key => !spec.inputs.some(i => i.id === key)) ? null : values;
}

export async function resolve(env: Env, app: MiniAppRow, connectors: Connection[], inputs: Record<string, string>, timeZone: string): Promise<{ view: ResolvedComponent[]; issues: { step: string; code: string }[] }> {
  const { spec } = parseSpec(JSON.parse(app.specJSON));
  const granted = JSON.parse(app.toolsJSON) as GrantedTool[];
  const context: Context = { inputs, timeZone, now: Date.now() };
  const outputs = new Map<string, unknown>(), errors = new Map<string, string>();
  // Remote reads depend only on inputs, so they run concurrently before local transforms.
  await Promise.all(spec.data.map(async step => {
    if (step.type !== 'mcp') return;
    const tool = granted.find(t => t.connectionID === step.connectionID && t.toolName === step.tool && t.role === 'read');
    const connection = connectors.find(c => c.id === step.connectionID);
    try {
      if (!tool || !connection) throw new StepError('NOT_AUTHORIZED');
      outputs.set(step.id, toolData(await call(env, connection, tool, evaluate(step.arguments, context) as Record<string, unknown>)));
    } catch (error) { errors.set(step.id, failureCode(error)); }
  }));
  for (const step of spec.data) {
    if (step.type === 'mcp') continue;
    if (step.type !== 'const' && errors.has(step.from)) { errors.set(step.id, errors.get(step.from)!); continue; }
    try { outputs.set(step.id, transform(step, outputs, context)); }
    catch (error) { errors.set(step.id, error instanceof StepError ? error.message : 'TRANSFORM_FAILED'); }
  }
  const view = present(spec.view, spec, outputs, errors);
  if (size(view) > 128_000) return { view: [{ type: 'notice', code: 'RESULT_TOO_LARGE' }], issues: [{ step: '*', code: 'RESULT_TOO_LARGE' }] };
  // Only step IDs and codes are retained so the contact can repair the spec; never data.
  const issues = [...errors].map(([step, code]) => ({ step, code }));
  await env.DB.prepare('UPDATE mini_app SET last_error = ? WHERE id = ? AND revision = ?')
    .bind(issues.length ? JSON.stringify(issues.slice(0, 12)) : null, app.id, app.revision).run();
  return { view, issues };
}

function fieldValues(fields: Spec['actions'][number]['fields'], raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw) || Object.keys(raw).some(key => !fields.some(f => f.id === key))) return null;
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    const value = raw[field.id];
    if (value === undefined || value === '') { if (field.required) return null; continue; }
    if (field.kind === 'number' ? typeof value !== 'number' || !Number.isFinite(value)
      : field.kind === 'toggle' ? typeof value !== 'boolean'
      : field.kind === 'date' ? typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value))
      : typeof value !== 'string' || value.length > 500 || value.includes('\0')) return null;
    values[field.id] = value;
  }
  return values;
}

export type ActionOutcome = { status: 'completed' | 'failed' | 'unknown'; replayed: boolean };
// Writes run once per client execution ID. An uncertain outcome is never replayed.
export async function runAction(env: Env, app: MiniAppRow, connectors: Connection[], actionID: string, executionID: string,
  rawInputs: unknown, rawFields: unknown, timeZone: string): Promise<ActionOutcome | { error: string; status: number }> {
  const { spec } = parseSpec(JSON.parse(app.specJSON));
  const action = spec.actions.find(a => a.id === actionID);
  if (!action) return { error: 'Action not found', status: 404 };
  const inputs = validInputs(spec, rawInputs), fields = fieldValues(action.fields, rawFields ?? {});
  if (!inputs || !fields) return { error: 'Check the form values.', status: 400 };
  const args = evaluate(action.arguments, { inputs, fields, timeZone, now: Date.now() }) as Record<string, unknown>;
  const argumentsJSON = JSON.stringify(args);
  if (argumentsJSON.length > 16_000) return { error: 'Action arguments are too large.', status: 400 };
  const existing = await env.DB.prepare('SELECT status, action_id AS actionID, arguments_json AS args FROM mini_app_action WHERE id = ? AND app_id = ?')
    .bind(executionID, app.id).first<{ status: string; actionID: string; args: string }>();
  if (existing) return existing.actionID === actionID && existing.status !== 'running'
    ? { status: existing.status as ActionOutcome['status'], replayed: true } : { error: 'This action was already submitted. Check the service before trying again.', status: 409 };
  const now = Date.now();
  const reserved = await env.DB.prepare(`INSERT OR IGNORE INTO mini_app_action (id, app_id, revision, action_id, arguments_json, status, created_at, updated_at)
    SELECT ?1, id, revision, ?3, ?4, 'running', ?5, ?5 FROM mini_app WHERE id = ?2 AND revision = ?6 AND approved_revision = revision`)
    .bind(executionID, app.id, actionID, argumentsJSON, now, app.revision).run();
  if (!reserved.meta.changes) return { error: 'This action was already submitted, or the mini app changed. Refresh and check the service before trying again.', status: 409 };
  const tool = (JSON.parse(app.toolsJSON) as GrantedTool[]).find(t => t.connectionID === action.connectionID && t.toolName === action.tool && t.role === 'write');
  const connection = connectors.find(c => c.id === action.connectionID);
  let status: ActionOutcome['status'] = 'unknown';
  try {
    if (tool && connection) {
      const response = await call(env, connection, tool, args);
      status = response.isError === true ? 'failed' : 'completed';
    } else status = 'failed';
  } catch (error) {
    // Definition/argument checks fail before any remote call; anything else is uncertain.
    status = error instanceof StepError ? 'failed' : 'unknown';
  }
  await env.DB.prepare("UPDATE mini_app_action SET status = ?, updated_at = ? WHERE id = ? AND status = 'running'").bind(status, Date.now(), executionID).run();
  return { status, replayed: false };
}
