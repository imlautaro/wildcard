import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';

// Exports the connector library logos used by the web app (apps/web/app/utils/connectorLogos.ts)
// from the pinned @iconify-json/logos package into the iOS asset catalog as vector
// imagesets named ConnectorLogos/<preset ID>. Run after changing that map:
//   node scripts/export-connector-logos.mjs
const source = readFileSync(new URL('../apps/web/app/utils/connectorLogos.ts', import.meta.url), 'utf8');
const logos = Object.fromEntries([...source.matchAll(/^\s*'?([a-z0-9-]+)'?: 'logos:([a-z0-9-]+)',$/gm)].map(match => [match[1], match[2]]));
if (!Object.keys(logos).length) throw new Error('No connector logos found.');
const collection = JSON.parse(readFileSync(new URL('../node_modules/@iconify-json/logos/icons.json', import.meta.url), 'utf8'));
const folder = new URL('../apps/ios/Wildcard/Assets.xcassets/ConnectorLogos/', import.meta.url);
const json = value => `${JSON.stringify(value, null, 2)}\n`;

rmSync(folder, { recursive: true, force: true });
mkdirSync(folder, { recursive: true });
writeFileSync(new URL('Contents.json', folder), json({ info: { author: 'xcode', version: 1 }, properties: { 'provides-namespace': true } }));
for (const [id, name] of Object.entries(logos)) {
  const alias = collection.aliases?.[name];
  const icon = collection.icons[name] ?? (alias && collection.icons[alias.parent]);
  if (!icon) throw new Error(`Unknown logo logos:${name} for ${id}.`);
  const width = icon.width ?? collection.width ?? 16, height = icon.height ?? collection.height ?? 16;
  const left = icon.left ?? 0, top = icon.top ?? 0;
  const imageset = new URL(`${id}.imageset/`, folder);
  mkdirSync(imageset);
  writeFileSync(new URL('logo.svg', imageset), `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="${left} ${top} ${width} ${height}">${icon.body}</svg>\n`);
  writeFileSync(new URL('Contents.json', imageset), json({
    images: [{ filename: 'logo.svg', idiom: 'universal' }],
    info: { author: 'xcode', version: 1 },
    properties: { 'preserves-vector-representation': true },
  }));
}
console.log(`Exported ${readdirSync(folder).filter(entry => entry.endsWith('.imageset')).length} connector logos.`);
