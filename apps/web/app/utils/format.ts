import type { Presence } from './types';

const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
const shortDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

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
  if (delta <= 0) return time.format(timestamp);
  if (delta === 1) return 'Yesterday';
  if (delta < 7) return weekday.format(timestamp);
  return shortDate.format(timestamp);
}

export function messageTime(timestamp: number) {
  return time.format(timestamp);
}

export function fullDate(timestamp: number) {
  return dateTime.format(timestamp);
}

export function dayLabel(timestamp: number) {
  const delta = dayDelta(timestamp);
  if (delta <= 0) return 'Today';
  if (delta === 1) return 'Yesterday';
  return shortDate.format(timestamp);
}

export function presenceLabel(presence: Presence | null | undefined) {
  if (!presence) return '';
  if (presence.status === 'online') return 'Online';
  if (presence.status === 'typing') return 'Typing...';
  if (!presence.lastSeenAt) return 'Offline';
  const delta = dayDelta(presence.lastSeenAt);
  const at = time.format(presence.lastSeenAt);
  if (delta <= 0) return `Last seen today at ${at}`;
  if (delta === 1) return `Last seen yesterday at ${at}`;
  return `Last seen ${shortDate.format(presence.lastSeenAt)} at ${at}`;
}

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0]![0]! + words.at(-1)![0]! : (words[0] ?? '?').slice(0, 2)).toUpperCase();
}
