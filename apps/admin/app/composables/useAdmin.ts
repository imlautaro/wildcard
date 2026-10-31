import type { LabContact, LabResult, Overview, Setting, UserSummary } from '~/utils/types';

// Session-owned caches for the admin screens. Navigation shows the cached
// value at once and revalidates in the background; a transient failure keeps
// the cached value visible. A revision counter rejects responses that started
// before a reset, a mutation or a newer request. Nothing is persisted.
const overview = ref<Overview | null>(null);
const settings = ref<Setting[] | null>(null);
const users = ref<UserSummary[] | null>(null);
const labContacts = ref<LabContact[] | null>(null);
const usersQuery = ref('');
const usersNext = ref<string | null>(null);
const errors = reactive({ overview: null as string | null, settings: null as string | null, users: null as string | null, lab: null as string | null });
const revisions = { overview: 0, settings: 0, users: 0, lab: 0 };
const inflight: Partial<Record<keyof typeof revisions, Promise<void>>> = {};

registerSessionReset(() => {
  overview.value = null;
  settings.value = null;
  users.value = null;
  labContacts.value = null;
  usersQuery.value = '';
  usersNext.value = null;
  Object.assign(errors, { overview: null, settings: null, users: null, lab: null });
  for (const key of Object.keys(revisions) as (keyof typeof revisions)[]) {
    revisions[key] += 1;
    delete inflight[key];
  }
});

function load<K extends keyof typeof revisions>(key: K, request: () => Promise<(revision: number) => void>, hasCache: boolean) {
  inflight[key] ??= (async () => {
    const revision = ++revisions[key];
    try {
      const apply = await request();
      if (revision === revisions[key]) { apply(revision); errors[key] = null; }
    } catch (error) {
      // Keep cached content through transient failures; report anything else.
      if (revision === revisions[key] && (!hasCache || !isTransientFailure(error))) errors[key] = errorMessage(error);
    } finally {
      if (revision === revisions[key]) delete inflight[key];
    }
  })();
  return inflight[key];
}

function loadOverview() {
  return load('overview', async () => {
    const result = await api<Overview>('admin/overview');
    return () => { overview.value = result; };
  }, overview.value !== null);
}

function loadSettings() {
  return load('settings', async () => {
    const result = await api<{ settings: Setting[] }>('admin/settings');
    return () => { settings.value = result.settings; };
  }, settings.value !== null);
}

// Reloads the first page for `query`. Changing the query drops the old list.
function loadUsers(query = usersQuery.value) {
  if (query !== usersQuery.value) {
    usersQuery.value = query;
    users.value = null;
    usersNext.value = null;
    revisions.users += 1;
    delete inflight.users;
  }
  return load('users', async () => {
    const result = await api<{ users: UserSummary[]; next: string | null }>('admin/users', { query: { q: query || undefined } });
    return () => { users.value = result.users; usersNext.value = result.next; };
  }, users.value !== null);
}

async function loadMoreUsers() {
  const cursor = usersNext.value;
  if (!cursor || inflight.users) return;
  await load('users', async () => {
    const result = await api<{ users: UserSummary[]; next: string | null }>('admin/users', { query: { q: usersQuery.value || undefined, before: cursor } });
    return () => {
      const known = new Set(users.value?.map((user) => user.id));
      users.value = [...(users.value ?? []), ...result.users.filter((user) => !known.has(user.id))];
      usersNext.value = result.next;
    };
  }, true);
}

async function saveSetting(key: string, value: boolean) {
  revisions.settings += 1;
  revisions.overview += 1;
  delete inflight.settings;
  delete inflight.overview;
  const result = await api<{ settings: Setting[] }>(`admin/settings/${encodeURIComponent(key)}`, { method: 'PUT', json: { value } });
  settings.value = result.settings;
  void loadOverview();
}

// Acceptance commits D1 removal and durable external cleanup. Remove the row
// immediately; Workflow/R2 cleanup continues independently with automatic retries.
async function deleteUser(user: UserSummary, email: string) {
  await api<{ deleted: true; cleanup: 'pending' }>(`admin/users/${encodeURIComponent(user.id)}`, {
    method: 'DELETE', json: { email },
  });
  revisions.users += 1;
  delete inflight.users;
  users.value = users.value?.filter((row) => row.id !== user.id) ?? null;
  revisions.overview += 1;
  delete inflight.overview;
  void loadOverview();
}

// The admin's own contacts for the mini app lab, with their app counts.
function loadLabContacts() {
  return load('lab', async () => {
    const result = await api<{ contacts: LabContact[] }>('admin/lab/contacts');
    return () => { labContacts.value = result.contacts; };
  }, labContacts.value !== null);
}

// An import changes the chat's app counts and adds an admin event: revalidate both.
async function importLabApps(contactID: string, apps: unknown[], replace: boolean) {
  const result = await api<{ results: LabResult[] }>(`admin/lab/contacts/${encodeURIComponent(contactID)}/mini-apps`, {
    method: 'POST', json: { apps, replace, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
  });
  revisions.lab += 1;
  delete inflight.lab;
  void loadLabContacts();
  revisions.overview += 1;
  delete inflight.overview;
  return result.results;
}

export function useAdmin() {
  return {
    overview: readonly(overview), settings: readonly(settings), users: readonly(users),
    labContacts: readonly(labContacts), usersQuery: readonly(usersQuery), usersNext: readonly(usersNext), errors: readonly(errors),
    loadOverview, loadSettings, loadUsers, loadMoreUsers, saveSetting, deleteUser, loadLabContacts, importLabApps,
  };
}
