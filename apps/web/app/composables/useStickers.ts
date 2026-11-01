import type { Sticker } from '~/utils/types';

// Session-owned sticker caches (docs/stickers.md#web, docs/caching.md#stickers): the
// person's library and one list per contact, memory only. Opening the picker renders the
// cached lists at once, including empty ones, and revalidates in the background when they
// are older than `freshFor`. Reads are deduplicated, mutations update the lists in place
// and invalidate reads that started before them, and sign-out or an account switch clears
// everything. Sticker bytes live in the private image cache (keys carry account, id and digest).
type List = { items: Sticker[]; limit: number | null; loaded: boolean; loadedAt: number; revision: number; request: Promise<void> | null; error: string | null };
const freshFor = 30_000;
const retainedContacts = 20;
const blank = (): List => ({ items: [], limit: null, loaded: false, loadedAt: 0, revision: 0, request: null, error: null });
const library = reactive<List>(blank());
const contacts = shallowReactive(new Map<string, List>());
// Read-only stand-in for a contact whose list was never requested; never stored.
const empty: List = Object.freeze(blank()) as List;

function reset(entry: List) {
  entry.revision++;
  Object.assign(entry, { items: [], limit: null, loaded: false, loadedAt: 0, request: null, error: null });
}
registerSessionReset(() => {
  reset(library);
  for (const entry of contacts.values()) reset(entry);
  contacts.clear();
});
export function forgetContactStickers(contactID: string) {
  const entry = contacts.get(contactID);
  if (entry) reset(entry);
  contacts.delete(contactID);
}

function contactEntry(contactID: string): List {
  let entry = contacts.get(contactID);
  if (entry) {
    contacts.delete(contactID);
    contacts.set(contactID, entry);
    return entry;
  }
  entry = reactive(blank()) as List;
  contacts.set(contactID, entry);
  for (const key of contacts.keys()) {
    if (contacts.size <= retainedContacts) break;
    if (key !== contactID) forgetContactStickers(key);
  }
  return entry;
}

function upsert(entry: List, sticker: Sticker) {
  entry.items = [sticker, ...entry.items.filter((item) => item.id !== sticker.id)];
}

// The read each list is waiting for; a mutation supersedes it, so a stale read never clears a newer one.
const current = new WeakMap<object, object>();
async function read(entry: List, valid: () => boolean, load: () => Promise<{ stickers: Sticker[]; limit?: number }>, force: boolean) {
  if (entry.request) return entry.request;
  if (!force && entry.loaded && Date.now() - entry.loadedAt < freshFor) return;
  const revision = entry.revision;
  const token = {};
  const request: Promise<void> = (async () => {
    try {
      const value = await load();
      if (!valid() || entry.revision !== revision) return;
      entry.items = value.stickers;
      if (value.limit !== undefined) entry.limit = value.limit;
      entry.loaded = true; entry.loadedAt = Date.now(); entry.error = null;
    } catch (failure) {
      if (!valid() || entry.revision !== revision) return;
      // Loaded stickers stay usable through transient failures.
      entry.loadedAt = entry.loaded ? Date.now() : 0;
      if (entry.loaded && isTransientFailure(failure)) return;
      if (failure instanceof ApiError && failure.status === 404) { entry.items = []; entry.loaded = true; }
      entry.error = errorMessage(failure);
    } finally {
      if (current.get(entry) === token) { current.delete(entry); entry.request = null; }
    }
  })();
  current.set(entry, token);
  entry.request = request;
  return request;
}

export function useStickers() {
  const accountID = () => useSession().user.value?.id ?? '';
  // A mutation that finishes after an account switch must not touch the new account's lists.
  function guard() {
    const account = accountID();
    return () => accountID() === account;
  }

  const refreshLibrary = (force = false) => {
    const valid = guard();
    return read(library, valid, () => api<{ stickers: Sticker[]; limit: number }>('stickers'), force);
  };
  const refreshContact = (contactID: string, force = false) => {
    const valid = guard();
    const entry = contactEntry(contactID);
    return read(entry, () => valid() && contacts.get(contactID) === entry,
      () => api<{ stickers: Sticker[] }>(`contacts/${contactID}/stickers`), force);
  };
  const contactList = (contactID: string): List => contacts.get(contactID) ?? empty;

  // A mutation supersedes every read that started before it.
  function applied(change: () => void) {
    library.revision++;
    library.request = null;
    current.delete(library);
    change();
  }

  async function create(emoji: string, data: string): Promise<Sticker> {
    const valid = guard();
    const { sticker } = await api<{ sticker: Sticker }>('stickers', { json: { emoji, data } });
    if (valid()) applied(() => { upsert(library, sticker); });
    return sticker;
  }
  async function remove(sticker: Sticker) {
    const valid = guard();
    try { await api('stickers/' + sticker.id, { method: 'DELETE' }); }
    catch (failure) { if (!(failure instanceof ApiError && failure.status === 404)) throw failure; }
    if (valid()) applied(() => { library.items = library.items.filter((item) => item.id !== sticker.id); });
  }
  async function setEmoji(sticker: Sticker, emoji: string) {
    const valid = guard();
    const { sticker: updated } = await api<{ sticker: Sticker }>(`stickers/${sticker.id}`, { method: 'PATCH', json: { emoji } });
    if (valid()) applied(() => { library.items = library.items.map((item) => item.id === updated.id ? updated : item); });
  }
  // Saving deduplicates by digest on the server: an existing entry comes back unchanged.
  async function saveFromContact(contactID: string, sticker: Sticker): Promise<Sticker> {
    const valid = guard();
    const { sticker: saved } = await api<{ sticker: Sticker }>(`contacts/${contactID}/stickers/${sticker.id}/save`, { method: 'POST' });
    if (valid()) applied(() => { if (!library.items.some((item) => item.id === saved.id)) upsert(library, saved); });
    return saved;
  }
  async function saveFromMessage(contactID: string, turnID: string, part: number): Promise<Sticker> {
    const valid = guard();
    const { sticker: saved } = await api<{ sticker: Sticker }>('stickers/save', { json: { contactID, turnID, part } });
    if (valid()) applied(() => { if (!library.items.some((item) => item.id === saved.id)) upsert(library, saved); });
    return saved;
  }
  const hasDigest = (digest: string) => library.items.some((item) => item.digest === digest);

  return { library, refreshLibrary, refreshContact, contactList, create, remove, setEmoji, saveFromContact, saveFromMessage, hasDigest };
}
