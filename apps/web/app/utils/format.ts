import type { MiniAppFormat, MiniAppStateValue, MiniAppUpdate, Presence } from './types';

// Dates and numbers follow the app locale (docs/localization.md), not the raw browser
// locale, so a Spanish UI never mixes in English month names. Formatters are cached
// per locale; reading appLocale() inside a computed re-renders on a language change.
const formatterCache = new Map<string, Intl.DateTimeFormat>();
function dateFormat(name: string, options: Intl.DateTimeFormatOptions) {
  const locale = appLocale();
  const key = `${locale}:${name}`;
  let formatter = formatterCache.get(key);
  if (!formatter) formatterCache.set(key, formatter = new Intl.DateTimeFormat(locale, options));
  return formatter;
}
const time = () => dateFormat('time', { hour: '2-digit', minute: '2-digit' });
const weekday = () => dateFormat('weekday', { weekday: 'long' });
const shortDate = () => dateFormat('shortDate', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTime = () => dateFormat('dateTime', { dateStyle: 'medium', timeStyle: 'short' });

function dayDelta(timestamp: number) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const day = new Date(timestamp);
  day.setHours(0, 0, 0, 0);
  return Math.round((start.getTime() - day.getTime()) / 86_400_000);
}

// Chat list dates: time today, "Yesterday", weekday within a week, otherwise a date.
export function listDate(timestamp: number) {
  const delta = dayDelta(timestamp);
  if (delta <= 0) return time().format(timestamp);
  if (delta === 1) return translate('common.yesterday');
  if (delta < 7) return weekday().format(timestamp);
  return shortDate().format(timestamp);
}

export function messageTime(timestamp: number) {
  return time().format(timestamp);
}

export function fullDate(timestamp: number) {
  return dateTime().format(timestamp);
}

export function dayLabel(timestamp: number) {
  const delta = dayDelta(timestamp);
  if (delta <= 0) return translate('common.today');
  if (delta === 1) return translate('common.yesterday');
  return shortDate().format(timestamp);
}

export function presenceLabel(presence: Presence | null | undefined) {
  if (!presence) return '';
  if (presence.status === 'online') return translate('common.online');
  if (presence.status === 'typing' && presence.isResearching) return translate('common.researching');
  if (presence.status === 'typing' && presence.isRecording) return translate('common.recording');
  if (presence.status === 'typing') return translate('common.typing');
  if (!presence.lastSeenAt) return translate('common.offline');
  const delta = dayDelta(presence.lastSeenAt);
  const at = time().format(presence.lastSeenAt);
  if (delta <= 0) return translate('common.lastSeenToday', { time: at });
  if (delta === 1) return translate('common.lastSeenYesterday', { time: at });
  return translate('common.lastSeenDate', { date: shortDate().format(presence.lastSeenAt), time: at });
}

export function fileSize(bytes: number) {
  const number = (value: number, digits: number) => value.toLocaleString(appLocale(), { maximumFractionDigits: digits, minimumFractionDigits: digits });
  if (bytes < 1024) return `${number(bytes, 0)} B`;
  if (bytes < 1024 * 1024) return `${number(Math.round(bytes / 1024), 0)} KB`;
  return `${number(bytes / 1024 / 1024, 1)} MB`;
}

export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0]![0]! + words.at(-1)![0]! : (words[0] ?? '?').slice(0, 2)).toUpperCase();
}

// Mini app values use the app locale, matching iOS FormatStyle output.
export function miniAppValue(value: number | string | null, format: MiniAppFormat, currency: string | null) {
  if (value === null) return '—';
  if (typeof value === 'number') {
    if (format === 'currency' && currency) return new Intl.NumberFormat(appLocale(), { style: 'currency', currency }).format(value);
    if (format === 'percent') return new Intl.NumberFormat(appLocale(), { style: 'percent', maximumFractionDigits: 1 }).format(value);
    if (format === 'number' || format === 'currency') return new Intl.NumberFormat(appLocale(), { maximumFractionDigits: 2 }).format(value);
  }
  if ((format === 'date' || format === 'datetime') && typeof value === 'string' && Number.isFinite(Date.parse(value))) {
    // Date-only values are calendar days, not instants: never shift them across time zones.
    const day = /^\d{4}-\d{2}-\d{2}$/.test(value);
    return new Intl.DateTimeFormat(appLocale(), day ? { dateStyle: 'medium', timeZone: 'UTC' } : { dateStyle: 'medium', ...(format === 'datetime' ? { timeStyle: 'short' } : {}) }).format(new Date(value));
  }
  return String(value);
}
// Issue codes with a message under `miniapps.issues.<CODE>`; any other code shows the generic one.
const miniAppIssues = new Set(['TOOL_ERROR', 'RESULT_NOT_JSON', 'TOOL_CHANGED', 'INVALID_ARGUMENTS', 'AUTHORIZATION_REQUIRED', 'CONNECTION_UNAVAILABLE',
  'NOT_AUTHORIZED', 'PATH_NOT_FOUND', 'NOT_A_LIST', 'TOO_MANY_ITEMS', 'TOO_MANY_GROUPS', 'RESULT_TOO_LARGE']);
export function miniAppIssue(code: string) { return miniAppIssues.has(code) ? translate(`miniapps.issues.${code}`) : translate('miniapps.issues.unknown'); }
// Mirrors the server's applyUpdates for literal values, so taps show before confirmation.
export function applyMiniAppUpdates(updates: MiniAppUpdate[], values: Record<string, MiniAppStateValue>) {
  const next = { ...values };
  for (const update of updates) {
    const current = next[update.state];
    if (current === undefined) continue;
    if (Array.isArray(current)) {
      if (update.op === 'clear') next[update.state] = [];
      // Client-only: a composer submission appends its prepared rows before the server confirms them.
      else if (update.op === 'append' && Array.isArray(update.value)) next[update.state] = [...current, ...update.value];
      else if (update.op === 'set_items' && update.field && update.value !== undefined && update.value !== null && !Array.isArray(update.value)) {
        const field = update.field, value = update.value;
        next[update.state] = current.map(item => ({ ...item, [field]: value }));
      }
      else if (update.op === 'remove_where' && update.field && update.value !== undefined && !Array.isArray(update.value)) {
        const field = update.field, value = update.value;
        next[update.state] = current.filter(item => item[field] !== value);
      }
      else if (update.index !== undefined && update.index < current.length && update.op === 'remove_item') next[update.state] = current.filter((_, index) => index !== update.index);
      else if (update.index !== undefined && update.index < current.length && update.op === 'toggle_item' && update.field) {
        const field = update.field;
        next[update.state] = current.map((item, index) => index === update.index ? { ...item, [field]: item[field] !== true } : item);
      }
      continue;
    }
    const number = typeof update.value === 'number' ? update.value : typeof update.value === 'string' && update.value.trim() && Number.isFinite(Number(update.value)) ? Number(update.value) : null;
    if (update.op === 'toggle' && typeof current === 'boolean') next[update.state] = !current;
    else if ((update.op === 'increment' || update.op === 'decrement') && typeof current === 'number') {
      const amount = update.value === undefined || update.value === null ? 1 : number;
      if (amount !== null) next[update.state] = current + (update.op === 'increment' ? amount : -amount);
    } else if (update.op === 'set') {
      if (typeof current === 'number' && number !== null) next[update.state] = number;
      else if (typeof current === 'string') next[update.state] = update.value === undefined || update.value === null ? '' : String(update.value);
      else if (typeof current === 'boolean' && typeof update.value === 'boolean') next[update.state] = update.value;
    }
  }
  return next;
}
// App, tab and tile icons share one closed catalog; tab and tile icons add a few.
const miniAppIcons = ['chart', 'list', 'money', 'calendar', 'cart', 'check', 'clock', 'star', 'bolt', 'folder', 'home', 'person', 'chat', 'book', 'trophy', 'heart', 'gear', 'grid'] as const;
export function miniAppIcon(icon: string | null): typeof miniAppIcons[number] {
  return miniAppIcons.includes(icon as typeof miniAppIcons[number]) ? icon as typeof miniAppIcons[number] : 'chart';
}
