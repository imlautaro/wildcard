// Offline MCP tool schema preflight regressions. No credentials or provider requests.
// node scripts/checks/mcp-schema.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript6');
const { Validator } = require('@cfworker/json-schema');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'apps/api/src/mcp/schema.ts'), 'utf8').replace(/^import .*;\n/gm, '');
const context = vm.createContext({ exports: {}, Validator,
  size: value => new TextEncoder().encode(JSON.stringify(value)).length,
  isRecord: value => typeof value === 'object' && value !== null && !Array.isArray(value) });
vm.runInContext(ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }), context);
const { validator } = context.exports;
const object = (properties, extra = {}) => ({ type: 'object', properties, ...extra });
const rejects = (name, schema, code = 'MCP_SCHEMA') => assert.throws(() => validator(schema), new RegExp(`^Error: ${code}$`), name);

// Local definitions are inlined and enforced.
const attachment = { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false };
let check = validator(object({ attachments: { type: 'array', items: { $ref: '#/$defs/Attachment' } } }, { $defs: { Attachment: attachment } }));
assert.equal(check({ attachments: [{ name: 'a.txt' }] }), true);
assert.equal(check({ attachments: [{ size: 1 }] }), false, 'referenced constraints apply');
check = validator(object({ label: { $ref: '#/definitions/Label' } }, { definitions: { Label: { type: 'string', maxLength: 3 } } }));
assert.equal(check({ label: 'abc' }), true);
assert.equal(check({ label: 'abcd' }), false);
// A root reference expands to the definition; siblings combine under 2020-12 semantics.
check = validator({ $schema: 'https://json-schema.org/draft/2020-12/schema', $ref: '#/$defs/Args', $defs: { Args: object({ q: { type: 'string' } }, { required: ['q'] }) } });
assert.equal(check({ q: 'x' }), true);
assert.equal(check({}), false);
check = validator({ $ref: '#/$defs/Args', description: 'Arguments', $defs: { Args: object({ q: { type: 'string' } }, { required: ['q'] }) } });
assert.equal(check({ q: 'x' }), true, 'root reference with siblings keeps the object type');
assert.equal(check({}), false);
check = validator(object({ id: { $ref: '#/$defs/Id', minLength: 2 } }, { $defs: { Id: { type: 'string', maxLength: 4 } } }));
assert.equal(check({ id: 'ab' }), true);
assert.equal(check({ id: 'a' }), false, 'sibling keyword applies');
assert.equal(check({ id: 'abcde' }), false, 'referenced keyword applies');
// Escaped definition names resolve.
assert.equal(validator(object({ a: { $ref: '#/$defs/a~1b' } }, { $defs: { 'a/b': { type: 'number' } } }))({ a: 'x' }), false);
// Literal data named $ref is not a reference.
assert.equal(validator(object({ a: { const: { $ref: 'https://example.org/x' } } }))({ a: { $ref: 'https://example.org/x' } }), true);

rejects('remote reference', object({ a: { $ref: 'https://example.org/schema.json' } }));
rejects('nested pointer', object({ a: { $ref: '#/properties/b' }, b: { type: 'string' } }));
rejects('missing definition', object({ a: { $ref: '#/$defs/Missing' } }, { $defs: {} }));
rejects('direct cycle', object({ a: { $ref: '#/$defs/Node' } }, { $defs: { Node: object({ next: { $ref: '#/$defs/Node' } }) } }));
rejects('indirect cycle', object({ a: { $ref: '#/$defs/A' } }, { $defs: { A: object({ b: { $ref: '#/$defs/B' } }), B: object({ a: { $ref: '#/$defs/A' } }) } }));
rejects('dynamic reference', object({ a: { $dynamicRef: '#node' } }));
rejects('non-object root after expansion', { $ref: '#/$defs/S', $defs: { S: { type: 'string' } } });
rejects('non-object root reference with siblings', { $ref: '#/$defs/S', description: 'x', $defs: { S: { type: 'string' } } });
// Reuse counts toward the node budget after expansion.
const wide = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, { type: 'string', description: 'x' }]));
const fanout = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`p${i}`, { $ref: '#/$defs/Wide' }]));
rejects('expanded node budget', object(fanout, { $defs: { Wide: object(wide) } }));

// Bounded repeats on one atom are admitted within the choice budget.
check = validator(object({ id: { type: 'string', pattern: '^[A-Za-z0-9._:-]{1,128}$' } }));
assert.equal(check({ id: 'request-1' }), true);
assert.equal(check({ id: '' }), false);
assert.equal(check({ id: 'x'.repeat(129) }), false);
validator(object({ ip: { type: 'string', pattern: '^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$' } }));
validator(object({ date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } }));
rejects('adjacent variable repeats', object({ a: { type: 'string', pattern: '^a{0,64}a{0,64}b$' } }), 'MCP_SCHEMA_PATTERN');
rejects('repeat above 256', object({ a: { type: 'string', pattern: '^a{1,300}$' } }), 'MCP_SCHEMA_PATTERN');
rejects('open-ended repeat', object({ a: { type: 'string', pattern: '^a{1,}$' } }), 'MCP_SCHEMA_PATTERN');
rejects('inverted repeat', object({ a: { type: 'string', pattern: '^a{5,2}$' } }), 'MCP_SCHEMA_PATTERN');
rejects('quantified group', object({ a: { type: 'string', pattern: '^(?:ab){1,3}$' } }), 'MCP_SCHEMA_PATTERN');
rejects('unbounded quantifier', object({ a: { type: 'string', pattern: '^(?:[a-z]+\\.)+[a-z]+$' } }), 'MCP_SCHEMA_PATTERN');
// Patterns reached only through a reference are still checked.
rejects('referenced pattern', object({ a: { $ref: '#/$defs/P' } }, { $defs: { P: { type: 'string', pattern: '^a+$' } } }), 'MCP_SCHEMA_PATTERN');

console.log('MCP schema checks passed.');
