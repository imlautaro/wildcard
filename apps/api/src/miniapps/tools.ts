import type { ModelTool } from '../chat/meta';
import type { StoredTurn } from '../chat/data';
import { parseSpec, SpecError } from './spec';
import { bindTools, contactConnectors, miniAppColumns, type MiniAppRow } from './runtime';

const specGuide = 'spec = {title, subtitle?, icon: chart|list|money|calendar|cart|check|clock|star|bolt|folder, state?, inputs?, data?, view, actions?}. '
  + 'state: saved values for this person, [{id,type:number|text|boolean,initial}]; read them in view by id (stat.step) or with {"$state":"id"}. '
  + 'data is an ordered list of steps; "from" may only name an EARLIER step. Step types: '
  + '{id,type:"mcp",connectionID,tool,arguments} (a read run each time the app opens); {id,type:"const",value}; {id,type:"select",from,path}; '
  + '{id,type:"filter",from,where:[{field,op:eq|neq|gt|gte|lt|lte|contains|after|before,value}]}; {id,type:"sort",from,field,order:asc|desc}; '
  + '{id,type:"limit",from,count}; {id,type:"aggregate",from,op:sum|avg|min|max|count,field?} (a number); '
  + '{id,type:"group",from,by,op,field?,order:key|value-asc|value-desc} (rows {key,value,count}). '
  + 'Paths are dot paths into the parsed JSON tool result, e.g. "data.expenses" or "amount"; "" is the whole value. '
  + 'Argument and filter values may be JSON literals or {"$input":"inputID"}, {"$date":{"days":-7,"format":"date"|"datetime"}} (relative to now, person time zone). '
  + 'inputs: {id,type:"segmented",label,options:[{value,label}],default} or {id,type:"text",label,default}. '
  + 'view components: {type:"section",title?,children}; {type:"stat",label,step,path?,caption?,format?,currency?}; '
  + '{type:"list",source,title,subtitle?,value?,limit?,empty?,format?,currency?} (title/subtitle/value are paths inside each row); '
  + '{type:"chart",source,kind:bar|line,x,y,title?,format?,currency?}; {type:"text",text,style:body|caption|headline}; {type:"action",action}. '
  + 'format: number|currency|percent|date|datetime|text; currency needs an ISO code. '
  + 'actions: local {id,label,set:[{state,op:increment|decrement|set|toggle,value?}],confirm?,style?,fields?} updates saved state instantly (increment/decrement default 1); '
  + 'remote {id,label,confirm,style?:default|destructive,connectionID,tool,arguments,fields?} runs an external write only after the person taps and confirms. '
  + 'fields: [{id,label,kind:text|number|date|toggle,required?}]; action values and arguments may use {"$field":"fieldID"}. '
  + 'Example counter: {title:"Counter",icon:"bolt",state:[{id:"count",type:"number",initial:0}],view:[{type:"stat",label:"Count",step:"count"},{type:"action",action:"add"}],actions:[{id:"add",label:"+1",set:[{state:"count",op:"increment"}]}]}.';

export const miniAppTools: ModelTool[] = [{ type: 'function', function: {
  name: 'create_mini_app',
  description: 'Build or update a native mini app for THIS person when they ask for an app, tool, counter, tracker, checklist, dashboard or reusable view. '
    + 'Apps without external tools (only state, inputs, const data and local actions) open immediately. '
    + 'For connected data, first use list_mcp_tools and call_mcp_tool once to inspect the real result shape; design paths from that result. Never invent connectionIDs, tools or fields. '
    + 'Apps using external tools start disabled: the person must review its tools and enable it from the card in this chat; each later open re-runs its read steps under that grant. '
    + 'Pass miniAppID to replace an existing app (it then needs review again). ' + specGuide,
  parameters: { type: 'object', additionalProperties: false, required: ['spec'], properties: {
    miniAppID: { type: 'string', maxLength: 64 }, spec: { type: 'object' },
  } },
} }, { type: 'function', function: {
  name: 'list_mini_apps',
  description: 'List the mini apps of THIS private chat with their spec, revision, whether the person enabled the current revision, and the step error codes of their last load (no data). Use it to repair or update an app.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
} }];

export async function executeMiniAppTool(env: Env, turn: StoredTurn, name: string, args: Record<string, unknown>): Promise<string> {
  if (turn.scheduleID || turn.groupRequestID) return JSON.stringify({ error: 'Mini apps require a direct private human request.' });
  if (name === 'list_mini_apps') {
    const { results } = await env.DB.prepare(`SELECT ${miniAppColumns} FROM mini_app WHERE contact_id = ? AND user_id = ? ORDER BY updated_at DESC LIMIT 20`)
      .bind(turn.contactID, turn.userID).all<MiniAppRow>();
    // Full specs only while they fit the tool budget; older apps are summarized.
    const miniApps = results.map(app => ({ id: app.id, title: app.title, revision: app.revision, enabled: app.approvedRevision === app.revision,
      lastLoadIssues: app.lastError ? JSON.parse(app.lastError) : [] as unknown, spec: JSON.parse(app.specJSON) as unknown }));
    let budget = 20000;
    for (const app of miniApps) {
      const cost = JSON.stringify(app).length;
      if (cost <= budget) budget -= cost;
      else { delete (app as { spec?: unknown }).spec; budget = Math.max(0, budget - JSON.stringify(app).length); }
    }
    return JSON.stringify({ miniApps, specsOmitted: miniApps.some(app => !('spec' in app)) ? 'Some specs were omitted for size; pass their miniAppID with a complete new spec to change them.' : undefined });
  }
  if (Object.keys(args).some(key => !['miniAppID', 'spec'].includes(key)) || (args.miniAppID !== undefined && typeof args.miniAppID !== 'string')) return JSON.stringify({ error: 'Provide spec and optionally miniAppID.' });
  let parsed: ReturnType<typeof parseSpec>;
  try { parsed = parseSpec(args.spec); }
  catch (error) { return JSON.stringify({ error: error instanceof SpecError ? `Invalid spec: ${error.message}` : 'Invalid spec.' }); }
  const tools = bindTools(parsed.tools, await contactConnectors(env.DB, turn.contactID, turn.userID));
  if (typeof tools === 'string') return JSON.stringify({ error: `${tools} Use list_mcp_tools for exact IDs.` });
  // Without external tools there is nothing to review: the revision is enabled as created.
  const now = Date.now(), specJSON = JSON.stringify(parsed.spec), toolsJSON = JSON.stringify(tools), enabled = tools.length ? 0 : 1;
  // Only a running direct human turn of this conversation can create or replace an app.
  const live = `EXISTS (SELECT 1 FROM chat_turn t JOIN agent_attention a ON a.turn_id = t.id AND a.attempt = t.attempt
    WHERE t.id = ?3 AND t.attempt = ?4 AND t.status = 'running' AND t.contact_id = ?1 AND t.user_id = ?2 AND t.schedule_id IS NULL AND t.group_request_id IS NULL)`;
  let row: { id: string; revision: number } | null;
  if (typeof args.miniAppID === 'string') {
    row = await env.DB.prepare(`UPDATE mini_app SET revision = revision + 1, title = ?5, spec_json = ?6, tools_json = ?7, approved_revision = CASE WHEN ?10 = 1 THEN revision + 1 END,
        last_error = NULL, turn_id = ?3, updated_at = ?8 WHERE id = ?9 AND contact_id = ?1 AND user_id = ?2 AND ${live} RETURNING id, revision`)
      .bind(turn.contactID, turn.userID, turn.id, turn.attempt, parsed.spec.title, specJSON, toolsJSON, now, args.miniAppID, enabled).first();
    if (!row) return JSON.stringify({ error: 'Mini app not found in this chat. Use list_mini_apps.' });
  } else {
    // One new app per human turn: a replayed Workflow step returns the original instead of a copy.
    const id = `${turn.id}:app`;
    const existing = await env.DB.prepare('SELECT id, revision FROM mini_app WHERE id = ? AND contact_id = ? AND user_id = ?').bind(id, turn.contactID, turn.userID).first<{ id: string; revision: number }>();
    if (existing) return JSON.stringify({ miniAppID: existing.id, revision: existing.revision, error: 'A mini app was already created for this message. Pass this miniAppID to change it.' });
    row = await env.DB.prepare(`INSERT INTO mini_app (id, contact_id, user_id, turn_id, title, spec_json, tools_json, approved_revision, created_at, updated_at)
        SELECT ?9, ?1, ?2, ?3, ?5, ?6, ?7, CASE WHEN ?10 = 1 THEN 1 END, ?8, ?8 WHERE ${live} AND (SELECT COUNT(*) FROM mini_app WHERE contact_id = ?1 AND user_id = ?2) < 20
        ON CONFLICT(id) DO NOTHING RETURNING id, revision`)
      .bind(turn.contactID, turn.userID, turn.id, turn.attempt, parsed.spec.title, specJSON, toolsJSON, now, id, enabled).first();
    if (!row) return JSON.stringify({ error: 'Could not create the mini app. Each chat supports 20; replace one with miniAppID.' });
  }
  return JSON.stringify({ miniAppID: row.id, revision: row.revision, enabled: !!enabled, tools: tools.map(t => ({ toolName: t.toolName, role: t.role })),
    nextStep: enabled ? 'Tell the person the mini app card is in this chat and opens immediately. Saved values are kept across revisions when ids and types match.'
      : 'Tell the person the mini app card is in this chat: they must review the listed tools and tap Enable before it loads. Do not claim it shows data yet.' });
}
