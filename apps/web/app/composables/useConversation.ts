import type { ChatPage, ChatReadState, ChatSubmission, ChatTurn, DraftAttachment, Presence } from '~/utils/types';

// Session cache of private conversations, keyed by contact. Pending sends keep
// their UUID across navigation and failures so a retry can never duplicate them.
export type PendingSend = { id: string; text: string; attachment: DraftAttachment | null; failed: string | null; createdAt: number };
export type Conversation = {
  turns: ChatTurn[];
  nextBefore: number | null;
  presence: Presence | null;
  loaded: boolean;
  error: string | null;
  unavailable: boolean;
  pending: PendingSend | null;
  draft: string;
  loadingEarlier: boolean;
  retrying: boolean;
  readSequence: number;
  revision: number;
};

const conversations = shallowReactive(new Map<string, Conversation>());
const retained = 20;

registerSessionReset(() => {
  for (const conversation of conversations.values()) revokePreview(conversation.pending?.attachment);
  conversations.clear();
});

function revokePreview(attachment: DraftAttachment | null | undefined) {
  if (attachment?.previewURL) URL.revokeObjectURL(attachment.previewURL);
}

function conversation(id: string): Conversation {
  let entry = conversations.get(id);
  if (entry) {
    conversations.delete(id);
    conversations.set(id, entry);
    return entry;
  }
  entry = reactive({
    turns: [], nextBefore: null, presence: null, loaded: false, error: null, unavailable: false,
    pending: null, draft: '', loadingEarlier: false, retrying: false, readSequence: 0, revision: 0,
  });
  conversations.set(id, entry);
  // Evict the least recently opened conversations without pending sends.
  for (const [key, value] of conversations) {
    if (conversations.size <= retained) break;
    if (key !== id && !value.pending) conversations.delete(key);
  }
  return entry;
}

function upsert(entry: Conversation, turn: ChatTurn) {
  const index = entry.turns.findIndex((item) => item.id === turn.id);
  if (index === -1) entry.turns = [...entry.turns, turn].sort((a, b) => a.sequence - b.sequence);
  else if (turn.updatedAt >= entry.turns[index]!.updatedAt) entry.turns.splice(index, 1, turn);
}

export function useConversation(contactID: MaybeRefOrGetter<string>) {
  const chats = useChats();
  // Resolve the entry outside a computed: lookup reorders the LRU map.
  const state = shallowRef(conversation(toValue(contactID)));
  watch(() => toValue(contactID), (id) => { state.value = conversation(id); });

  function syncListPreview(id: string, entry: Conversation) {
    const last = entry.turns.at(-1);
    if (last) chats.updateContactActivity(id, { lastMessageAt: last.createdAt, lastMessageText: last.assistantText ?? last.userText });
  }

  async function load() {
    const id = toValue(contactID);
    const entry = conversation(id);
    const revision = ++entry.revision;
    try {
      const page = await api<ChatPage>(`contacts/${id}/chat/turns`);
      if (revision !== entry.revision || conversations.get(id) !== entry) return;
      const first = page.turns[0]?.sequence ?? -Infinity;
      const last = page.turns.at(-1)?.sequence ?? 0;
      const older = entry.turns.filter((turn) => turn.sequence < first);
      // Keep turns accepted after this request started; the page may predate them.
      const newer = entry.turns.filter((turn) => turn.sequence > last && !page.turns.some((item) => item.id === turn.id));
      entry.turns = [...older, ...page.turns, ...newer];
      if (!older.length) entry.nextBefore = page.nextBefore;
      entry.presence = page.presence;
      entry.loaded = true;
      entry.error = null;
      syncListPreview(id, entry);
    } catch (error) {
      if (conversations.get(id) !== entry) return;
      if (error instanceof ApiError && error.status === 404) {
        entry.unavailable = true;
        chats.removeContact(id);
      }
      entry.error = errorMessage(error);
    }
  }

  async function loadEarlier() {
    const id = toValue(contactID);
    const entry = conversation(id);
    if (!entry.nextBefore || entry.loadingEarlier) return;
    entry.loadingEarlier = true;
    try {
      const page = await api<ChatPage>(`contacts/${id}/chat/turns`, { query: { before: entry.nextBefore } });
      const ids = new Set(entry.turns.map((turn) => turn.id));
      entry.turns = [...page.turns.filter((turn) => !ids.has(turn.id)), ...entry.turns];
      entry.nextBefore = page.nextBefore;
    } catch (error) {
      entry.error = errorMessage(error);
    } finally {
      entry.loadingEarlier = false;
    }
  }

  async function submit() {
    const id = toValue(contactID);
    const entry = conversation(id);
    const pending = entry.pending;
    if (!pending) return;
    pending.failed = null;
    const attachment = pending.attachment
      ? { name: pending.attachment.name, mimeType: pending.attachment.mimeType, data: pending.attachment.data }
      : undefined;
    try {
      const result = await api<ChatSubmission>(`contacts/${id}/chat/turns`, {
        json: { id: pending.id, text: pending.text, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, attachment },
      });
      if (entry.pending?.id !== pending.id) return;
      upsert(entry, result.turn);
      if (result.presence) entry.presence = result.presence;
      revokePreview(pending.attachment);
      entry.pending = null;
      syncListPreview(id, entry);
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
    revokePreview(entry.pending.attachment);
    entry.pending = null;
  }

  async function retryReply(turn: ChatTurn) {
    const id = toValue(contactID);
    const entry = conversation(id);
    if (entry.retrying) return;
    entry.retrying = true;
    try {
      const result = await api<ChatSubmission>(`contacts/${id}/chat/turns/${turn.id}/retry`, { method: 'POST' });
      upsert(entry, result.turn);
      if (result.presence) entry.presence = result.presence;
    } catch (error) {
      entry.error = errorMessage(error);
    } finally {
      entry.retrying = false;
    }
  }

  // Acknowledge only completed replies that were actually displayed.
  async function markRead() {
    const id = toValue(contactID);
    const entry = conversation(id);
    const sequence = entry.turns.findLast((turn) => turn.status === 'complete')?.sequence ?? 0;
    if (sequence <= entry.readSequence) return;
    entry.readSequence = sequence;
    try {
      const result = await api<ChatReadState>(`contacts/${id}/chat/read`, { method: 'PUT', json: { sequence } });
      chats.updateContactActivity(id, { unreadCount: result.unreadCount, lastReadSequence: result.lastReadSequence });
    } catch {
      entry.readSequence = 0; // Retried on the next visible refresh.
    }
  }

  return { state, load, loadEarlier, send, submit, discardPending, retryReply, markRead };
}

// Presence activity for one visible chat visit. Contains no draft text.
export function useChatActivity(contactID: MaybeRefOrGetter<string>) {
  let visitID: string | null = null;
  let lastTyping = 0;

  function post(kind: 'open' | 'typing' | 'leave', keepalive = false) {
    if (!visitID) return;
    const body = JSON.stringify({ visitID, kind });
    // keepalive lets "leave" complete while the tab is closing.
    void fetch(`/api/v1/contacts/${toValue(contactID)}/chat/activity`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive, credentials: 'same-origin',
    }).catch(() => {});
  }
  function open() {
    if (visitID || document.visibilityState !== 'visible') return;
    visitID = crypto.randomUUID();
    lastTyping = 0;
    post('open');
  }
  function leave() {
    post('leave', true);
    visitID = null;
  }
  function typing() {
    if (Date.now() - lastTyping < 10_000) return;
    lastTyping = Date.now();
    post('typing');
  }
  function onVisibility() {
    if (document.visibilityState === 'visible') open();
    else leave();
  }

  onMounted(() => {
    open();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', leave);
  });
  onBeforeUnmount(() => {
    leave();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', leave);
  });
  watch(() => toValue(contactID), () => { leave(); open(); });
  return { typing };
}
