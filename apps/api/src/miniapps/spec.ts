import { isRecord } from '../chat/meta';

// Mini apps are declarative data: ordered steps that may only reference earlier
// steps (an acyclic graph by construction), and a view tree of a closed component
// catalog. Nothing here evaluates code, regular expressions or remote references.
export const miniAppIcons = ['chart', 'list', 'money', 'calendar', 'cart', 'check', 'clock', 'star', 'bolt', 'folder'] as const;
const formats = ['number', 'currency', 'percent', 'date', 'datetime', 'text'] as const;
const comparisons = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'after', 'before'] as const;
const aggregates = ['sum', 'avg', 'min', 'max', 'count'] as const;
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
type Input = { id: string; type: 'segmented'; label: string; options: { value: string; label: string }[]; default: string }
  | { id: string; type: 'text'; label: string; default: string };
type Field = { id: string; label: string; kind: 'text' | 'number' | 'date' | 'toggle'; required: boolean };
export type Action = { id: string; label: string; confirm: string; style: 'default' | 'destructive'; connectionID: string; tool: string; arguments: Record<string, unknown>; fields: Field[] };
type Value = { format?: Format; currency?: string };
export type Component =
  | { type: 'section'; title?: string; children: Component[] }
  | ({ type: 'stat'; label: string; step: string; path?: string; caption?: string } & Value)
  | ({ type: 'list'; source: string; title: string; subtitle?: string; value?: string; limit: number; empty?: string } & Value)
  | ({ type: 'chart'; source: string; kind: 'bar' | 'line'; x: string; y: string; title?: string } & Value)
  | { type: 'text'; text: string; style: 'body' | 'caption' | 'headline' }
  | { type: 'action'; action: string };
export type Spec = { title: string; subtitle?: string; icon: typeof miniAppIcons[number]; inputs: Input[]; data: Step[]; view: Component[]; actions: Action[] };
export type ToolUse = { connectionID: string; toolName: string; role: 'read' | 'write' };

export class SpecError extends Error {}
const fail = (message: string): never => { throw new SpecError(message); };
const identifier = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
function text(value: unknown, name: string, max: number, optional = false, multiline = false): string | undefined {
  if (value === undefined && optional) return undefined;
  if (typeof value !== 'string' || !value.trim() || [...value].length > max || (multiline ? /[\u0000-\u0009\u000b-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value)) return fail(`${name} must be non-empty text of at most ${max} characters.`);
  return value.trim();
}
function path(value: unknown, name: string, optional = false): string | undefined {
  if (value === undefined && optional) return undefined;
  if (typeof value !== 'string' || value.length > 200 || (value !== '' && value.split('.').some(part => !part || part.length > 64 || /[\u0000-\u001f]/.test(part))) || value.split('.').length > 8) return fail(`${name} must be a dot path such as "data.items" (up to 8 segments).`);
  return value;
}
function only(value: Record<string, unknown>, keys: string[], name: string) {
  const extra = Object.keys(value).find(key => !keys.includes(key));
  if (extra) fail(`${name} does not support "${extra}".`);
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

// Templates are literal JSON plus three single-key expressions.
function template(value: unknown, name: string, scope: { inputs: Set<string>; fields?: Set<string> }, depth = 0): unknown {
  if (depth > 6) return fail(`${name} is nested too deeply.`);
  if (value === null || typeof value === 'boolean' || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) return value;
  if (Array.isArray(value)) return value.length > 50 ? fail(`${name} has too many items.`) : value.map((item, index) => template(item, `${name}[${index}]`, scope, depth + 1));
  if (!isRecord(value)) return fail(`${name} must be JSON.`);
  const keys = Object.keys(value);
  if (keys.some(key => key.startsWith('$'))) {
    if (keys.length !== 1) return fail(`${name}: an expression object must contain only its "$" key.`);
    const [key] = keys, argument = value[key];
    if (key === '$input') return typeof argument === 'string' && scope.inputs.has(argument) ? value : fail(`${name}: $input must name a declared input.`);
    if (key === '$field') return scope.fields && typeof argument === 'string' && scope.fields.has(argument) ? value : fail(`${name}: $field is only available in actions and must name one of its fields.`);
    if (key === '$date') {
      if (!isRecord(argument)) return fail(`${name}: $date expects {"days": -7, "format": "date"}.`);
      only(argument, ['days', 'format'], `${name}.$date`);
      if (argument.days !== undefined && (!Number.isInteger(argument.days) || Math.abs(Number(argument.days)) > 366)) fail(`${name}.$date.days must be an integer between -366 and 366.`);
      choice(argument.format, ['date', 'datetime'] as const, `${name}.$date.format`);
      return value;
    }
    return fail(`${name}: unknown expression ${key}. Use $input, $field or $date.`);
  }
  if (keys.length > 50) return fail(`${name} has too many keys.`);
  return Object.fromEntries(keys.map(key => [key, template(value[key], `${name}.${key}`, scope, depth + 1)]));
}

export function parseSpec(raw: unknown): { spec: Spec; tools: ToolUse[] } {
  if (!isRecord(raw)) fail('spec must be an object.');
  const value = raw as Record<string, unknown>;
  if (JSON.stringify(value).length > 16000) fail('spec must be at most 16 KB.');
  only(value, ['title', 'subtitle', 'icon', 'inputs', 'data', 'view', 'actions'], 'spec');
  const ids = new Set<string>();
  const unique = (id: unknown, name: string) => {
    if (typeof id !== 'string' || !identifier.test(id)) return fail(`${name}.id must start with a letter and contain only letters, digits or _ (max 32).`);
    if (ids.has(id)) return fail(`Duplicate id "${id}".`);
    ids.add(id); return id;
  };
  const list = (field: unknown, name: string, max: number, required = false) => {
    if (field === undefined && !required) return [];
    if (!Array.isArray(field) || (required && !field.length) || field.length > max) return fail(`${name} must be an array of ${required ? '1' : '0'}–${max} items.`);
    return field;
  };
  const inputs: Input[] = list(value.inputs, 'inputs', 4).map((item, index) => {
    const name = `inputs[${index}]`;
    if (!isRecord(item)) return fail(`${name} must be an object.`);
    const id = unique(item.id, name), label = text(item.label, `${name}.label`, 40)!;
    if (item.type === 'segmented') {
      only(item, ['id', 'type', 'label', 'options', 'default'], name);
      const options = list(item.options, `${name}.options`, 5, true).map((option, at) => {
        if (!isRecord(option)) return fail(`${name}.options[${at}] must be an object.`);
        only(option, ['value', 'label'], `${name}.options[${at}]`);
        return { value: text(option.value, `${name}.options[${at}].value`, 60)!, label: text(option.label, `${name}.options[${at}].label`, 24)! };
      });
      if (options.length < 2 || new Set(options.map(o => o.value)).size !== options.length) fail(`${name} needs 2–5 options with distinct values.`);
      const fallback = item.default ?? options[0].value;
      if (!options.some(o => o.value === fallback)) fail(`${name}.default must be one of its option values.`);
      return { id, type: 'segmented', label, options, default: String(fallback) };
    }
    if (item.type === 'text') {
      only(item, ['id', 'type', 'label', 'default'], name);
      if (item.default !== undefined && (typeof item.default !== 'string' || item.default.length > 200)) fail(`${name}.default must be text.`);
      return { id, type: 'text', label, default: typeof item.default === 'string' ? item.default : '' };
    }
    return fail(`${name}.type must be segmented or text.`);
  });
  const inputIDs = new Set(inputs.map(i => i.id));
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
  const earlier = (from: unknown, name: string) => typeof from === 'string' && stepIDs.has(from) ? from : fail(`${name}.from must name an earlier data step.`);
  const data: Step[] = list(value.data, 'data', 12, true).map((item, index) => {
    const name = `data[${index}]`;
    if (!isRecord(item)) return fail(`${name} must be an object.`);
    const id = unique(item.id, name);
    let step: Step;
    switch (item.type) {
      case 'mcp': only(item, ['id', 'type', 'connectionID', 'tool', 'arguments'], name);
        step = { id, type: 'mcp', ...remote(item, name, 'read'), arguments: template(item.arguments ?? {}, `${name}.arguments`, { inputs: inputIDs }) as Record<string, unknown> }; break;
      case 'const': only(item, ['id', 'type', 'value'], name);
        step = { id, type: 'const', value: template(item.value ?? null, `${name}.value`, { inputs: inputIDs }) }; break;
      case 'select': only(item, ['id', 'type', 'from', 'path'], name);
        step = { id, type: 'select', from: earlier(item.from, name), path: path(item.path, `${name}.path`)! }; break;
      case 'filter': only(item, ['id', 'type', 'from', 'where'], name);
        step = { id, type: 'filter', from: earlier(item.from, name), where: list(item.where, `${name}.where`, 6, true).map((condition, at) => {
          if (!isRecord(condition)) return fail(`${name}.where[${at}] must be an object.`);
          only(condition, ['field', 'op', 'value'], `${name}.where[${at}]`);
          return { field: path(condition.field, `${name}.where[${at}].field`)!, op: choice(condition.op, comparisons, `${name}.where[${at}].op`), value: template(condition.value ?? null, `${name}.where[${at}].value`, { inputs: inputIDs }) };
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
      default: return fail(`${name}.type must be mcp, const, select, filter, sort, limit, aggregate or group.`);
    }
    stepIDs.add(id);
    return step;
  });
  if (data.filter(s => s.type === 'mcp').length > 4) fail('Use at most four mcp data steps.');
  const actions: Action[] = list(value.actions, 'actions', 4).map((item, index) => {
    const name = `actions[${index}]`;
    if (!isRecord(item)) return fail(`${name} must be an object.`);
    only(item, ['id', 'label', 'confirm', 'style', 'connectionID', 'tool', 'arguments', 'fields'], name);
    const id = unique(item.id, name);
    const fields: Field[] = list(item.fields, `${name}.fields`, 6).map((field, at) => {
      if (!isRecord(field)) return fail(`${name}.fields[${at}] must be an object.`);
      only(field, ['id', 'label', 'kind', 'required'], `${name}.fields[${at}]`);
      if (typeof field.id !== 'string' || !identifier.test(field.id)) fail(`${name}.fields[${at}].id is invalid.`);
      if (field.required !== undefined && typeof field.required !== 'boolean') fail(`${name}.fields[${at}].required must be a boolean.`);
      return { id: field.id as string, label: text(field.label, `${name}.fields[${at}].label`, 40)!, kind: choice(field.kind, ['text', 'number', 'date', 'toggle'] as const, `${name}.fields[${at}].kind`, 'text'), required: field.required === true };
    });
    if (new Set(fields.map(f => f.id)).size !== fields.length) fail(`${name}.fields ids must be distinct.`);
    return { id, label: text(item.label, `${name}.label`, 40)!, confirm: text(item.confirm, `${name}.confirm`, 200)!, style: choice(item.style, ['default', 'destructive'] as const, `${name}.style`, 'default'),
      ...remote(item, name, 'write'), arguments: template(item.arguments ?? {}, `${name}.arguments`, { inputs: inputIDs, fields: new Set(fields.map(f => f.id)) }) as Record<string, unknown>, fields };
  });
  const actionIDs = new Set(actions.map(a => a.id));
  let nodes = 0;
  const source = (field: unknown, name: string) => typeof field === 'string' && stepIDs.has(field) ? field : fail(`${name} must name a data step.`);
  const component = (item: unknown, name: string, nested: boolean): Component => {
    if (++nodes > 40) return fail('view supports at most 40 components.');
    if (!isRecord(item)) return fail(`${name} must be an object.`);
    switch (item.type) {
      case 'section': only(item, ['type', 'title', 'children'], name);
        if (nested) fail(`${name}: sections cannot be nested.`);
        return { type: 'section', title: text(item.title, `${name}.title`, 60, true), children: list(item.children, `${name}.children`, 20, true).map((child, at) => component(child, `${name}.children[${at}]`, true)) };
      case 'stat': only(item, ['type', 'label', 'step', 'path', 'caption', 'format', 'currency'], name);
        return { type: 'stat', label: text(item.label, `${name}.label`, 40)!, step: source(item.step, `${name}.step`), path: path(item.path, `${name}.path`, true), caption: text(item.caption, `${name}.caption`, 80, true), ...format(item, name) };
      case 'list': only(item, ['type', 'source', 'title', 'subtitle', 'value', 'limit', 'empty', 'format', 'currency'], name);
        if (item.limit !== undefined && (!Number.isInteger(item.limit) || Number(item.limit) < 1 || Number(item.limit) > 100)) fail(`${name}.limit must be 1–100.`);
        return { type: 'list', source: source(item.source, `${name}.source`), title: path(item.title, `${name}.title`)!, subtitle: path(item.subtitle, `${name}.subtitle`, true), value: path(item.value, `${name}.value`, true), limit: Number(item.limit ?? 20), empty: text(item.empty, `${name}.empty`, 80, true), ...format(item, name) };
      case 'chart': only(item, ['type', 'source', 'kind', 'x', 'y', 'title', 'format', 'currency'], name);
        return { type: 'chart', source: source(item.source, `${name}.source`), kind: choice(item.kind, ['bar', 'line'] as const, `${name}.kind`, 'bar'), x: path(item.x, `${name}.x`)!, y: path(item.y, `${name}.y`)!, title: text(item.title, `${name}.title`, 60, true), ...format(item, name) };
      case 'text': only(item, ['type', 'text', 'style'], name);
        return { type: 'text', text: text(item.text, `${name}.text`, 500, false, true)!, style: choice(item.style, ['body', 'caption', 'headline'] as const, `${name}.style`, 'body') };
      case 'action': only(item, ['type', 'action'], name);
        return { type: 'action', action: typeof item.action === 'string' && actionIDs.has(item.action) ? item.action : fail(`${name}.action must name a declared action.`) };
      default: return fail(`${name}.type must be section, stat, list, chart, text or action.`);
    }
  };
  const view = list(value.view, 'view', 20, true).map((item, index) => component(item, `view[${index}]`, false));
  return { spec: { title: text(value.title, 'title', 60)!, subtitle: text(value.subtitle, 'subtitle', 120, true), icon: choice(value.icon, miniAppIcons, 'icon', 'chart'), inputs, data, view, actions }, tools };
}

// Runtime evaluation ---------------------------------------------------------

export type Context = { inputs: Record<string, string>; fields?: Record<string, unknown>; timeZone: string; now: number };
function localDate(timestamp: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(timestamp));
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function evaluate(value: unknown, context: Context): unknown {
  if (Array.isArray(value)) return value.map(item => evaluate(item, context));
  if (!isRecord(value)) return value;
  if ('$input' in value) return context.inputs[String(value.$input)] ?? null;
  if ('$field' in value) return context.fields?.[String(value.$field)] ?? null;
  if ('$date' in value && isRecord(value.$date)) {
    const timestamp = context.now + Number(value.$date.days ?? 0) * 86_400_000;
    return value.$date.format === 'date' ? localDate(timestamp, context.timeZone) : new Date(timestamp).toISOString();
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
const numeric = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value
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

export type ResolvedComponent =
  | { type: 'section'; title: string | null; children: ResolvedComponent[] }
  | { type: 'stat'; label: string; value: number | string | null; format: Format; currency: string | null; caption: string | null }
  | { type: 'list'; items: { title: string; subtitle: string | null; value: number | string | null }[]; format: Format; currency: string | null; empty: string }
  | { type: 'chart'; kind: 'bar' | 'line'; title: string | null; points: { x: string; y: number }[]; format: Format; currency: string | null }
  | { type: 'text'; text: string; style: 'body' | 'caption' | 'headline' }
  | { type: 'action'; id: string; label: string; confirm: string; style: 'default' | 'destructive'; fields: Field[] }
  | { type: 'notice'; code: string };

export function present(view: Component[], spec: Spec, outputs: Map<string, unknown>, errors: Map<string, string>): ResolvedComponent[] {
  const scalar = (value: unknown) => numeric(value) ?? (value === null || value === undefined ? null : label(value));
  return view.map((component): ResolvedComponent => {
    switch (component.type) {
      case 'section': return { type: 'section', title: component.title ?? null, children: present(component.children, spec, outputs, errors) };
      case 'text': return component;
      case 'action': {
        const action = spec.actions.find(a => a.id === component.action)!;
        return { type: 'action', id: action.id, label: action.label, confirm: action.confirm, style: action.style, fields: action.fields };
      }
      case 'stat': {
        if (errors.has(component.step)) return { type: 'notice', code: errors.get(component.step)! };
        const value = read(outputs.get(component.step), component.path);
        return { type: 'stat', label: component.label, value: scalar(value), format: component.format ?? (typeof value === 'number' ? 'number' : 'text'), currency: component.currency ?? null, caption: component.caption ?? null };
      }
      case 'list': case 'chart': {
        if (errors.has(component.source)) return { type: 'notice', code: errors.get(component.source)! };
        const rows = outputs.get(component.source);
        if (!Array.isArray(rows)) return { type: 'notice', code: 'NOT_A_LIST' };
        if (component.type === 'list') return { type: 'list', items: rows.slice(0, component.limit).map(row => ({ title: label(read(row, component.title)), subtitle: component.subtitle ? label(read(row, component.subtitle)) : null, value: component.value ? scalar(read(row, component.value)) : null })), format: component.format ?? 'text', currency: component.currency ?? null, empty: component.empty ?? 'Nothing to show.' };
        const points = rows.slice(0, 60).flatMap(row => { const y = numeric(read(row, component.y)); return y === null ? [] : [{ x: [...label(read(row, component.x))].slice(0, 40).join(''), y }]; });
        return { type: 'chart', kind: component.kind, title: component.title ?? null, points, format: component.format ?? 'number', currency: component.currency ?? null };
      }
    }
  });
}
