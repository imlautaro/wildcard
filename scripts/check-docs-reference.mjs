import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMarkdown } from '@nuxtjs/mdc/runtime';

// Static content validation, using the same Markdown compiler as the docs site.
const root = fileURLToPath(new URL('../', import.meta.url));
const content = path.join(root, 'apps/docs/content');
const pages = new Map();
const errors = [];
const asset = await readFile(path.join(root, 'apps/docs/public/reference-assets/workers-build-paths.json'), 'utf8');
JSON.parse(asset);
if (asset !== await readFile(path.join(root, 'docs/workers-build-paths.json'), 'utf8')) {
  errors.push('Reference build-path configuration is stale; prepare the reference again.');
}

async function visit(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, item.name);
    if (item.isDirectory()) await visit(filename);
    else if (item.name.endsWith('.md')) {
      const relative = path.relative(content, filename);
      const route = '/' + relative.replace(/\.md$/, '').split(path.sep)
        .map(part => part.replace(/^\d+\./, '')).join('/').replace(/\/index$/, '');
      const markdown = await readFile(filename, 'utf8');
      // A fresh compiler keeps duplicate-heading counters local to each page.
      const parsed = await parseMarkdown(markdown, { highlight: false });
      const ids = new Set();
      const links = [];
      function inspect(node) {
        if (node.props?.id) {
          if (ids.has(node.props.id)) errors.push(`${relative}: duplicate section ${node.props.id}`);
          ids.add(node.props.id);
        }
        for (const key of ['href', 'to']) {
          if (typeof node.props?.[key] === 'string') links.push(node.props[key]);
        }
        for (const child of node.children || []) inspect(child);
      }
      inspect(parsed.body);
      if (pages.has(route)) errors.push(`Duplicate route: ${route}`);
      pages.set(route, { ids, links, relative });
    }
  }
}
await visit(content);
for (const [route, page] of pages) {
  for (const link of page.links) {
    if (/^(?:[a-z]+:|\/\/)/i.test(link)) continue;
    const target = new URL(link, `https://docs.invalid${route}`);
    if (target.pathname.startsWith('/reference-assets/')) {
      if (target.pathname !== '/reference-assets/workers-build-paths.json') errors.push(`${page.relative}: unknown asset ${link}`);
      continue;
    }
    const destination = pages.get(target.pathname.replace(/\/$/, ''));
    if (!destination) errors.push(`${page.relative}: missing page ${link}`);
    else if (target.hash && !destination.ids.has(decodeURIComponent(target.hash.slice(1)))) {
      errors.push(`${page.relative}: missing section ${link}`);
    }
  }
}
for (const locale of ['en', 'es']) {
  for (const guide of (await readdir(path.join(root, 'docs'))).filter(name => name.endsWith('.md'))) {
    if (!pages.has(`/${locale}/reference/${guide.slice(0, -3)}`)) errors.push(`Missing ${locale} reference: ${guide}`);
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Checked ${pages.size} pages: complete bilingual reference, Markdown, links and section anchors.`);
}
