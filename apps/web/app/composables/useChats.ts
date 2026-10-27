import type { ChatGroup, Contact, ContactsPage, GroupInvitation, ReceivedContactInvitation } from '~/utils/types';

// Session cache for the chat list, the contact directory, and both invitation
// inboxes. Loaded data renders synchronously on navigation; refreshes run in the
// background and keep the previous content visible when they fail.
export type ChatRow =
  | { kind: 'contact'; id: string; name: string; photoPath: string | null; preview: string; sender: null; at: number; unread: number }
  | { kind: 'group'; id: string; name: string; photoPath: string | null; preview: string; sender: string | null; at: number; unread: number };

const contacts = ref<Contact[]>([]);
const nextCursor = ref<string | null>(null);
const groups = ref<ChatGroup[]>([]);
const contactInvitations = ref<ReceivedContactInvitation[]>([]);
const groupInvitations = ref<GroupInvitation[]>([]);
const contributorModel = ref(false);
const loaded = ref(false);
const allContactsLoaded = ref(false);
const error = ref<string | null>(null);
let refreshing: Promise<void> | null = null;
let generation = 0;

registerSessionReset(() => {
  generation += 1;
  contacts.value = [];
  nextCursor.value = null;
  groups.value = [];
  contactInvitations.value = [];
  groupInvitations.value = [];
  contributorModel.value = false;
  loaded.value = false;
  allContactsLoaded.value = false;
  error.value = null;
  refreshing = null;
});

export function contactPhotoPath(contact: Pick<Contact, 'id' | 'photoVersion'>) {
  return contact.photoVersion ? `contacts/${contact.id}/photo?version=${encodeURIComponent(contact.photoVersion)}` : null;
}
export function groupPhotoPath(group: Pick<ChatGroup, 'id' | 'photoVersion'>) {
  return group.photoVersion ? `groups/${group.id}/photo?version=${encodeURIComponent(group.photoVersion)}` : null;
}

function mergeContacts(firstPage: Contact[]) {
  // Keep rows from later pages that the refreshed first page did not cover.
  const ids = new Set(firstPage.map((contact) => contact.id));
  const oldest = firstPage.at(-1);
  const boundary = oldest ? (oldest.lastMessageAt ?? oldest.createdAt) : Infinity;
  const older = contacts.value.filter((contact) => !ids.has(contact.id) && (contact.lastMessageAt ?? contact.createdAt) < boundary);
  return [...firstPage, ...older];
}

async function refresh() {
  refreshing ??= (async () => {
    const started = generation;
    try {
      const [page, groupList, contactInbox, groupInbox] = await Promise.all([
        api<ContactsPage>('contacts'),
        api<{ groups: ChatGroup[]; contributorModel: boolean }>('groups'),
        api<{ invitations: ReceivedContactInvitation[]; contributorModel: boolean }>('contacts/sharing/inbox'),
        api<{ invitations: GroupInvitation[] }>('groups/invitations'),
      ]);
      if (started !== generation) return;
      const keepsOlder = contacts.value.length > page.contacts.length;
      contacts.value = mergeContacts(page.contacts);
      if (!keepsOlder) nextCursor.value = page.nextCursor;
      groups.value = groupList.groups;
      contributorModel.value = groupList.contributorModel || contactInbox.contributorModel;
      contactInvitations.value = contactInbox.invitations;
      groupInvitations.value = groupInbox.invitations;
      loaded.value = true;
      error.value = null;
    } catch (failure) {
      if (started === generation) error.value = errorMessage(failure);
    } finally {
      refreshing = null;
    }
  })();
  await refreshing;
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
  if (!loaded.value) await refresh();
  for (let pages = 0; nextCursor.value && pages < 40; pages += 1) await loadMore();
  allContactsLoaded.value = !nextCursor.value;
}

function upsertContact(contact: Contact) {
  const index = contacts.value.findIndex((item) => item.id === contact.id);
  if (index === -1) contacts.value = [contact, ...contacts.value];
  else contacts.value.splice(index, 1, { ...contacts.value[index]!, ...contact });
}

function removeContact(id: string) {
  contacts.value = contacts.value.filter((contact) => contact.id !== id);
}

function updateContactActivity(id: string, changes: Partial<Contact>) {
  const index = contacts.value.findIndex((item) => item.id === id);
  if (index !== -1) contacts.value.splice(index, 1, { ...contacts.value[index]!, ...changes });
}

function updateGroup(id: string, changes: Partial<ChatGroup>) {
  const index = groups.value.findIndex((item) => item.id === id);
  if (index !== -1) groups.value.splice(index, 1, { ...groups.value[index]!, ...changes });
}

function removeGroup(id: string) {
  groups.value = groups.value.filter((group) => group.id !== id);
}

const rows = computed<ChatRow[]>(() => {
  const contactRows: ChatRow[] = contacts.value
    .filter((contact) => contact.lastMessageAt !== null)
    .map((contact) => ({
      kind: 'contact', id: contact.id, name: contact.name, photoPath: contactPhotoPath(contact),
      preview: contact.lastMessageText ?? '', sender: null, at: contact.lastMessageAt!, unread: Math.max(0, contact.unreadCount ?? 0),
    }));
  const groupRows: ChatRow[] = groups.value.map((group) => ({
    kind: 'group', id: group.id, name: group.name, photoPath: groupPhotoPath(group),
    preview: group.lastMessageText ?? 'No messages yet', sender: group.lastMessageSenderName,
    at: group.lastMessageAt ?? group.createdAt, unread: Math.max(0, group.unreadCount ?? 0),
  }));
  return [...contactRows, ...groupRows].sort((a, b) => b.at - a.at || b.id.localeCompare(a.id));
});

const directory = computed(() => [...contacts.value].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })));
const totalUnread = computed(() => rows.value.reduce((sum, row) => sum + row.unread, 0));
const invitationCount = computed(() => contactInvitations.value.length + groupInvitations.value.length);

export function useChats() {
  return {
    contacts, groups, rows, directory, totalUnread, nextCursor, loaded, allContactsLoaded, error,
    contactInvitations, groupInvitations, invitationCount, contributorModel,
    refresh, loadMore, loadAllContacts, upsertContact, removeContact, updateContactActivity, updateGroup, removeGroup,
  };
}
