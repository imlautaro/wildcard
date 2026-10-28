import type { ModelTool } from '../chat/meta';
import type { StoredTurn } from '../chat/data';
import { parseSpec, SpecError } from './spec';
import { bindTools, contactConnectors, miniAppColumns, type MiniAppRow } from './runtime';
import { turnSamples, verifySpec, type Verification } from './verify';

const specGuide = 'spec (a JSON object, not a string) = {title, subtitle?, icon (same catalog as tab icons), state?, inputs?, data?, view | tabs, menu?, actions?}. '
  + 'The app opens full screen like a native app. Use view (array of components) for one screen, or tabs for 2–5 screens with a native bottom tab bar: tabs:[{id,title,icon,view}] '
  + '(icon: home|list|chart|check|star|calendar|clock|money|cart|bolt|folder|person|chat|book|trophy|heart|gear|grid). '
  + 'menu: up to 6 action ids without fields, shown in the top bar ⋯ menu (e.g. clear list, reset, shuffle); put secondary or destructive actions there instead of big buttons. '
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
  + 'view components: {type:"section",title?,children} (one level); {type:"grid",columns?:2|3,children} (cards side by side; children: stat, progress, chart, text, action, tile; not nested); '
  + '{type:"stat",label,step,path?,caption?,format?,currency?} (a single stat shows as a large number); '
  + '{type:"progress",label,step,goal,caption?,style?:bar|ring} (value toward a goal; goal is a number or a number state id; ring suits grids); '
  + '{type:"tile",title,caption?,icon?,step?,path?,format?,tab?|action?} (a card: tab opens that tab, action runs a field-less action, step shows a value); '
  + '{type:"composer",action,placeholder?} (a text bar pinned to the bottom of its screen with a send/add button, like a messaging app; its action has exactly one text or number field; at most one per screen, top level); '
  + '{type:"lesson",title,hearts?:1-5,xp?,questions:[{prompt,options?:[2-4 texts],answer,accept?,explain?}]} (a Duolingo-style quiz card: one question at a time with Check, feedback, hearts and a final score; '
  + 'answer is the 0-based index of the correct option, or for typed questions without options the expected text (accept lists other valid spellings); xp is a number state that grows by the correct answers when a lesson ends; '
  + 'write 5–10 real questions per lesson in the person\'s language, several lessons for a course; test it with {edit:{state:"xp",op:"increment",value:3}}); '
  + '{type:"toggle",label,state} (boolean state, tap to flip); '
  + '{type:"choice",label,state,options:[{value,label}]} (text state, pick one); {type:"input",label,state,placeholder?} (text/number state, edited in place); '
  + '{type:"checklist",state,title,done?,subtitle?,value?,removable?,empty?} (list state; rows tap to toggle the boolean "done" field and swipe to delete); '
  + '{type:"list",source,title,subtitle?,value?,limit?,empty?,format?,currency?} (read-only rows from a step or list state; title/subtitle/value are paths in each row); '
  + '{type:"chart",source,kind:bar|line|area|pie,x,y,title?,format?,currency?} (pie: up to 12 slices, e.g. a group step); {type:"timer",label,minutes} (on-device countdown with start/pause/reset); '
  + '{type:"text",text,style:body|caption|headline}; {type:"action",action} (consecutive buttons share one row). '
  + 'format: number|currency|percent|date|datetime|text; currency needs an ISO code. '
  + 'actions (ids separate from state ids): local {id,label,set:[{state,op,value?}],confirm?,style?,fields?} updates saved state instantly. ops: increment/decrement (number, default 1), set (number/text/boolean), toggle (boolean), '
  + 'append (list; value is an object, often from fields, e.g. {"name":{"$field":"item"},"done":false}), clear (list), set_items (list; {field:"done",value:false} sets that field on every item, e.g. to restart a checklist), remove_where (list; {field:"done",value:true} removes matching items, e.g. clear completed), '
  + 'pick (text/number; value is an array of options, one chosen at random, e.g. a dinner roulette). Omit confirm unless the action is destructive. '
  + 'remote {id,label,confirm,style?:default|destructive,connectionID,tool,arguments,fields?} runs an external write only after the person taps and confirms. '
  + 'fields: [{id,label,kind:text|number|date|toggle,required?}] render a form with the button. '
  + 'Prefer the bound components (toggle, choice, input, checklist) over many buttons. Keep labels short (use "+" and "−" for counters) and write all text in the person\'s language. '
  + 'Example counter: {title:"Counter",icon:"bolt",state:[{id:"count",type:"number",initial:0}],view:[{type:"stat",label:"Count",step:"count"},{type:"action",action:"sub"},{type:"action",action:"add"}],actions:[{id:"sub",label:"−",set:[{state:"count",op:"decrement"}]},{id:"add",label:"+",set:[{state:"count",op:"increment"}]}]}. '
  + 'tests (required for apps with local actions or editable components): up to 8 scenarios run on the server before the app is saved, each from the initial state: '
  + '{name,steps:[{tap:actionId,fields?:{fieldId:value}} | {edit:{state,op,value?,index?}} (what a toggle/choice/input/checklist row sends: op toggle, set, toggle_item or remove_item) | {input:{inputId:value}}],'
  + 'expect:[{state,equals?|count?|includes?:{field:value}} | {step,equals} | {text}]} (text: something the screen must show). Test the main flow and edge cases, e.g. add two items then check one, or a calculation with known inputs. '
  + 'Example to-do list with an input bar and a menu: {title:"To-do",icon:"check",state:[{id:"items",type:"list",initial:[]}],menu:["clearDone","clearAll"],view:[{type:"checklist",state:"items",title:"name",done:"done",empty:"Nothing to do"},{type:"composer",action:"add",placeholder:"New task"}],'
  + 'actions:[{id:"add",label:"Add",fields:[{id:"item",label:"Task",kind:"text",required:true}],set:[{state:"items",op:"append",value:{"name":{"$field":"item"},"done":false}}]},{id:"clearDone",label:"Uncheck all",set:[{state:"items",op:"set_items",field:"done",value:false}]},{id:"clearAll",label:"Clear list",style:"destructive",confirm:"Delete every task?",set:[{state:"items",op:"clear"}]}],'
  + 'tests:[{name:"add and check",steps:[{tap:"add",fields:{item:"Milk"}},{tap:"add",fields:{item:"Eggs"}},{edit:{state:"items",op:"toggle_item",index:0}}],expect:[{state:"items",count:2},{state:"items",includes:{name:"Milk",done:true}}]},'
  + '{name:"clear",steps:[{tap:"add",fields:{item:"Milk"}},{tap:"clearAll"}],expect:[{state:"items",count:0}]}]}. '
  + 'Example tabs: tabs:[{id:"home",title:"Home",icon:"home",view:[{type:"grid",children:[{type:"stat",label:"Total",step:"total"},{type:"progress",label:"Goal",step:"total",goal:10,style:"ring"},{type:"tile",title:"History",icon:"list",tab:"history"}]}]},{id:"history",title:"History",icon:"list",view:[{type:"list",source:"log",title:"name"}]}].';

// System guidance for direct private chats; the evaluation script uses the same text.
export const miniAppInstruction = 'When the person asks for an app, tool, counter, tracker, checklist or reusable view, build a native mini app with create_mini_app instead of describing one or writing code. '
  + 'Use saved state and local actions for things that only need to remember values. create_mini_app verifies each app (automatic checks plus your tests) and saves it only if it passes. '
  + 'Mention a mini app only when create_mini_app returned its miniAppID. If it keeps failing, or the request needs something mini apps cannot do, tell the person plainly which part could not be built and why, '
  + 'and offer the closest version instead of handing over something broken.';

export const miniAppTools: ModelTool[] = [{ type: 'function', function: {
  name: 'create_mini_app',
  description: 'Build or update a native mini app for THIS person when they ask for an app, tool, counter, tracker, checklist, dashboard or reusable view. '
    + 'Apps without external tools (only state, inputs, const data and local actions) open immediately. '
    + 'For connected data, first use list_mcp_tools and call_mcp_tool once to inspect the real result shape; design paths from that result. Never invent connectionIDs, tools or fields. '
    + 'Apps using external tools start disabled: the person must review its tools and enable it from the card in this chat; each later open re-runs its read steps under that grant. '
    + 'Pass miniAppID to replace an existing app (it then needs review again). '
    + 'Before saving, the server verifies the app: automatic checks (every action reachable and runnable, lists that can grow, no data step failing on first open, connector paths checked against the result you inspected) and your tests. '
    + 'A failing app is NOT saved; you get the problems to fix. Never create placeholder, probe or test apps: every call must be the app the person asked for. Only promise what the catalog below can do: if part of the request is impossible (camera, live AI replies, multiplayer, notifications, arbitrary code, data without a connector) say so and offer the closest app. ' + specGuide,
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
  const prepared = prepareMiniApp(args.spec, turn.timeZone ?? 'UTC', await turnSamples(env.DB, turn.id));
  if ('response' in prepared) return JSON.stringify(prepared.response);
  const { parsed, verification } = prepared;
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
    verified: { testsPassed: verification.testsPassed, warnings: verification.warnings.slice(0, 8) },
    nextStep: enabled ? 'Tell the person the mini app card is in this chat and opens immediately. Saved values are kept across revisions when ids and types match.'
      : 'Tell the person the mini app card is in this chat: they must review the listed tools and tap Enable before it loads. Do not claim it shows data yet.' });
}

// Parsing plus offline verification, shared with scripts/checks/mini-app-eval.mjs.
// A spec that fails either is never saved; the model gets the problems to fix.
export function prepareMiniApp(raw: unknown, timeZone: string, samples: Map<string, unknown>, now = Date.now()):
  { parsed: ReturnType<typeof parseSpec>; verification: Verification } | { response: Record<string, unknown> } {
  let parsed: ReturnType<typeof parseSpec>;
  try { parsed = parseSpec(raw); }
  catch (error) { return { response: { error: error instanceof SpecError ? `Invalid spec: ${error.message}` : 'Invalid spec.' } }; }
  const verification = verifySpec(parsed.spec, samples, timeZone, now);
  if (verification.errors.length) return { response: {
    error: 'The mini app failed verification and was NOT saved. Fix every problem and call create_mini_app again with the complete spec. If you cannot make it work, tell the person plainly which part cannot be built; never say the app exists.',
    problems: verification.errors.slice(0, 12), testsPassed: verification.testsPassed, warnings: verification.warnings.slice(0, 6) } };
  return { parsed, verification };
}
