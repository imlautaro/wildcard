import { isRecord } from '../chat/meta';
import { sourceURL } from '../research/model';

// Home cards are declarative data in a closed catalog, like mini app components:
// each client draws every kind with its own native layout. Nothing here is code,
// markup or a remote reference a client would fetch, except validated https links.
export const cardKinds = ['headlines', 'matches', 'table', 'metrics', 'chart', 'tracker', 'note', 'list'] as const;
export type CardKind = typeof cardKinds[number];
export const homeIcons = ['news', 'sport', 'trophy', 'chart', 'money', 'globe', 'calendar', 'clock', 'book', 'heart', 'star',
  'bolt', 'list', 'check', 'person', 'chat', 'home', 'folder', 'cart', 'plane', 'doc', 'weather'] as const;
export const homeAccents = ['blue', 'green', 'orange', 'red', 'purple', 'teal', 'pink', 'indigo', 'gray'] as const;
const trends = ['up', 'down', 'flat'] as const;
const stepStates = ['done', 'current', 'upcoming'] as const;

// How long a card stays fresh before a curation run may compose it again.
export const cardLifetimes: Record<CardKind, number> = {
  headlines: 4 * 3_600_000, matches: 2 * 3_600_000, table: 12 * 3_600_000, metrics: 2 * 3_600_000,
  chart: 6 * 3_600_000, tracker: 24 * 3_600_000, note: 12 * 3_600_000, list: 12 * 3_600_000,
};

// What the composer is told about each kind. Keep in sync with parseCard.
export const kindGuide: Record<CardKind, string> = {
  headlines: 'News layout. items: 1-5 {title (max 140), summary (max 280), source (outlet name, max 60), url (article https URL from evidence), time (short label like "2 h ago" or "Oct 30", max 40)}. The first item is shown as the lead story, so put the most important one first.',
  matches: 'Sports fixtures/results. items: 1-8 {home, away (team names, max 40), homeScore, awayScore (integers, or null before kickoff), status (max 30, e.g. "FT", "Live 63\'", "Sat 21:00"), detail (max 60, e.g. scorers or venue)}. Put the competition or matchday in subtitle.',
  table: 'Compact table such as standings. columns: 2-5 short headers (max 20). rows: 1-12 arrays with exactly one cell per column (max 24 each, strings). highlight: optional zero-based row index to emphasize (for example the person\'s team). caption: optional (max 140).',
  metrics: 'Key figures as tiles. items: 1-6 {label (max 40), value (formatted, max 24), unit (max 12), change (max 16, e.g. "+1.2%"), trend ("up", "down" or "flat"), caption (max 80)}.',
  chart: 'One series chart. style: "line" or "bar". points: 2-31 {label (max 16, e.g. a date), value (number)} in chronological order. unit (max 12), value (current headline value, max 24), change (max 16), trend, summary (one sentence, max 200).',
  tracker: 'Progress of a process or wait (application, shipment, goal). figure (the key number, max 24, e.g. "14.5 months"), figureLabel (what it means, max 80), status (max 120), progress (0 to 1, optional), steps: 0-6 {label (max 60), state ("done", "current" or "upcoming"), detail (max 80)}, note (max 280).',
  note: 'A short personal note from you to the person. text (max 500): a useful tip, reminder or thought grounded in what you know. prompt (max 200, optional): a message the person could send you to continue, in their language.',
  list: 'Generic list. items: 1-8 {title (max 120), detail (max 160), trailing (short value or date, max 24), url (optional https URL from evidence)}.',
};

export type HomeCard = {
  kind: CardKind; title: string; subtitle?: string; icon: typeof homeIcons[number]; accent: typeof homeAccents[number];
  sources: { title: string; url: string }[];
} & Record<string, unknown>;

class CardError extends Error {}
const fail = (message: string): never => { throw new CardError(message); };

function text(value: unknown, path: string, max: number, required = true): string | undefined {
  if (value === undefined || value === null || value === '') return required ? fail(`${path} is required.`) : undefined;
  if (typeof value !== 'string') return fail(`${path} must be a string.`);
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) return required ? fail(`${path} is required.`) : undefined;
  if (trimmed.includes('\0')) return fail(`${path} contains an invalid character.`);
  if (Array.from(trimmed).length > max) return fail(`${path} is longer than ${max} characters.`);
  return trimmed;
}

function choice<T extends string>(value: unknown, path: string, options: readonly T[], fallback?: T): T {
  if ((value === undefined || value === null || value === '') && fallback) return fallback;
  if (typeof value !== 'string' || !options.includes(value as T)) return fail(`${path} must be one of ${options.join(', ')}.`);
  return value as T;
}

function list(value: unknown, path: string, min: number, max: number): unknown[] {
  if (!Array.isArray(value)) return fail(`${path} must be an array.`);
  if (value.length < min || value.length > max) return fail(`${path} must have ${min}-${max} entries.`);
  return value;
}

function object(value: unknown, path: string, keys: string[]): Record<string, unknown> {
  if (!isRecord(value)) return fail(`${path} must be an object.`);
  const unknown = Object.keys(value).find(key => !keys.includes(key));
  if (unknown) fail(`${path}.${unknown} is not supported here; allowed: ${keys.join(', ')}.`);
  return value;
}

function link(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const url = sourceURL(value);
  if (!url) return fail(`${path} must be a public http(s) URL copied from evidence.`);
  return url;
}

function score(value: unknown, path: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 999) return fail(`${path} must be an integer or null.`);
  return value as number;
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

const common = ['kind', 'title', 'subtitle', 'icon', 'accent', 'sources'];
const fields: Record<CardKind, string[]> = {
  headlines: ['items'], matches: ['items'], table: ['columns', 'rows', 'highlight', 'caption'], metrics: ['items'],
  chart: ['style', 'points', 'unit', 'value', 'change', 'trend', 'summary'],
  tracker: ['figure', 'figureLabel', 'status', 'progress', 'steps', 'note'], note: ['text', 'prompt'], list: ['items'],
};

function body(kind: CardKind, card: Record<string, unknown>): Record<string, unknown> {
  switch (kind) {
    case 'headlines': return { items: list(card.items, 'items', 1, 5).map((raw, index) => {
      const item = object(raw, `items[${index}]`, ['title', 'summary', 'source', 'url', 'time']);
      return compact({ title: text(item.title, `items[${index}].title`, 140), summary: text(item.summary, `items[${index}].summary`, 280, false),
        source: text(item.source, `items[${index}].source`, 60, false), url: link(item.url, `items[${index}].url`), time: text(item.time, `items[${index}].time`, 40, false) });
    }) };
    case 'matches': return { items: list(card.items, 'items', 1, 8).map((raw, index) => {
      const item = object(raw, `items[${index}]`, ['home', 'away', 'homeScore', 'awayScore', 'status', 'detail']);
      return compact({ home: text(item.home, `items[${index}].home`, 40), away: text(item.away, `items[${index}].away`, 40),
        homeScore: score(item.homeScore, `items[${index}].homeScore`), awayScore: score(item.awayScore, `items[${index}].awayScore`),
        status: text(item.status, `items[${index}].status`, 30), detail: text(item.detail, `items[${index}].detail`, 60, false) });
    }) };
    case 'table': {
      const columns = list(card.columns, 'columns', 2, 5).map((value, index) => text(value, `columns[${index}]`, 20)!);
      const rows = list(card.rows, 'rows', 1, 12).map((raw, row) => list(raw, `rows[${row}]`, columns.length, columns.length)
        .map((cell, index) => text(typeof cell === 'number' ? String(cell) : cell, `rows[${row}][${index}]`, 24, false) ?? ''));
      const highlight = card.highlight === undefined || card.highlight === null ? undefined
        : Number.isInteger(card.highlight) && (card.highlight as number) >= 0 && (card.highlight as number) < rows.length ? card.highlight as number
        : fail('highlight must be a row index.');
      return compact({ columns, rows, highlight, caption: text(card.caption, 'caption', 140, false) });
    }
    case 'metrics': return { items: list(card.items, 'items', 1, 6).map((raw, index) => {
      const item = object(raw, `items[${index}]`, ['label', 'value', 'unit', 'change', 'trend', 'caption']);
      return compact({ label: text(item.label, `items[${index}].label`, 40), value: text(typeof item.value === 'number' ? String(item.value) : item.value, `items[${index}].value`, 24),
        unit: text(item.unit, `items[${index}].unit`, 12, false), change: text(item.change, `items[${index}].change`, 16, false),
        trend: item.trend === undefined || item.trend === null || item.trend === '' ? undefined : choice(item.trend, `items[${index}].trend`, trends),
        caption: text(item.caption, `items[${index}].caption`, 80, false) });
    }) };
    case 'chart': return compact({ style: choice(card.style, 'style', ['line', 'bar'] as const, 'line'),
      points: list(card.points, 'points', 2, 31).map((raw, index) => {
        const point = object(raw, `points[${index}]`, ['label', 'value']);
        if (typeof point.value !== 'number' || !Number.isFinite(point.value) || Math.abs(point.value) > 1e15) fail(`points[${index}].value must be a finite number.`);
        return { label: text(typeof point.label === 'number' ? String(point.label) : point.label, `points[${index}].label`, 16)!, value: point.value as number };
      }),
      unit: text(card.unit, 'unit', 12, false), value: text(typeof card.value === 'number' ? String(card.value) : card.value, 'value', 24, false),
      change: text(card.change, 'change', 16, false), trend: card.trend === undefined || card.trend === null || card.trend === '' ? undefined : choice(card.trend, 'trend', trends),
      summary: text(card.summary, 'summary', 200, false) });
    case 'tracker': {
      const progress = card.progress === undefined || card.progress === null ? undefined
        : typeof card.progress === 'number' && card.progress >= 0 && card.progress <= 1 ? card.progress : fail('progress must be a number from 0 to 1.');
      return compact({ figure: text(typeof card.figure === 'number' ? String(card.figure) : card.figure, 'figure', 24), figureLabel: text(card.figureLabel, 'figureLabel', 80),
        status: text(card.status, 'status', 120, false), progress,
        steps: card.steps === undefined || card.steps === null ? undefined : list(card.steps, 'steps', 0, 6).map((raw, index) => {
          const step = object(raw, `steps[${index}]`, ['label', 'state', 'detail']);
          return compact({ label: text(step.label, `steps[${index}].label`, 60), state: choice(step.state, `steps[${index}].state`, stepStates),
            detail: text(step.detail, `steps[${index}].detail`, 80, false) });
        }),
        note: text(card.note, 'note', 280, false) });
    }
    case 'note': return compact({ text: text(card.text, 'text', 500), prompt: text(card.prompt, 'prompt', 200, false) });
    case 'list': return { items: list(card.items, 'items', 1, 8).map((raw, index) => {
      const item = object(raw, `items[${index}]`, ['title', 'detail', 'trailing', 'url']);
      return compact({ title: text(item.title, `items[${index}].title`, 120), detail: text(item.detail, `items[${index}].detail`, 160, false),
        trailing: text(item.trailing, `items[${index}].trailing`, 24, false), url: link(item.url, `items[${index}].url`) });
    }) };
  }
}

/** Validates a composed card, returning a precise error the composer can repair. */
export function parseCard(raw: unknown): { card: HomeCard } | { error: string } {
  try {
    if (!isRecord(raw)) fail('card must be an object.');
    const card = raw as Record<string, unknown>;
    const kind = choice(card.kind, 'kind', cardKinds);
    object(card, 'card', [...common, ...fields[kind]]);
    const sources = card.sources === undefined || card.sources === null ? [] : list(card.sources, 'sources', 0, 5).map((value, index) => {
      const source = object(value, `sources[${index}]`, ['title', 'url']);
      return { title: text(source.title, `sources[${index}].title`, 120) ?? 'Source', url: link(source.url, `sources[${index}].url`) ?? fail(`sources[${index}].url is required.`) };
    });
    const parsed = compact({ kind, title: text(card.title, 'title', 60)!, subtitle: text(card.subtitle, 'subtitle', 100, false),
      icon: choice(card.icon, 'icon', homeIcons, 'star'), accent: choice(card.accent, 'accent', homeAccents, 'blue'),
      ...body(kind, card), sources }) as HomeCard;
    if (JSON.stringify(parsed).length > 12_000) fail('card is too large; shorten texts or use fewer items.');
    return { card: parsed };
  } catch (error) {
    if (error instanceof CardError) return { error: error.message };
    throw error;
  }
}
