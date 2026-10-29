// Offline parser regressions. No credentials, provider requests or database writes.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript6');
const MarkdownIt = require('markdown-it');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'apps/api/src/research/model.ts'), 'utf8')
  .replace(/^import .*;\n/gm, '');
const context = vm.createContext({ exports: {}, MarkdownIt, URL, AbortSignal, TextDecoder,
  validChatModel: model => ['muse-spark-1.3', 'muse-spark-1.3-contributor'].includes(model),
  isRecord: value => typeof value === 'object' && value !== null && !Array.isArray(value) });
vm.runInContext(ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }), context);
const parse = value => context.exports.parseResearchResponse(value, 'Public fixture', 'muse-spark-1.3');
const hit = 'http://example.org/spec?version=2#format';
const response = (text, url = hit, annotations = [], searchStatus = 'completed') => ({ status: 'completed', output: [
  { type: 'web_search_call', status: searchStatus, results: [{ title: 'Specification', url }] },
  { type: 'message', role: 'assistant', content: [{ type: 'output_text', text, annotations }] },
] });
const cases = [
  ['exact link', response(`[Specification](${hit})`), true],
  ['HTTPS upgrade', response(`[Specification](${hit.replace('http:', 'https:')})`), true],
  ['bare source URL', response(`Source: ${hit}`), true],
  ['reference link', response(`[Specification][spec]\n\n[spec]: ${hit}`), true],
  ['angle autolink', response(`<${hit}>`), true],
  ['inline code is not a citation', response('`' + hit + '`'), false],
  ['fenced code is not a citation', response('```\n' + hit + '\n```'), false],
  ['image is not a citation', response(`![Specification](${hit})`), false],
  ['image alt is not a citation', response(`![${hit}](https://example.org/image.png)`), false],
  ['HTML anchor is not a citation', response(`<a href="${hit}">Specification</a>`), false],
  ['homepage substitution', response('[Specification](https://example.org/)'), false],
  ['guessed official URL absent from search', response('[RFC 4287](https://www.ietf.org/rfc/rfc4287.txt)', 'https://example.org/atom-overview'), false],
  ['different query', response(`[Specification](${hit.replace('version=2', 'version=3')})`), false],
  ['different fragment', response(`[Specification](${hit.replace('#format', '#other')})`), false],
  ['different host', response(`[Specification](${hit.replace('example.org', 'other.org')})`), false],
  ['different port', response('[Specification](https://example.org:8080/spec?version=2#format)'), false],
  ['non-default HTTP port', response('[Specification](https://example.org:8080/spec)', 'http://example.org:8080/spec'), false],
  ['HTTPS downgrade', response('[Specification](http://example.org/spec)', 'https://example.org/spec'), false],
  ['retrieved-only source', response('An answer with no source link.'), false],
  ['incomplete search', response(`[Specification](${hit})`, hit, [], 'in_progress'), false],
  ['unsafe source', response('[Specification](http://localhost/spec)', 'http://localhost/spec'), false],
  ['provider annotation', response('An annotated claim.', hit, [{ type: 'url_citation', title: 'Cited page', url: 'https://example.org/cited' }]), true],
];
const commentary = response('An answer with no source link.');
commentary.output.push({ type: 'message', role: 'assistant', phase: 'commentary', content: [{ type: 'output_text', text: hit }] });
cases.push(['commentary excluded', commentary, false]);
for (const [name, value, accepted] of cases) {
  if (accepted) assert.ok(parse(value).provenance.sources.some(source => source.cited), name);
  else assert.throws(() => parse(value), error => /^MODEL_RESEARCH_(NO_CITATIONS|NO_SEARCH)$/.test(error.message), name);
}
async function synthesisChecks() {
  const value = response('No usable citation.');
  value.usage = { input_tokens: 10, output_tokens: 5 };
  const report = { sections: [{ text: 'A limited comparison.', sourceIDs: [1] }], limitations: 'Page text was unavailable.' };
  let calls = 0, admissionChecks = 0;
  const mock = content => {
    context.fetch = async (url, options) => {
      calls++;
      const body = JSON.parse(options.body);
      if (url.endsWith('/responses')) return new Response(JSON.stringify(value));
      assert.equal(body.tools, undefined, 'synthesis has no tools');
      assert.equal(body.messages.length, 2);
      assert.equal(body.response_format.json_schema.name, 'research_report');
      assert.equal(JSON.parse(body.messages[1].content).searchHits[0].url, hit);
      return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }],
        usage: { prompt_tokens: 20, completion_tokens: 8 } }));
    };
  };
  mock(report);
  const result = await context.exports.researchWeb({ META_API_KEY: 'fixture' }, 'Public fixture', 'muse-spark-1.3', async () => { admissionChecks++; return true; });
  assert.equal(calls, 2);
  assert.equal(admissionChecks, 1);
  assert.equal(result.provenance.sources[0].url, hit);
  assert.equal(result.provenance.sources[0].cited, true);
  assert.equal(result.provenance.synthesisCalls, 1);
  assert.equal(result.provenance.inputTokens, 30);
  assert.equal(result.provenance.outputTokens, 13);
  assert.ok(result.markdown.includes(`[1](<${hit}>)`));
  calls = 0;
  await assert.rejects(context.exports.researchWeb({ META_API_KEY: 'fixture' }, 'Public fixture', 'muse-spark-1.3', async () => false),
    error => error.message === 'MODEL_RESEARCH_ACCESS_CHANGED');
  assert.equal(calls, 1, 'access loss prevents synthesis');
  for (const invalid of [
    { ...report, sections: [{ text: 'A claim.', sourceIDs: [2] }] },
    { ...report, sections: [{ text: 'A claim.', sourceIDs: [] }] },
    { ...report, sections: [{ text: '[Guessed source](https://example.org/other)', sourceIDs: [1] }] },
    { ...report, limitations: 'See https://example.org/other' },
  ]) {
    mock(invalid);
    await assert.rejects(context.exports.synthesizeResearchResponse({ META_API_KEY: 'fixture' }, value, 'Public fixture', 'muse-spark-1.3', AbortSignal.timeout(1000)),
      error => error.message === 'MODEL_RESEARCH_INVALID_REPORT');
  }
  console.log(`Passed ${cases.length} offline citation cases and 6 synthesis/admission cases.`);
}
synthesisChecks().catch(error => { console.error(error); process.exitCode = 1; });
