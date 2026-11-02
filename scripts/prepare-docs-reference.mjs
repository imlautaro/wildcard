import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseMarkdown } from '@nuxtjs/mdc/runtime';

// Publish the maintained guides without committing or editing generated copies.
const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'docs');
const names = (await readdir(source)).filter(name => name.endsWith('.md')).sort();
const known = new Set(names);
const guides = await Promise.all(names.map(async name => {
  const markdown = await readFile(path.join(source, name), 'utf8');
  const title = markdown.match(/^# (.+)$/m)?.[1];
  if (!title) throw new Error(`Missing guide title: docs/${name}`);
  return { name, title, markdown };
}));

function rewrite(markdown, locale) {
  // Only rewrite prose: code examples must retain their original paths/content.
  const section = fragment => fragment.replace(/-+/g, '-').replace(/^-|-$/g, '').replace(/^(\d)/, '_$1');
  let fence;
  return markdown.split('\n').map(line => {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = undefined;
      return line;
    }
    if (fence) return line;
    const linked = line.replace(/\]\(([^)]+)\)/g, (original, target) => {
      if (/^(?:[a-z]+:|\/)/i.test(target)) return original;
      if (target.startsWith('#')) return `](#${section(target.slice(1))})`;
      const [filename, fragment] = target.split('#');
      if (known.has(filename)) return `](/${locale}/reference/${filename.slice(0, -3)}${fragment ? `#${section(fragment)}` : ''})`;
      if (filename === 'workers-build-paths.json') return `](/${locale}/reference/workers-build-paths)`;
      // Repository working agreements are not part of the public feature guides.
      if (filename === '../AGENTS.md') return `](/${locale}/operations/contributing)`;
      throw new Error(`Unmapped reference link: ${target}`);
    });
    return linked.replace(/(?<!\[)`docs\/([a-z0-9-]+)\.md`/g, (original, name) => {
      if (!known.has(`${name}.md`)) throw new Error(`Unknown guide reference: ${original}`);
      return `[${original}](/${locale}/reference/${name})`;
    });
  }).join('\n');
}

async function preserveSectionAnchors(english, spanish, name) {
  async function inspect(markdown) {
    const parsed = await parseMarkdown(markdown, { highlight: false, keepPosition: true });
    const result = { headings: [], code: [], links: [], rows: 0 };
    function text(node) {
      return node.value ?? (node.children || []).map(text).join('');
    }
    function visit(node) {
      if (/^h[2-6]$/.test(node.tag)) result.headings.push(node);
      if (node.tag === 'code') result.code.push(text(node));
      if (node.tag === 'a' && node.props?.href) result.links.push(node.props.href);
      if (node.tag === 'tr') result.rows++;
      for (const child of node.children || []) visit(child);
    }
    visit(parsed.body);
    return result;
  }
  const source = await inspect(english);
  const translation = await inspect(spanish);
  source.code.sort();
  translation.code.sort();
  source.links.sort();
  translation.links.sort();
  for (const field of ['code', 'links', 'rows']) {
    if (JSON.stringify(source[field]) !== JSON.stringify(translation[field])) throw new Error(`Translation ${field} differs from source: ${name}`);
  }
  const originals = source.headings;
  const translated = translation.headings;
  if (originals.length !== translated.length) throw new Error(`Section coverage differs in Spanish: ${name}`);
  for (let index = translated.length - 1; index >= 0; index--) {
    const original = originals[index];
    const heading = translated[index];
    if (original.tag !== heading.tag) throw new Error(`Section hierarchy differs in Spanish: ${name}`);
    if (original.props.id === heading.props.id) continue;
    const offset = heading.position?.start;
    if (offset == null) throw new Error(`Missing section position: ${name}`);
    spanish = spanish.slice(0, offset) + `<div id="${original.props.id}" style="scroll-margin-top: 6rem"></div>\n\n` + spanish.slice(offset);
  }
  return spanish;
}

const translations = path.join(root, 'apps/docs/reference/es');
const buildPaths = await readFile(path.join(source, 'workers-build-paths.json'), 'utf8');
JSON.parse(buildPaths);
const revisions = JSON.parse(await readFile(path.join(translations, 'sources.json'), 'utf8'));
for (const name of (await readdir(translations)).filter(name => name.endsWith('.md'))) {
  if (!known.has(name)) throw new Error(`Remove the obsolete Spanish reference translation: ${name}`);
}
for (const name of Object.keys(revisions)) {
  if (!known.has(name)) throw new Error(`Remove the obsolete Spanish source revision: ${name}`);
}
for (const { name, markdown } of guides) {
  const digest = createHash('sha256').update(markdown).digest('hex');
  if (revisions[name] !== digest) throw new Error(`Update the full Spanish translation and sources.json for docs/${name}.`);
  await readFile(path.join(translations, name), 'utf8');
}
for (const locale of ['en', 'es']) {
  const destination = path.join(root, 'apps/docs/content', locale, '6.reference');
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  const label = locale === 'es' ? 'Referencia' : 'Reference';
  await writeFile(path.join(destination, '.navigation.yml'), `title: ${label}\nicon: i-lucide-library\n`);
  const entries = [];
  for (const { name, title, markdown } of guides) {
    const localized = locale === 'en' ? markdown : await readFile(path.join(translations, name), 'utf8');
    const heading = localized.match(/^# (.+)$/m)?.[1];
    if (!heading) throw new Error(`Missing translated guide title: ${name}`);
    let body = localized.replace(/^# .+\r?\n/m, '');
    if (locale === 'es') body = await preserveSectionAnchors(markdown.replace(/^# .+\r?\n/m, ''), body, name);
    body = rewrite(body, locale);
    const description = locale === 'es' ? `Guía técnica completa: ${heading}.` : `Complete technical guide: ${title}.`;
    await writeFile(path.join(destination, name), `---\ntitle: ${JSON.stringify(heading)}\ndescription: ${JSON.stringify(description)}\n---\n\n${body.trim()}\n`);
    entries.push(`- [${heading}](/${locale}/reference/${name.slice(0, -3)})`);
  }
  const configurationTitle = locale === 'es' ? 'Filtros de builds' : 'Build watch paths';
  const configurationIntro = locale === 'es'
    ? 'Configuración reproducible de los filtros de Cloudflare Workers Builds. Se aplica en el panel; Wrangler no la aplica automáticamente.'
    : 'Reproducible Cloudflare Workers Builds path filters. Apply these in the dashboard; Wrangler does not apply them automatically.';
  await writeFile(path.join(destination, 'workers-build-paths.md'), `---\ntitle: ${configurationTitle}\n---\n\n${configurationIntro}\n\n\`\`\`json\n${buildPaths.trim()}\n\`\`\`\n`);
  entries.push(`- [${configurationTitle}](/${locale}/reference/workers-build-paths)`);
  const intro = locale === 'es'
    ? 'Guías completas de funciones, configuración y operaciones. Incluyen contratos de API, migraciones, permisos, reglas de caché y estado de verificación.'
    : 'Complete feature, setup and operations guides, including API contracts, migrations, permissions, cache rules and verification status.';
  await writeFile(path.join(destination, '1.overview.md'), `---\ntitle: ${label}\n---\n\n${intro}\n\n${entries.join('\n')}\n`);
}
const assets = path.join(root, 'apps/docs/public/reference-assets');
await mkdir(assets, { recursive: true });
await writeFile(path.join(assets, 'workers-build-paths.json'), await readFile(path.join(source, 'workers-build-paths.json')));
console.log(`Prepared ${guides.length} complete reference guides.`);
