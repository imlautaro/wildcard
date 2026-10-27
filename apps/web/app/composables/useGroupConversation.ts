import type { DraftAttachment, GroupMessage, GroupMessagesPage, GroupSnapshot } from '~/utils/types';

// Session cache of group conversations, mirroring useConversation.
export type GroupPending = { id: string; text: string; attachment: DraftAttachment | null; failed: string | null; createdAt: number };
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
  readSequence: number;
  revision: number;
};

const groups = shallowReactive(new Map<string, GroupConversation>());
const retained = 20;

registerSessionReset(() => {
  for (const group of groups.values()) if (group.pending?.attachment?.previewURL) URL.revokeObjectURL(group.pending.attachment.previewURL);
  groups.clear();
});

function entryFor(id: string): GroupConversation {
  let entry = groups.get(id);
  if (entry) {
    groups.delete(id);
    groups.set(id, entry);
    return entry;
  }
  entry = reactive({
    snapshot: null, messages: [], nextBefore: null, loaded: false, error: null, unavailable: false,
    pending: null, draft: '', loadingEarlier: false, readSequence: 0, revision: 0,
  });
  groups.set(id, entry);
  for (const [key, value] of groups) {
    if (groups.size <= retained) break;
    if (key !== id && !value.pending) groups.delete(key);
  }
  return entry;
}

export function forgetGroup(id: string) {
  groups.delete(id);
}

export function useGroupConversation(groupID: MaybeRefOrGetter<string>) {
  const chats = useChats();
  const state = shallowRef(entryFor(toValue(groupID)));
  watch(() => toValue(groupID), (id) => { state.value = entryFor(id); });

  async function load() {
    const id = toValue(groupID);
    const entry = entryFor(id);
    const revision = ++entry.revision;
    try {
      const [snapshot, page] = await Promise.all([
        api<GroupSnapshot>(`groups/${id}`),
        api<GroupMessagesPage>(`groups/${id}/messages`),
      ]);
      if (revision !== entry.revision || groups.get(id) !== entry) return;
      const first = page.messages[0]?.sequence ?? -Infinity;
      const last = page.messages.at(-1)?.sequence ?? 0;
      const older = entry.messages.filter((message) => message.sequence < first);
      const newer = entry.messages.filter((message) => message.sequence > last && !page.messages.some((item) => item.id === message.id));
      entry.messages = [...older, ...page.messages, ...newer];
      if (!older.length) entry.nextBefore = page.nextBefore;
      entry.snapshot = snapshot;
      entry.loaded = true;
      entry.error = null;
      const latest = entry.messages.at(-1);
      chats.updateGroup(id, {
        name: snapshot.group.name, photoVersion: snapshot.group.photoVersion,
        ...(latest ? { lastMessageAt: latest.createdAt, lastMessageText: latest.text || (latest.attachment ? `Attachment: ${latest.attachment.name}` : ''), lastMessageSenderName: latest.senderName } : {}),
      });
    } catch (error) {
      if (groups.get(id) !== entry) return;
      if (error instanceof ApiError && error.status === 404) {
        entry.unavailable = true;
        chats.removeGroup(id);
      }
      entry.error = errorMessage(error);
    }
  }

  async function loadEarlier() {
    const id = toValue(groupID);
    const entry = entryFor(id);
    if (!entry.nextBefore || entry.loadingEarlier) return;
    entry.loadingEarlier = true;
    try {
      const page = await api<GroupMessagesPage>(`groups/${id}/messages`, { query: { before: entry.nextBefore } });
      const ids = new Set(entry.messages.map((message) => message.id));
      entry.messages = [...page.messages.filter((message) => !ids.has(message.id)), ...entry.messages];
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
      await load();
      if (pending.attachment?.previewURL) URL.revokeObjectURL(pending.attachment.previewURL);
      entry.pending = null;
    } catch (error) {
      if (entry.pending?.id === pending.id) entry.pending.failed = errorMessage(error);
    }
  }

  async function send(text: string, attachment: DraftAttachment | null) {
    const entry = state.value;
    if (entry.pending) return;
    entry.pending = { id: crypto.randomUUID(), text: text.trim(), attachment, failed: null, createdAt: Date.now() };
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

  async function markRead() {
    const id = toValue(groupID);
    const entry = entryFor(id);
    const sequence = entry.messages.at(-1)?.sequence ?? 0;
    if (sequence <= entry.readSequence) return;
    entry.readSequence = sequence;
    try {
      const result = await api<{ lastReadSequence: number; unreadCount: number }>(`groups/${id}/read`, { method: 'PUT', json: { sequence } });
      chats.updateGroup(id, { unreadCount: result.unreadCount, lastReadSequence: result.lastReadSequence });
    } catch {
      entry.readSequence = 0;
    }
  }

  return { state, load, loadEarlier, send, submit, discardPending, retryReply, markRead };
}
