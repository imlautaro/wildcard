// Linked contacts of one contact (docs/contacts.md#linked-contacts), matching the iOS
// ContactsStore.linkSnapshots cache: one snapshot per contact, reused synchronously on
// navigation and revalidated in the background. Links are mutual, so every change
// invalidates all snapshots; the response of a change replaces the current one.
export type LinkedContact = { id: string; name: string; photoVersion: string | null };
/** allContacts: "Contacts share with each other" is on, so every eligible contact is linked too (docs/privacy.md). */
export type ContactLinks = { links: LinkedContact[]; available: LinkedContact[]; unavailable: string | null; allContacts?: boolean };
type Snapshot = { value: ContactLinks | null; revision: number; request: Promise<void> | null };
const snapshots = shallowReactive(new Map<string, Snapshot>());
registerSessionReset(() => { for (const entry of snapshots.values()) entry.revision++; snapshots.clear(); });

/** Privacy changes (a private chat, contacts sharing) change every snapshot; drop them all. */
export function invalidateContactLinks() { for (const entry of snapshots.values()) entry.revision++; snapshots.clear(); }

export function useContactLinks(contactID: MaybeRefOrGetter<string>) {
  const state = computed(() => snapshots.get(toValue(contactID))?.value ?? null);
  const busy = ref(false), error = ref<string | null>(null);
  function entry(key: string) {
    let current = snapshots.get(key);
    if (!current) {
      current = reactive({ value: null, revision: 0, request: null }) as Snapshot;
      snapshots.set(key, current);
      while (snapshots.size > 8) { const oldest = snapshots.keys().next().value!; snapshots.get(oldest)!.revision++; snapshots.delete(oldest); }
    }
    return current;
  }
  async function refresh() {
    const key = toValue(contactID), current = entry(key);
    if (current.request) return current.request;
    const revision = current.revision;
    current.request = (async () => {
      try {
        const value = await api<ContactLinks>(`contacts/${key}/links`);
        if (snapshots.get(key) === current && current.revision === revision) { current.value = value; error.value = null; }
      } catch (failure) {
        if (snapshots.get(key) === current && current.revision === revision) error.value = errorMessage(failure);
      } finally { if (current.revision === revision) current.request = null; }
    })();
    return current.request;
  }
  async function change(otherID: string, link: boolean) {
    if (busy.value) return;
    const key = toValue(contactID);
    for (const item of snapshots.values()) { item.revision++; item.request = null; }
    busy.value = true; error.value = null;
    try {
      const value = await api<ContactLinks>(`contacts/${key}/links/${otherID}`, { method: link ? 'PUT' : 'DELETE' });
      // The other side changed too; drop its snapshot so it refetches.
      const other = snapshots.get(otherID);
      if (other) { other.revision++; snapshots.delete(otherID); }
      entry(key).value = value;
    } catch (failure) { error.value = errorMessage(failure); }
    finally { busy.value = false; }
  }
  return { state, busy: readonly(busy), error: readonly(error), refresh, link: (id: string) => change(id, true), unlink: (id: string) => change(id, false) };
}
