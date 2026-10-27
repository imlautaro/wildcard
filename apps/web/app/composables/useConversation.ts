import { createReactionCache, clearReactionCache, refreshReactions, type ReactionCache } from './useMessageReactions';
import type { ChatPage, ChatReadState, ChatSubmission, ChatTurn, DraftAttachment, Presence, ReplyQuote } from '~/utils/types';

// Session cache of private conversations, keyed by contact. Pending sends keep
// their UUID across navigation and failures so a retry can never duplicate them.
export type PendingSend = { id: string; text: string; attachment: DraftAttachment | null; replyTo: ReplyQuote | null; failed: string | null; createdAt: number };
export type Conversation = {
  reactions: ReactionCache;
  turns: ChatTurn[];
  nextBefore: number | null;
  presence: Presence | null;
  loaded: boolean;
  error: string | null;
  unavailable: boolean;
  pending: PendingSend | null;
  draft: string;
  // The message being replied to, kept with the draft across navigation.
  replyTo: ReplyQuote | null;
  loadingEarlier: boolean;
  retrying: boolean;
  revision: number;
};

const conversations = shallowReactive(new Map<string, Conversation>());
const retained = 20;
// Bounded catch-up when the newest page does not reach previously cached history.
const catchUpPages = 10;

registerSessionReset(() => {
  for (const conversation of conversations.values()) revokePreview(conversation.pending?.attachment);
  for (const entry of conversations.values()) clearReactionCache(entry.reactions);
  conversations.clear();
});

function revokePreview(attachment: DraftAttachment | null | undefined) {
  if (attachment?.previewURL) URL.revokeObjectURL(attachment.previewURL);
}

export function forgetConversation(id: string) {
  const entry = conversations.get(id);
  if (entry) clearReactionCache(entry.reactions);
  conversations.delete(id);
  forgetRead(`contact:${id}`);
}

// Read-only lookup for Home: no LRU reordering, so rendering never mutates the cache.
export function peekConversation(id: string): Conversation | undefined {
  return conversations.get(id);
}

function conversation(id: string): Conversation {
  let entry = conversations.get(id);
  if (entry) {
    conversations.delete(id);
    conversations.set(id, entry);
    return entry;
  }
  entry = reactive({
    reactions: createReactionCache(),
    turns: [], nextBefore: null, presence: null, loaded: false, error: null, unavailable: false,
    pending: null, draft: '', replyTo: null, loadingEarlier: false, retrying: false, revision: 0,
  });
  conversations.set(id, entry);
  // Evict the least recently opened conversations without pending sends.
  for (const [key, value] of conversations) {
    if (conversations.size <= retained) break;
    if (key !== id && !value.pending && !Object.keys(value.reactions.pending).length) {
      clearReactionCache(value.reactions);
      conversations.delete(key);
    }
  }
  return entry;
}

function mergeInto(existing: ChatTurn[], incoming: ChatTurn[]) {
  const byID = new Map(existing.map((turn) => [turn.id, turn]));
  for (const turn of incoming) {
    const current = byID.get(turn.id);
    byID.set(turn.id, current ? mergeTurn(current, turn) : turn);
  }
  return [...byID.values()].sort((a, b) => a.sequence - b.sequence);
}

export async function loadConversation(id: string) {
  const chats = useChats();
  const entry = conversation(id);
  const revision = ++entry.revision;
  try {
    const page = await api<ChatPage>(`contacts/${id}/chat/turns`);
    let cursor = page.nextBefore;
    let fetched = page.turns;
    const known = new Set(entry.turns.map((turn) => turn.id));
    const overlaps = () => fetched.some((turn) => known.has(turn.id));
    // Bridge any gap between cached history and the newest page. Past the bound,
    // drop the disconnected cache instead of showing a hole.
    for (let pages = 0; known.size && cursor !== null && !overlaps() && pages < catchUpPages; pages += 1) {
      const earlier = await api<ChatPage>(`contacts/${id}/chat/turns`, { query: { before: cursor } });
      fetched = [...earlier.turns, ...fetched];
      cursor = earlier.nextBefore;
    }
    if (revision !== entry.revision || conversations.get(id) !== entry) return;
    if (known.size && cursor !== null && !overlaps()) entry.turns = [];
    const hadOlder = entry.turns.some((turn) => turn.sequence < (fetched[0]?.sequence ?? -Infinity));
    entry.turns = mergeInto(entry.turns, fetched);
    if (!hadOlder) entry.nextBefore = cursor;
    entry.presence = page.presence;
    entry.loaded = true;
    entry.error = null;
    await refreshReactions(entry.reactions, `contacts/${id}/chat/reactions`, entry.turns.map((turn) => turn.id));
  } catch (error) {
    if (conversations.get(id) !== entry) return;
    if (error instanceof ApiError && error.status === 404) {
      clearReactionCache(entry.reactions);
      entry.unavailable = true;
      chats.removeContact(id);
      forgetRead(`contact:${id}`);
    }
    entry.error = errorMessage(error);
  }
}

export function useConversation(contactID: MaybeRefOrGetter<string>) {
  const chats = useChats();
  // Resolve the entry outside a computed: lookup reorders the LRU map.
  const state = shallowRef(conversation(toValue(contactID)));
  watch(() => toValue(contactID), (id) => { state.value = conversation(id); });

  const load = () => loadConversation(toValue(contactID));

  async function loadEarlier() {
    const id = toValue(contactID);
    const entry = conversation(id);
    if (!entry.nextBefore || entry.loadingEarlier) return;
    entry.loadingEarlier = true;
    try {
      const page = await api<ChatPage>(`contacts/${id}/chat/turns`, { query: { before: entry.nextBefore } });
      entry.turns = mergeInto(entry.turns, page.turns);
      entry.nextBefore = page.nextBefore;
      await refreshReactions(entry.reactions, `contacts/${id}/chat/reactions`, entry.turns.map((turn) => turn.id));
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
        json: { id: pending.id, text: pending.text, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, attachment,
          replyTo: pending.replyTo ? { messageID: pending.replyTo.messageID, side: pending.replyTo.side } : undefined },
      });
      if (entry.pending?.id !== pending.id) return;
      entry.turns = mergeInto(entry.turns, [result.turn]);
      if (result.presence) entry.presence = result.presence;
      revokePreview(pending.attachment);
      entry.pending = null;
    } catch (error) {
      if (entry.pending?.id === pending.id) entry.pending.failed = errorMessage(error);
    }
  }

  async function send(text: string, attachment: DraftAttachment | null) {
    const entry = state.value;
    if (entry.pending) return;
    entry.pending = { id: crypto.randomUUID(), text: text.trim(), attachment, replyTo: entry.replyTo, failed: null, createdAt: Date.now() };
    entry.draft = '';
    entry.replyTo = null;
    await submit();
  }

  function discardPending() {
    const entry = state.value;
    if (!entry.pending?.failed) return;
    entry.draft = entry.pending.text;
    entry.replyTo = entry.pending.replyTo;
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
      entry.turns = mergeInto(entry.turns, [result.turn]);
      if (result.presence) entry.presence = result.presence;
    } catch (error) {
      entry.error = errorMessage(error);
    } finally {
      entry.retrying = false;
    }
  }

  // Acknowledge only completed replies that were actually displayed. The session
  // queue finishes the write even if this chat is closed.
  function markRead() {
    const id = toValue(contactID);
    const sequence = conversation(id).turns.findLast((turn) => turn.status === 'complete')?.sequence ?? 0;
    const confirmed = chats.contacts.value.find((contact) => contact.id === id)?.lastReadSequence ?? 0;
    enqueueRead(`contact:${id}`, sequence, confirmed, async (value) => {
      const result = await api<ChatReadState>(`contacts/${id}/chat/read`, { method: 'PUT', json: { sequence: value } });
      chats.applyRead('contact', id, result.lastReadSequence, result.unreadCount);
      return result.lastReadSequence;
    });
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
