import type { ModelTool } from '../chat/meta';
import type { StoredTurn } from '../chat/data';
import { parseSpec, SpecError } from './spec';
import { bindTools, contactConnectors, miniAppColumns, type MiniAppRow } from './runtime';

const specGuide = 'spec (a JSON object, not a string) = {title, subtitle?, icon: chart|list|money|calendar|cart|check|clock|star|bolt|folder, state?, inputs?, data?, view, actions?}. '
  + 'state: saved values for this person, [{id,type:number|text|boolean|list,initial}]; a list holds flat objects, e.g. [{"name":"Milk","done":false}]. '
  + 'Read state in the view by id (stat.step, list.source) or with {"$state":"id"}; data steps may also read state with "from". '
  + 'data is an ordered list of steps; "from" may only name an EARLIER step or a state id. Step types: '
  + '{id,type:"mcp",connectionID,tool,arguments} (a read run each time the app opens); {id,type:"const",value} (also for calculations); {id,type:"select",from,path}; '
  + '{id,type:"filter",from,where:[{field,op:eq|neq|gt|gte|lt|lte|contains|after|before,value}]}; {id,type:"sort",from,field,order:asc|desc}; '
  + '{id,type:"limit",from,count}; {id,type:"aggregate",from,op:sum|avg|min|max|count,field?} (a number); '
  + '{id,type:"group",from,by,op,field?,order:key|value-asc|value-desc} (rows {key,value,count}). '
  + 'Paths are dot paths, e.g. "data.expenses" or "amount"; "" is the whole value. '
  + 'Values may be JSON literals or expressions: {"$input":"id"}, {"$state":"id"}, {"$field":"id"} (actions), {"$date":{"days":-7,"format":"date"|"datetime"}}, '
  + 'math {"$add"|"$sub"|"$mul"|"$div"|"$min"|"$max":[a,b,…]}, {"$round":{"value":…,"digits":2}}, and {"$daysSince":"2026-10-01"} / {"$daysUntil":…} (whole days from today).  Example tip: {id:"tip",type:"const",value:{"$round":{"value":{"$mul":[{"$input":"bill"},{"$div":[{"$input":"pct"},100]}]},"digits":2}}}. '
  + 'inputs (not saved, recomputed live): {id,type:"segmented",label,options:[{value,label}],default}, {id,type:"number",label,default} or {id,type:"text",label,default}. '
  + 'view components: {type:"section",title?,children} (one level); {type:"stat",label,step,path?,caption?,format?,currency?} (a single stat shows as a large number); '
  + '{type:"progress",label,step,goal,caption?} (value toward a goal; goal is a number or a number state id); {type:"toggle",label,state} (boolean state, tap to flip); '
  + '{type:"choice",label,state,options:[{value,label}]} (text state, pick one); {type:"input",label,state,placeholder?} (text/number state, edited in place); '
  + '{type:"checklist",state,title,done?,subtitle?,value?,removable?,empty?} (list state; rows tap to toggle the boolean "done" field and swipe to delete); '
  + '{type:"list",source,title,subtitle?,value?,limit?,empty?,format?,currency?} (read-only rows from a step or list state; title/subtitle/value are paths in each row); '
  + '{type:"chart",source,kind:bar|line,x,y,title?,format?,currency?}; {type:"timer",label,minutes} (on-device countdown with start/pause/reset); '
  + '{type:"text",text,style:body|caption|headline}; {type:"action",action} (consecutive buttons share one row). '
  + 'format: number|currency|percent|date|datetime|text; currency needs an ISO code. '
  + 'actions (ids separate from state ids): local {id,label,set:[{state,op,value?}],confirm?,style?,fields?} updates saved state instantly. ops: increment/decrement (number, default 1), set (number/text/boolean), toggle (boolean), '
  + 'append (list; value is an object, often from fields, e.g. {"name":{"$field":"item"},"done":false}), clear (list), set_items (list; {field:"done",value:false} sets that field on every item, e.g. to restart a checklist), '
  + 'pick (text/number; value is an array of options, one chosen at random, e.g. a dinner roulette). Omit confirm unless the action is destructive. '
  + 'remote {id,label,confirm,style?:default|destructive,connectionID,tool,arguments,fields?} runs an external write only after the person taps and confirms. '
  + 'fields: [{id,label,kind:text|number|date|toggle,required?}] render a form with the button. '
  + 'Prefer the bound components (toggle, choice, input, checklist) over many buttons. Keep labels short (use "+" and "−" for counters) and write all text in the person\'s language. '
  + 'Example counter: {title:"Counter",icon:"bolt",state:[{id:"count",type:"number",initial:0}],view:[{type:"stat",label:"Count",step:"count"},{type:"action",action:"sub"},{type:"action",action:"add"}],actions:[{id:"sub",label:"−",set:[{state:"count",op:"decrement"}]},{id:"add",label:"+",set:[{state:"count",op:"increment"}]}]}. '
  + 'Example shopping list: {title:"Groceries",icon:"cart",state:[{id:"items",type:"list",initial:[]}],view:[{type:"checklist",state:"items",title:"name",done:"done",empty:"Add your first item"},{type:"action",action:"add"}],actions:[{id:"add",label:"Add",fields:[{id:"item",label:"Item",kind:"text",required:true}],set:[{state:"items",op:"append",value:{"name":{"$field":"item"},"done":false}}]}]}.';

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
