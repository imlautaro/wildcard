// Generates the marketing site's example portraits with the app's real portrait
// generator: apps/api/src/contacts/portrait.ts (Meta muse-image-1.0, the same
// per-style prompts and request options as contact creation). Only the appearance
// and personality text below is hand-written, so each portrait fits its role in the
// site's scenes; the app writes that text with Muse Spark.
//
// Usage (from the repository root, macOS for the resize step):
//   node apps/site/scripts/generate-portraits.mjs [mila theo …]
// Reads META_API_KEY from apps/api/.dev.vars (never printed). Calls the paid Meta
// image API once per portrait. Writes 384 px JPEGs to apps/site/public/contacts.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
// PORTRAITS_OUT writes elsewhere, for trying a prompt without replacing the site's files.
const output = process.env.PORTRAITS_OUT || join(root, 'apps/site/public/contacts');

const cast = {
  mila: {
    input: { style: 'cartoon' },
    identity: { age: 27, gender: 'female', portrait: 'Young woman with a wavy chestnut bob, warm brown eyes, light freckles, a big open smile; wears a mustard-yellow sweater over a white collar and small round glasses pushed up on her head.', description: 'Playful, curious friend who follows tech news obsessively, teases kindly and always has a hot take ready.' },
  },
  theo: {
    input: { style: 'realistic' },
    identity: { age: 34, gender: 'male', portrait: 'Man with short dark brown hair, a neatly trimmed beard, warm hazel eyes and a calm half smile; navy crewneck sweater over a white t-shirt; soft daylight from a window in a small café.', description: 'Grounded, practical work colleague who helps plan a small bakery launch; organized, dry sense of humor, follows up on details.' },
  },
  ivy: {
    input: { style: '3d' },
    identity: { age: 29, gender: 'female', portrait: 'Athletic young woman with auburn hair in a high ponytail, bright green eyes, rosy cheeks and an energetic grin; coral running top with a thin headband.', description: 'Upbeat, encouraging marathon coach who keeps you honest about rest days and pacing.' },
  },
  pixel: {
    input: { style: 'custom', customStyle: 'retro video game robots' },
    identity: { age: 25, gender: 'male', portrait: 'A small friendly boxy robot with a light gray metal head, two glowing cyan square eyes, a little antenna with a yellow light, a grille mouth and a purple chest panel with a red heart light.', description: 'Precise, cheerful study partner who turns hard topics into flashcards and celebrates every small win.' },
  },
  nova: {
    input: { style: 'anime' },
    identity: { age: 24, gender: 'female', portrait: 'Young woman with long lavender hair and straight bangs, large violet eyes, a soft confident smile; dark navy jacket with a white collar.', description: 'Thoughtful, quick learner and new project partner who asks sharp questions and likes to catch up fast.' },
  },
  coco: {
    input: { style: 'pets' },
    identity: { age: 30, gender: 'female', portrait: 'Fluffy orange tabby cat with big round amber eyes, white muzzle and chest, forehead stripes and a tiny teal collar with a bell.', description: 'Warm, attentive family helper who remembers everyone\'s plans and keeps the household on track.' },
  },
};

const vars = readFileSync(join(root, 'apps/api/.dev.vars'), 'utf8');
const META_API_KEY = vars.match(/^META_API_KEY=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '');
if (!META_API_KEY) throw new Error('Set META_API_KEY in apps/api/.dev.vars first.');

// Bundle the Worker module for Node, stubbing the one Workers-only import.
const esbuild = createRequire(join(root, 'package.json'))('esbuild');
const work = mkdtempSync(join(tmpdir(), 'wildcard-portraits-'));
const bundle = join(work, 'portrait.mjs');
await esbuild.build({
  entryPoints: [join(root, 'apps/api/src/contacts/portrait.ts')], bundle: true, platform: 'node', format: 'esm',
  outfile: bundle, logLevel: 'warning',
  plugins: [{ name: 'workflows-stub', setup(build) {
    build.onResolve({ filter: /^cloudflare:workflows$/ }, () => ({ path: 'stub', namespace: 'stub' }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export class NonRetryableError extends Error {}' }));
  } }],
});
const { generatePortrait } = await import(pathToFileURL(bundle).href);

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(cast);
await Promise.all(ids.map(async (id) => {
  if (!cast[id]) return console.log(id, 'unknown');
  try {
    const original = join(work, `${id}.jpg`);
    writeFileSync(original, await generatePortrait({ META_API_KEY }, cast[id].identity, cast[id].input));
    execFileSync('sips', ['-Z', '384', '-s', 'format', 'jpeg', '-s', 'formatOptions', '82', original, '--out', join(output, `${id}.jpg`)], { stdio: 'ignore' });
    console.log(id, 'written');
  } catch (error) {
    console.log(id, 'failed:', error instanceof Error ? error.message : error);
  }
}));
