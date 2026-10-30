import type { HomeFeed } from '~/utils/types';

// Session-owned Home feed (docs/home.md), matching the iOS HomeFeedStore. Memory
// only: connector-derived cards are never persisted. The last feed renders at once
// on navigation; reads are deduplicated, revalidated after a minute (every four
// seconds while contacts are preparing cards), and every mutation returns the whole
// feed, which replaces the cached one and rejects older in-flight reads.
const state = reactive({ value: null as HomeFeed | null, loadedAt: 0, revision: 0, request: null as Promise<void> | null, error: null as string | null, saving: 0 });
registerSessionReset(() => {
  state.revision++; state.value = null; state.loadedAt = 0; state.request = null; state.error = null;
});

export function homeUpdating(feed: HomeFeed | null) { return !!feed && (feed.status === 'updating' || feed.pending); }

export function useHome() {
  async function refresh(force = false) {
    if (state.request) return state.request;
    if (state.saving || (!force && !homeUpdating(state.value) && Date.now() - state.loadedAt < 60_000)) return;
    const revision = state.revision;
    state.request = (async () => {
      try {
        const value = await api<HomeFeed>('home', { query: { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } });
        if (state.revision !== revision || state.saving) return;
        state.value = value; state.loadedAt = Date.now(); state.error = null;
      } catch (failure) {
        if (state.revision !== revision) return;
        state.loadedAt = Date.now();
        if (state.value && isTransientFailure(failure)) return;
        state.error = errorMessage(failure);
      } finally { if (state.revision === revision) state.request = null; }
    })();
    return state.request;
  }
  async function mutate(path: string, method: 'POST' | 'PATCH', json: Record<string, unknown>) {
    state.saving++;
    state.revision++;
    state.request = null;
    const revision = state.revision;
    try {
      const value = await api<HomeFeed>(`home/${path}`, { method, json });
      if (state.revision === revision) { state.value = value; state.loadedAt = Date.now(); state.error = null; }
    } finally { state.saving--; }
  }
  return {
    state, refresh,
    update: () => mutate('refresh', 'POST', {}),
    follow: (text: string) => mutate('topics', 'POST', { text }),
    setTopic: (id: string, patch: { status?: 'active' | 'hidden'; feedback?: 'more' | 'less' | null }) => mutate(`topics/${id}`, 'PATCH', patch),
  };
}
