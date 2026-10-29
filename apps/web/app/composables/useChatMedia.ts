import type { ChatMediaItem } from '~/utils/types';

// Session-owned cache for chat details media: one paginated list per chat and kind.
// Lists hold metadata only; image bytes go through the private image cache.
export type ChatMediaKind = 'image' | 'file';
type List = { items: ChatMediaItem[]; nextBefore: number | null; loaded: boolean; loadedAt: number; revision: number;
  request: Promise<void> | null; error: string | null };
const lists = shallowReactive(new Map<string, List>());
function invalidate(key: string) { const entry = lists.get(key); if (entry) entry.revision++; lists.delete(key); }
registerSessionReset(() => { for (const key of [...lists.keys()]) invalidate(key); });
// `base` is the chat's API prefix: `contacts/:id/chat` or `groups/:id`.
export function forgetChatMedia(base: string) {
  for (const key of [...lists.keys()]) if (key.startsWith(`${base}|`)) invalidate(key);
}

export function useChatMedia(base: MaybeRefOrGetter<string>, kind: MaybeRefOrGetter<ChatMediaKind>) {
  const key = () => `${toValue(base)}|${toValue(kind)}`;
  function list(id: string) {
    let value = lists.get(id);
    if (!value) {
      value = reactive({ items: [], nextBefore: null, loaded: false, loadedAt: 0, revision: 0, request: null, error: null }) as List;
      lists.set(id, value);
      while (lists.size > 24) invalidate(lists.keys().next().value!);
    }
    return value;
  }
  const state = computed(() => list(key()));
  // A refresh reloads the first page and drops later pages; "more" appends the next page.
  async function load(more = false, force = false) {
    const id = key(), entry = list(id);
    if (entry.request) return entry.request;
    if (more && entry.nextBefore === null) return;
    if (!more && !force && Date.now() - entry.loadedAt < 15_000) return;
    const revision = entry.revision;
    const cursor = more ? `&before=${entry.nextBefore}` : '';
    entry.request = (async () => {
      try {
        const value = await api<{ items: ChatMediaItem[]; nextBefore: number | null }>(`${toValue(base)}/media?kind=${toValue(kind)}${cursor}`);
        if (lists.get(id) !== entry || entry.revision !== revision) return;
        entry.items = more ? [...entry.items, ...value.items] : value.items;
        entry.nextBefore = value.nextBefore;
        entry.loaded = true; entry.loadedAt = Date.now(); entry.error = null;
      } catch (failure) {
        if (lists.get(id) !== entry || entry.revision !== revision) return;
        entry.loadedAt = Date.now();
        if (entry.loaded && isTransientFailure(failure)) return;
        if (failure instanceof ApiError && [403, 404].includes(failure.status)) { entry.items = []; entry.nextBefore = null; entry.loaded = true; }
        entry.error = errorMessage(failure);
      } finally { if (entry.revision === revision) entry.request = null; }
    })();
    return entry.request;
  }
  return { state, load };
}

export const chatMediaItemKey = (item: ChatMediaItem) => `${item.messageID}/${item.side ?? 'group'}`;
