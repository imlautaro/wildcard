import { isRecord } from '../chat/meta';
import { allComponents, applyUpdates, directUpdate, normalizeState, numeric, present, StepError, toolData, transform,
  type Action, type Context, type Expectation, type ResolvedComponent, type ResolvedTab, type Spec, type StateValue, type TestStep } from './spec';

// Before an app is saved, the server runs it offline: automatic checks that do not
// depend on the contact (every action reachable and runnable, lists that can grow,
// nothing broken on first open) plus the contact's own test scenarios. Connector reads
// use the results inspected with call_mcp_tool in the same turn; nothing remote runs.
export type Verification = { errors: string[]; warnings: string[]; testsPassed: number;
  preview: { view: ResolvedComponent[]; tabs?: ResolvedTab[]; state: Record<string, StateValue> } };
type Samples = Map<string, unknown>;
export const sampleKey = (connectionID: string, tool: string) => `${connectionID}/${tool}`;

const sampleFields = (action: Action, today: string): Record<string, unknown> =>
  Object.fromEntries(action.fields.map(f => [f.id, f.kind === 'number' ? 12.5 : f.kind === 'toggle' ? true : f.kind === 'date' ? today : 'Example']));
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
  const apply = (action: Action, state: Record<string, StateValue>, fields: Record<string, unknown>, inputs = defaults) =>
    action.kind === 'state' ? applyUpdates(spec, action.set, state, { ...context, inputs, state, fields }) : state;

  // 1. Nothing broken on first open.
  const initial = normalizeState(spec, null);
  const first = run(spec, initial, defaults, samples, context);
  for (const [step, code] of first.errors) {
    const source = spec.data.find(s => s.id === step);
    if (code === 'NO_SAMPLE' && source?.type === 'mcp') errors.push(`Data step "${step}" reads ${source.tool}, but no result of it was inspected in this turn. Call call_mcp_tool on it first so the app can be checked against real data.`);
    else if (code !== 'NO_SAMPLE') errors.push(`Data step "${step}" fails on first open with ${code}${code === 'PATH_NOT_FOUND' ? ' (the path is not in the data; check the inspected result)' : code === 'NOT_A_LIST' ? ' (it expects a list; select the array first)' : ''}.`);
  }

  // 2. Every action is reachable from the screen and runs.
  const reachable = new Set<string>([...spec.menu, ...components.flatMap(c => c.type === 'action' || c.type === 'composer' ? [c.action] : c.type === 'tile' && c.action ? [c.action] : [])]);
  for (const action of spec.actions) if (!reachable.has(action.id)) errors.push(`Action "${action.id}" is declared but no button, tile, menu or composer uses it.`);
  for (const action of spec.actions.filter(a => a.kind === 'state')) {
    if (!apply(action, initial, sampleFields(action, today))) errors.push(`Action "${action.id}" fails from the initial state with sample values (check its value templates, field kinds and state types).`);
  }

  // 3. A populated state: every everyday action twice, then each action must change something.
  let populated = initial;
  for (const action of spec.actions) {
    if (action.kind !== 'state' || action.style === 'destructive' || action.set.some(u => u.op === 'clear')) continue;
    for (let tap = 0; tap < 2; tap++) populated = apply(action, populated, sampleFields(action, today)) ?? populated;
  }
  for (const action of spec.actions.filter(a => a.kind === 'state' && !a.set.some(u => u.op === 'pick'))) {
    const next = apply(action, populated, sampleFields(action, today));
    if (next && equal(next, populated) && equal(apply(action, initial, sampleFields(action, today)), initial)) warnings.push(`Action "${action.id}" never changes anything.`);
  }

  // 4. Lists the person sees must be able to grow, and saved state should be used.
  const appended = new Set(spec.actions.flatMap(a => a.kind === 'state' && reachable.has(a.id) ? a.set.filter(u => u.op === 'append').map(u => u.state) : []));
  const shownLists = new Set(components.flatMap(c => c.type === 'checklist' ? [c.state] : c.type === 'list' || c.type === 'chart' ? [c.source] : []));
  for (const variable of spec.state) {
    if (variable.type === 'list' && shownLists.has(variable.id) && !(variable.initial as unknown[]).length && !appended.has(variable.id))
      errors.push(`List "${variable.id}" starts empty and nothing adds to it. Add an append action (a composer or a button with fields).`);
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
        return apply(action, state, step.fields, inputs) ?? `${action.id} could not run with ${shown(step.fields)}`;
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
