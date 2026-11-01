import { plainMessageMarkdown } from '~/utils/messageMarkdown';
import type { ChatGroup, Contact, ContactsPage, GroupInvitation, LastReaction, ReceivedContactInvitation } from '~/utils/types';

// Session cache for the chat list, the contact directory, and both invitation
// inboxes. Loaded data renders synchronously on navigation; refreshes run in the
// background and keep the previous content visible when they fail. Rows project
// the cached conversation (latest turn/message, pending send, receipts) when it is
// at least as recent as the server summary, like the iOS Home list.
export type ChatRow = {
  kind: 'contact' | 'group';
  archived: boolean;
  canClear: boolean;
  canDelete: boolean;
  id: string;
  name: string;
  photoPath: string | null;
  voice?: import('~/utils/types').VoiceInfo | null;
  preview: string;
  sender: string | null;
  at: number;
  unread: number;
  own: boolean;
  sending: boolean;
  readAt: number | null;
  receiptState: string | null;
  /** A first-circle contact still being created: shown disabled (docs/onboarding.md#progressive-setup). */
  setupPending?: boolean;
  /** The preview is the unsent composer text, labeled "Draft:" (docs/chats.md#chat-list-previews). */
  draft?: boolean;
};

const contacts = ref<Contact[]>([]);
const nextCursor = ref<string | null>(null);
const groups = ref<ChatGroup[]>([]);
const contactInvitations = ref<ReceivedContactInvitation[]>([]);
const groupInvitations = ref<GroupInvitation[]>([]);
const contributorModel = ref(false);
const contactsLoaded = ref(false);
const groupsLoaded = ref(false);
const contactsError = ref<string | null>(null);
const groupsError = ref<string | null>(null);
const allContactsLoaded = ref(false);
// Acknowledged read watermarks, so a list fetched before the write cannot raise a counter again.
const readGuards = new Map<string, { sequence: number; unread: number }>();
// Group previews already confirmed as received (bounded to current previews).
const receivedPreviews = new Set<string>();
let refreshingLists: Promise<void> | null = null;
let refreshingInvitations: Promise<void> | null = null;
let warming = 0;
let generation = 0;
const warmLimit = 4;

registerSessionReset(() => {
  generation += 1;
  contacts.value = [];
  nextCursor.value = null;
  groups.value = [];
  contactInvitations.value = [];
  groupInvitations.value = [];
  contributorModel.value = false;
  contactsLoaded.value = false;
  groupsLoaded.value = false;
  contactsError.value = null;
  groupsError.value = null;
  allContactsLoaded.value = false;
  readGuards.clear();
  receivedPreviews.clear();
  refreshingLists = null;
  refreshingInvitations = null;
});

registerModelChange((contributor) => {
  generation += 1;
  contributorModel.value = contributor;
});

export function contactPhotoPath(contact: Pick<Contact, 'id' | 'photoVersion'>) {
  return contact.photoVersion ? `contacts/${contact.id}/photo?version=${encodeURIComponent(contact.photoVersion)}` : null;
}
export function groupPhotoPath(group: Pick<ChatGroup, 'id' | 'photoVersion'>) {
  return group.photoVersion ? `groups/${group.id}/photo?version=${encodeURIComponent(group.photoVersion)}` : null;
}

function guarded<T extends { id: string; lastReadSequence?: number | null; unreadCount?: number | null }>(kind: string, row: T): T {
  const guard = readGuards.get(`${kind}:${row.id}`);
  if (!guard || (row.lastReadSequence ?? 0) >= guard.sequence) return row;
  return { ...row, lastReadSequence: guard.sequence, unreadCount: guard.unread };
}

function mergeContacts(firstPage: Contact[]) {
  // Keep rows from later pages that the refreshed first page did not cover.
  const ids = new Set(firstPage.map((contact) => contact.id));
  const oldest = firstPage.at(-1);
  const boundary = oldest ? (oldest.lastMessageAt ?? oldest.createdAt) : Infinity;
  const older = contacts.value.filter((contact) => !ids.has(contact.id) && (contact.lastMessageAt ?? contact.createdAt) < boundary);
  return [...firstPage.map((contact) => guarded('contact', contact)), ...older];
}

function mergeGroups(list: ChatGroup[]) {
  const previous = new Map(groups.value.map((group) => [group.id, group]));
  return list.map((group) => {
    const old = previous.get(group.id);
    const receipt = old && old.lastMessageID === group.lastMessageID
      ? mergeReceipt(old.lastMessageReceiptState, group.lastMessageReceiptState) : group.lastMessageReceiptState;
    return guarded('group', { ...group, lastMessageReceiptState: receipt });
  });
}

// Keep already opened chats warm when the list observes newer activity.
function warm() {
  const due: (() => Promise<void>)[] = [];
  for (const contact of contacts.value) {
    const cached = peekConversation(contact.id);
    const latest = cached?.loaded ? cached.turns.at(-1) : undefined;
    if (cached?.loaded && (contact.lastMessageAt ?? 0) > (latest ? turnTimestamp(latest) : 0)) due.push(() => loadConversation(contact.id));
  }
  for (const group of groups.value) {
    const cached = peekGroupConversation(group.id);
    if (cached?.loaded && (cached.pending || (group.lastMessageID && group.lastMessageID !== lastGroupChatMessage(cached.messages)?.id))) {
      due.push(() => loadGroupConversation(group.id));
    }
  }
  for (const task of due) {
    if (warming >= warmLimit) break;
    warming += 1;
    void task().finally(() => { warming -= 1; });
  }
}

async function confirmPreviews() {
  const previewIDs = new Set(groups.value.map((group) => group.lastMessageID).filter((id): id is string => !!id));
  for (const id of receivedPreviews) if (!previewIDs.has(id)) receivedPreviews.delete(id);
  const unseen = [...previewIDs].filter((id) => !receivedPreviews.has(id)).slice(0, 100);
  if (!unseen.length) return;
  try {
    await api('groups/receipts', { method: 'PUT', json: { messageIDs: unseen } });
    for (const id of unseen) receivedPreviews.add(id);
  } catch { /* Retried on the next list refresh. */ }
}

function announce(previousContacts: Map<string, Contact> | null, previousGroups: Map<string, ChatGroup> | null) {
  const { user } = useSession();
  for (const contact of previousContacts ? contacts.value : []) {
    const old = previousContacts!.get(contact.id);
    if (old && contact.lastMessageAt && contact.lastMessageFromUser !== 1 && (contact.unreadCount ?? 0) > (old.unreadCount ?? 0)
      && contact.lastMessageAt !== old.lastMessageAt) messageElsewhere(`contact/${contact.id}`, `contact/${contact.id}/${contact.lastMessageAt}`, contact.lastMessageAt);
  }
  for (const group of previousGroups ? groups.value : []) {
    const old = previousGroups!.get(group.id);
    if (old && group.lastMessageID && group.lastMessageAt && group.lastMessageID !== old.lastMessageID
      && group.lastMessageUserID !== user.value?.id && (group.unreadCount ?? 0) > (old.unreadCount ?? 0)) messageElsewhere(`group/${group.id}`, group.lastMessageID, group.lastMessageAt);
  }
}

async function refreshLists() {
  refreshingLists ??= (async () => {
    const started = generation;
    const [page, groupList] = await Promise.allSettled([
      api<ContactsPage>('contacts'),
      api<{ groups: ChatGroup[]; contributorModel: boolean }>('groups'),
    ]);
    if (started !== generation) return;
    if (page.status === 'fulfilled') for (const contact of page.value.contacts) {
      const old = contacts.value.find(item => item.id === contact.id);
      if (old && (old.historyRevision ?? 0) !== (contact.historyRevision ?? 0)) purgeHistory('contact',contact.id);
    }
    if (groupList.status === 'fulfilled') for (const group of groupList.value.groups) {
      const old = groups.value.find(item => item.id === group.id);
      if (old && (old.historyRevision ?? 0) !== (group.historyRevision ?? 0)) purgeHistory('group',group.id);
    }
    // Hydrate the open conversation before publishing a newer sidebar summary.
    // Other chats keep their existing bounded background warming behavior.
    const visible = visibleConversationKey();
    if (visible?.startsWith('contact/') && page.status === 'fulfilled') {
      const id = visible.slice('contact/'.length);
      const summary = page.value.contacts.find((contact) => contact.id === id);
      const cached = peekConversation(id);
      const newest = cached?.turns.reduce((at, turn) => Math.max(at, turnTimestamp(turn)), 0) ?? 0;
      if (summary && (!cached?.loaded || (summary.lastMessageAt ?? 0) > newest)) await loadConversation(id);
    } else if (visible?.startsWith('group/') && groupList.status === 'fulfilled') {
      const id = visible.slice('group/'.length);
      const summary = groupList.value.groups.find((group) => group.id === id);
      const cached = peekGroupConversation(id);
      if (summary && (!cached?.loaded || (summary.lastMessageID && summary.lastMessageID !== lastGroupChatMessage(cached.messages)?.id))) {
        await loadGroupConversation(id, true);
      }
    }
    if (started !== generation) return;
    // New incoming messages in conversations that are not on screen chime (see useMessageSounds).
    const before = { contacts: contactsLoaded.value ? new Map(contacts.value.map((contact) => [contact.id, contact])) : null,
      groups: groupsLoaded.value ? new Map(groups.value.map((group) => [group.id, group])) : null };
    if (page.status === 'fulfilled') {
      const keepsOlder = contacts.value.length > page.value.contacts.length;
      contacts.value = mergeContacts(page.value.contacts);
      for (const contact of contacts.value) {
        const latest = peekConversation(contact.id)?.turns.at(-1);
        if (!latest || turnTimestamp(latest) !== contact.lastMessageAt) continue;
        if (latest.assistantText == null) latest.voice = mergeVoice(latest.voice, contact.lastMessageVoice);
        else {
          const message = latest.assistantMessages?.at(-1);
          if (message) message.voice = mergeVoice(message.voice, contact.lastMessageVoice);
        }
      }
      if (!keepsOlder) nextCursor.value = page.value.nextCursor;
      contactsLoaded.value = true;
      contactsError.value = null;
    } else if (!(contactsLoaded.value && isTransientFailure(page.reason))) {
      // Background revalidation keeps loaded rows visible through transient failures.
      contactsError.value = errorMessage(page.reason);
    }
    if (groupList.status === 'fulfilled') {
      groups.value = mergeGroups(groupList.value.groups);
      contributorModel.value = groupList.value.contributorModel;
      groupsLoaded.value = true;
      groupsError.value = null;
      // Reconcile summary receipts back into the matching cached message.
      for (const group of groups.value) {
        const cached = peekGroupConversation(group.id);
        const message = cached?.messages.find((item) => item.id === group.lastMessageID);
        if (message) {
          message.receiptState = mergeReceipt(message.receiptState, group.lastMessageReceiptState);
          message.voice = mergeVoice(message.voice, group.lastMessageVoice);
        }
      }
      void confirmPreviews();
    } else if (!(groupsLoaded.value && isTransientFailure(groupList.reason))) {
      groupsError.value = errorMessage(groupList.reason);
    }
    announce(before.contacts, before.groups);
    warm();
  })().finally(() => { refreshingLists = null; });
  await refreshingLists;
}

async function refreshInvitations() {
  refreshingInvitations ??= (async () => {
    const started = generation;
    try {
      const [contactInbox, groupInbox] = await Promise.all([
        api<{ invitations: ReceivedContactInvitation[]; contributorModel: boolean }>('contacts/sharing/inbox'),
        api<{ invitations: GroupInvitation[]; contributorModel: boolean }>('groups/invitations'),
      ]);
      if (started !== generation) return;
      contactInvitations.value = contactInbox.invitations;
      groupInvitations.value = groupInbox.invitations;
      contributorModel.value = contactInbox.contributorModel || groupInbox.contributorModel;
    } catch { /* Invitations keep their last known value. */ }
  })().finally(() => { refreshingInvitations = null; });
  await refreshingInvitations;
}

async function refresh() {
  await Promise.all([refreshLists(), refreshInvitations()]);
}

async function loadMore() {
  if (!nextCursor.value) return;
  const started = generation;
  const page = await api<ContactsPage>('contacts', { query: { before: nextCursor.value } });
  if (started !== generation) return;
  const ids = new Set(contacts.value.map((contact) => contact.id));
  contacts.value = [...contacts.value, ...page.contacts.filter((contact) => !ids.has(contact.id))];
  nextCursor.value = page.nextCursor;
}

// The directory is alphabetical, so it needs every page (bounded like iOS lists).
async function loadAllContacts() {
  if (!contactsLoaded.value) await refreshLists();
  for (let pages = 0; nextCursor.value && pages < 40; pages += 1) await loadMore();
  allContactsLoaded.value = !nextCursor.value;
}

async function setInitiative(id: string, enabled: boolean): Promise<Contact | null> {
  const started = ++generation;
  const result = await api<{ contact: Contact }>(`contacts/${id}/initiative`, { method: 'PUT', json: { enabled } });
  if (started !== generation) return null;
  generation += 1; // Reject reads started while the mutation was pending.
  upsertContact(result.contact);
  return result.contact;
}

// Sets or clears (null) this account's private alias. The response is authoritative, so it is
// applied even if a list refresh ran meanwhile; the generation bump rejects reads begun before it.
async function setAlias(id: string, alias: string | null): Promise<Contact> {
  const result = await api<{ contact: Contact }>(`contacts/${id}/alias`, { method: 'PATCH', json: { alias } });
  generation += 1;
  upsertContact(result.contact);
  // Other caches hold names the server resolved with the previous alias.
  applyContactAlias(result.contact.agentID, result.contact.name);
  forgetAllTasks(); forgetAllDocuments(); forgetAllGroupMessageInfo(); forgetAllConversationLearning(); staleHome();
  void refreshLists().catch(() => {});
  return result.contact;
}

function upsertContact(contact: Contact) {
  const index = contacts.value.findIndex((item) => item.id === contact.id);
  if (index === -1) contacts.value = [contact, ...contacts.value];
  else contacts.value.splice(index, 1, { ...contacts.value[index]!, ...contact });
}

function removeContact(id: string) {
  forgetConversationLearning(`contacts/${id}`);
  generation += 1;
  clearPrivateImages(); clearVoiceAudio();
  forgetPersonality(id);
  forgetConversation(id);
  contacts.value = contacts.value.filter((contact) => contact.id !== id);
  readGuards.delete(`contact:${id}`);
}

function updateGroup(id: string, changes: Partial<ChatGroup>) {
  const index = groups.value.findIndex((item) => item.id === id);
  if (index !== -1) groups.value.splice(index, 1, { ...groups.value[index]!, ...changes });
}

function removeGroup(id: string) {
  generation += 1;
  clearPrivateImages(); clearVoiceAudio();
  forgetGroup(id);
  groups.value = groups.value.filter((group) => group.id !== id);
  readGuards.delete(`group:${id}`);
}

// Counters change only on server acknowledgement and never move the watermark back.
function applyRead(kind: 'contact' | 'group', id: string, sequence: number, unread: number) {
  const key = `${kind}:${id}`;
  if (sequence < (readGuards.get(key)?.sequence ?? 0)) return;
  readGuards.set(key, { sequence, unread });
  if (kind === 'contact') {
    const index = contacts.value.findIndex((item) => item.id === id);
    if (index !== -1) contacts.value.splice(index, 1, { ...contacts.value[index]!, lastReadSequence: sequence, unreadCount: unread });
  } else {
    updateGroup(id, { lastReadSequence: sequence, unreadCount: unread });
  }
}

// Chat list second line (docs/chats.md#chat-list-previews), in priority order: live
// activity, an unsent draft, a reaction newer than the last message, the last message.
function draftPreview(text: string | undefined) {
  const value = text?.replace(/\s+/g, ' ').trim();
  return value ? [...value].slice(0, 500).join('') : null;
}
function withDraft(row: ChatRow, draft: string | null): ChatRow {
  return draft ? { ...row, draft: true, preview: draft, sender: 'Draft', voice: null, own: false, sending: false, readAt: null, receiptState: null } : row;
}
function withReaction(row: ChatRow, reaction: LastReaction | null | undefined, group: boolean): ChatRow {
  if (!reaction || reaction.at <= row.at || row.sending) return row;
  const sender = reaction.own ? 'You' : group ? (reaction.name || null) : null;
  return { ...row, preview: `${sender ? 'reacted' : 'Reacted'} with ${reaction.emoji}`, sender, voice: null, own: false, readAt: null, receiptState: null };
}

function contactRow(contact: Contact): ChatRow | null {
  if (contact.setupPending === 1) {
    return { kind: 'contact', archived: false, canClear: false, canDelete: false, id: contact.id, name: contact.name, photoPath: contactPhotoPath(contact),
      voice: null, preview: 'Creating…', sender: null, at: contact.createdAt, unread: 0, own: false, sending: false, readAt: null, receiptState: null, setupPending: true };
  }
  const draft = contact.clearing === 1 ? null : draftPreview(peekConversation(contact.id)?.draft);
  const message = contactMessageRow(contact);
  // A draft keeps a chat without messages in the list.
  const row = message ?? (draft ? { kind: 'contact' as const, archived: contact.archivedAt != null, canClear: true, canDelete: true, id: contact.id, name: contact.name,
    photoPath: contactPhotoPath(contact), voice: null, preview: '', sender: null, at: contact.createdAt, unread: Math.max(0, contact.unreadCount ?? 0),
    own: false, sending: false, readAt: null, receiptState: null } : null);
  if (row && contact.clearing === 1) return { ...row, voice: null, preview: 'Cleaning up...' };
  if (row && (contact.replyActivity === 'typing' || contact.replyActivity === 'recording' || contact.replyActivity === 'researching')) {
    return { ...row, voice: null, preview: contact.replyActivity === 'researching' ? 'Researching...' : contact.replyActivity === 'recording' ? 'Recording...' : 'Typing...', own: false, sender: null, sending: false, receiptState: null };
  }
  return row && withDraft(withReaction(row, contact.lastReaction, false), draft);
}

function contactMessageRow(contact: Contact): ChatRow | null {
  const cached = peekConversation(contact.id);
  const base = {
    kind: 'contact' as const, archived: contact.archivedAt != null, canClear: true, canDelete: true, id: contact.id, name: contact.name, photoPath: contactPhotoPath(contact),
    sender: null, unread: Math.max(0, contact.unreadCount ?? 0), receiptState: null,
  };
  const pending = cached?.pending;
  if (pending && !cached.turns.some((turn) => turn.id === pending.id)) {
    return { ...base, voice: pending.voice ? { durationMs: pending.voice.durationMs, listenedAt: null, transcript: null } : null, preview: pending.voice ? voicePreviewLabel(pending.voice) : pending.text || (pending.sticker ? `Sticker ${pending.sticker.emoji}` : pending.attachment ? `Attachment: ${pending.attachment.name}` : ''),
      at: pending.createdAt, own: true, sending: true, readAt: null };
  }
  const latest = cached?.turns.at(-1);
  if (latest && turnTimestamp(latest) >= (contact.lastMessageAt ?? 0)) {
    const at = turnTimestamp(latest);
    const voice = at === contact.lastMessageAt ? mergeVoice(latestTurnVoice(latest), contact.lastMessageVoice) : latestTurnVoice(latest);
    const reads = [latest.readAt, at === contact.lastMessageAt ? contact.lastMessageReadAt : null].filter((value): value is number => value != null);
    return { ...base, voice, preview: voice ? voicePreviewLabel(voice) : latest.assistantText != null ? [...plainMessageMarkdown(latest.assistantText)].slice(0, 500).join('') : turnPreview(latest), at, own: turnFromUser(latest), sending: false,
      readAt: reads.length ? Math.max(...reads) : null };
  }
  if (contact.lastMessageAt == null) return contact.onboardingChat === 1 || contact.archivedAt != null || contact.clearing === 1
    ? { ...base, preview: contact.clearing === 1 ? 'Cleaning up...' : 'No messages yet', at: contact.createdAt, own: false, sending: false, readAt: null } : null;
  return { ...base, voice: contact.lastMessageVoice, preview: contact.lastMessageVoice ? voicePreviewLabel(contact.lastMessageVoice) : contact.lastMessagePreview ?? (contact.lastMessageFromUser === 0 ? plainMessageMarkdown(contact.lastMessageText ?? '') : contact.lastMessageText ?? ''), at: contact.lastMessageAt, own: contact.lastMessageFromUser === 1,
    sending: false, readAt: contact.lastMessageReadAt ?? null };
}

function groupRow(group: ChatGroup, me: string | undefined): ChatRow {
  const cached = peekGroupConversation(group.id);
  let voice = group.lastMessageVoice;
  let preview = group.lastMessagePreview ?? (group.lastMessageUserID == null ? plainMessageMarkdown(group.lastMessageText ?? 'No messages yet') : group.lastMessageText ?? 'No messages yet');
  let at = group.lastMessageAt ?? group.createdAt;
  let sender = group.lastMessageSenderName;
  let userID = group.lastMessageUserID ?? null;
  let receiptState = group.lastMessageReceiptState ?? null;
  let sending = false;
  const last = cached ? lastGroupChatMessage(cached.messages) : undefined;
  if (last && (last.id === group.lastMessageID || last.createdAt >= (group.lastMessageAt ?? 0))) {
    voice = last.id === group.lastMessageID ? mergeVoice(last.voice, group.lastMessageVoice) : last.voice;
    preview = last.text ? [...(last.agentID ? plainMessageMarkdown(last.text) : last.text)].slice(0, 500).join('') : (last.attachments?.length ?? 0) > 1 ? `${last.attachments!.length} photos` : last.attachment?.sticker ? `Sticker ${last.attachment.sticker.emoji}` : last.attachment ? `Attachment: ${last.attachment.name}` : '';
    at = last.createdAt;
    sender = last.senderName;
    userID = last.userID;
    receiptState = last.id === group.lastMessageID ? mergeReceipt(last.receiptState, group.lastMessageReceiptState) : (last.receiptState ?? null);
  }
  const pending = cached?.pending;
  if (pending && !cached.messages.some((message) => message.id === pending.id)) {
    voice = pending.voice ? { durationMs: pending.voice.durationMs, listenedAt: null, transcript: null } : null;
    preview = pending.text || (pending.sticker ? `Sticker ${pending.sticker.emoji}` : pending.attachment ? `Attachment: ${pending.attachment.name}` : '');
    at = pending.createdAt;
    userID = me ?? null;
    receiptState = 'sent';
    sending = !pending.accepted;
  }
  if (voice) preview = voicePreviewLabel(voice);
  const own = !!userID && userID === me;
  const row: ChatRow = {
    kind: 'group', voice: group.replyActivity || group.clearing === 1 ? null : voice, archived: group.archivedAt != null, canClear: group.ownerID === me, canDelete: false, id: group.id, name: group.name, photoPath: groupPhotoPath(group), preview: group.clearing===1 ? 'Cleaning up...' : group.replyActivity ?? preview,
    sender: group.replyActivity ? null : own ? 'You' : sender, at, unread: Math.max(0, group.unreadCount ?? 0),
    own: group.replyActivity ? false : own, sending, readAt: null, receiptState: receiptState ?? 'sent',
  };
  if (group.replyActivity || group.clearing === 1) return row;
  return withDraft(withReaction(row, group.lastReaction, true), draftPreview(cached?.draft));
}

const loaded = computed(() => contactsLoaded.value && groupsLoaded.value);
const error = computed(() => contactsError.value ?? groupsError.value);

const allRows = computed<ChatRow[]>(() => {
  // Publish the mixed list only after both sources load, unless one failed:
  // then show whatever rows are available alongside the retry control.
  if (!loaded.value && !error.value) return [];
  const me = useSession().user.value?.id;
  const contactRows = contacts.value.map(contactRow).filter((row): row is ChatRow => row !== null);
  const groupRows = groups.value.map((group) => groupRow(group, me));
  return [...contactRows, ...groupRows].sort((a, b) => b.at - a.at || b.id.localeCompare(a.id));
});

const rows = computed(() => allRows.value.filter(row => !row.archived));
const archivedRows = computed(() => allRows.value.filter(row => row.archived));
const directory = computed(() => [...contacts.value].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })));
const totalUnread = computed(() => allRows.value.reduce((sum, row) => sum + row.unread, 0));
const invitationCount = computed(() => contactInvitations.value.length + groupInvitations.value.length);

export function useChats() {
  return {
    contacts, groups, rows, archivedRows, directory, totalUnread, nextCursor, loaded, contactsLoaded, groupsLoaded, allContactsLoaded, error,
    contactInvitations, groupInvitations, invitationCount, contributorModel,
    archiveChat, clearChat, deleteChatContact, refresh, refreshLists, refreshInvitations, loadMore, loadAllContacts, setInitiative, setAlias, upsertContact, removeContact, updateGroup, removeGroup, applyRead,
  };
}

function purgeHistory(kind: 'contact' | 'group', id: string) {
  forgetConversationLearning(`${kind === 'contact' ? 'contacts' : 'groups'}/${id}`);
  if (kind === 'contact') { forgetConversation(id); forgetPersonality(id); }
  else forgetGroup(id);
  readGuards.delete(`${kind}:${id}`);
  clearPrivateImages(); clearVoiceAudio();
}

let lifecycleBusy = false;
async function lifecycleMutation(operation: () => Promise<void>) {
  if (lifecycleBusy) throw new Error('Please wait for the current change to finish.');
  const owner = useSession().user.value?.id;
  lifecycleBusy = true;
  generation += 1;
  try {
    await operation();
    if (useSession().user.value?.id !== owner) return;
    generation += 1;
    // An older shared refresh must settle before starting the replacement.
    await refreshingLists;
    await refreshLists();
  } finally { lifecycleBusy = false; }
}
async function archiveChat(kind: 'contact' | 'group', id: string, archived: boolean) {
  await lifecycleMutation(async () => {
    const owner = useSession().user.value?.id;
    await api(`${kind === 'contact' ? 'contacts' : 'groups'}/${id}/archive`,{method:'PUT',json:{archived}});
    if (useSession().user.value?.id !== owner) return;
    const archivedAt = archived ? Date.now() : null;
    if (kind === 'contact') {
      const contact = contacts.value.find(item=>item.id===id);
      if (contact) upsertContact({...contact,archivedAt});
    } else updateGroup(id,{archivedAt});
  });
}
async function clearChat(kind: 'contact' | 'group', id: string, clearMemory: boolean) {
  await lifecycleMutation(async () => {
    const owner = useSession().user.value?.id;
    const historyRevision = (kind==='contact' ? contacts.value.find(item=>item.id===id) : groups.value.find(item=>item.id===id))?.historyRevision ?? 0;
    await api(`${kind === 'contact' ? 'contacts' : 'groups'}/${id}/clear`,{method:'POST',json:{clearMemory,historyRevision}});
    if (useSession().user.value?.id !== owner) return;
    purgeHistory(kind,id);
    if (kind === 'contact') {
      const result = await api<{contact:Contact}>(`contacts/${id}`);
      if (useSession().user.value?.id === owner) upsertContact(result.contact);
    }
  });
}
async function deleteChatContact(id: string) {
  await lifecycleMutation(async () => {
    const owner = useSession().user.value?.id;
    await api(`contacts/${id}`,{method:'DELETE'});
    if (useSession().user.value?.id !== owner) return;
    removeContact(id);
    forgetContactEnergy(id);
    forgetMcpConnections(id);
    forgetMiniApps(`contacts/${id}`);
    forgetRead(`contact:${id}`);
  });
}

// Creators delete the contact for everyone; shared participants only leave it.
export function contactDeletionWarning(name: string | undefined, canManage: boolean) {
  return canManage
    ? `This permanently deletes ${name ?? 'this contact'} for everyone, including all participants' chats, schedules, memories, and this contact's group messages and work.`
    : 'This removes your access and deletes your private chat, schedules, and contributed memories. Other participants keep the contact.';
}
