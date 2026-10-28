import { isRecord } from '../chat/meta';

// Mini apps are declarative data: ordered steps that may only reference earlier
// steps (an acyclic graph by construction), and a view tree of a closed component
// catalog. Nothing here evaluates code, regular expressions or remote references.
export const miniAppIcons = ['chart', 'list', 'money', 'calendar', 'cart', 'check', 'clock', 'star', 'bolt', 'folder'] as const;
// Tab and tile icons: a closed catalog that both clients map to native symbols.
export const symbolIcons = [...miniAppIcons, 'home', 'person', 'chat', 'book', 'trophy', 'heart', 'gear', 'grid'] as const;
const formats = ['number', 'currency', 'percent', 'date', 'datetime', 'text'] as const;
const comparisons = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'after', 'before'] as const;
const aggregates = ['sum', 'avg', 'min', 'max', 'count'] as const;
const arithmetic = ['$add', '$sub', '$mul', '$div', '$min', '$max'] as const;
const chartKinds = ['bar', 'line', 'area', 'pie'] as const;
const stateOps = ['increment', 'decrement', 'set', 'toggle', 'append', 'clear', 'pick', 'set_items', 'remove_where', 'toggle_item', 'remove_item'] as const;
type Format = typeof formats[number];
type Aggregate = typeof aggregates[number];
type Condition = { field: string; op: typeof comparisons[number]; value: unknown };
export type Step =
  | { id: string; type: 'mcp'; connectionID: string; tool: string; arguments: Record<string, unknown> }
  | { id: string; type: 'const'; value: unknown }
  | { id: string; type: 'select'; from: string; path: string }
  | { id: string; type: 'filter'; from: string; where: Condition[] }
  | { id: string; type: 'sort'; from: string; field: string; order: 'asc' | 'desc' }
  | { id: string; type: 'limit'; from: string; count: number }
  | { id: string; type: 'aggregate'; from: string; op: Aggregate; field?: string }
  | { id: string; type: 'group'; from: string; by: string; op: Aggregate; field?: string; order: 'key' | 'value-asc' | 'value-desc' };
type Option = { value: string; label: string };
type Input = { id: string; type: 'segmented'; label: string; options: Option[]; default: string }
  | { id: string; type: 'text' | 'number'; label: string; default: string };
type Field = { id: string; label: string; kind: 'text' | 'number' | 'date' | 'toggle'; required: boolean };
export type Scalar = number | string | boolean;
export type Item = Record<string, Scalar>;
export type StateValue = Scalar | Item[];
export type StateVar = { id: string; type: 'number' | 'text' | 'boolean' | 'list'; initial: StateValue };
export type StateUpdate = { state: string; op: typeof stateOps[number]; value?: unknown; index?: number; field?: string };
type ActionBase = { id: string; label: string; style: 'default' | 'destructive'; fields: Field[] };
// Remote actions call an MCP write tool after confirmation; local actions only update saved state.
export type Action = (ActionBase & { kind: 'remote'; confirm: string; connectionID: string; tool: string; arguments: Record<string, unknown> })
  | (ActionBase & { kind: 'state'; confirm?: string; set: StateUpdate[] });
type Value = { format?: Format; currency?: string };
export type Component =
  | { type: 'section'; title?: string; children: Component[] }
  | ({ type: 'stat'; label: string; step: string; path?: string; caption?: string } & Value)
  | ({ type: 'progress'; label: string; step: string; path?: string; goal: number | string; caption?: string; style: 'bar' | 'ring' } & Value)
  | ({ type: 'list'; source: string; title: string; subtitle?: string; value?: string; limit: number; empty?: string } & Value)
  | ({ type: 'checklist'; state: string; title: string; subtitle?: string; value?: string; done?: string; removable: boolean; empty?: string } & Value)
  | ({ type: 'chart'; source: string; kind: typeof chartKinds[number]; x: string; y: string; title?: string } & Value)
  | { type: 'text'; text: string; style: 'body' | 'caption' | 'headline' }
  | { type: 'toggle'; label: string; state: string }
  | { type: 'choice'; label: string; state: string; options: Option[] }
  | { type: 'input'; label: string; state: string; placeholder?: string }
  | { type: 'timer'; label: string; minutes: number }
  | { type: 'action'; action: string }
  // Layout: a grid of cards, a tappable tile (opens a tab or runs an action) and a text bar pinned to the bottom.
  | { type: 'grid'; columns: 2 | 3; children: Component[] }
  | ({ type: 'tile'; title: string; caption?: string; icon?: typeof symbolIcons[number]; step?: string; path?: string; tab?: string; action?: string } & Value)
  | { type: 'composer'; action: string; placeholder?: string }
  // A Duolingo-style lesson: one question at a time with feedback and hearts. Finishing
  // adds the number of correct answers to `xp` (a number state), if set.
  | { type: 'lesson'; title: string; questions: Question[]; hearts: number; xp?: string };
// A multiple-choice question has options and the index of the correct one; a typed
// question has the accepted answers (compared ignoring case, accents and punctuation).
export type Question = { prompt: string; options?: string[]; answer: number | string; accept?: string[]; explain?: string };
export type Tab = { id: string; title: string; icon: typeof symbolIcons[number]; view: Component[] };
// Tests are scenarios the contact writes with the app; the server runs them before saving it.
export type TestStep = { tap: string; fields: Record<string, unknown> } | { edit: Record<string, unknown> } | { input: Record<string, string> };
export type Expectation = { state: string; equals?: unknown; count?: number; includes?: Item } | { step: string; equals: unknown } | { text: string };
export type Test = { name: string; steps: TestStep[]; expect: Expectation[] };
// An app has either one `view` or 2–5 `tabs` (a native tab bar); `menu` lists field-less actions in the top bar.
export type Spec = { title: string; subtitle?: string; icon: typeof symbolIcons[number]; state: StateVar[]; inputs: Input[]; data: Step[]; view?: Component[]; tabs?: Tab[]; menu: string[]; actions: Action[]; tests: Test[] };
export type ToolUse = { connectionID: string; toolName: string; role: 'read' | 'write' };

export class SpecError extends Error {}
const fail = (message: string): never => { throw new SpecError(message); };
// Ids are internal keys, so letters in any script are fine ("hábito").
const identifier = /^\p{L}[\p{L}\p{N}_]{0,31}$/u;
const maxItems = 200;
function text(value: unknown, name: string, max: number, optional = false, multiline = false): string | undefined {
  if ((value === undefined || value === null) && optional) return undefined;
  if (typeof value !== 'string' || !value.trim() || [...value].length > max || (multiline ? /[\u0000-\u0009\u000b-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value)) return fail(`${name} must be non-empty text of at most ${max} characters.`);
  return value.trim();
}
function path(value: unknown, name: string, optional = false): string | undefined {
  if ((value === undefined || value === null) && optional) return undefined;
  if (typeof value !== 'string' || value.length > 200 || (value !== '' && value.split('.').some(part => !part || part.length > 64 || /[\u0000-\u001f]/.test(part))) || value.split('.').length > 8) return fail(`${name} must be a dot path such as "data.items" (up to 8 segments).`);
  return value;
}
function only(value: Record<string, unknown>, keys: string[], name: string) {
  const extra = Object.keys(value).find(key => !keys.includes(key));
  if (extra) fail(`${name} does not support "${extra}". Allowed: ${keys.join(', ')}.`);
}
function choice<T extends string>(value: unknown, options: readonly T[], name: string, fallback?: T): T {
  if (value === undefined && fallback !== undefined) return fallback;
  return options.includes(value as T) ? value as T : fail(`${name} must be one of ${options.join(', ')}.`);
}
function format(value: Record<string, unknown>, name: string): Value {
  const result: Value = {};
  if (value.format !== undefined) result.format = choice(value.format, formats, `${name}.format`);
  if (value.currency !== undefined) {
    if (typeof value.currency !== 'string' || !/^[A-Z]{3}$/.test(value.currency)) fail(`${name}.currency must be an ISO 4217 code such as USD.`);
    result.currency = value.currency as string;
  }
  if (result.format === 'currency' && !result.currency) fail(`${name} needs currency when format is currency.`);
  return result;
}
function isItem(value: unknown): value is Item {
  return isRecord(value) && Object.keys(value).length <= 10 && Object.entries(value).every(([key, v]) => identifier.test(key)
    && (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.length <= 500)));
}

// Templates are literal JSON plus single-key expressions. Arithmetic is structured
// ({"$mul": [a, b]}), never parsed from text.
type Scope = { inputs: Set<string>; states: Set<string>; fields?: Set<string> };
function template(raw: unknown, name: string, scope: Scope, depth = 0): unknown {
  let value = raw;
  if (depth > 8) return fail(`${name} is nested too deeply.`);
  if (value === null || typeof value === 'boolean' || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) return value;
  if (Array.isArray(value)) return value.length > 50 ? fail(`${name} has too many items.`) : value.map((item, index) => template(item, `${name}[${index}]`, scope, depth + 1));
  if (!isRecord(value)) return fail(`${name} must be JSON.`);
  let keys = Object.keys(value);
  // A frequent model slip: {"$round": {...}, "digits": 2}. Fold the sibling into the expression.
  if (keys.length === 2 && keys.includes('$round') && keys.includes('digits') && isRecord(value.$round)) {
    value = { $round: { digits: value.digits, ...value.$round } }; keys = ['$round'];
  }
  if (keys.some(key => key.startsWith('$'))) {
    if (keys.length !== 1) return fail(`${name}: an expression object must contain only its "$" key.`);
    const [key] = keys, argument = (value as Record<string, unknown>)[key];
    if (key === '$input') return typeof argument === 'string' && scope.inputs.has(argument) ? value : fail(`${name}: $input must name a declared input.`);
    if (key === '$state') return typeof argument === 'string' && scope.states.has(argument) ? value : fail(`${name}: $state must name a declared state value.`);
    if (key === '$field') return scope.fields && typeof argument === 'string' && scope.fields.has(argument) ? value : fail(`${name}: $field is only available in actions and must name one of its fields.`);
    if (key === '$date') {
      if (!isRecord(argument)) return fail(`${name}: $date expects {"days": -7, "format": "date"}.`);
      only(argument, ['days', 'format'], `${name}.$date`);
      if (argument.days !== undefined && (!Number.isInteger(argument.days) || Math.abs(Number(argument.days)) > 366)) fail(`${name}.$date.days must be an integer between -366 and 366.`);
      choice(argument.format, ['date', 'datetime'] as const, `${name}.$date.format`);
      return value;
    }
    if ((arithmetic as readonly string[]).includes(key)) {
      if (!Array.isArray(argument) || argument.length < 2 || argument.length > 8) return fail(`${name}: ${key} expects an array of 2–8 values.`);
      return { [key]: argument.map((item, index) => template(item, `${name}.${key}[${index}]`, scope, depth + 1)) };
    }
    if (key === '$daysSince' || key === '$daysUntil') {
      // Whole days between today (person's time zone) and a YYYY-MM-DD date, which may itself be a template.
      return { [key]: typeof argument === 'string' ? (/^\d{4}-\d{2}-\d{2}$/.test(argument) && Number.isFinite(Date.parse(argument)) ? argument : fail(`${name}: ${key} expects a YYYY-MM-DD date.`))
        : template(argument, `${name}.${key}`, scope, depth + 1) };
    }
    if (key === '$round') {
      if (!isRecord(argument)) return fail(`${name}: $round expects {"value": …, "digits": 2}.`);
      only(argument, ['value', 'digits'], `${name}.$round`);
      if (argument.digits !== undefined && (!Number.isInteger(argument.digits) || Number(argument.digits) < 0 || Number(argument.digits) > 6)) fail(`${name}.$round.digits must be 0–6.`);
      return { $round: { value: template(argument.value, `${name}.$round.value`, scope, depth + 1), digits: Number(argument.digits ?? 0) } };
    }
    return fail(`${name}: unknown expression ${key}. Use $input, $state, $field, $date, $daysSince, $daysUntil, $add, $sub, $mul, $div, $min, $max or $round.`);
  }
  if (keys.length > 50) return fail(`${name} has too many keys.`);
  return Object.fromEntries(keys.map(key => [key, template((value as Record<string, unknown>)[key], `${name}.${key}`, scope, depth + 1)]));
}

export function parseSpec(raw: unknown): { spec: Spec; tools: ToolUse[] } {
  // Models sometimes send the spec as a JSON string; accept it when it parses to an object.
  if (typeof raw === 'string') {
    // Models that stringify long specs often add stray closing brackets at the end, or a
    // stray bare word between tokens ("…} mais]"). Outside strings neither can be data, so
    // trim the brackets and drop the word at the reported position; anything else fails.
    let source = raw.trim(), parsed: unknown = undefined;
    for (let attempt = 0; attempt < 8 && parsed === undefined; attempt++) {
      try { parsed = JSON.parse(source); } catch (error) {
        const at = Number(/position (\d+)/.exec(error instanceof Error ? error.message : '')?.[1] ?? NaN);
        const stray = Number.isInteger(at) ? /^\s*[\p{L}\p{N}_]+\s*(?=[,\]}])/u.exec(source.slice(at)) : null;
        if (stray && /[}\]"\d]\s*$/.test(source.slice(0, at))) source = source.slice(0, at) + source.slice(at + stray[0].length);
        else if (/[}\]]$/.test(source)) source = source.slice(0, -1).trimEnd();
        else break;
      }
    }
    raw = parsed ?? fail('spec must be a JSON object, not text. Send spec as an object and check that brackets balance.');
  }
  if (!isRecord(raw)) fail('spec must be an object.');
  const value = raw as Record<string, unknown>;
  if (JSON.stringify(value).length > 24000) fail('spec must be at most 24 KB.');
  only(value, ['title', 'subtitle', 'icon', 'state', 'inputs', 'data', 'view', 'tabs', 'menu', 'actions', 'tests'], 'spec');
  // State and data steps share one namespace because the view reads both by id.
  const valueIDs = new Set<string>(), inputIDs = new Set<string>(), actionIDs = new Set<string>();
  const unique = (ids: Set<string>, id: unknown, name: string) => {
    if (typeof id !== 'string' || !identifier.test(id)) return fail(`${name}.id must start with a letter and contain only letters, digits or _ (max 32).`);
    if (ids.has(id)) return fail(`Duplicate id "${id}" in ${name.replace(/\[.*$/, '')}.`);
    ids.add(id); return id;
  };
  const list = (field: unknown, name: string, max: number, required = false) => {
    if (field === undefined && !required) return [];
    if (!Array.isArray(field) || (required && !field.length) || field.length > max) return fail(`${name} must be an array of ${required ? '1' : '0'}–${max} items.`);
    return field;
  };
  const options = (field: unknown, name: string, min: number, max: number): Option[] => {
    const parsed = list(field, name, max, true).map((option, at) => {
      if (!isRecord(option)) return fail(`${name}[${at}] must be an object.`);
      only(option, ['value', 'label'], `${name}[${at}]`);
      // Option values are text; numbers such as 15 are accepted as "15".
      const raw = typeof option.value === 'number' || typeof option.value === 'boolean' ? String(option.value) : option.value;
      return { value: text(raw, `${name}[${at}].value`, 60)!, label: text(option.label ?? raw, `${name}[${at}].label`, 24)! };
    });
    if (parsed.length < min || new Set(parsed.map(o => o.value)).size !== parsed.length) fail(`${name} needs ${min}–${max} options with distinct values.`);
    return parsed;
  };
  const state: StateVar[] = list(value.state, 'state', 8).map((item, index) => {
    const name = `state[${index}]`;
    if (!isRecord(item)) return fail(`${name} must be an object.`);
    only(item, ['id', 'type', 'initial'], name);
    const id = unique(valueIDs, item.id, name), type = choice(item.type, ['number', 'text', 'boolean', 'list'] as const, `${name}.type`);
    const initial = item.initial ?? { number: 0, text: '', boolean: false, list: [] }[type];
    if (type === 'list') {
      if (!Array.isArray(initial) || initial.length > maxItems || !initial.every(isItem)) fail(`${name}.initial must be a list of up to ${maxItems} flat objects, e.g. [{"name":"Milk","done":false}].`);
    } else if (type === 'number' ? typeof initial !== 'number' || !Number.isFinite(initial) || Math.abs(initial) > 1e12
      : type === 'text' ? typeof initial !== 'string' || initial.length > 500 : typeof initial !== 'boolean') fail(`${name}.initial must be a ${type}.`);
    return { id, type, initial: initial as StateValue };
  });
  const stateOf = (id: unknown) => state.find(v => v.id === id);
  const stateIDs = new Set(state.map(v => v.id));
  const inputs: Input[] = list(value.inputs, 'inputs', 4).map((item, index) => {
    const name = `inputs[${index}]`;
    if (!isRecord(item)) return fail(`${name} must be an object.`);
    const id = unique(inputIDs, item.id, name), label = text(item.label, `${name}.label`, 40)!;
    if (item.type === 'segmented') {
      only(item, ['id', 'type', 'label', 'options', 'default'], name);
      const parsed = options(item.options, `${name}.options`, 2, 5);
      const fallback = item.default ?? parsed[0].value;
      if (!parsed.some(o => o.value === String(fallback))) fail(`${name}.default must be one of its option values.`);
      return { id, type: 'segmented', label, options: parsed, default: String(fallback) };
    }
    if (item.type === 'text' || item.type === 'number') {
      only(item, ['id', 'type', 'label', 'default'], name);
      const fallback = item.default ?? '';
      if (item.type === 'number' ? fallback !== '' && (typeof fallback !== 'number' && typeof fallback !== 'string' || !Number.isFinite(Number(fallback)))
        : typeof fallback !== 'string' || fallback.length > 200) fail(`${name}.default must be a ${item.type}.`);
      return { id, type: item.type, label, default: String(fallback) };
    }
    return fail(`${name}.type must be segmented, text or number.`);
  });
  const scope: Scope = { inputs: inputIDs, states: stateIDs };
  const tools: ToolUse[] = [];
  const remote = (item: Record<string, unknown>, name: string, role: ToolUse['role']) => {
    const connectionID = typeof item.connectionID === 'string' && item.connectionID.length <= 80 ? item.connectionID : fail(`${name}.connectionID must be the connectionID from list_mcp_tools.`);
    const tool = typeof item.tool === 'string' && item.tool.length <= 128 ? item.tool : fail(`${name}.tool must be the exact toolName.`);
    if (item.arguments !== undefined && !isRecord(item.arguments)) fail(`${name}.arguments must be an object.`);
    const existing = tools.find(t => t.connectionID === connectionID && t.toolName === tool);
    if (existing && existing.role !== role) fail(`${tool} cannot be used both to load data and as an action.`);
    if (!existing) tools.push({ connectionID, toolName: tool, role });
    return { connectionID, tool };
  };
  const stepIDs = new Set<string>();
  // Transforms may read earlier steps and saved state (for example a list of expenses).
  const known = () => [...stateIDs, ...stepIDs].join(', ') || 'none';
  const earlier = (from: unknown, name: string) => typeof from === 'string' && (stepIDs.has(from) || stateIDs.has(from)) ? from : fail(`${name}.from must name an earlier data step or a state value (available: ${known()}).`);
  const data: Step[] = list(value.data, 'data', 12).map((item, index) => {
    const name = `data[${index}]`;
    if (!isRecord(item)) return fail(`${name} must be an object.`);
    const id = unique(valueIDs, item.id, name);
    // Infer an omitted step type from its distinctive keys.
    if (item.type === undefined) item.type = 'tool' in item ? 'mcp' : 'by' in item ? 'group' : 'where' in item ? 'filter' : 'count' in item ? 'limit'
      : 'path' in item ? 'select' : 'op' in item && 'from' in item ? 'aggregate' : 'order' in item ? 'sort' : 'value' in item ? 'const' : undefined;
    let step: Step;
    switch (item.type) {
      case 'mcp': only(item, ['id', 'type', 'connectionID', 'tool', 'arguments'], name);
        step = { id, type: 'mcp', ...remote(item, name, 'read'), arguments: template(item.arguments ?? {}, `${name}.arguments`, scope) as Record<string, unknown> }; break;
      case 'const': only(item, ['id', 'type', 'value'], name);
        step = { id, type: 'const', value: template(item.value ?? null, `${name}.value`, scope) }; break;
      case 'select': only(item, ['id', 'type', 'from', 'path'], name);
        step = { id, type: 'select', from: earlier(item.from, name), path: path(item.path, `${name}.path`)! }; break;
      case 'filter':
        // Accept the single-condition shorthand {field, op, value} next to or instead of `where`.
        if (item.where === undefined && item.field !== undefined) item.where = [{ field: item.field, op: item.op, value: item.value }];
        delete item.field; delete item.op; delete item.value;
        only(item, ['id', 'type', 'from', 'where'], name);
        step = { id, type: 'filter', from: earlier(item.from, name), where: list(item.where, `${name}.where`, 6, true).map((condition, at) => {
          if (!isRecord(condition)) return fail(`${name}.where[${at}] must be an object.`);
          only(condition, ['field', 'op', 'value'], `${name}.where[${at}]`);
          return { field: path(condition.field, `${name}.where[${at}].field`)!, op: choice(condition.op, comparisons, `${name}.where[${at}].op`), value: template(condition.value ?? null, `${name}.where[${at}].value`, scope) };
        }) }; break;
      case 'sort': only(item, ['id', 'type', 'from', 'field', 'order'], name);
        step = { id, type: 'sort', from: earlier(item.from, name), field: path(item.field, `${name}.field`)!, order: choice(item.order, ['asc', 'desc'] as const, `${name}.order`, 'asc') }; break;
      case 'limit': only(item, ['id', 'type', 'from', 'count'], name);
        if (!Number.isInteger(item.count) || Number(item.count) < 1 || Number(item.count) > 500) fail(`${name}.count must be 1–500.`);
        step = { id, type: 'limit', from: earlier(item.from, name), count: Number(item.count) }; break;
      case 'aggregate': only(item, ['id', 'type', 'from', 'op', 'field'], name);
        step = { id, type: 'aggregate', from: earlier(item.from, name), op: choice(item.op, aggregates, `${name}.op`), field: path(item.field, `${name}.field`, true) };
        if (step.op !== 'count' && step.field === undefined) fail(`${name}.field is required unless op is count.`); break;
      case 'group': only(item, ['id', 'type', 'from', 'by', 'op', 'field', 'order'], name);
        step = { id, type: 'group', from: earlier(item.from, name), by: path(item.by, `${name}.by`)!, op: choice(item.op, aggregates, `${name}.op`), field: path(item.field, `${name}.field`, true), order: choice(item.order, ['key', 'value-asc', 'value-desc'] as const, `${name}.order`, 'value-desc') };
        if (step.op !== 'count' && step.field === undefined) fail(`${name}.field is required unless op is count.`); break;
      default: return fail(`${name}.type must be mcp, const, select, filter, sort, limit, aggregate or group. Use const with $add/$mul/… for calculations.`);
    }
    stepIDs.add(id);
    return step;
  });
  if (data.filter(s => s.type === 'mcp').length > 4) fail('Use at most four mcp data steps.');
  const update = (raw: unknown, where: string, actionScope: Scope): StateUpdate => {
    if (!isRecord(raw)) return fail(`${where} must be an object.`);
    // {state, field, value} without op can only mean setting that field on every item.
    if (raw.op === undefined && raw.field !== undefined) raw = { ...raw, op: 'set_items' };
    if (!isRecord(raw)) return fail(`${where} must be an object.`);
    only(raw, ['state', 'op', 'value', 'field'], where);
    const target = stateOf(raw.state) ?? fail(`${where}.state must name a declared state value.`);
    const op = choice(raw.op, stateOps.filter(o => o !== 'toggle_item' && o !== 'remove_item'), `${where}.op`);
    const needs = { increment: 'number', decrement: 'number', toggle: 'boolean', append: 'list', clear: 'list', set_items: 'list', remove_where: 'list' } as Record<string, string>;
    if (needs[op] && target.type !== needs[op]) fail(`${where}: ${op} needs a ${needs[op]} state.`);
    if (op === 'set' && target.type === 'list') fail(`${where}: use append, clear or set_items for lists.`);
    if (['set', 'append', 'pick', 'set_items', 'remove_where'].includes(op) && raw.value === undefined) fail(`${where}.value is required for ${op}.`);
    if (op === 'pick' && (target.type === 'list' || target.type === 'boolean' || !Array.isArray(raw.value) || raw.value.length < 2 || raw.value.length > 50
      || raw.value.some(v => typeof v !== 'string' && typeof v !== 'number'))) fail(`${where}: pick needs a text or number state and a value array of 2–50 options.`);
    const byField = op === 'set_items' || op === 'remove_where';
    if (byField && (typeof raw.field !== 'string' || !identifier.test(raw.field))) fail(`${where}.field must name the item field, e.g. "done".`);
    if (raw.field !== undefined && !byField) fail(`${where}.field is only used with set_items and remove_where.`);
    return { state: target.id, op, ...(raw.value === undefined ? {} : { value: template(raw.value, `${where}.value`, actionScope) }), ...(byField ? { field: raw.field as string } : {}) };
  };
  const actions: Action[] = list(value.actions, 'actions', 16).map((item, index) => {
    const name = `actions[${index}]`;
    if (!isRecord(item)) return fail(`${name} must be an object.`);
    // `kind` is optional on input and always present in stored (normalized) specs.
    const local = item.set !== undefined;
    if (item.kind !== undefined && item.kind !== (local ? 'state' : 'remote')) fail(`${name}.kind must be ${local ? 'state' : 'remote'} for this action.`);
    only(item, local ? ['id', 'kind', 'label', 'confirm', 'style', 'set', 'fields'] : ['id', 'kind', 'label', 'confirm', 'style', 'connectionID', 'tool', 'arguments', 'fields'], name);
    const id = unique(actionIDs, item.id, name);
    const fields: Field[] = list(item.fields, `${name}.fields`, 6).map((field, at) => {
      if (!isRecord(field)) return fail(`${name}.fields[${at}] must be an object.`);
      only(field, ['id', 'label', 'kind', 'required'], `${name}.fields[${at}]`);
      if (typeof field.id !== 'string' || !identifier.test(field.id)) fail(`${name}.fields[${at}].id is invalid.`);
      if (field.required !== undefined && typeof field.required !== 'boolean') fail(`${name}.fields[${at}].required must be a boolean.`);
      return { id: field.id as string, label: text(field.label, `${name}.fields[${at}].label`, 40)!, kind: choice(field.kind, ['text', 'number', 'date', 'toggle'] as const, `${name}.fields[${at}].kind`, 'text'), required: field.required === true };
    });
    if (new Set(fields.map(f => f.id)).size !== fields.length) fail(`${name}.fields ids must be distinct.`);
    const base = { id, label: text(item.label, `${name}.label`, 40)!, style: choice(item.style, ['default', 'destructive'] as const, `${name}.style`, 'default'), fields };
    const actionScope = { ...scope, fields: new Set(fields.map(f => f.id)) };
    if (local) {
      const set = list(item.set, `${name}.set`, 6, true).map((raw, at) => update(raw, `${name}.set[${at}]`, actionScope));
      // An empty confirmation on a local action means none; `true` asks with the button's label.
      const confirm = item.confirm === false || (typeof item.confirm === 'string' && !item.confirm.trim()) ? undefined : item.confirm === true ? `${base.label}?` : item.confirm;
      return { ...base, kind: 'state', confirm: text(confirm, `${name}.confirm`, 200, true), set };
    }
    return { ...base, kind: 'remote', confirm: text(item.confirm === true ? `${base.label}?` : item.confirm, `${name}.confirm`, 200)!,
      ...remote(item, name, 'write'), arguments: template(item.arguments ?? {}, `${name}.arguments`, actionScope) as Record<string, unknown> };
  });
  let nodes = 0;
  const listSource = (field: unknown, name: string) => typeof field === 'string' && (stepIDs.has(field) || stateOf(field)?.type === 'list') ? field : fail(`${name} must name a data step or a list state (available: ${known()}).`);
  const valueSource = (field: unknown, name: string) => typeof field === 'string' && (stepIDs.has(field) || stateIDs.has(field)) ? field : fail(`${name} must name a data step or state value (available: ${known()}). Declare it in data or state first.`);
  const bound = (field: unknown, name: string, types: StateVar['type'][]) => {
    const target = stateOf(field);
    return target && types.includes(target.type) ? target.id : fail(`${name} must name a ${types.join(' or ')} state value.`);
  };
  const declaredAction = (field: unknown, name: string) => typeof field === 'string' && actionIDs.has(field) ? field : fail(`${name} must name a declared action (available: ${[...actionIDs].join(', ') || 'none'}).`);
  // Tab ids are collected first so tiles anywhere can open any tab.
  const tabIDs = new Set<string>();
  if (value.tabs !== undefined && Array.isArray(value.tabs)) for (const [index, tab] of value.tabs.entries()) if (isRecord(tab)) unique(tabIDs, tab.id, `tabs[${index}]`);
  // Models often omit `type` or add stray keys. The type is inferred from distinctive
  // keys and unknown keys are dropped, since the normalized component is rebuilt anyway.
  const infer = (item: Record<string, unknown>) => item.type !== undefined ? item.type
    : 'questions' in item ? 'lesson' : 'columns' in item ? 'grid' : 'children' in item ? 'section' : 'placeholder' in item && 'action' in item ? 'composer' : 'tab' in item || 'icon' in item ? 'tile'
    : 'action' in item ? 'action' : 'minutes' in item ? 'timer' : 'goal' in item ? 'progress'
    : 'step' in item ? 'stat' : 'x' in item || 'y' in item ? 'chart' : 'source' in item ? 'list' : 'options' in item ? 'choice'
    : 'done' in item ? 'checklist' : 'text' in item ? 'text' : undefined;
  const keysByType: Record<string, string[]> = {
    section: ['title', 'children'], stat: ['label', 'step', 'path', 'caption', 'format', 'currency'], progress: ['label', 'step', 'path', 'goal', 'caption', 'style', 'format', 'currency'],
    list: ['source', 'title', 'subtitle', 'value', 'limit', 'empty', 'format', 'currency'], checklist: ['state', 'title', 'subtitle', 'value', 'done', 'removable', 'empty', 'format', 'currency'],
    chart: ['source', 'kind', 'x', 'y', 'title', 'format', 'currency'], text: ['text', 'style'], toggle: ['label', 'state'], choice: ['label', 'state', 'options'],
    input: ['label', 'state', 'placeholder'], timer: ['label', 'minutes'], action: ['action'], grid: ['columns', 'children'],
    tile: ['title', 'caption', 'icon', 'step', 'path', 'tab', 'action', 'format', 'currency'], composer: ['action', 'placeholder'],
    lesson: ['title', 'questions', 'hearts', 'xp'],
  };
  // Cards in a grid are self-contained; lists, forms and bound controls need full-width rows.
  const gridChildren = ['stat', 'progress', 'chart', 'text', 'action', 'tile'];
  type Place = 'top' | 'section' | 'grid';
  const component = (raw: unknown, name: string, place: Place): Component => {
    if (++nodes > 80) return fail('An app supports at most 80 components in total.');
    if (!isRecord(raw)) return fail(`${name} must be an object.`);
    const type = infer(raw);
    const item: Record<string, unknown> = typeof type === 'string' && keysByType[type]
      ? Object.fromEntries(Object.entries(raw).filter(([key]) => key === 'type' || keysByType[type].includes(key)).map(([key, v]) => [key, key === 'type' ? type : v]))
      : raw;
    if (item.type === undefined && typeof type === 'string') item.type = type;
    if (place === 'grid' && !gridChildren.includes(String(item.type))) fail(`${name}: a grid holds only ${gridChildren.join(', ')} cards.`);
    switch (item.type) {
      case 'section': case 'grid': {
        if (place !== 'top') fail(`${name}: sections and grids cannot be nested.`);
        if (item.type === 'section') {
          only(item, ['type', 'title', 'children'], name);
          return { type: 'section', title: text(item.title, `${name}.title`, 60, true), children: list(item.children, `${name}.children`, 20, true).map((child, at) => component(child, `${name}.children[${at}]`, 'section')) };
        }
        only(item, ['type', 'columns', 'children'], name);
        if (item.columns !== undefined && item.columns !== 2 && item.columns !== 3) fail(`${name}.columns must be 2 or 3.`);
        return { type: 'grid', columns: item.columns === 3 ? 3 : 2, children: list(item.children, `${name}.children`, 12, true).map((child, at) => component(child, `${name}.children[${at}]`, 'grid')) };
      }
      case 'stat': only(item, ['type', 'label', 'step', 'path', 'caption', 'format', 'currency'], name);
        return { type: 'stat', label: text(item.label, `${name}.label`, 40)!, step: valueSource(item.step, `${name}.step`), path: path(item.path, `${name}.path`, true), caption: text(item.caption, `${name}.caption`, 80, true), ...format(item, name) };
      case 'progress': only(item, ['type', 'label', 'step', 'path', 'goal', 'caption', 'style', 'format', 'currency'], name);
        // The goal is a positive number, or the id of a number state/step (a goal the person can change).
        if (typeof item.goal === 'string') valueSource(item.goal, `${name}.goal`);
        else if (typeof item.goal !== 'number' || !Number.isFinite(item.goal) || item.goal <= 0 || item.goal > 1e12) fail(`${name}.goal must be a positive number or the id of a number state.`);
        return { type: 'progress', label: text(item.label, `${name}.label`, 40)!, step: valueSource(item.step, `${name}.step`), path: path(item.path, `${name}.path`, true), goal: item.goal as number | string,
          caption: text(item.caption, `${name}.caption`, 80, true), style: choice(item.style, ['bar', 'ring'] as const, `${name}.style`, 'bar'), ...format(item, name) };
      case 'list': only(item, ['type', 'source', 'title', 'subtitle', 'value', 'limit', 'empty', 'format', 'currency'], name);
        if (item.limit !== undefined && (!Number.isInteger(item.limit) || Number(item.limit) < 1 || Number(item.limit) > 100)) fail(`${name}.limit must be 1–100.`);
        return { type: 'list', source: listSource(item.source, `${name}.source`), title: path(item.title, `${name}.title`)!, subtitle: path(item.subtitle, `${name}.subtitle`, true), value: path(item.value, `${name}.value`, true), limit: Number(item.limit ?? 20), empty: text(item.empty, `${name}.empty`, 80, true), ...format(item, name) };
      case 'checklist': only(item, ['type', 'state', 'title', 'subtitle', 'value', 'done', 'removable', 'empty', 'format', 'currency'], name);
        if (item.removable !== undefined && typeof item.removable !== 'boolean') fail(`${name}.removable must be a boolean.`);
      {
        const list = bound(item.state, `${name}.state`, ['list']);
        // Without an explicit `done`, use the first boolean field of the list's items.
        const samples = [...(stateOf(list)!.initial as Item[]), ...actions.flatMap(a => a.kind === 'state' ? a.set.filter(u => u.state === list && u.op === 'append').map(u => u.value) : [])];
        const done = path(item.done, `${name}.done`, true) ?? samples.flatMap(v => isRecord(v) ? Object.keys(v).filter(k => typeof v[k] === 'boolean') : [])[0];
        return { type: 'checklist', state: list, title: path(item.title, `${name}.title`)!, subtitle: path(item.subtitle === '' ? undefined : item.subtitle, `${name}.subtitle`, true), value: path(item.value, `${name}.value`, true),
          done, removable: item.removable !== false, empty: text(item.empty, `${name}.empty`, 80, true), ...format(item, name) };
      }
      case 'chart': only(item, ['type', 'source', 'kind', 'x', 'y', 'title', 'format', 'currency'], name);
        return { type: 'chart', source: listSource(item.source, `${name}.source`), kind: choice(item.kind, chartKinds, `${name}.kind`, 'bar'), x: path(item.x, `${name}.x`)!, y: path(item.y, `${name}.y`)!, title: text(item.title, `${name}.title`, 60, true), ...format(item, name) };
      case 'text': only(item, ['type', 'text', 'style'], name);
        return { type: 'text', text: text(item.text, `${name}.text`, 500, false, true)!, style: choice(item.style, ['body', 'caption', 'headline'] as const, `${name}.style`, 'body') };
      case 'toggle': only(item, ['type', 'label', 'state'], name);
        return { type: 'toggle', label: text(item.label, `${name}.label`, 60)!, state: bound(item.state, `${name}.state`, ['boolean']) };
      case 'choice': only(item, ['type', 'label', 'state', 'options'], name);
        return { type: 'choice', label: text(item.label, `${name}.label`, 60)!, state: bound(item.state, `${name}.state`, ['text']), options: options(item.options, `${name}.options`, 2, 6) };
      case 'input': only(item, ['type', 'label', 'state', 'placeholder'], name);
        return { type: 'input', label: text(item.label, `${name}.label`, 60)!, state: bound(item.state, `${name}.state`, ['text', 'number']), placeholder: text(item.placeholder, `${name}.placeholder`, 60, true) };
      case 'timer': only(item, ['type', 'label', 'minutes'], name);
        if (typeof item.minutes !== 'number' || !Number.isFinite(item.minutes) || item.minutes <= 0 || item.minutes > 240) fail(`${name}.minutes must be between 0 and 240.`);
        return { type: 'timer', label: text(item.label, `${name}.label`, 40)!, minutes: Number(item.minutes) };
      case 'action': only(item, ['type', 'action'], name);
        if (place === 'grid' && actions.find(a => a.id === item.action)?.fields.length) fail(`${name}: an action with fields cannot be a grid card.`);
        return { type: 'action', action: declaredAction(item.action, `${name}.action`) };
      case 'tile': {
        only(item, ['type', 'title', 'caption', 'icon', 'step', 'path', 'tab', 'action', 'format', 'currency'], name);
        if (item.tab !== undefined && item.action !== undefined) fail(`${name}: a tile opens a tab or runs an action, not both.`);
        if (item.tab !== undefined && (typeof item.tab !== 'string' || !tabIDs.has(item.tab))) fail(`${name}.tab must name a declared tab (available: ${[...tabIDs].join(', ') || 'none'}).`);
        const action = item.action === undefined ? undefined : declaredAction(item.action, `${name}.action`);
        if (action && actions.find(a => a.id === action)!.fields.length) fail(`${name}.action must be an action without fields.`);
        return { type: 'tile', title: text(item.title, `${name}.title`, 40)!, caption: text(item.caption, `${name}.caption`, 80, true), icon: item.icon === undefined ? undefined : choice(item.icon, symbolIcons, `${name}.icon`),
          step: item.step === undefined ? undefined : valueSource(item.step, `${name}.step`), path: path(item.path, `${name}.path`, true), tab: item.tab as string | undefined, action, ...format(item, name) };
      }
      case 'composer': {
        only(item, ['type', 'action', 'placeholder'], name);
        if (place !== 'top') fail(`${name}: a composer must be at the top level of a view or tab.`);
        const action = actions.find(a => a.id === declaredAction(item.action, `${name}.action`))!;
        if (action.fields.length !== 1 || !['text', 'number'].includes(action.fields[0].kind)) fail(`${name}: the composer's action must have exactly one text or number field, e.g. fields:[{"id":"item","label":"Item","kind":"text","required":true}].`);
        return { type: 'composer', action: action.id, placeholder: text(item.placeholder, `${name}.placeholder`, 60, true) };
      }
      case 'lesson': {
        only(item, ['type', 'title', 'questions', 'hearts', 'xp'], name);
        if (place === 'grid') fail(`${name}: a lesson cannot be a grid card.`);
        if (item.hearts !== undefined && (!Number.isInteger(item.hearts) || Number(item.hearts) < 1 || Number(item.hearts) > 5)) fail(`${name}.hearts must be 1–5.`);
        const questions = list(item.questions, `${name}.questions`, 20, true).map((raw, at): Question => {
          const where = `${name}.questions[${at}]`;
          if (!isRecord(raw)) return fail(`${where} must be an object.`);
          only(raw, ['prompt', 'options', 'answer', 'accept', 'explain'], where);
          const prompt = text(raw.prompt, `${where}.prompt`, 200, false, true)!, explain = text(raw.explain, `${where}.explain`, 200, true);
          if (raw.options !== undefined) {
            if (!Array.isArray(raw.options) || raw.options.length < 2 || raw.options.length > 4) fail(`${where}.options needs 2–4 choices.`);
            const options = (raw.options as unknown[]).map((o, i) => text(typeof o === 'number' ? String(o) : o, `${where}.options[${i}]`, 80)!);
            if (new Set(options.map(o => o.toLowerCase())).size !== options.length) fail(`${where}.options must be distinct.`);
            // The correct option may be given by index or by its text.
            const answer = typeof raw.answer === 'string' ? options.findIndex(o => o.toLowerCase() === String(raw.answer).trim().toLowerCase()) : raw.answer;
            if (!Number.isInteger(answer) || Number(answer) < 0 || Number(answer) >= options.length) fail(`${where}.answer must be the index (0-based) or text of the correct option.`);
            return { prompt, options, answer: Number(answer), ...(explain ? { explain } : {}) };
          }
          const answer = text(typeof raw.answer === 'number' ? String(raw.answer) : raw.answer, `${where}.answer`, 80)!;
          if (raw.accept !== undefined && (!Array.isArray(raw.accept) || raw.accept.length > 5)) fail(`${where}.accept must list up to 5 other accepted answers.`);
          const accept = (raw.accept as unknown[] | undefined)?.map((a, i) => text(a, `${where}.accept[${i}]`, 80)!);
          return { prompt, answer, ...(accept?.length ? { accept } : {}), ...(explain ? { explain } : {}) };
        });
        return { type: 'lesson', title: text(item.title, `${name}.title`, 60)!, questions, hearts: Number(item.hearts ?? 3),
          ...(item.xp === undefined ? {} : { xp: bound(item.xp, `${name}.xp`, ['number']) }) };
      }
      default: return fail(`${name}.type must be section, grid, stat, progress, list, checklist, chart, text, toggle, choice, input, timer, action, tile, composer or lesson.`);
    }
  };
  const viewOf = (raw: unknown, name: string) => {
    const parsed = list(raw, name, 20, true).map((item, index) => component(item, `${name}[${index}]`, 'top'));
    if (parsed.filter(c => c.type === 'composer').length > 1) fail(`${name} supports one composer.`);
    return parsed;
  };
  if ((value.view === undefined) === (value.tabs === undefined)) fail('spec needs either view (one screen) or tabs (2–5 screens with a tab bar), not both.');
  const tabs: Tab[] | undefined = value.tabs === undefined ? undefined : list(value.tabs, 'tabs', 5, true).map((tab, index) => {
    const name = `tabs[${index}]`;
    if (!isRecord(tab)) return fail(`${name} must be an object.`);
    only(tab, ['id', 'title', 'icon', 'view'], name);
    return { id: tab.id as string, title: text(tab.title, `${name}.title`, 20)!, icon: choice(tab.icon, symbolIcons, `${name}.icon`, 'list'), view: viewOf(tab.view, `${name}.view`) };
  });
  if (tabs && tabs.length < 2) fail('tabs needs 2–5 tabs; use view for a single screen.');
  const view = tabs ? undefined : viewOf(value.view, 'view');
  const menu = list(value.menu, 'menu', 6).map((id, index) => {
    const action = actions.find(a => a.id === declaredAction(id, `menu[${index}]`))!;
    if (action.fields.length) fail(`menu[${index}]: menu actions cannot have fields; use a button or composer for ${action.id}.`);
    return action.id;
  });
  if (new Set(menu).size !== menu.length) fail('menu lists an action twice.');
  const literal = (raw: unknown, name: string): unknown => {
    if (raw === null || typeof raw === 'boolean' || typeof raw === 'string' || (typeof raw === 'number' && Number.isFinite(raw))) return raw;
    if (Array.isArray(raw) && raw.length <= 50) return raw.map((item, at) => literal(item, `${name}[${at}]`));
    if (isRecord(raw) && Object.keys(raw).length <= 20 && !Object.keys(raw).some(key => key.startsWith('$'))) return Object.fromEntries(Object.entries(raw).map(([key, v]) => [key, literal(v, `${name}.${key}`)]));
    return fail(`${name} must be a plain JSON value.`);
  };
  const tests: Test[] = list(value.tests, 'tests', 8).map((raw, index) => {
    const name = `tests[${index}]`;
    if (!isRecord(raw)) return fail(`${name} must be an object.`);
    only(raw, ['name', 'steps', 'expect'], name);
    const steps = list(raw.steps, `${name}.steps`, 12).map((step, at): TestStep => {
      const where = `${name}.steps[${at}]`;
      if (!isRecord(step)) return fail(`${where} must be an object.`);
      if ('tap' in step) {
        only(step, ['tap', 'fields'], where);
        const action = actions.find(a => a.id === declaredAction(step.tap, `${where}.tap`))!;
        if (action.kind === 'remote') fail(`${where}: ${action.id} calls an external tool, which tests cannot run; test only local behavior.`);
        const fields = step.fields === undefined ? {} : isRecord(step.fields) ? step.fields : fail(`${where}.fields must be an object of field values.`);
        const unknown = Object.keys(fields).find(key => !action.fields.some(f => f.id === key));
        if (unknown) fail(`${where}.fields.${unknown} is not a field of ${action.id}.`);
        return { tap: action.id, fields: literal(fields, `${where}.fields`) as Record<string, unknown> };
      }
      if ('edit' in step) {
        only(step, ['edit'], where);
        if (!isRecord(step.edit)) fail(`${where}.edit must be {state, op, value?, index?}, as a bound component sends it.`);
        return { edit: literal(step.edit, `${where}.edit`) as Record<string, unknown> };
      }
      if ('input' in step) {
        only(step, ['input'], where);
        if (!isRecord(step.input) || Object.entries(step.input).some(([key, v]) => !inputIDs.has(key) || (typeof v !== 'string' && typeof v !== 'number'))) fail(`${where}.input must map declared input ids to values.`);
        return { input: Object.fromEntries(Object.entries(step.input as Record<string, unknown>).map(([key, v]) => [key, String(v)])) };
      }
      return fail(`${where} must be {tap, fields?}, {edit} or {input}.`);
    });
    const expect = list(raw.expect, `${name}.expect`, 8, true).map((check, at): Expectation => {
      const where = `${name}.expect[${at}]`;
      if (!isRecord(check)) return fail(`${where} must be an object.`);
      if ('text' in check) { only(check, ['text'], where); return { text: text(check.text, `${where}.text`, 120)! }; }
      if ('step' in check) {
        only(check, ['step', 'equals'], where);
        if (typeof check.step !== 'string' || !stepIDs.has(check.step)) fail(`${where}.step must name a data step.`);
        return { step: check.step as string, equals: literal(check.equals ?? null, `${where}.equals`) };
      }
      only(check, ['state', 'equals', 'count', 'includes'], where);
      const target = stateOf(check.state) ?? fail(`${where} needs state (a state id), step (a data step id) or text.`);
      if (check.count !== undefined && (target.type !== 'list' || !Number.isInteger(check.count) || Number(check.count) < 0)) fail(`${where}.count needs a list state and a whole number.`);
      if (check.includes !== undefined && (target.type !== 'list' || !isItem(check.includes))) fail(`${where}.includes needs a list state and a flat object such as {"name":"Milk"}.`);
      if (check.equals === undefined && check.count === undefined && check.includes === undefined) fail(`${where} needs equals, count or includes.`);
      return { state: target.id, ...(check.equals !== undefined ? { equals: literal(check.equals, `${where}.equals`) } : {}),
        ...(check.count !== undefined ? { count: Number(check.count) } : {}), ...(check.includes !== undefined ? { includes: check.includes as Item } : {}) };
    });
    return { name: text(raw.name, `${name}.name`, 80)!, steps, expect };
  });
  return { spec: { title: text(value.title, 'title', 60)!, subtitle: text(value.subtitle, 'subtitle', 120, true), icon: choice(value.icon, symbolIcons, 'icon', 'chart'), state, inputs, data, ...(tabs ? { tabs } : { view }), menu, actions, tests }, tools };
}

// Every component of the app, in tabs, sections and grids.
export function allComponents(spec: Spec): Component[] {
  const walk = (items: Component[]): Component[] => items.flatMap(c => c.type === 'section' || c.type === 'grid' ? [c, ...walk(c.children)] : [c]);
  return spec.tabs ? spec.tabs.flatMap(tab => walk(tab.view)) : walk(spec.view ?? []);
}

// Runtime evaluation ---------------------------------------------------------

export type Context = { inputs: Record<string, string>; state: Record<string, unknown>; fields?: Record<string, unknown>; timeZone: string; now: number };
function localDate(timestamp: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(timestamp));
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
const finite = (value: number) => Number.isFinite(value) && Math.abs(value) <= 1e15 ? value : null;
export function evaluate(value: unknown, context: Context): unknown {
  if (Array.isArray(value)) return value.map(item => evaluate(item, context));
  if (!isRecord(value)) return value;
  if ('$input' in value) return context.inputs[String(value.$input)] ?? null;
  if ('$state' in value) return context.state[String(value.$state)] ?? null;
  if ('$field' in value) return context.fields?.[String(value.$field)] ?? null;
  if ('$date' in value && isRecord(value.$date)) {
    const timestamp = context.now + Number(value.$date.days ?? 0) * 86_400_000;
    return value.$date.format === 'date' ? localDate(timestamp, context.timeZone) : new Date(timestamp).toISOString();
  }
  const operator = arithmetic.find(key => key in value);
  if (operator) {
    // Missing or non-numeric operands make the whole result empty instead of guessing.
    const values = (value[operator] as unknown[]).map(item => numeric(evaluate(item, context)));
    if (values.some(v => v === null)) return null;
    const numbers = values as number[];
    if (operator === '$add') return finite(numbers.reduce((a, b) => a + b));
    if (operator === '$sub') return finite(numbers.reduce((a, b) => a - b));
    if (operator === '$mul') return finite(numbers.reduce((a, b) => a * b));
    if (operator === '$div') return numbers.slice(1).some(n => n === 0) ? null : finite(numbers.reduce((a, b) => a / b));
    return operator === '$min' ? Math.min(...numbers) : Math.max(...numbers);
  }
  if ('$daysSince' in value || '$daysUntil' in value) {
    const target = evaluate('$daysSince' in value ? value.$daysSince : value.$daysUntil, context);
    if (typeof target !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(target)) return null;
    const days = Math.round((Date.parse(localDate(context.now, context.timeZone)) - Date.parse(target.slice(0, 10))) / 86_400_000);
    return Number.isFinite(days) ? ('$daysSince' in value ? days : -days) : null;
  }
  if ('$round' in value && isRecord(value.$round)) {
    const number = numeric(evaluate(value.$round.value, context));
    const factor = 10 ** Number(value.$round.digits ?? 0);
    return number === null ? null : Math.round(number * factor) / factor;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, evaluate(item, context)]));
}
export function read(value: unknown, at: string | undefined): unknown {
  if (!at) return value;
  let current = value;
  for (const part of at.split('.')) {
    if (Array.isArray(current) && /^\d+$/.test(part)) current = current[Number(part)];
    else if (isRecord(current) && Object.hasOwn(current, part)) current = current[part];
    else return undefined;
  }
  return current;
}
export const numeric = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value
  : typeof value === 'string' && value.trim() && Number.isFinite(Number(value)) ? Number(value) : null;
function compare(left: unknown, op: Condition['op'], right: unknown): boolean {
  if (op === 'after' || op === 'before') {
    const a = typeof left === 'string' ? Date.parse(left) : NaN, b = typeof right === 'string' ? Date.parse(right) : NaN;
    return Number.isFinite(a) && Number.isFinite(b) && (op === 'after' ? a >= b : a < b);
  }
  if (op === 'contains') return Array.isArray(left) ? left.some(item => item === right)
    : typeof left === 'string' && typeof right === 'string' && left.toLowerCase().includes(right.toLowerCase());
  const a = numeric(left), b = numeric(right);
  const order = a !== null && b !== null ? a - b : String(left ?? '').localeCompare(String(right ?? ''));
  return { eq: order === 0, neq: order !== 0, gt: order > 0, gte: order >= 0, lt: order < 0, lte: order <= 0 }[op];
}
function aggregate(items: unknown[], op: Aggregate, field?: string): number | null {
  if (op === 'count') return items.length;
  const values = items.map(item => numeric(read(item, field))).filter((n): n is number => n !== null);
  if (!values.length) return op === 'sum' ? 0 : null;
  if (op === 'sum') return values.reduce((a, b) => a + b, 0);
  if (op === 'avg') return values.reduce((a, b) => a + b, 0) / values.length;
  return op === 'min' ? Math.min(...values) : Math.max(...values);
}
export function label(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return [...value].slice(0, 200).join('');
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return [...JSON.stringify(value)].slice(0, 200).join('');
}

export class StepError extends Error {}
export function transform(step: Exclude<Step, { type: 'mcp' }>, outputs: Map<string, unknown>, context: Context): unknown {
  if (step.type === 'const') return evaluate(step.value, context);
  const input = outputs.get(step.from);
  if (step.type === 'select') {
    const selected = read(input, step.path);
    if (selected === undefined) throw new StepError('PATH_NOT_FOUND');
    return selected;
  }
  if (!Array.isArray(input)) throw new StepError('NOT_A_LIST');
  if (input.length > 5000) throw new StepError('TOO_MANY_ITEMS');
  switch (step.type) {
    case 'filter': {
      const where = step.where.map(c => ({ ...c, value: evaluate(c.value, context) }));
      return input.filter(item => where.every(c => compare(read(item, c.field), c.op, c.value)));
    }
    case 'sort': return [...input].sort((a, b) => {
      const x = read(a, step.field), y = read(b, step.field), nx = numeric(x), ny = numeric(y);
      const order = nx !== null && ny !== null ? nx - ny : label(x).localeCompare(label(y));
      return step.order === 'desc' ? -order : order;
    });
    case 'limit': return input.slice(0, step.count);
    case 'aggregate': return aggregate(input, step.op, step.field);
    case 'group': {
      const groups = new Map<string, unknown[]>();
      for (const item of input) {
        const key = label(read(item, step.by));
        if (!groups.has(key) && groups.size >= 100) throw new StepError('TOO_MANY_GROUPS');
        groups.set(key, [...(groups.get(key) ?? []), item]);
      }
      const rows = [...groups].map(([key, items]) => ({ key, value: aggregate(items, step.op, step.field), count: items.length }));
      return rows.sort((a, b) => step.order === 'key' ? a.key.localeCompare(b.key) : (step.order === 'value-asc' ? 1 : -1) * ((a.value ?? 0) - (b.value ?? 0)));
    }
  }
}

// Text blocks come first because that is the shape the contact saw when designing.
export function toolData(result: Record<string, unknown>): unknown {
  if (result.isError === true) throw new StepError('TOOL_ERROR');
  const textBlocks = Array.isArray(result.content) ? result.content.filter(v => isRecord(v) && v.type === 'text' && typeof v.text === 'string').map(v => (v as { text: string }).text) : [];
  if (textBlocks.length) try { return JSON.parse(textBlocks.join('')); } catch { /* fall through to structured content */ }
  if (isRecord(result.structuredContent)) return result.structuredContent;
  throw new StepError('RESULT_NOT_JSON');
}

type Row = { title: string; subtitle: string | null; value: number | string | null };
export type ResolvedComponent =
  | { type: 'section'; title: string | null; children: ResolvedComponent[] }
  | { type: 'stat'; label: string; value: number | string | null; format: Format; currency: string | null; caption: string | null; state: string | null }
  | { type: 'progress'; label: string; value: number | null; goal: number; format: Format; currency: string | null; caption: string | null; state: string | null; style: 'bar' | 'ring' }
  | { type: 'list'; items: Row[]; format: Format; currency: string | null; empty: string }
  // Checklist paths let clients re-derive rows from saved state for instant taps.
  | { type: 'checklist'; state: string; title: string; subtitle: string | null; value: string | null; done: string | null; removable: boolean; items: (Row & { done: boolean | null })[]; format: Format; currency: string | null; empty: string }
  | { type: 'chart'; kind: typeof chartKinds[number]; title: string | null; points: { x: string; y: number }[]; format: Format; currency: string | null }
  | { type: 'text'; text: string; style: 'body' | 'caption' | 'headline' }
  | { type: 'toggle'; label: string; state: string; value: boolean }
  | { type: 'choice'; label: string; state: string; value: string; options: Option[] }
  | { type: 'input'; label: string; state: string; value: string | number; kind: 'text' | 'number'; placeholder: string | null }
  | { type: 'timer'; label: string; seconds: number }
  | ResolvedAction
  | { type: 'grid'; columns: 2 | 3; children: ResolvedComponent[] }
  | { type: 'tile'; title: string; caption: string | null; icon: string | null; value: number | string | null; format: Format; currency: string | null; state: string | null; tab: string | null; action: ResolvedAction | null }
  // `append` lets clients show a submitted row at once: `item` plus the typed text under `key`.
  | { type: 'composer'; action: string; field: string; kind: 'text' | 'number'; placeholder: string | null; label: string; confirm: string | null; remote: boolean; append: { state: string; key: string; item: Item } | null }
  // Answers travel with the questions: the lesson is checked on the device for instant feedback.
  | { type: 'lesson'; title: string; hearts: number; xp: string | null; questions: { prompt: string; options: string[] | null; correct: number | null; answers: string[] | null; explain: string | null }[] }
  | { type: 'notice'; code: string };
export type ResolvedAction = { type: 'action'; id: string; kind: 'remote' | 'state'; label: string; confirm: string | null; style: 'default' | 'destructive'; fields: Field[]; updates: StateUpdate[] | null };
export type ResolvedTab = { id: string; title: string; icon: string; view: ResolvedComponent[] };

// Literal-only updates let clients show a tap instantly before the server confirms it.
export function resolvedAction(spec: Spec, id: string): ResolvedAction {
  const action = spec.actions.find(a => a.id === id)!;
  const literal = (value: unknown) => value === undefined || value === null || ['number', 'string', 'boolean'].includes(typeof value);
  const updates = action.kind === 'state' && !action.fields.length && action.set.every(u => literal(u.value)) ? action.set : null;
  return { type: 'action', id: action.id, kind: action.kind, label: action.label, confirm: action.confirm ?? null, style: action.style, fields: action.fields, updates };
}
function composerAppend(action: Action): { state: string; key: string; item: Item } | null {
  if (action.kind !== 'state' || action.confirm || action.set.length !== 1 || action.set[0].op !== 'append' || !isRecord(action.set[0].value)) return null;
  const item: Item = {}, field = action.fields[0].id;
  let key: string | null = null;
  for (const [name, value] of Object.entries(action.set[0].value)) {
    if (isRecord(value) && value.$field === field && Object.keys(value).length === 1 && key === null) key = name;
    else if (typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) item[name] = value;
    else return null;
  }
  return key ? { state: action.set[0].state, key, item } : null;
}

export function present(view: Component[], spec: Spec, outputs: Map<string, unknown>, errors: Map<string, string>): ResolvedComponent[] {
  const scalar = (value: unknown) => numeric(value) ?? (value === null || value === undefined ? null : label(value));
  // Missing subtitles/values are omitted rather than shown as a dash.
  const optional = (item: unknown, at?: string) => { const v = at ? read(item, at) : undefined; return v === undefined || v === null || v === '' ? null : v; };
  const row = (item: unknown, c: { title: string; subtitle?: string; value?: string }): Row => {
    const subtitle = optional(item, c.subtitle), value = optional(item, c.value);
    return { title: label(read(item, c.title)), subtitle: subtitle === null ? null : label(subtitle), value: value === null ? null : scalar(value) };
  };
  return view.map((component): ResolvedComponent => {
    switch (component.type) {
      case 'section': return { type: 'section', title: component.title ?? null, children: present(component.children, spec, outputs, errors) };
      case 'grid': return { type: 'grid', columns: component.columns, children: present(component.children, spec, outputs, errors) };
      case 'lesson': return { type: 'lesson', title: component.title, hearts: component.hearts, xp: component.xp ?? null, questions: component.questions.map(q => ({
        prompt: q.prompt, options: q.options ?? null, correct: q.options ? Number(q.answer) : null, answers: q.options ? null : [String(q.answer), ...(q.accept ?? [])], explain: q.explain ?? null })) };
      case 'composer': {
        const action = spec.actions.find(a => a.id === component.action)!, field = action.fields[0];
        return { type: 'composer', action: action.id, field: field.id, kind: field.kind === 'number' ? 'number' : 'text', placeholder: component.placeholder ?? field.label, label: action.label,
          confirm: action.confirm ?? null, remote: action.kind === 'remote', append: composerAppend(action) };
      }
      case 'tile': {
        if (component.step && errors.has(component.step)) return { type: 'notice', code: errors.get(component.step)! };
        const value = component.step ? read(outputs.get(component.step), component.path) : undefined;
        const state = component.step && !component.path && spec.state.some(v => v.id === component.step) ? component.step : null;
        return { type: 'tile', title: component.title, caption: component.caption ?? null, icon: component.icon ?? null, value: value === undefined ? null : scalar(value),
          format: component.format ?? (typeof value === 'number' ? 'number' : 'text'), currency: component.currency ?? null, state, tab: component.tab ?? null,
          action: component.action ? resolvedAction(spec, component.action) : null };
      }
      case 'text': return component;
      case 'timer': return { type: 'timer', label: component.label, seconds: Math.round(component.minutes * 60) };
      case 'toggle': return { type: 'toggle', label: component.label, state: component.state, value: outputs.get(component.state) === true };
      case 'choice': return { type: 'choice', label: component.label, state: component.state, value: String(outputs.get(component.state) ?? ''), options: component.options };
      case 'input': {
        const value = outputs.get(component.state);
        return { type: 'input', label: component.label, state: component.state, value: typeof value === 'number' ? value : String(value ?? ''), kind: typeof value === 'number' ? 'number' : 'text', placeholder: component.placeholder ?? null };
      }
      case 'action': return resolvedAction(spec, component.action);
      case 'stat': case 'progress': {
        if (errors.has(component.step)) return { type: 'notice', code: errors.get(component.step)! };
        const value = read(outputs.get(component.step), component.path);
        const state = !component.path && spec.state.some(v => v.id === component.step) ? component.step : null;
        if (component.type === 'progress') {
          const goal = typeof component.goal === 'number' ? component.goal : numeric(outputs.get(component.goal));
          return { type: 'progress', label: component.label, value: numeric(value), goal: goal !== null && goal > 0 ? goal : 1, format: component.format ?? 'number', currency: component.currency ?? null, caption: component.caption ?? null, state, style: component.style };
        }
        return { type: 'stat', label: component.label, value: scalar(value), format: component.format ?? (typeof value === 'number' ? 'number' : 'text'), currency: component.currency ?? null, caption: component.caption ?? null, state };
      }
      case 'checklist': {
        const items = outputs.get(component.state);
        return { type: 'checklist', state: component.state, title: component.title, subtitle: component.subtitle ?? null, value: component.value ?? null, done: component.done ?? null, removable: component.removable,
          items: (Array.isArray(items) ? items : []).slice(0, maxItems).map(item => ({ ...row(item, component), done: component.done ? read(item, component.done) === true : null })),
          format: component.format ?? 'text', currency: component.currency ?? null, empty: component.empty ?? 'Nothing here yet.' };
      }
      case 'list': case 'chart': {
        if (errors.has(component.source)) return { type: 'notice', code: errors.get(component.source)! };
        const rows = outputs.get(component.source);
        if (!Array.isArray(rows)) return { type: 'notice', code: 'NOT_A_LIST' };
        if (component.type === 'list') return { type: 'list', items: rows.slice(0, component.limit).map(item => row(item, component)), format: component.format ?? 'text', currency: component.currency ?? null, empty: component.empty ?? 'Nothing to show.' };
        // Pie slices beyond a dozen are unreadable; bars and lines keep up to 60 points.
        const points = rows.slice(0, component.kind === 'pie' ? 12 : 60).flatMap(item => { const y = numeric(read(item, component.y)); return y === null ? [] : [{ x: [...label(read(item, component.x))].slice(0, 40).join(''), y }]; });
        return { type: 'chart', kind: component.kind, title: component.title ?? null, points, format: component.format ?? 'number', currency: component.currency ?? null };
      }
    }
  });
}

// Saved values keep their declared type across revisions; anything else resets to initial.
export function normalizeState(spec: Spec, stored: unknown): Record<string, StateValue> {
  const values: Record<string, StateValue> = {};
  for (const variable of spec.state) {
    const value = isRecord(stored) ? stored[variable.id] : undefined;
    const valid = variable.type === 'list' ? Array.isArray(value) && value.length <= maxItems && value.every(isItem)
      : typeof value === typeof variable.initial && (typeof value !== 'number' || Number.isFinite(value));
    values[variable.id] = valid ? value as StateValue : variable.initial;
  }
  return values;
}
// Direct edits come from components bound to state; each binding allows only its own operation.
export function directUpdate(spec: Spec, raw: unknown): StateUpdate | null {
  if (!isRecord(raw) || Object.keys(raw).some(key => !['state', 'op', 'value', 'index', 'field'].includes(key))) return null;
  for (const c of allComponents(spec)) {
    if (c.type === 'toggle' && c.state === raw.state && raw.op === 'toggle') return { state: c.state, op: 'toggle' };
    if (c.type === 'choice' && c.state === raw.state && raw.op === 'set' && c.options.some(o => o.value === raw.value)) return { state: c.state, op: 'set', value: raw.value };
    if (c.type === 'input' && c.state === raw.state && raw.op === 'set' && (typeof raw.value === 'string' || typeof raw.value === 'number')) return { state: c.state, op: 'set', value: raw.value };
    // Finishing a lesson adds its correct answers, at most one per question.
    if (c.type === 'lesson' && c.xp === raw.state && raw.op === 'increment' && Number.isInteger(raw.value) && Number(raw.value) >= 0 && Number(raw.value) <= c.questions.length) return { state: c.xp!, op: 'increment', value: raw.value };
    if (c.type === 'checklist' && c.state === raw.state && Number.isInteger(raw.index) && Number(raw.index) >= 0) {
      if (raw.op === 'toggle_item' && c.done) return { state: c.state, op: 'toggle_item', index: Number(raw.index), field: c.done };
      if (raw.op === 'remove_item' && c.removable) return { state: c.state, op: 'remove_item', index: Number(raw.index) };
    }
  }
  return null;
}
export function applyUpdates(spec: Spec, updates: StateUpdate[], current: Record<string, StateValue>, context: Context): Record<string, StateValue> | null {
  const next = { ...current };
  for (const update of updates) {
    const variable = spec.state.find(v => v.id === update.state)!;
    const value = update.value === undefined ? undefined : evaluate(update.value, { ...context, state: next });
    const items = Array.isArray(next[variable.id]) ? next[variable.id] as Item[] : [];
    switch (update.op) {
      case 'toggle': next[variable.id] = !next[variable.id]; break;
      case 'clear': next[variable.id] = []; break;
      case 'pick': {
        // Server-side choice: clients wait for the result instead of guessing it.
        const options = Array.isArray(value) ? value.filter(v => typeof v === 'string' || typeof v === 'number') : [];
        if (!options.length) return null;
        const picked = options[Math.floor(Math.random() * options.length)];
        next[variable.id] = variable.type === 'number' ? (numeric(picked) ?? 0) : label(picked);
        break;
      }
      case 'set_items': {
        if (value !== null && typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return null;
        next[variable.id] = items.map(item => value === null ? Object.fromEntries(Object.entries(item).filter(([key]) => key !== update.field)) : { ...item, [update.field!]: value });
        break;
      }
      case 'append': {
        // Scalars become {"value": …}; objects keep only flat scalar fields.
        const item = isRecord(value) ? Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null && v !== undefined && v !== '')) : value === null || value === undefined || value === '' ? null : { value };
        if (!item || !isItem(item) || !Object.keys(item).length || items.length >= maxItems) return null;
        next[variable.id] = [...items, item as Item];
        break;
      }
      case 'remove_where': {
        // Removes the items whose field equals the value, e.g. completed tasks.
        next[variable.id] = items.filter(item => item[update.field!] !== value);
        break;
      }
      case 'toggle_item': case 'remove_item': {
        if (update.index === undefined || update.index >= items.length) return null;
        next[variable.id] = update.op === 'remove_item' ? items.filter((_, index) => index !== update.index)
          : items.map((item, index) => index === update.index ? { ...item, [update.field!]: item[update.field!] !== true } : item);
        break;
      }
      case 'set': {
        const coerced = variable.type === 'number' ? numeric(value) : variable.type === 'boolean' ? (typeof value === 'boolean' ? value : null) : (value === null || value === undefined ? '' : label(value));
        if (coerced === null || (typeof coerced === 'string' && coerced.length > 500)) return null;
        next[variable.id] = coerced;
        break;
      }
      default: {
        const amount = value === undefined ? 1 : numeric(value);
        if (amount === null) return null;
        const result = Number(next[variable.id]) + (update.op === 'increment' ? amount : -amount);
        if (!Number.isFinite(result) || Math.abs(result) > 1e12) return null;
        next[variable.id] = result;
      }
    }
  }
  return next;
}
