import type { ChatDocument, ChatDocumentSummary } from '~/utils/types';

// Session-owned document caches: one list per chat (`contacts/:id` or `groups/:id`)
// and up to 16 open documents. Contacts edit documents during their turns, so lists
// revalidate after five seconds and an open document every five seconds while shown.
type List = { items: ChatDocumentSummary[]; loaded: boolean; loadedAt: number; revision: number; request: Promise<void> | null; error: string | null };
type Doc = { value: ChatDocument | null; loadedAt: number; revision: number; request: Promise<void> | null; error: string | null };
const lists = shallowReactive(new Map<string, List>());
const docs = shallowReactive(new Map<string, Doc>());
function drop<T extends { revision: number }>(map: Map<string, T>, key: string) { const entry = map.get(key); if (entry) entry.revision++; map.delete(key); }
registerSessionReset(() => { for (const key of [...lists.keys()]) drop(lists, key); for (const key of [...docs.keys()]) drop(docs, key); });
export function forgetDocuments(base: string) {
  drop(lists, base);
  for (const key of [...docs.keys()]) if (key.startsWith(`${base}/`)) drop(docs, key);
}
export class DocumentConflict extends Error {
  constructor(message: string, readonly current: ChatDocument | null) { super(message); }
}

export function useDocuments(base: MaybeRefOrGetter<string>) {
  function list(key: string) {
    let value = lists.get(key);
    if (!value) {
      value = reactive({ items: [], loaded: false, loadedAt: 0, revision: 0, request: null, error: null }) as List;
      lists.set(key, value);
      while (lists.size > 20) drop(lists, lists.keys().next().value!);
    }
    return value;
  }
  function doc(key: string) {
    let value = docs.get(key);
    if (!value) {
      value = reactive({ value: null, loadedAt: 0, revision: 0, request: null, error: null }) as Doc;
      docs.set(key, value);
      while (docs.size > 16) drop(docs, docs.keys().next().value!);
    }
    return value;
  }
  const state = computed(() => list(toValue(base)));
  async function refresh(force = false) {
    const key = toValue(base), entry = list(key);
    if (entry.request) return entry.request;
    if (!force && Date.now() - entry.loadedAt < 5000) return;
    const revision = entry.revision;
    entry.request = (async () => {
      try {
        const value = await api<{ documents: ChatDocumentSummary[] }>(`${key}/documents`);
        if (lists.get(key) !== entry || entry.revision !== revision) return;
        entry.items = value.documents; entry.loaded = true; entry.loadedAt = Date.now(); entry.error = null;
      } catch (failure) {
        if (lists.get(key) !== entry || entry.revision !== revision) return;
        entry.loadedAt = Date.now();
        if (entry.loaded && isTransientFailure(failure)) return;
        if (failure instanceof ApiError && [403, 404].includes(failure.status)) { entry.items = []; entry.loaded = true; }
        entry.error = errorMessage(failure);
      } finally { if (entry.revision === revision) entry.request = null; }
    })();
    return entry.request;
  }
  function document(id: string) { return doc(`${toValue(base)}/${id}`); }
  async function load(id: string, force = false) {
    const key = `${toValue(base)}/${id}`, entry = doc(key);
    if (entry.request) return entry.request;
    if (!force && Date.now() - entry.loadedAt < 5000) return;
    const revision = entry.revision;
    entry.request = (async () => {
      try {
        const value = await api<{ document: ChatDocument }>(`${toValue(base)}/documents/${id}`);
        if (docs.get(key) !== entry || entry.revision !== revision) return;
        entry.value = value.document; entry.loadedAt = Date.now(); entry.error = null;
      } catch (failure) {
        if (docs.get(key) !== entry || entry.revision !== revision) return;
        entry.loadedAt = Date.now();
        if (entry.value && isTransientFailure(failure)) return;
        if (failure instanceof ApiError && failure.status === 404) entry.value = null;
        entry.error = errorMessage(failure);
      } finally { if (entry.revision === revision) entry.request = null; }
    })();
    return entry.request;
  }
  function store(value: ChatDocument) {
    const entry = doc(`${toValue(base)}/${value.id}`);
    entry.revision++; entry.request = null; entry.value = value; entry.loadedAt = Date.now(); entry.error = null;
    list(toValue(base)).loadedAt = 0;
  }
  async function create(title: string) {
    const id = crypto.randomUUID();
    store((await api<{ document: ChatDocument }>(`${toValue(base)}/documents`, { json: { id, title, body: '' } })).document);
    await refresh(true);
    return id;
  }
  /** Saves against the revision the editor started from; a conflict carries the current document. */
  async function save(id: string, baseRevision: number, title: string, body: string, summary?: string) {
    try {
      store((await api<{ document: ChatDocument }>(`${toValue(base)}/documents/${id}`, { method: 'PUT', json: { baseRevision, title, body, summary } })).document);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) {
        await load(id, true);
        throw new DocumentConflict(failure.message, document(id).value);
      }
      throw failure;
    }
  }
  async function remove(id: string) {
    await api(`${toValue(base)}/documents/${id}`, { method: 'DELETE' });
    drop(docs, `${toValue(base)}/${id}`);
    await refresh(true);
  }
  return { state, refresh, document, load, create, save, remove };
}
