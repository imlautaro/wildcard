import { createReactionCache, clearReactionCache, refreshReactions, type ReactionCache } from './useMessageReactions';
import type { DraftAttachment, DraftVoice, GroupMessage, GroupMessagesPage, GroupSnapshot, ReplyQuote } from '~/utils/types';

// Session cache of group conversations, mirroring useConversation. A pending send
// becomes `accepted` (Sent) on HTTP acceptance, before the follow-up history
// request; history then replaces it by UUID.
export type GroupPending = { historyRevision: number; id: string; text: string; attachment: DraftAttachment | null; voice: DraftVoice | null; replyTo: ReplyQuote | null; failed: string | null; accepted: boolean; createdAt: number };
export type GroupConversation = {
  reactions: ReactionCache;
  snapshot: GroupSnapshot | null;
  messages: GroupMessage[];
  nextBefore: number | null;
  loaded: boolean;
  error: string | null;
  unavailable: boolean;
  pending: GroupPending | null;
  draft: string;
  // The message being replied to, kept with the draft across navigation.
  replyTo: ReplyQuote | null;
  loadingEarlier: boolean;
  revision: number;
};

// Recipient acknowledgements, outside reactivity. Deduplication keeps polling from
// re-sending IDs (the API allows 120 receipt writes per minute per account).
type Receipts = { received: Set<string>; read: Set<string>; pendingRead: Set<string>; inFlight: Set<string> };

const groups = shallowReactive(new Map<string, GroupConversation>());
const receipts = new Map<string, Receipts>();
const detailsRequests = new Map<string, Promise<void>>();
const retained = 20;
const catchUpPages = 10;
const batch = 100;

registerSessionReset(() => {
  for (const group of groups.values()) if (group.pending?.attachment?.previewURL) URL.revokeObjectURL(group.pending.attachment.previewURL);
  for (const entry of groups.values()) clearReactionCache(entry.reactions);
  for (const entry of groups.values()) { entry.snapshot = null; entry.revision += 1; }
  groups.clear();
  receipts.clear();
  detailsRequests.clear();
});

registerModelChange((contributor) => {
  for (const entry of groups.values()) {
    entry.revision += 1;
    if (entry.snapshot) entry.snapshot = { ...entry.snapshot, contributorModel: contributor };
  }
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
    reactions: createReactionCache(),
    snapshot: null, messages: [], nextBefore: null, loaded: false, error: null, unavailable: false,
    pending: null, draft: '', replyTo: null, loadingEarlier: false, revision: 0,
  });
  groups.set(id, entry);
  for (const [key, value] of groups) {
    if (groups.size <= retained) break;
    if (key !== id && !value.pending && !Object.keys(value.reactions.pending).length) {
      clearReactionCache(value.reactions);
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
  forgetConversationLearning(`groups/${id}`);
  const removed = groups.get(id);
  if (removed) {
    clearReactionCache(removed.reactions); removed.snapshot = null; removed.revision += 1;
    if (removed.pending?.attachment?.previewURL) URL.revokeObjectURL(removed.pending.attachment.previewURL);
    removed.messages = []; removed.pending = null;
  }
  groups.delete(id);
  receipts.delete(id);
  detailsRequests.delete(id);
  forgetChatMedia(`groups/${id}`);
  forgetTasks(`groups/${id}`);
  forgetDocuments(`groups/${id}`);
  forgetMiniApps(`groups/${id}`);
  forgetRead(`group:${id}`);
}

export function updateGroupPrivateSharing(id: string, agentID: string, enabled: boolean) {
  invalidateGroupDetails(id);
  const entry = groups.get(id);
  if (entry?.snapshot) entry.snapshot = { ...entry.snapshot,
    privateSharing: entry.snapshot.privateSharing?.map(permission => permission.agentID === agentID
      ? { ...permission, enabled: enabled ? 1 : 0 } : permission) };
}

export function invalidateGroupDetails(id: string) {
  const entry = groups.get(id);
  if (entry) entry.revision += 1;
  detailsRequests.delete(id);
}

// Share the conversation snapshot with group details, including empty permissions.
export async function loadGroupDetails(id: string): Promise<void> {
  const active = detailsRequests.get(id);
  if (active) return active;
  const entry = entryFor(id);
  const revision = ++entry.revision;
  const request = (async () => {
    try {
      const snapshot = await api<GroupSnapshot>(`groups/${id}`);
      if (groups.get(id) !== entry || revision !== entry.revision) return;
      entry.snapshot = snapshot;
      entry.error = null;
    } catch (error) {
      if (groups.get(id) !== entry || revision !== entry.revision) return;
      if (error instanceof ApiError && (error.status === 403 || error.status === 404)) forgetGroup(id);
      throw error;
    }
  })();
  detailsRequests.set(id, request);
  try { await request; }
  finally { if (detailsRequests.get(id) === request) detailsRequests.delete(id); }
}

function mergeMessages(existing: GroupMessage[], incoming: GroupMessage[]) {
  const byID = new Map(existing.map((message) => [message.id, message]));
  for (const message of incoming) {
    const current = byID.get(message.id);
    byID.set(message.id, current ? { ...message, voice: mergeVoice(current.voice, message.voice), receiptState: mergeReceipt(current.receiptState, message.receiptState) } : message);
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
const historyRequests = new WeakMap<GroupConversation, Promise<void>>();

export function loadGroupConversation(id: string, visible = false): Promise<void> {
  const entry = entryFor(id);
  const existing = historyRequests.get(entry);
  if (existing) return existing;
  const request = fetchGroupConversation(id, visible).finally(() => { historyRequests.delete(entry); });
  historyRequests.set(entry, request);
  return request;
}

async function fetchGroupConversation(id: string, visible: boolean) {
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
      if ((earlier.historyRevision ?? 0)!==(page.historyRevision ?? 0)) return;
      fetched = [...earlier.messages, ...fetched];
      cursor = earlier.nextBefore;
    }
    if (revision !== entry.revision || groups.get(id) !== entry) return;
    if (known.size && cursor !== null && !overlaps()) entry.messages = [];
    const previousEpoch = entry.snapshot?.group.historyRevision ?? 0;
    if ((page.historyRevision ?? 0)<previousEpoch || (page.historyRevision ?? 0)!==(snapshot.group.historyRevision ?? 0)) return;
    if (previousEpoch!==(page.historyRevision ?? 0)) {
      if (entry.pending?.attachment?.previewURL) URL.revokeObjectURL(entry.pending.attachment.previewURL);
      entry.messages=[]; entry.pending=null; entry.draft=''; entry.replyTo=null;
      clearReactionCache(entry.reactions); clearPrivateImages(); clearVoiceAudio();
    }
    const hadOlder = entry.messages.some((message) => message.sequence < (fetched[0]?.sequence ?? -Infinity));
    const wasLoaded = entry.loaded;
    entry.messages = mergeMessages(entry.messages, fetched);
    // Others' new messages sound in the visible group (see useMessageSounds).
    if (wasLoaded) {
      for (const message of fetched) {
        if (!known.has(message.id) && (message.agentID !== null || message.userID !== user.value?.id)) replyShown(`group/${id}`, message.id, message.createdAt);
      }
    }
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

    await refreshReactions(entry.reactions, `groups/${id}/reactions`, entry.messages.map((message) => message.id));
    if (visible || visibleConversationKey() === `group/${id}`) {
      const others = entry.messages.filter((message) => message.userID !== user.value?.id).map((message) => message.id);
      await acknowledge(id, others, 'received');
    }
    const pendingRead = receiptsFor(id).pendingRead;
    if (pendingRead.size) await acknowledge(id, [...pendingRead], 'read');
  } catch (error) {
    if (groups.get(id) !== entry) return;
    // Background revalidation keeps the loaded history visible through transient failures.
    if (entry.loaded && isTransientFailure(error)) return;
    if (error instanceof ApiError && error.status === 404) {
      clearReactionCache(entry.reactions);
      entry.unavailable = true;
      entry.snapshot = null;
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
  watch(() => [toValue(groupID), groups.get(toValue(groupID))] as const, ([id,cached]) => {
    if (cached !== state.value) state.value = entryFor(id);
  });

  const load = () => loadGroupConversation(toValue(groupID), true);

  async function loadEarlier() {
    const id = toValue(groupID);
    const entry = entryFor(id);
    if (!entry.nextBefore || entry.loadingEarlier) return;
    entry.loadingEarlier = true;
    try {
      const page = await api<GroupMessagesPage>(`groups/${id}/messages`, { query: { before: entry.nextBefore } });
      if ((page.historyRevision ?? 0)!==(entry.snapshot?.group.historyRevision ?? 0)) return;
      entry.messages = mergeMessages(entry.messages, page.messages);
      entry.nextBefore = page.nextBefore;
      await refreshReactions(entry.reactions, `groups/${id}/reactions`, entry.messages.map((message) => message.id));
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
      await api<{ id: string }>(`groups/${id}/messages`, { json: { historyRevision: pending.historyRevision, id: pending.id, text: pending.text, attachment,
        voice: pending.voice ? { data: pending.voice.data } : undefined, replyToID: pending.replyTo?.messageID } });
      if (entry.pending?.id !== pending.id) return;
      // Seed before history loads, so the accepted voice bubble plays without a download.
      if (pending.voice) seedVoiceAudio(`groups/${id}/messages/${pending.id}/attachment`, pending.voice.blob);
      // Acceptance means Sent, not Received; polling confirms it even if this load fails.
      entry.pending.accepted = true;
      messageSent(`group/${id}`, pending.id);
      await load();
    } catch (error) {
      // A transient failure keeps the UUID so Retry cannot duplicate the message.
      if (entry.pending?.id === pending.id && !entry.pending.accepted) entry.pending.failed = errorMessage(error);
    }
  }

  async function send(text: string, attachment: DraftAttachment | null, voice: DraftVoice | null = null) {
    const entry = state.value;
    if (entry.pending) return;
    entry.pending = { historyRevision: entry.snapshot?.group.historyRevision ?? 0, id: crypto.randomUUID(), text: voice ? '' : text.trim(), attachment: voice ? null : attachment, voice, replyTo: entry.replyTo, failed: null, accepted: false, createdAt: Date.now() };
    if (!voice) entry.draft = '';
    entry.replyTo = null;
    await submit();
  }

  function discardPending() {
    const entry = state.value;
    if (!entry.pending?.failed) return;
    // A failed voice message has no text to edit: discarding drops the clip.
    if (!entry.pending.voice) entry.draft = entry.pending.text;
    entry.replyTo = entry.pending.replyTo;
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
