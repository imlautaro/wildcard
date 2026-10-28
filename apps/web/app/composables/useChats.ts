import { plainMessageMarkdown } from '~/utils/messageMarkdown';
import type { ChatGroup, Contact, ContactsPage, GroupInvitation, ReceivedContactInvitation } from '~/utils/types';

// Session cache for the chat list, the contact directory, and both invitation
// inboxes. Loaded data renders synchronously on navigation; refreshes run in the
// background and keep the previous content visible when they fail. Rows project
// the cached conversation (latest turn/message, pending send, receipts) when it is
// at least as recent as the server summary, like the iOS Home list.
export type ChatRow = {
  kind: 'contact' | 'group';
  id: string;
  name: string;
  photoPath: string | null;
  preview: string;
  sender: string | null;
  at: number;
  unread: number;
  own: boolean;
  sending: boolean;
  readAt: number | null;
  receiptState: string | null;
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
    if (cached?.loaded && (cached.pending || (group.lastMessageID && group.lastMessageID !== cached.messages.at(-1)?.id))) {
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

async function refreshLists() {
  refreshingLists ??= (async () => {
    const started = generation;
    const [page, groupList] = await Promise.allSettled([
      api<ContactsPage>('contacts'),
      api<{ groups: ChatGroup[]; contributorModel: boolean }>('groups'),
    ]);
    if (started !== generation) return;
    if (page.status === 'fulfilled') {
      const keepsOlder = contacts.value.length > page.value.contacts.length;
      contacts.value = mergeContacts(page.value.contacts);
      if (!keepsOlder) nextCursor.value = page.value.nextCursor;
      contactsLoaded.value = true;
      contactsError.value = null;
    } else {
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
        if (message) message.receiptState = mergeReceipt(message.receiptState, group.lastMessageReceiptState);
      }
      void confirmPreviews();
    } else {
      groupsError.value = errorMessage(groupList.reason);
    }
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

function upsertContact(contact: Contact) {
  const index = contacts.value.findIndex((item) => item.id === contact.id);
  if (index === -1) contacts.value = [contact, ...contacts.value];
  else contacts.value.splice(index, 1, { ...contacts.value[index]!, ...contact });
}

function removeContact(id: string) {
  forgetConversation(id);
  contacts.value = contacts.value.filter((contact) => contact.id !== id);
  readGuards.delete(`contact:${id}`);
}

function updateGroup(id: string, changes: Partial<ChatGroup>) {
  const index = groups.value.findIndex((item) => item.id === id);
  if (index !== -1) groups.value.splice(index, 1, { ...groups.value[index]!, ...changes });
}

function removeGroup(id: string) {
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

function contactRow(contact: Contact): ChatRow | null {
  const cached = peekConversation(contact.id);
  const base = {
    kind: 'contact' as const, id: contact.id, name: contact.name, photoPath: contactPhotoPath(contact),
    sender: null, unread: Math.max(0, contact.unreadCount ?? 0), receiptState: null,
  };
  const pending = cached?.pending;
  if (pending && !cached.turns.some((turn) => turn.id === pending.id)) {
    return { ...base, preview: pending.text || (pending.attachment ? `Attachment: ${pending.attachment.name}` : ''),
      at: pending.createdAt, own: true, sending: true, readAt: null };
  }
  const latest = cached?.turns.at(-1);
  if (latest && turnTimestamp(latest) >= (contact.lastMessageAt ?? 0)) {
    const at = turnTimestamp(latest);
    const reads = [latest.readAt, at === contact.lastMessageAt ? contact.lastMessageReadAt : null].filter((value): value is number => value != null);
    return { ...base, preview: latest.assistantText != null ? [...plainMessageMarkdown(latest.assistantText)].slice(0, 500).join('') : turnPreview(latest), at, own: turnFromUser(latest), sending: false,
      readAt: reads.length ? Math.max(...reads) : null };
  }
  if (contact.lastMessageAt === null) return null;
  return { ...base, preview: contact.lastMessagePreview ?? (contact.lastMessageFromUser === 0 ? plainMessageMarkdown(contact.lastMessageText ?? '') : contact.lastMessageText ?? ''), at: contact.lastMessageAt, own: contact.lastMessageFromUser === 1,
    sending: false, readAt: contact.lastMessageReadAt ?? null };
}

function groupRow(group: ChatGroup, me: string | undefined): ChatRow {
  const cached = peekGroupConversation(group.id);
  let preview = group.lastMessagePreview ?? (group.lastMessageUserID == null ? plainMessageMarkdown(group.lastMessageText ?? 'No messages yet') : group.lastMessageText ?? 'No messages yet');
  let at = group.lastMessageAt ?? group.createdAt;
  let sender = group.lastMessageSenderName;
  let userID = group.lastMessageUserID ?? null;
  let receiptState = group.lastMessageReceiptState ?? null;
  let sending = false;
  const last = cached?.messages.at(-1);
  if (last && (last.id === group.lastMessageID || last.createdAt >= (group.lastMessageAt ?? 0))) {
    preview = last.text ? [...(last.agentID ? plainMessageMarkdown(last.text) : last.text)].slice(0, 500).join('') : last.attachment ? `Attachment: ${last.attachment.name}` : '';
    at = last.createdAt;
    sender = last.senderName;
    userID = last.userID;
    receiptState = last.id === group.lastMessageID ? mergeReceipt(last.receiptState, group.lastMessageReceiptState) : (last.receiptState ?? null);
  }
  const pending = cached?.pending;
  if (pending && !cached.messages.some((message) => message.id === pending.id)) {
    preview = pending.text || (pending.attachment ? `Attachment: ${pending.attachment.name}` : '');
    at = pending.createdAt;
    userID = me ?? null;
    receiptState = 'sent';
    sending = !pending.accepted;
  }
  const own = !!userID && userID === me;
  return {
    kind: 'group', id: group.id, name: group.name, photoPath: groupPhotoPath(group), preview,
    sender: own ? 'You' : sender, at, unread: Math.max(0, group.unreadCount ?? 0),
    own, sending, readAt: null, receiptState: receiptState ?? 'sent',
  };
}

const loaded = computed(() => contactsLoaded.value && groupsLoaded.value);
const error = computed(() => contactsError.value ?? groupsError.value);

const rows = computed<ChatRow[]>(() => {
  // Publish the mixed list only after both sources load, unless one failed:
  // then show whatever rows are available alongside the retry control.
  if (!loaded.value && !error.value) return [];
  const me = useSession().user.value?.id;
  const contactRows = contacts.value.map(contactRow).filter((row): row is ChatRow => row !== null);
  const groupRows = groups.value.map((group) => groupRow(group, me));
  return [...contactRows, ...groupRows].sort((a, b) => b.at - a.at || b.id.localeCompare(a.id));
});

const directory = computed(() => [...contacts.value].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })));
const totalUnread = computed(() => rows.value.reduce((sum, row) => sum + row.unread, 0));
const invitationCount = computed(() => contactInvitations.value.length + groupInvitations.value.length);

export function useChats() {
  return {
    contacts, groups, rows, directory, totalUnread, nextCursor, loaded, contactsLoaded, groupsLoaded, allContactsLoaded, error,
    contactInvitations, groupInvitations, invitationCount, contributorModel,
    refresh, refreshLists, refreshInvitations, loadMore, loadAllContacts, upsertContact, removeContact, updateGroup, removeGroup, applyRead,
  };
}
