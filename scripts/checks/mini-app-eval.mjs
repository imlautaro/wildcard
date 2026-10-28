#!/usr/bin/env node
// Generates mini apps with the real model, tool definitions, response validation,
// spec interpreter and offline verifier, then writes the verifier's populated
// preview (every everyday action used twice) as fixtures.
// Usage: META_API_KEY=… node scripts/checks/mini-app-eval.mjs --prompts prompts.json --out dir [--model muse-spark-1.3-contributor]
// The key may instead be a META_API_KEY line in apps/api/.dev.vars. It is never printed.
// Without connectors only state, inputs, const data and local actions can be exercised.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argument = (name, fallback) => { const index = process.argv.indexOf(`--${name}`); return index > 0 ? process.argv[index + 1] : fallback; };
const out = resolve(argument('out', join(root, '.mini-app-eval')));
const model = argument('model', 'muse-spark-1.3-contributor');
const prompts = argument('prompts') ? JSON.parse(readFileSync(resolve(argument('prompts')), 'utf8')) : [
  'Make me a counter that starts at 0 with + and − buttons and a reset.',
  'I want a tracker for the glasses of water I drink today, with a goal of 8.',
  'Build a scoreboard for a game between two teams.',
];
function key() {
  if (process.env.META_API_KEY?.trim()) return process.env.META_API_KEY.trim();
  const vars = join(root, 'apps/api/.dev.vars');
  const line = existsSync(vars) ? readFileSync(vars, 'utf8').split('\n').find(l => l.startsWith('META_API_KEY=')) : null;
  const value = line?.slice('META_API_KEY='.length).trim().replace(/^"(.*)"$/, '$1');
  if (!value) throw new Error('Set META_API_KEY in the environment or apps/api/.dev.vars.');
  return value;
}

mkdirSync(out, { recursive: true });
const bundle = join(out, 'harness.mjs');
await build({
  stdin: { contents: `export { museCompletion } from './apps/api/src/chat/meta';
    export { miniAppTools, miniAppInstruction, prepareMiniApp } from './apps/api/src/miniapps/tools';
    export * from './apps/api/src/miniapps/spec';`, resolveDir: root, loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', outfile: bundle, logLevel: 'error',
  plugins: [{ name: 'workers', setup(b) {
    b.onResolve({ filter: /^cloudflare:/ }, args => ({ path: args.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export class NonRetryableError extends Error {} export class WorkflowEntrypoint {}', loader: 'js' }));
  } }],
});
const h = await import(pathToFileURL(bundle).href);
const env = { META_API_KEY: key() };
const timeZone = 'America/Argentina/Buenos_Aires';
const system = [
  h.miniAppInstruction,
  'You are a helpful conversational assistant shared by participants. Your contact display name is "Test contact".',
  'This conversation has no external connectors. Reply in the person’s language.',
].join('\n');

const results = [];
for (const [index, prompt] of prompts.entries()) {
  const messages = [{ role: 'system', content: system }, { role: 'user', content: prompt }];
  const record = { index, prompt, attempts: [], spec: null, reply: null, error: null, seconds: 0, resolution: null, verification: null };
  const started = Date.now();
  try {
    // Same shape as production private chats: three tool rounds, one more to repair a
    // mini app that failed verification in the last round, then a final answer.
    let toolRounds = 3, repairRound = false;
    for (let round = 0; round <= toolRounds && !record.reply; round++) {
      if (round === toolRounds) messages.push({ role: 'system', content: 'Tool budget exhausted. Answer using the available evidence; acknowledge any missing detail.' });
      const answer = await h.museCompletion(env, messages, model, round < toolRounds ? { maxTokens: 8192, tools: h.miniAppTools } : {});
      if (!answer.tool_calls?.length) { record.reply = answer.content; break; }
      messages.push(answer);
      let failed = false;
      for (const call of answer.tool_calls) {
        let content;
        try {
          const args = JSON.parse(call.function.arguments);
          if (call.function.name !== 'create_mini_app') content = JSON.stringify({ miniApps: [] });
          else {
            // The same parsing and offline verification as production; no connectors here.
            const prepared = h.prepareMiniApp(args.spec, timeZone, new Map());
            if (prepared.response) content = JSON.stringify(prepared.response);
            else if (prepared.parsed.tools.length) content = JSON.stringify({ error: 'No connectors are assigned to this contact.' });
            else {
              record.spec = prepared.parsed.spec; record.verification = prepared.verification;
              content = JSON.stringify({ miniAppID: `eval-${index}`, revision: 1, enabled: true, verified: { testsPassed: prepared.verification.testsPassed, warnings: prepared.verification.warnings.slice(0, 8) },
                nextStep: 'Tell the person the mini app card is in this chat and opens immediately.' });
            }
          }
          const result = JSON.parse(content);
          if (result.error) failed = call.function.name === 'create_mini_app';
          record.attempts.push({ tool: call.function.name, bytes: call.function.arguments.length, ok: !result.error, ...(result.error ? { error: result.error, problems: result.problems, arguments: call.function.arguments } : {}) });
        } catch (error) {
          content = JSON.stringify({ error: 'Invalid arguments.' });
          failed = true;
          record.attempts.push({ tool: call.function.name, bytes: call.function.arguments.length, ok: false, error: String(error), arguments: call.function.arguments });
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content });
      }
      if (failed && !repairRound && round === toolRounds - 1) { toolRounds++; repairRound = true; }
    }
  } catch (error) { record.error = error instanceof Error ? error.message : String(error); }
  record.seconds = Math.round((Date.now() - started) / 100) / 10;
  if (record.spec) {
    // The verifier's populated preview: every everyday action used twice with sample values.
    const spec = record.spec, preview = record.verification.preview;
    record.resolution = { revision: 1, inputs: Object.fromEntries(spec.inputs.map(i => [i.id, i.default])), resolvedAt: Date.now(), view: preview.view, ...(preview.tabs ? { tabs: preview.tabs } : {}),
      menu: spec.menu.map(id => h.resolvedAction(spec, id)), issues: [], state: preview.state, remote: false };
  }
  results.push(record);
  writeFileSync(join(out, `app-${String(index + 1).padStart(2, '0')}.json`), JSON.stringify({ title: record.spec?.title ?? prompt, inputs: record.spec?.inputs ?? [], resolution: record.resolution }, null, 1));
  const failures = record.attempts.filter(a => !a.ok).map(a => [a.error, ...(a.problems ?? [])].join(' / ')).join(' | ');
  console.log(`${index + 1}. ${record.spec ? 'OK  ' : 'FAIL'} ${record.seconds}s attempts=${record.attempts.length} tests=${record.verification?.testsPassed ?? 0} ${record.error ?? failures} :: ${prompt}`);
  if (!record.spec) console.log(`   reply: ${(record.reply ?? '').slice(0, 300).replace(/\n/g, ' ')}`);
}
writeFileSync(join(out, 'results.json'), JSON.stringify(results, null, 1));
console.log(`${results.filter(r => r.spec).length}/${results.length} built. Details: ${join(out, 'results.json')}`);
