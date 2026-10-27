import type { ChatTurn } from './types';

// Ports of apps/ios/Wildcard/Chat/ConversationSync.swift and GroupMemberColor.swift.

const receiptRank: Record<string, number> = { sent: 0, received: 1, read: 2 };

// Group receipts only advance Sent → Received → Read; a missing value keeps the current one.
export function mergeReceipt(current: string | null | undefined, incoming: string | null | undefined): string | null {
  if (incoming == null) return current ?? null;
  if (current == null) return incoming;
  return (receiptRank[incoming] ?? -1) >= (receiptRank[current] ?? -1) ? incoming : current;
}

const statusRank: Record<ChatTurn['status'], number> = { queued: 0, running: 1, failed: 2, complete: 3 };

// History, send acknowledgements, and pagination may arrive out of order. Prefer the
// later attempt, then the later update, then the more advanced status; keep the
// latest read evidence from either copy.
export function mergeTurn(current: ChatTurn, incoming: ChatTurn): ChatTurn {
  if (current.id !== incoming.id) return incoming;
  const newer = incoming.attempt > current.attempt || (incoming.attempt === current.attempt
    && (incoming.updatedAt > current.updatedAt
      || (incoming.updatedAt === current.updatedAt && statusRank[incoming.status] >= statusRank[current.status])));
  const result = { ...(newer ? incoming : current) };
  const reads = [current.readAt, incoming.readAt].filter((value): value is number => value != null);
  result.readAt = reads.length ? Math.max(...reads) : null;
  return result;
}

// Matches the API's chat list summary for the latest turn.
export function turnPreview(turn: ChatTurn) {
  const fallback = turn.scheduleID ? 'Scheduled message' : turn.groupRequestID ? 'Group response'
    : !turn.userText && turn.attachment ? `Attachment: ${turn.attachment.name}` : turn.userText;
  return [...(turn.assistantText ?? fallback)].slice(0, 500).join('');
}
export function turnTimestamp(turn: ChatTurn) {
  return turn.assistantText == null ? turn.createdAt : turn.updatedAt;
}
export function turnFromUser(turn: ChatTurn) {
  return turn.assistantText == null && !turn.scheduleID && !turn.groupRequestID;
}

// Paired dark inks (light mode) and light tints (dark mode) for sender labels.
const palette: [string, string][] = [
  ['#A12622', '#FFABA3'], ['#914600', '#FFC18A'], ['#725600', '#E8CF78'], ['#48651C', '#BDD98A'],
  ['#17683E', '#8ED8AF'], ['#006664', '#80D8D2'], ['#006487', '#8BD5F2'], ['#2456A6', '#A8C9FF'],
  ['#5843A8', '#C9B8FF'], ['#793699', '#E4AEF5'], ['#963365', '#F6ACD0'], ['#825044', '#E8BDAF'],
];
const fnvPrime = 1099511628211n;
const mask = (1n << 64n) - 1n;

// FNV-1a over `groupID/identity`, identical to iOS so both clients agree. Identity
// comes from the message (`agent/<id>`, `user/<id>`, or `message/<id>`), not membership.
export function senderColor(groupID: string, identity: string) {
  let hash = 14695981039346656037n;
  for (const byte of new TextEncoder().encode(`${groupID}/${identity}`)) {
    hash = ((hash ^ BigInt(byte)) * fnvPrime) & mask;
  }
  const [light, dark] = palette[Number(hash % BigInt(palette.length))]!;
  return { '--sender-light': light, '--sender-dark': dark };
}
