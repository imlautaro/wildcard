import type { DraftAttachment, GroupMessage, GroupMessagesPage, GroupSnapshot } from '~/utils/types';

// Session cache of group conversations, mirroring useConversation. A pending send
// becomes `accepted` (Sent) on HTTP acceptance, before the follow-up history
// request; history then replaces it by UUID.
export type GroupPending = { id: string; text: string; attachment: DraftAttachment | null; failed: string | null; accepted: boolean; createdAt: number };
export type GroupConversation = {
  snapshot: GroupSnapshot | null;
  messages: GroupMessage[];
  nextBefore: number | null;
  loaded: boolean;
  error: string | null;
  unavailable: boolean;
  pending: GroupPending | null;
  draft: string;
  loadingEarlier: boolean;
  revision: number;
};

// Recipient acknowledgements, outside reactivity. Deduplication keeps polling from
// re-sending IDs (the API allows 120 receipt writes per minute per account).
type Receipts = { received: Set<string>; read: Set<string>; pendingRead: Set<string>; inFlight: Set<string> };

const groups = shallowReactive(new Map<string, GroupConversation>());
const receipts = new Map<string, Receipts>();
const retained = 20;
const catchUpPages = 10;
const batch = 100;

registerSessionReset(() => {
  for (const group of groups.values()) if (group.pending?.attachment?.previewURL) URL.revokeObjectURL(group.pending.attachment.previewURL);
  groups.clear();
  receipts.clear();
});

export function peekGroupConversation(id: string): GroupConversation | undefined {
  return groups.get(id);
}

function entryFor(id: string): GroupConversation {
  let entry = groups.get(id);
  if (entry) {
    groups.delete(id);
    groups.set(id, entry);
    return entry;
  }
  entry = reactive({
    snapshot: null, messages: [], nextBefore: null, loaded: false, error: null, unavailable: false,
    pending: null, draft: '', loadingEarlier: false, revision: 0,
  });
  groups.set(id, entry);
  for (const [key, value] of groups) {
    if (groups.size <= retained) break;
    if (key !== id && !value.pending) {
      groups.delete(key);
      receipts.delete(key);
    }
  }
  return entry;
}

function receiptsFor(id: string): Receipts {
  let value = receipts.get(id);
  if (!value) receipts.set(id, value = { received: new Set(), read: new Set(), pendingRead: new Set(), inFlight: new Set() });
  return value;
}

export function forgetGroup(id: string) {
  groups.delete(id);
  receipts.delete(id);
  forgetRead(`group:${id}`);
}

function mergeMessages(existing: GroupMessage[], incoming: GroupMessage[]) {
  const byID = new Map(existing.map((message) => [message.id, message]));
  for (const message of incoming) {
    const current = byID.get(message.id);
    byID.set(message.id, current ? { ...message, receiptState: mergeReceipt(current.receiptState, message.receiptState) } : message);
  }
  return [...byID.values()].sort((a, b) => a.sequence - b.sequence);
}

async function acknowledge(id: string, ids: string[], state: 'received' | 'read') {
  const tracked = receiptsFor(id);
  if (state === 'read') for (const value of ids) if (!tracked.read.has(value)) tracked.pendingRead.add(value);
  const known = state === 'read' ? tracked.read : tracked.received;
  const unseen = [...new Set(ids)].filter((value) => !known.has(value)).sort();
  for (let offset = 0; offset < unseen.length; offset += batch) {
    const messageIDs = unseen.slice(offset, offset + batch);
    const key = `${state}/${messageIDs.join('/')}`;
    if (tracked.inFlight.has(key)) continue;
    tracked.inFlight.add(key);
    try {
      await api(`groups/${id}/receipts`, { method: 'PUT', json: { messageIDs, state } });
      if (receipts.get(id) !== tracked) return;
      for (const value of messageIDs) {
        tracked.received.add(value);
        if (state === 'read') { tracked.read.add(value); tracked.pendingRead.delete(value); }
      }
      // Bound deduplication to retained history.
      const retainedIDs = new Set([...(groups.get(id)?.messages.map((message) => message.id) ?? []), ...messageIDs]);
      for (const set of [tracked.received, tracked.read]) for (const value of set) if (!retainedIDs.has(value)) set.delete(value);
    } catch {
      // Retried on the next visible poll.
    } finally {
      tracked.inFlight.delete(key);
    }
  }
}

// `visible`: the group is on screen. Only then is downloaded history acknowledged
// as received, matching iOS (Home warming refreshes without acknowledging).
export async function loadGroupConversation(id: string, visible = false) {
  const chats = useChats();
  const { user } = useSession();
  const entry = entryFor(id);
  const revision = ++entry.revision;
  try {
    const [snapshot, page] = await Promise.all([
      api<GroupSnapshot>(`groups/${id}`),
      api<GroupMessagesPage>(`groups/${id}/messages`),
    ]);
    let fetched = page.messages;
    let cursor = page.nextBefore;
    const known = new Set(entry.messages.map((message) => message.id));
    const overlaps = () => fetched.some((message) => known.has(message.id));
    for (let pages = 0; known.size && cursor !== null && !overlaps() && pages < catchUpPages; pages += 1) {
      const earlier = await api<GroupMessagesPage>(`groups/${id}/messages`, { query: { before: cursor } });
      fetched = [...earlier.messages, ...fetched];
      cursor = earlier.nextBefore;
    }
    if (revision !== entry.revision || groups.get(id) !== entry) return;
    if (known.size && cursor !== null && !overlaps()) entry.messages = [];
    const hadOlder = entry.messages.some((message) => message.sequence < (fetched[0]?.sequence ?? -Infinity));
    entry.messages = mergeMessages(entry.messages, fetched);
    if (!hadOlder) entry.nextBefore = cursor;
    entry.snapshot = snapshot;
    entry.loaded = true;
    entry.error = null;
    if (entry.pending && entry.messages.some((message) => message.id === entry.pending!.id)) {
      if (entry.pending.attachment?.previewURL) URL.revokeObjectURL(entry.pending.attachment.previewURL);
      entry.pending = null;
    }
    chats.updateGroup(id, { name: snapshot.group.name, photoVersion: snapshot.group.photoVersion });

    // Refresh receipts of older retained outgoing messages without refetching bodies.
    const recent = new Set(page.messages.map((message) => message.id));
    const older = entry.messages
      .filter((message) => message.userID === user.value?.id && message.agentID === null && !recent.has(message.id) && message.receiptState !== 'read')
      .map((message) => message.id);
    for (let offset = 0; offset < older.length; offset += batch) {
      const ids = older.slice(offset, offset + batch);
      const result = await api<{ receipts: { id: string; receiptState: string | null }[] }>(
        `groups/${id}/receipts`, { query: { messageIDs: JSON.stringify(ids) } });
      if (revision !== entry.revision || groups.get(id) !== entry) return;
      const updates = new Map(result.receipts.map((receipt) => [receipt.id, receipt.receiptState]));
      entry.messages = entry.messages.map((message) => updates.has(message.id)
        ? { ...message, receiptState: mergeReceipt(message.receiptState, updates.get(message.id)) } : message);
    }

    if (visible) {
      const others = entry.messages.filter((message) => message.userID !== user.value?.id).map((message) => message.id);
      await acknowledge(id, others, 'received');
    }
    const pendingRead = receiptsFor(id).pendingRead;
    if (pendingRead.size) await acknowledge(id, [...pendingRead], 'read');
  } catch (error) {
    if (groups.get(id) !== entry) return;
    if (error instanceof ApiError && error.status === 404) {
      entry.unavailable = true;
      chats.removeGroup(id);
      receipts.delete(id);
      forgetRead(`group:${id}`);
    }
    entry.error = errorMessage(error);
  }
}

export function useGroupConversation(groupID: MaybeRefOrGetter<string>) {
  const chats = useChats();
  const state = shallowRef(entryFor(toValue(groupID)));
  watch(() => toValue(groupID), (id) => { state.value = entryFor(id); });

  const load = () => loadGroupConversation(toValue(groupID), true);

  async function loadEarlier() {
    const id = toValue(groupID);
    const entry = entryFor(id);
    if (!entry.nextBefore || entry.loadingEarlier) return;
    entry.loadingEarlier = true;
    try {
      const page = await api<GroupMessagesPage>(`groups/${id}/messages`, { query: { before: entry.nextBefore } });
      entry.messages = mergeMessages(entry.messages, page.messages);
      entry.nextBefore = page.nextBefore;
    } catch (error) {
      entry.error = errorMessage(error);
    } finally {
      entry.loadingEarlier = false;
    }
  }

  async function submit() {
    const id = toValue(groupID);
    const entry = entryFor(id);
    const pending = entry.pending;
    if (!pending) return;
    pending.failed = null;
    const attachment = pending.attachment
      ? { name: pending.attachment.name, mimeType: pending.attachment.mimeType, data: pending.attachment.data }
      : undefined;
    try {
      await api<{ id: string }>(`groups/${id}/messages`, { json: { id: pending.id, text: pending.text, attachment } });
      if (entry.pending?.id !== pending.id) return;
      // Acceptance means Sent, not Received; polling confirms it even if this load fails.
      entry.pending.accepted = true;
      await load();
    } catch (error) {
      // A transient failure keeps the UUID so Retry cannot duplicate the message.
      if (entry.pending?.id === pending.id && !entry.pending.accepted) entry.pending.failed = errorMessage(error);
    }
  }

  async function send(text: string, attachment: DraftAttachment | null) {
    const entry = state.value;
    if (entry.pending) return;
    entry.pending = { id: crypto.randomUUID(), text: text.trim(), attachment, failed: null, accepted: false, createdAt: Date.now() };
    entry.draft = '';
    await submit();
  }

  function discardPending() {
    const entry = state.value;
    if (!entry.pending?.failed) return;
    entry.draft = entry.pending.text;
    if (entry.pending.attachment?.previewURL) URL.revokeObjectURL(entry.pending.attachment.previewURL);
    entry.pending = null;
  }

  async function retryReply(replyID: string) {
    const id = toValue(groupID);
    try {
      await api(`groups/${id}/replies/${replyID}/retry`, { method: 'POST', json: {} });
      await load();
    } catch (error) {
      entryFor(id).error = errorMessage(error);
    }
  }

  // A message from someone else at least 50% visible in the foreground counts as read.
  function noteSeen(messageIDs: string[]) {
    if (messageIDs.length) void acknowledge(toValue(groupID), messageIDs, 'read');
  }

  // Unread watermark, separate from recipient read receipts.
  function markRead() {
    const id = toValue(groupID);
    const sequence = entryFor(id).messages.at(-1)?.sequence ?? 0;
    const confirmed = chats.groups.value.find((group) => group.id === id)?.lastReadSequence ?? 0;
    enqueueRead(`group:${id}`, sequence, confirmed, async (value) => {
      const result = await api<{ lastReadSequence: number; unreadCount: number }>(`groups/${id}/read`, { method: 'PUT', json: { sequence: value } });
      chats.applyRead('group', id, result.lastReadSequence, result.unreadCount);
      return result.lastReadSequence;
    });
  }

  return { state, load, loadEarlier, send, submit, discardPending, retryReply, noteSeen, markRead };
}
