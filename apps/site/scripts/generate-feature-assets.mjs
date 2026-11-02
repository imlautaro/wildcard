// Fictional marketing assets through the real app generators, without D1/R2 writes.
// Usage: node apps/site/scripts/generate-feature-assets.mjs [coco-sticker pixel-sticker ivy-selfie mila-selfie bakery]
// Calls paid Meta Muse Image, Muse Spark (face checks) and SAM APIs. Never logs credentials.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = process.env.FEATURE_ASSETS_OUT || join(root, 'apps/site/public/features');
mkdirSync(output, { recursive: true });
const vars = readFileSync(join(root, 'apps/api/.dev.vars'), 'utf8');
const META_API_KEY = vars.match(/^META_API_KEY=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '');
if (!META_API_KEY) throw new Error('Set META_API_KEY in apps/api/.dev.vars first.');
const env = { META_API_KEY };
const work = mkdtempSync(join(tmpdir(), 'wildcard-feature-assets-'));
const bundle = join(work, 'generators.mjs');
const esbuild = createRequire(join(root, 'package.json'))('esbuild');
await esbuild.build({
  stdin: { contents: `export { expressionImage, photoShowsFace } from './apps/api/src/stickers/tools.ts';
export { cutout } from './apps/api/src/stickers/cutout.ts';
export { requestImage } from './apps/api/src/photos/generation.ts';`, resolveDir: root },
  bundle: true, platform: 'node', format: 'esm', outfile: bundle, logLevel: 'warning',
  plugins: [
    { name: 'workflows-stub', setup(build) {
      build.onResolve({ filter: /^cloudflare:workflows$/ }, () => ({ path: 'stub', namespace: 'stub' }));
      build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export class NonRetryableError extends Error {}' }));
    } },
    // Expose the private provider helper only in this temporary Node bundle.
    // Its source, request options, parsing and validation stay identical to the app.
    { name: 'chat-image-entry', setup(build) {
      build.onLoad({ filter: /\/photos\/generation\.ts$/ }, ({ path }) => ({
        contents: `${readFileSync(path, 'utf8')}\nexport { requestImage };`, loader: 'ts',
      }));
    } },
  ],
});
const { expressionImage, photoShowsFace, cutout, requestImage } = await import(pathToFileURL(bundle).href);
const avatar = id => new Uint8Array(readFileSync(join(root, `apps/site/public/contacts/cartoon/${id}.jpg`)));
const definitions = {
  'coco-sticker': { contact: 'coco', expression: 'Delighted laugh, eyes joyfully closed, both front paws raised in celebration.' },
  'pixel-sticker': { contact: 'pixel', expression: 'Excited celebration, cheerful smiling face, both robot hands giving thumbs up.' },
  'ivy-selfie': { contact: 'ivy', prompt: 'A playful arm-length selfie of Ivy after a run in a leafy park, coral running top, auburn ponytail and headband, happy expression, warm morning light. Reference 1 supplies Ivy\'s avatar identity. Preserve her face and the clean 2D cartoon illustration style, dark outlines and warm flat colors. Show her shoulders, face and park scenery. No text or watermark.' },
  'mila-selfie': { contact: 'mila', prompt: 'A playful arm-length selfie of Mila at a cozy cafe, holding a cup of coffee, chestnut bob, freckles, glasses on her head, mustard sweater and white collar, warm smile. Reference 1 supplies Mila\'s avatar identity. Preserve her face and the clean 2D cartoon illustration style, dark outlines and warm flat colors. Warm afternoon light, cafe window in the background. No text or watermark.' },
  bakery: { prompt: 'A cozy small neighborhood bakery interior at morning opening, fresh golden croissants on a wooden counter, a vase of flowers, warm sunlight through the window. Clean 2D cartoon illustration, crisp dark outlines, rounded shapes, flat warm colors with minimal cel shading. A charming image sent in a conversation about a bakery opening. No people, no text, no watermark.' },
};
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(definitions);
let failed = false;
await Promise.all(ids.map(async id => {
  try {
    const item = definitions[id];
    if (!item) throw new Error('Unknown asset');
    if (item.expression) {
      const reference = avatar(item.contact);
      if (!await photoShowsFace(env, reference)) throw new Error('Reference face check failed');
      const source = await expressionImage(env, reference, item.expression);
      const result = await cutout(env, source);
      writeFileSync(join(output, `${id}.png`), result.png);
    } else {
      const result = await requestImage(env, {
        prompt: item.prompt, aspectRatio: '3:4', imageSearch: false,
        refs: item.contact ? [{ kind: 'agent', memberID: item.contact }] : [],
        inputs: item.contact ? [{ image_url: `data:image/jpeg;base64,${Buffer.from(avatar(item.contact)).toString('base64')}` }] : [],
      });
      const original = join(work, `${id}.jpg`);
      writeFileSync(original, result.bytes);
      execFileSync('sips', ['-Z', '640', '-s', 'format', 'jpeg', '-s', 'formatOptions', '82', original, '--out', join(output, `${id}.jpg`)], { stdio: 'ignore' });
    }
    console.log(id, 'written');
  } catch (error) {
    failed = true;
    console.error(id, 'failed:', error instanceof Error ? error.message : 'Unknown generation error');
  }
}));
if (failed) process.exitCode = 1;
