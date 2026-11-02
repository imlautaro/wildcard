// Static check for the web app and marketing site translations (docs/localization.md).
// For each app it verifies that every locale has exactly the English keys, that each
// message compiles with vue-i18n's message compiler (no stray `@ { } | $`, no HTML),
// that named placeholders and plural branches match English, and that every literal
// key used in the source exists. Emits nothing; exits 1 on any problem.
//
//   node scripts/check-locales.mjs            # apps/web and apps/site
//   node scripts/check-locales.mjs apps/web   # one app
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { baseCompile } from '@intlify/message-compiler';

const root = fileURLToPath(new URL('..', import.meta.url));
const apps = process.argv.slice(2).length ? process.argv.slice(2) : ['apps/web', 'apps/site'];
const sourceLocale = 'en';
let problems = 0;
const report = (message) => { problems++; console.error(`  ${message}`); };

function files(dir, test) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules' || name.startsWith('.')) return [];
    return statSync(path).isDirectory() ? files(path, test) : test(path) ? [path] : [];
  });
}

function flatten(value, prefix, out) {
  if (typeof value === 'string') out.set(prefix, value);
  else if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) flatten(child, prefix ? `${prefix}.${key}` : key, out);
  } else out.set(prefix, value);
  return out;
}

// i18n/locales/<locale>/<area>.json or i18n/locales/<locale>.json
function loadLocales(app) {
  const dir = join(root, app, 'i18n', 'locales');
  const locales = new Map();
  for (const path of files(dir, (path) => path.endsWith('.json'))) {
    const parts = relative(dir, path).split(sep);
    const locale = parts.length > 1 ? parts[0] : parts[0].replace(/\.json$/, '');
    let data;
    try { data = JSON.parse(readFileSync(path, 'utf8')); } catch (error) { report(`${relative(root, path)}: invalid JSON (${error.message})`); continue; }
    const messages = locales.get(locale) ?? new Map();
    for (const [key, value] of flatten(data, '', new Map())) {
      if (messages.has(key)) report(`${locale}: duplicate key ${key} (${relative(root, path)})`);
      messages.set(key, value);
    }
    locales.set(locale, messages);
  }
  return locales;
}

const placeholders = (message) => [...message.matchAll(/\{\s*([A-Za-z_][\w]*)\s*\}/g)].map((match) => match[1]).sort().join(',');
const branches = (message) => message.split(/(?<!\{'?)\s\|\s(?!'?\})/).length;

function checkMessage(app, locale, key, message) {
  if (typeof message !== 'string') return report(`${locale}: ${key} is not a string`);
  if (!message.trim()) report(`${locale}: ${key} is empty`);
  if (/<\/?[a-z][^>]*>/i.test(message)) report(`${locale}: ${key} contains HTML (use <i18n-t> instead): ${message}`);
  baseCompile(message, { onError: (error) => report(`${locale}: ${key} does not compile (${error.message}): ${message}`) });
}

function sourceKeys(app) {
  const keys = new Map();
  const pattern = /(?:\$t|\bt|\btranslate|\bte|\btm|\$te|\$tm)\(\s*(['"`])([A-Za-z0-9_.-]+)\1/g;
  const keypath = /keypath="([A-Za-z0-9_.-]+)"/g;
  for (const path of files(join(root, app, 'app'), (path) => /\.(vue|ts)$/.test(path))) {
    const text = readFileSync(path, 'utf8');
    for (const match of text.matchAll(pattern)) keys.set(match[2], relative(root, path));
    for (const match of text.matchAll(keypath)) keys.set(match[1], relative(root, path));
  }
  return keys;
}

for (const app of apps) {
  console.log(`${app}`);
  const before = problems;
  const locales = loadLocales(app);
  const source = locales.get(sourceLocale);
  if (!source) { report(`no ${sourceLocale} messages`); continue; }
  for (const [locale, messages] of locales) {
    for (const [key, message] of messages) checkMessage(app, locale, key, message);
    if (locale === sourceLocale) continue;
    for (const key of source.keys()) if (!messages.has(key)) report(`${locale}: missing ${key}`);
    for (const key of messages.keys()) if (!source.has(key)) report(`${locale}: extra key ${key}`);
    for (const [key, message] of messages) {
      const english = source.get(key);
      if (typeof english !== 'string' || typeof message !== 'string') continue;
      if (placeholders(english) !== placeholders(message)) report(`${locale}: ${key} placeholders {${placeholders(message)}} differ from English {${placeholders(english)}}`);
      if (branches(english) !== branches(message)) report(`${locale}: ${key} has ${branches(message)} plural branches, English has ${branches(english)}`);
    }
  }
  for (const [key, path] of sourceKeys(app)) {
    // A literal prefix of a dynamic key (t(`miniapps.issue.${code}`)) is not a key.
    if (!source.has(key) && ![...source.keys()].some((known) => known.startsWith(`${key}.`))) report(`unknown key ${key} used in ${path}`);
  }
  console.log(problems === before ? `  ok (${source.size} messages, ${locales.size} locales)` : '');
}
process.exit(problems ? 1 : 0);
