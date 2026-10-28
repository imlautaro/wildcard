#!/usr/bin/env node
// Generates mini apps with the real model, tool definitions, response validation and
// spec interpreter, then simulates local taps and writes resolved views as fixtures.
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
    export { miniAppTools } from './apps/api/src/miniapps/tools';
    export * from './apps/api/src/miniapps/spec';`, resolveDir: root, loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', outfile: bundle, logLevel: 'error',
  plugins: [{ name: 'workers', setup(b) {
    b.onResolve({ filter: /^cloudflare:/ }, args => ({ path: args.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export class NonRetryableError extends Error {} export class WorkflowEntrypoint {}', loader: 'js' }));
  } }],
});
const h = await import(pathToFileURL(bundle).href);
const env = { META_API_KEY: key() };
const system = [
  'When the person asks for an app, tool, counter, tracker, checklist or reusable view, build a native mini app with create_mini_app instead of describing one or writing code. Use saved state and local actions for things that only need to remember values.',
  'You are a helpful conversational assistant shared by participants. Your contact display name is "Test contact".',
  'This conversation has no external connectors. Reply in the person’s language.',
].join('\n');

const results = [];
for (const [index, prompt] of prompts.entries()) {
  const messages = [{ role: 'system', content: system }, { role: 'user', content: prompt }];
  const record = { index, prompt, attempts: [], spec: null, reply: null, error: null, seconds: 0, resolution: null };
  const started = Date.now();
  try {
    // Same shape as production private chats: three tool rounds, then a final answer.
    for (let round = 0; round <= 3 && !record.reply; round++) {
      if (round === 3) messages.push({ role: 'system', content: 'Tool budget exhausted. Answer using the available evidence; acknowledge any missing detail.' });
      const answer = await h.museCompletion(env, messages, model, round < 3 ? { maxTokens: 8192, tools: h.miniAppTools } : {});
      if (!answer.tool_calls?.length) { record.reply = answer.content; break; }
      messages.push(answer);
      for (const call of answer.tool_calls) {
        let content;
        try {
          const args = JSON.parse(call.function.arguments);
          if (call.function.name !== 'create_mini_app') content = JSON.stringify({ miniApps: [] });
          else {
            const parsed = h.parseSpec(args.spec);
            if (parsed.tools.length) throw new h.SpecError('No connectors are assigned to this contact.');
            record.spec = parsed.spec;
            content = JSON.stringify({ miniAppID: `eval-${index}`, revision: 1, enabled: true, nextStep: 'Tell the person the mini app card is in this chat and opens immediately.' });
          }
          record.attempts.push({ tool: call.function.name, bytes: call.function.arguments.length, ok: true });
        } catch (error) {
          content = JSON.stringify({ error: error instanceof h.SpecError ? `Invalid spec: ${error.message}` : 'Invalid arguments.' });
          record.attempts.push({ tool: call.function.name, bytes: call.function.arguments.length, ok: false, error: JSON.parse(content).error, arguments: call.function.arguments });
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content });
      }
    }
  } catch (error) { record.error = error instanceof Error ? error.message : String(error); }
  record.seconds = Math.round((Date.now() - started) / 100) / 10;
  if (record.spec) {
    // Resolve as the server would: run each local action with sample form values
    // (field-less ones twice), then toggle the first row of each checklist.
    const spec = record.spec;
    const context = { inputs: Object.fromEntries(spec.inputs.map(i => [i.id, i.default])), timeZone: 'America/Argentina/Buenos_Aires', now: Date.now() };
    let state = h.normalizeState(spec, null);
    const taps = [];
    const sample = { text: 'Example', number: 12.5, toggle: true, date: new Date().toISOString().slice(0, 10) };
    for (const action of spec.actions) {
      // Destructive and clearing actions would empty the fixture before it is rendered.
      if (action.kind !== 'state' || action.style === 'destructive' || action.set.some(u => u.op === 'clear')) continue;
      const fields = Object.fromEntries(action.fields.map(f => [f.id, sample[f.kind]]));
      for (let tap = 0; tap < 2; tap++) {
        const next = h.applyUpdates(spec, action.set, state, { ...context, fields, state });
        taps.push({ action: action.id, ok: !!next });
        if (next) state = next;
      }
    }
    for (const component of spec.view.flatMap(c => c.type === 'section' ? c.children : [c])) {
      if (component.type !== 'checklist' || !component.done) continue;
      const update = h.directUpdate(spec, { state: component.state, op: 'toggle_item', index: 0 });
      const next = update && h.applyUpdates(spec, [update], state, { ...context, state });
      taps.push({ action: `toggle ${component.state}[0]`, ok: !!next });
      if (next) state = next;
    }
    const outputs = new Map(Object.entries(state)), errors = new Map();
    for (const step of spec.data) {
      if (step.type === 'mcp') { errors.set(step.id, 'NOT_AUTHORIZED'); continue; }
      if (step.type !== 'const' && errors.has(step.from)) { errors.set(step.id, errors.get(step.from)); continue; }
      try { outputs.set(step.id, h.transform(step, outputs, { ...context, state })); } catch (error) { errors.set(step.id, error.message); }
    }
    record.taps = taps;
    record.resolution = { revision: 1, inputs: context.inputs, resolvedAt: Date.now(), view: h.present(spec.view, spec, outputs, errors), issues: [...errors].map(([step, code]) => ({ step, code })), state, remote: false };
  }
  results.push(record);
  writeFileSync(join(out, `app-${String(index + 1).padStart(2, '0')}.json`), JSON.stringify({ title: record.spec?.title ?? prompt, inputs: record.spec?.inputs ?? [], resolution: record.resolution }, null, 1));
  console.log(`${index + 1}. ${record.spec ? 'OK  ' : 'FAIL'} ${record.seconds}s attempts=${record.attempts.length} ${record.error ?? record.attempts.filter(a => !a.ok).map(a => a.error).join(' | ')} :: ${prompt}`);
}
writeFileSync(join(out, 'results.json'), JSON.stringify(results, null, 1));
console.log(`${results.filter(r => r.spec).length}/${results.length} built. Details: ${join(out, 'results.json')}`);
