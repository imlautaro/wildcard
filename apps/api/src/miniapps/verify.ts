import { isRecord } from '../chat/meta';
import { allComponents, applyUpdates, directUpdate, isRowAction, ownerOf, normalizeState, numeric, present, selectOptions, StepError, toolData, transform,
  type Action, type Component, type Context, type Expectation, type ResolvedComponent, type ResolvedTab, type Spec, type StateValue, type TestStep } from './spec';

// Before an app is saved, the server runs it offline: automatic checks that do not
// depend on the contact (every action reachable and runnable, lists that can grow,
// nothing broken on first open) plus the contact's own test scenarios. Connector reads
// use the results inspected with call_mcp_tool in the same turn; nothing remote runs.
export type Verification = { errors: string[]; warnings: string[]; testsPassed: number;
  preview: { view: ResolvedComponent[]; tabs?: ResolvedTab[]; state: Record<string, StateValue> } };
type Samples = Map<string, unknown>;
export const sampleKey = (connectionID: string, tool: string) => `${connectionID}/${tool}`;

// Select fields take their first option: a fixed one, or the first item of their list in the current state.
const sampleFields = (action: Action, today: string, state: Record<string, StateValue> = {}): Record<string, unknown> =>
  Object.fromEntries(action.fields.map(f => [f.id, f.kind === 'number' ? 12.5 : f.kind === 'toggle' ? true : f.kind === 'date' ? today
    : f.kind === 'select' ? (f.options ?? selectOptions(f, state[f.from!]))[0]?.value ?? 'Example' : 'Example']));
// The list a row action runs on (the list or checklist that shows it).
const rowList = (spec: Spec, components: Component[], id: string) => components.flatMap(c => (c.type === 'list' || c.type === 'checklist') && (c.edit === id || c.actions?.includes(id)) ? [c.type === 'list' ? ownerOf(spec.state, spec.data, c.source) ?? c.source : c.state] : [])[0];
function equal(a: unknown, b: unknown): boolean {
  const x = numeric(a), y = numeric(b);
  if (typeof a === 'number' || typeof b === 'number') return x !== null && y !== null && Math.abs(x - y) < 1e-9;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => equal(item, b[i]));
  if (isRecord(a) || isRecord(b)) return isRecord(a) && isRecord(b) && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => equal(a[key], b[key]));
  return a === b;
}
const shown = (value: unknown) => JSON.stringify(value)?.slice(0, 120) ?? 'nothing';

function run(spec: Spec, state: Record<string, StateValue>, inputs: Record<string, string>, samples: Samples, context: Omit<Context, 'state' | 'inputs'>) {
  const outputs = new Map<string, unknown>(Object.entries(state)), errors = new Map<string, string>();
  const full = { ...context, inputs, state };
  for (const step of spec.data) {
    if (step.type === 'mcp') {
      const sample = samples.get(sampleKey(step.connectionID, step.tool));
      if (sample === undefined) errors.set(step.id, 'NO_SAMPLE'); else outputs.set(step.id, sample);
      continue;
    }
    if (step.type !== 'const' && errors.has(step.from)) { errors.set(step.id, errors.get(step.from)!); continue; }
    try { outputs.set(step.id, transform(step, outputs, full)); }
    catch (error) { errors.set(step.id, error instanceof StepError ? error.message : 'TRANSFORM_FAILED'); }
  }
  const screens = spec.tabs?.map(tab => ({ id: tab.id, title: tab.title, icon: tab.icon, view: present(tab.view, spec, outputs, errors) }));
  const view = screens ? screens[0].view : present(spec.view ?? [], spec, outputs, errors);
  return { outputs, errors, view, tabs: screens };
}
// Every visible string and raw value, so a test can assert what the person would read.
function texts(components: ResolvedComponent[], into: string[] = []): string[] {
  const visit = (value: unknown) => {
    if (typeof value === 'string' || typeof value === 'number') into.push(String(value));
    else if (Array.isArray(value)) value.forEach(visit);
    else if (isRecord(value)) Object.entries(value).forEach(([key, v]) => { if (!['type', 'format', 'currency', 'state', 'id', 'kind', 'style'].includes(key)) visit(v); });
  };
  visit(components);
  return into;
}

export function verifySpec(spec: Spec, samples: Samples, timeZone: string, now = Date.now()): Verification {
  const errors: string[] = [], warnings: string[] = [];
  const today = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  const context = { timeZone, now };
  const defaults = Object.fromEntries(spec.inputs.map(i => [i.id, i.default]));
  const components = allComponents(spec);
  // Row actions run on the first row of their list (or the given one); with no rows they cannot run yet.
  const apply = (action: Action, state: Record<string, StateValue>, fields: Record<string, unknown>, inputs = defaults, index = 0) => {
    if (action.kind !== 'state') return state;
    const list = isRowAction(action) ? rowList(spec, components, action.id) : undefined;
    if (list && !((state[list] as unknown[] | undefined)?.length)) return undefined;
    return applyUpdates(spec, action.set, state, { ...context, inputs, state, fields, ...(list ? { row: { state: list, index } } : {}) });
  };

  // 1. Nothing broken on first open.
  const initial = normalizeState(spec, null);
  const first = run(spec, initial, defaults, samples, context);
  for (const [step, code] of first.errors) {
    const source = spec.data.find(s => s.id === step);
    if (code === 'NO_SAMPLE' && source?.type === 'mcp') errors.push(`Data step "${step}" reads ${source.tool}, but no result of it was inspected in this turn. Call call_mcp_tool on it first so the app can be checked against real data.`);
    else if (code !== 'NO_SAMPLE') errors.push(`Data step "${step}" fails on first open with ${code}${code === 'PATH_NOT_FOUND' ? ' (the path is not in the data; check the inspected result)' : code === 'NOT_A_LIST' ? ' (it expects a list; select the array first)' : ''}.`);
  }

  // 2. Every action is reachable from the screen and runs.
  const reachable = new Set<string>([...spec.menu, ...components.flatMap(c => c.type === 'action' || c.type === 'composer' || c.type === 'toolbar' ? [c.action] : c.type === 'tile' && c.action ? [c.action]
    : c.type === 'list' || c.type === 'checklist' ? [...(c.edit ? [c.edit] : []), ...(c.actions ?? [])] : [])]);
  for (const action of spec.actions) if (!reachable.has(action.id)) errors.push(`Action "${action.id}" is declared but no button, toolbar, tile, menu, composer or list row uses it.`);
  for (const action of spec.actions.filter(a => a.kind === 'state')) {
    // Row actions on an initially empty list are checked on the populated state below.
    const result = action.set.some(u => u.from && !((initial[u.from] as unknown[] | undefined)?.length)) ? undefined : apply(action, initial, sampleFields(action, today, initial));
    if (result === null) errors.push(`Action "${action.id}" fails from the initial state with sample values (check its value templates, field kinds and state types).`);
  }

  // 3. A populated state: every everyday action twice, then each action must change something.
  let populated = initial;
  // Adding actions first, so row actions and selects find rows to work on.
  const everyday = spec.actions.filter(a => a.kind === 'state' && a.style !== 'destructive' && !a.set.some(u => u.op === 'clear' || u.op === 'remove_item'));
  for (const action of [...everyday.filter(a => !isRowAction(a)), ...everyday.filter(a => isRowAction(a))]) {
    for (let tap = 0; tap < 2; tap++) populated = apply(action, populated, sampleFields(action, today, populated)) ?? populated;
  }
  for (const action of spec.actions.filter(a => a.kind === 'state' && isRowAction(a))) {
    if (apply(action, populated, sampleFields(action, today, populated)) === null) errors.push(`Row action "${action.id}" fails on a row of its list after sample use (check update_item values, $item fields and field kinds).`);
  }
  for (const action of spec.actions.filter(a => a.kind === 'state' && !a.set.some(u => u.op === 'pick' || u.op === 'assign' || u.op === 'update_item'))) {
    const next = apply(action, populated, sampleFields(action, today, populated));
    if (next && equal(next, populated) && equal(apply(action, initial, sampleFields(action, today, initial)) ?? initial, initial)) warnings.push(`Action "${action.id}" never changes anything.`);
  }

  // 4. Lists the person sees must be able to grow, and saved state should be used.
  const appended = new Set(spec.actions.flatMap(a => a.kind === 'state' && reachable.has(a.id) ? a.set.filter(u => u.op === 'append').map(u => u.state) : []));
  // Read anywhere: shown, computed from (a total over expenses), offered in a select or picked from.
  const shownLists = new Set([...components.flatMap(c => c.type === 'checklist' ? [c.state] : c.type === 'list' || c.type === 'chart' ? [c.source] : []),
    ...spec.data.flatMap(step => 'from' in step ? [step.from] : []), ...spec.actions.flatMap(a => [...a.fields.flatMap(f => f.from ? [f.from] : []), ...(a.kind === 'state' ? a.set.flatMap(u => u.from ? [u.from] : []) : [])])]);
  for (const variable of spec.state) {
    if (variable.type === 'list' && shownLists.has(variable.id) && !(variable.initial as unknown[]).length && !appended.has(variable.id))
      errors.push(`List "${variable.id}" starts empty and nothing adds to it, but the app shows or computes from it. Add an append action (a composer, or a toolbar + with fields) or remove what reads it.`);
  }
  const specText = JSON.stringify({ data: spec.data, actions: spec.actions, view: spec.view, tabs: spec.tabs });
  for (const variable of spec.state) if (!specText.includes(`"${variable.id}"`)) warnings.push(`State "${variable.id}" is never shown or used.`);
  const later = run(spec, populated, defaults, samples, context);
  const walk = (items: ResolvedComponent[], at: string) => items.forEach((c, i) => {
    if (c.type === 'section' || c.type === 'grid') walk(c.children, `${at}[${i}]`);
    else if (c.type === 'chart' && !c.points.length) warnings.push(`Chart at ${at}[${i}] has no points after sample use; check its source, x and y.`);
    else if (c.type === 'stat' && c.value === null && !c.state) warnings.push(`Stat "${c.label}" shows no value after sample use; check its step and path.`);
  });
  if (later.tabs) later.tabs.forEach(tab => walk(tab.view, `tab ${tab.id}`)); else walk(later.view, 'view');

  // 4b. Design: one connected data model, nothing shown twice, options as a choice.
  design(spec, components, reachable, populated, errors, warnings);

  // 5. The interactive app should come with at least one test of its main behavior.
  const interactive = spec.actions.some(a => a.kind === 'state') || components.some(c => ['toggle', 'choice', 'input', 'checklist'].includes(c.type) || (c.type === 'lesson' && c.xp));
  if (interactive && !spec.tests.length) errors.push('Add tests: at least one scenario that taps the main actions and checks the resulting state, e.g. tests:[{name:"adds an item",steps:[{tap:"add",fields:{item:"Milk"}}],expect:[{state:"items",count:1}]}].');

  // 6. The contact's tests, each from a fresh initial state.
  let testsPassed = 0;
  for (const test of spec.tests) {
    let state = initial, inputs = { ...defaults }, failure: string | null = null;
    for (const [index, step] of test.steps.entries()) {
      const next = stepOnce(step);
      if (typeof next === 'string') { failure = `step ${index + 1}: ${next}`; break; }
      state = next;
    }
    function stepOnce(step: TestStep): Record<string, StateValue> | string {
      if ('input' in step) {
        for (const [id, value] of Object.entries(step.input)) {
          const input = spec.inputs.find(i => i.id === id)!;
          if (input.type === 'segmented' && !input.options.some(o => o.value === value)) return `input ${id} has no option "${value}"`;
          inputs = { ...inputs, [id]: value };
        }
        return state;
      }
      if ('tap' in step) {
        const action = spec.actions.find(a => a.id === step.tap)!;
        const missing = action.fields.find(f => f.required && (step.fields[f.id] === undefined || step.fields[f.id] === ''));
        if (missing) return `${action.id} needs field ${missing.id}`;
        const list = isRowAction(action) ? rowList(spec, components, action.id) : undefined;
        if (list && (step.row ?? 0) >= ((state[list] as unknown[] | undefined)?.length ?? 0)) return `${action.id} needs row ${step.row ?? 0} of ${list}, which has ${((state[list] as unknown[] | undefined)?.length ?? 0)} items`;
        return apply(action, state, step.fields, inputs, step.row ?? 0) ?? `${action.id} could not run with ${shown(step.fields)}`;
      }
      const update = directUpdate(spec, step.edit);
      if (!update) return `no component on screen allows the edit ${shown(step.edit)}`;
      return applyUpdates(spec, [update], state, { ...context, inputs, state }) ?? `the edit ${shown(step.edit)} is not valid for the current state`;
    }
    if (!failure) {
      const result = run(spec, state, inputs, samples, context);
      const visible = texts(result.tabs ? result.tabs.flatMap(t => t.view) : result.view).map(t => t.toLowerCase());
      for (const check of test.expect) {
        const problem = expectation(check, state, result.outputs, visible);
        if (problem) { failure = problem; break; }
      }
    }
    if (failure) errors.push(`Test "${test.name}" failed: ${failure}.`); else testsPassed++;
  }

  return { errors, warnings, testsPassed, preview: { view: later.view, ...(later.tabs ? { tabs: later.tabs } : {}), state: populated } };
}

// Checks of the app's shape that the person would notice even when every action works.
function design(spec: Spec, components: Component[], reachable: Set<string>, populated: Record<string, StateValue>, errors: string[], warnings: string[]) {
  const local = spec.actions.filter((a): a is Extract<Action, { kind: 'state' }> => a.kind === 'state' && reachable.has(a.id));
  // Lists the person fills (something appends to them).
  const filled = [...new Set(local.flatMap(a => a.set.filter(u => u.op === 'append').map(u => u.state)))];
  if (filled.length) for (const action of local) for (const u of action.set) {
    if (u.op === 'pick' && !u.from) errors.push(`Action "${action.id}" picks from fixed options although the person keeps the list "${filled[0]}". Pick from that list instead: {"state":"${u.state}","op":"pick","from":"${filled[0]}","field":"name"}.`);
  }
  // Two lists the person fills must be connected: a select field, a pick or a row action of one feeds the other.
  if (filled.length > 1) {
    const links = new Map<string, Set<string>>(filled.map(id => [id, new Set<string>()]));
    const link = (a: string, b: string) => { if (a !== b && links.has(a) && links.has(b)) { links.get(a)!.add(b); links.get(b)!.add(a); } };
    for (const action of local) {
      const reads = [...action.fields.flatMap(f => f.from ? [f.from] : []), ...action.set.flatMap(u => u.from ? [u.from] : []),
        ...components.flatMap(c => (c.type === 'list' || c.type === 'checklist') && (c.edit === action.id || c.actions?.includes(action.id)) ? [c.type === 'list' ? ownerOf(spec.state, spec.data, c.source) ?? c.source : c.state] : [])];
      for (const read of reads) for (const u of action.set) link(read, u.state);
    }
    const component = (id: string) => { const found = new Set<string>(), queue = [id]; while (queue.length) { const x = queue.pop()!; if (!found.has(x)) { found.add(x); queue.push(...links.get(x)!); } } return found; };
    // Item fields each list receives, and the text fields typed into it.
    const appends = (id: string) => local.flatMap(a => a.set.filter(u => u.op === 'append' && u.state === id).map(u => ({ action: a, value: u.value })));
    const keys = (id: string) => new Set([...appends(id).flatMap(x => typeof x.value === 'object' && x.value ? Object.keys(x.value) : ['value']),
      ...((spec.state.find(v => v.id === id)?.initial as Record<string, unknown>[] | undefined) ?? []).flatMap(item => Object.keys(item))].filter(k => k !== 'done'));
    const typed = (id: string) => appends(id).flatMap(x => x.action.fields.filter(f => f.kind === 'text' && JSON.stringify(x.value).includes(`"$field":"${f.id}"`)));
    const roster = (id: string) => keys(id).size === 1 && typed(id).length > 0;
    for (const [i, a] of filled.entries()) for (const b of filled.slice(i + 1)) {
      if (component(a).has(b)) continue;
      const ka = keys(a), kb = keys(b);
      // One kind of thing split by status (to read / read) or by group (team 1 / team 2).
      if (ka.size && ka.size === kb.size && [...ka].every(k => kb.has(k)))
        errors.push(`The lists "${a}" and "${b}" hold the same kind of item, split in two. Keep one list with a status or group field (e.g. status: to read/reading/read, team: A/B) and change it with an edit or row action, or deal it with assign.`);
      // A list of names, and another list where people type those names again as free text.
      // Only records (several fields) refer to the names; a second list of single entries (words, songs) is its own data.
      else for (const [names, other] of [[a, b], [b, a]] as const) if (roster(names) && keys(other).size > 1 && typed(other).length)
        errors.push(`"${other}" takes free text (${typed(other).map(f => f.id).join(', ')}) although the person keeps the list "${names}". Connect them: a select field with from:"${names}" (e.g. who paid, which plant), or a row action on "${names}" (update_item, or $item in an append).`);
    }
  }
  // Rows must not show raw true/false.
  for (const c of components) {
    if (c.type !== 'list' && c.type !== 'checklist') continue;
    const items = populated[c.type === 'list' ? ownerOf(spec.state, spec.data, c.source) ?? c.source : c.state];
    if (!Array.isArray(items)) continue;
    for (const key of [c.title, c.subtitle, c.value]) if (key && items.some(item => typeof (item as Record<string, unknown>)[key] === 'boolean'))
      errors.push(`A ${c.type} shows the boolean field "${key}" as text (true/false). Show text or numbers in title, subtitle and value; a checklist shows its done field as the checkbox.`);
  }
  const screens = spec.tabs ? spec.tabs.map(t => ({ name: `tab ${t.id}`, view: t.view })) : [{ name: 'the screen', view: spec.view ?? [] }];
  const flat = (items: Component[]): Component[] => items.flatMap(c => c.type === 'section' || c.type === 'grid' ? flat(c.children) : [c]);
  for (const screen of screens) {
    const items = flat(screen.view);
    // The same number twice on one screen wastes space and reads as two different values.
    const shown = new Map<string, number>();
    for (const c of items) if ((c.type === 'stat' || c.type === 'progress' || c.type === 'tile') && c.step) {
      const key = `${c.step}${c.path ? `.${c.path}` : ''}`; shown.set(key, (shown.get(key) ?? 0) + 1);
    }
    for (const [key, count] of shown) if (count > 1) errors.push(`${screen.name} shows "${key}" ${count} times (stat, progress or tile). Show each value once; a progress already shows its value, so put extra context in its caption.`);
    // Several buttons that each set one value of the same state are a choice.
    const setters = new Map<string, string[]>();
    for (const c of items) {
      if (c.type !== 'action') continue;
      const action = local.find(a => a.id === c.action);
      if (!action || action.fields.length || action.set.length !== 1 || action.set[0].op !== 'set' || typeof action.set[0].value === 'object') continue;
      setters.set(action.set[0].state, [...(setters.get(action.set[0].state) ?? []), action.id]);
    }
    for (const [state, ids] of setters) if (ids.length > 1) errors.push(`Buttons ${ids.join(', ')} each set "${state}" to a fixed value. Use one {type:"choice",state:"${state}",options:[…]} instead: it shows which option is selected.`);
  }
  // Tabs that share no saved state are separate apps in one shell.
  if (spec.tabs && spec.tabs.length > 1) {
    const refs = spec.tabs.map(tab => {
      const text = JSON.stringify(tab.view), used = new Set<string>();
      const add = (id: string) => { if (used.has(id)) return; used.add(id); const step = spec.data.find(s => s.id === id); if (step && 'from' in step) add(step.from); };
      for (const v of [...spec.state, ...spec.data]) if (text.includes(`"${v.id}"`)) add(v.id);
      for (const action of local) if (text.includes(`"${action.id}"`)) action.set.forEach(u => add(u.state));
      return new Set([...used].filter(id => spec.state.some(v => v.id === id)));
    });
    const lonely = spec.tabs.filter((_, i) => refs[i].size && refs.every((other, j) => j === i || ![...refs[i]].some(id => other.has(id))));
    if (lonely.length > 1) warnings.push(`Tabs ${lonely.map(t => t.id).join(', ')} share no saved data. Use tabs only for different views of the same data; a simple tool fits one screen.`);
  }
}

function expectation(check: Expectation, state: Record<string, StateValue>, outputs: Map<string, unknown>, visible: string[]): string | null {
  if ('text' in check) return visible.some(t => t.includes(check.text.toLowerCase())) ? null : `the screen does not show "${check.text}"`;
  if ('step' in check) {
    const value = outputs.get(check.step);
    return equal(value, check.equals) ? null : `expected data step ${check.step} to equal ${shown(check.equals)}, got ${shown(value)}`;
  }
  const value = state[check.state];
  if (check.count !== undefined && (!Array.isArray(value) || value.length !== check.count)) return `expected ${check.state} to have ${check.count} items, got ${Array.isArray(value) ? value.length : shown(value)}`;
  if (check.includes && !(Array.isArray(value) && value.some(item => Object.entries(check.includes!).every(([key, v]) => equal(item[key], v)))))
    return `expected ${check.state} to include ${shown(check.includes)}, got ${shown(value)}`;
  if (check.equals !== undefined && !equal(value, check.equals)) return `expected ${check.state} to equal ${shown(check.equals)}, got ${shown(value)}`;
  return null;
}

// Results inspected with call_mcp_tool in this turn, keyed by connection and tool.
export async function turnSamples(db: D1Database, turnID: string): Promise<Samples> {
  const { results } = await db.prepare('SELECT connection_id AS connectionID, tool_name AS toolName, result_json AS result FROM mcp_execution WHERE turn_id = ? AND result_json IS NOT NULL ORDER BY slot')
    .bind(turnID).all<{ connectionID: string; toolName: string; result: string }>();
  const samples: Samples = new Map();
  for (const row of results) {
    try {
      const parsed: unknown = JSON.parse(row.result);
      if (!isRecord(parsed) || 'error' in parsed) continue;
      samples.set(sampleKey(row.connectionID, row.toolName), toolData(parsed));
    } catch { /* prose or failed results cannot serve as samples */ }
  }
  return samples;
}
