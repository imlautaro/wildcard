import { Validator } from '@cfworker/json-schema';
import { isRecord } from '../chat/meta';
import { size } from './security';

// Admit only anchored, finite regexes with a small statically bounded search space.
// No unbounded/variable repeats, quantified groups, lookarounds or backreferences.
function checkPattern(value: unknown) {
  const fail = () => { throw new Error('MCP_SCHEMA_PATTERN'); };
  if (typeof value !== 'string' || value.length > 256 || !value.startsWith('^') || !value.endsWith('$')) return fail();
  const pattern = value;
  let position = 1;
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
        const repeat = /^\{([0-9]{1,3})\}/.exec(pattern.slice(position));
        if (!repeat || Number(repeat[1]) > 256) return fail();
        atom.width *= Number(repeat[1]); position += repeat[0].length;
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

export function validator(schema: Record<string, unknown>) {
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
    for (const key of ['properties', '$defs', 'definitions', 'dependentSchemas']) {
      if (value[key] === undefined) continue;
      if (!isRecord(value[key])) throw new Error('MCP_SCHEMA');
      Object.values(value[key]).forEach(inspect);
    }
    for (const key of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) {
      if (value[key] === undefined) continue;
      if (!Array.isArray(value[key])) throw new Error('MCP_SCHEMA');
      value[key].forEach(inspect);
    }
    for (const key of ['items', 'additionalItems', 'additionalProperties', 'unevaluatedItems', 'unevaluatedProperties', 'propertyNames', 'contains', 'not', 'if', 'then', 'else']) {
      if (value[key] === undefined) continue;
      if (Array.isArray(value[key])) value[key].forEach(inspect); else inspect(value[key]);
    }
    if (isRecord(value.dependencies)) for (const child of Object.values(value.dependencies)) if (!Array.isArray(child)) inspect(child);
  };
  if ((schema.$schema !== undefined && !['https://json-schema.org/draft/2020-12/schema', 'http://json-schema.org/draft-07/schema#', 'https://json-schema.org/draft-07/schema#', 'https://json-schema.org/draft/2019-09/schema'].includes(String(schema.$schema))) || size(schema) > 16000 || schema.type !== 'object') throw new Error('MCP_SCHEMA');
  count(schema, 0); inspect(schema);
  let compiled: Validator;
  try { compiled = new Validator(schema, '2020-12', true); } catch { throw new Error('MCP_SCHEMA'); }
  return (value: unknown) => compiled.validate(value).valid;
}
