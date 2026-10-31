import { Validator } from '@cfworker/json-schema';
import { isRecord } from '../chat/meta';
import { size } from './security';

// Admit only anchored, finite regexes with a small statically bounded search space.
// No unbounded repeats, quantified groups, lookarounds or backreferences. Bounded
// {m,n} repeats on a single atom multiply a pattern-wide choice budget, so adjacent
// variable repeats cannot combine into catastrophic backtracking.
function checkPattern(value: unknown) {
  const fail = () => { throw new Error('MCP_SCHEMA_PATTERN'); };
  if (typeof value !== 'string' || value.length > 256 || !value.startsWith('^') || !value.endsWith('$')) return fail();
  const pattern = value;
  let position = 1;
  let choices = 1;
  const end = pattern.length - 1;
  type Cost = { width: number; paths: number };
  const bounded = (cost: Cost) => { if (cost.width > 256 || cost.paths > 64) fail(); return cost; };
  function sequence(depth: number): Cost {
    if (depth > 8) return fail();
    let width = 0, paths = 1;
    while (position < end && !['|', ')'].includes(pattern[position])) {
      const char = pattern[position++];
      let atom: Cost = { width: 1, paths: 1 };
      let group = false;
      if (char === '(') {
        group = true;
        if (pattern[position] === '?') {
          if (pattern.slice(position, position + 2) !== '?:') return fail();
          position += 2;
        }
        atom = sequence(depth + 1);
        while (pattern[position] === '|') {
          position++;
          const branch = sequence(depth + 1);
          atom = bounded({ width: Math.max(atom.width, branch.width), paths: atom.paths + branch.paths });
        }
        if (pattern[position++] !== ')') return fail();
      } else if (char === '[') {
        if (pattern[position] === '^') position++;
        const start = position;
        while (position < end && pattern[position] !== ']') {
          if (pattern[position++] === '\\') {
            if (position >= end) return fail();
            // Inside a class, escapes cannot add repetition or backtracking.
            if (!'dDsSwWnrtfv\\.^$|?*+()[]{}-/'.includes(pattern[position++])) return fail();
          }
        }
        if (position === start || pattern[position++] !== ']') return fail();
      } else if (char === '\\') {
        if (position >= end || !'dDsSwWnrtfv\\.^$|?*+()[]{}-/'.includes(pattern[position++])) return fail();
      } else if ('^$*+?{}]'.includes(char)) return fail();
      if (pattern[position] === '{') {
        if (group) return fail();
        const repeat = /^\{([0-9]{1,3})(?:,([0-9]{1,3}))?\}/.exec(pattern.slice(position));
        const min = Number(repeat?.[1]), max = repeat?.[2] === undefined ? min : Number(repeat[2]);
        if (!repeat || max > 256 || min > max) return fail();
        choices *= max - min + 1;
        if (choices > 1024) return fail();
        atom.width *= max; position += repeat[0].length;
      }
      width += atom.width; paths *= atom.paths;
      bounded({ width, paths });
    }
    return { width, paths };
  }
  sequence(0);
  if (position !== end) return fail();
  try { new RegExp(pattern, 'u'); } catch { fail(); }
}

const schemaMaps = ['properties', '$defs', 'definitions', 'dependentSchemas'];
const schemaLists = ['allOf', 'anyOf', 'oneOf', 'prefixItems'];
const schemaValues = ['items', 'additionalItems', 'additionalProperties', 'unevaluatedItems', 'unevaluatedProperties', 'propertyNames', 'contains', 'not', 'if', 'then', 'else'];

// Replace local `#/$defs/…` and `#/definitions/…` references with the referenced
// subschema, shared by reference so expansion stays linear. Remote, nested-pointer and
// cyclic references fail closed. The node/depth bounds then apply to the expanded
// graph, so every reuse of a definition still counts.
function inline(root: Record<string, unknown>) {
  const done = new Map<string, unknown>(), active = new Set<string>();
  const resolve = (ref: string) => {
    const match = /^#\/(\$defs|definitions)\/([^/]+)$/.exec(ref);
    const definitions = match ? root[match[1]] : undefined;
    const name = match ? match[2].replaceAll('~1', '/').replaceAll('~0', '~') : '';
    if (!match || !isRecord(definitions) || !Object.hasOwn(definitions, name) || active.has(ref)) throw new Error('MCP_SCHEMA');
    if (!done.has(ref)) { active.add(ref); done.set(ref, walk(definitions[name])); active.delete(ref); }
    return done.get(ref);
  };
  // Visit actual subschemas only; enum/const/default data is copied as is.
  const walk = (value: unknown): unknown => {
    if (!isRecord(value)) return value;
    const { $ref, ...rest } = value;
    const copy: Record<string, unknown> = { ...rest };
    for (const key of schemaMaps) if (isRecord(rest[key])) copy[key] = Object.fromEntries(Object.entries(rest[key]).map(([name, child]) => [name, walk(child)]));
    for (const key of schemaLists) if (Array.isArray(rest[key])) copy[key] = rest[key].map(walk);
    for (const key of schemaValues) if (rest[key] !== undefined) copy[key] = Array.isArray(rest[key]) ? rest[key].map(walk) : walk(rest[key]);
    if (isRecord(rest.dependencies)) copy.dependencies = Object.fromEntries(Object.entries(rest.dependencies).map(([name, child]) => [name, Array.isArray(child) ? child : walk(child)]));
    if ($ref === undefined) return copy;
    if (typeof $ref !== 'string') throw new Error('MCP_SCHEMA');
    const target = resolve($ref);
    // Under 2020-12 a $ref applies alongside its sibling keywords.
    return Object.keys(rest).length ? { ...copy, allOf: [...(Array.isArray(copy.allOf) ? copy.allOf : []), target] } : target;
  };
  // Root definitions are only reachable through references; the dialect is checked by the caller.
  const { $defs: _defs, definitions: _definitions, $schema: _dialect, ...body } = root;
  const expanded = walk(body);
  if (!isRecord(expanded)) throw new Error('MCP_SCHEMA');
  // pydantic emits a root `$ref` beside `description`/`title`; the referenced object type then holds.
  const target = Array.isArray(expanded.allOf) ? expanded.allOf.at(-1) : undefined;
  if (body.$ref !== undefined && expanded.type === undefined && isRecord(target) && target.type === 'object') return { ...expanded, type: 'object' };
  return expanded;
}

export function validator(original: Record<string, unknown>) {
  let nodes = 0;
  const count = (value: unknown, depth: number) => {
    if (++nodes > 1000 || depth > 16) throw new Error('MCP_SCHEMA');
    if (Array.isArray(value)) value.forEach(child => count(child, depth + 1));
    else if (isRecord(value)) Object.values(value).forEach(child => count(child, depth + 1));
  };
  // Visit actual subschemas, not property names or literal enum/const data.
  const inspect = (value: unknown) => {
    if (typeof value === 'boolean') return;
    if (!isRecord(value)) throw new Error('MCP_SCHEMA');
    if (['$ref', '$dynamicRef', '$recursiveRef', 'patternProperties'].some(key => Object.hasOwn(value, key))) throw new Error('MCP_SCHEMA');
    if (Object.hasOwn(value, 'pattern')) checkPattern(value.pattern);
    for (const key of schemaMaps) {
      if (value[key] === undefined) continue;
      if (!isRecord(value[key])) throw new Error('MCP_SCHEMA');
      Object.values(value[key]).forEach(inspect);
    }
    for (const key of schemaLists) {
      if (value[key] === undefined) continue;
      if (!Array.isArray(value[key])) throw new Error('MCP_SCHEMA');
      value[key].forEach(inspect);
    }
    for (const key of schemaValues) {
      if (value[key] === undefined) continue;
      if (Array.isArray(value[key])) value[key].forEach(inspect); else inspect(value[key]);
    }
    if (isRecord(value.dependencies)) for (const child of Object.values(value.dependencies)) if (!Array.isArray(child)) inspect(child);
  };
  if ((original.$schema !== undefined && !['https://json-schema.org/draft/2020-12/schema', 'http://json-schema.org/draft-07/schema#', 'https://json-schema.org/draft-07/schema#', 'https://json-schema.org/draft/2019-09/schema'].includes(String(original.$schema))) || size(original) > 16000) throw new Error('MCP_SCHEMA');
  const schema = inline(original);
  if (schema.type !== 'object') throw new Error('MCP_SCHEMA');
  count(schema, 0); inspect(schema);
  let compiled: Validator;
  try { compiled = new Validator(schema, '2020-12', true); } catch { throw new Error('MCP_SCHEMA'); }
  return (value: unknown) => compiled.validate(value).valid;
}
