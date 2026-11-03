import type { HomeFeed, HomePost } from '~/utils/types';

// Session-owned Updates feed (docs/updates.md; the API resource is still `home`),
// matching the iOS HomeFeedStore. Memory
// only: connector-derived cards are never persisted. The last feed renders at once
// on navigation; reads are deduplicated, revalidated after a minute (every four
// seconds while contacts are preparing cards), and every mutation returns the whole
// feed, which replaces the cached one and rejects older in-flight reads.
const state = reactive({ value: null as HomeFeed | null, loadedAt: 0, revision: 0, request: null as Promise<void> | null, error: null as string | null, saving: 0 });
// New-card badge (docs/updates.md#new-card-badge): polled by the chat list, cleared
// locally and on the server as soon as Updates opens. A badge read that started
// before the page opened never brings the count back.
const badge = reactive({ unseen: 0, revision: 0, open: false });
registerSessionReset(() => {
  state.revision++; state.value = null; state.loadedAt = 0; state.request = null; state.error = null;
  badge.revision++; badge.unseen = 0; badge.open = false;
});

export async function refreshUpdatesBadge() {
  if (badge.open) return;
  const revision = badge.revision;
  try {
    const value = await api<{ unseen: number }>('home/badge');
    if (badge.revision === revision && !badge.open) badge.unseen = value.unseen;
  } catch { /* The badge keeps its last known value. */ }
}

// Called while the Updates page is visible; the feed read also marks it seen.
export function updatesOpened(open: boolean) {
  badge.open = open;
  if (!open) return;
  badge.revision++;
  badge.unseen = 0;
  void api('home/seen', { method: 'POST', json: {} }).catch(() => {});
}

export function updatesBadge() { return computed(() => badge.unseen); }

// The feed names contacts by the viewer's alias: keep the last feed visible, reject in-flight
// reads and revalidate in the background once it has been loaded. A rejected in-flight
// read is re-issued at once even before the first feed arrives: otherwise a first load
// racing the contact list would stay on the skeleton until the next 60-second poll.
export function staleHome() {
  const waiting = !!state.request;
  state.revision++; state.request = null; state.loadedAt = 0;
  if (state.value || waiting) void useHome().refresh(true);
}

/** The timeline, newest first; an API without posts gets one text-less post per card. */
export function homePosts(feed: HomeFeed | null): HomePost[] {
  if (!feed) return [];
  if (feed.posts) return feed.posts;
  return feed.cards.map(({ generatedAt, ...card }) => ({ ...card, text: null, replyTo: null, createdAt: generatedAt }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** A compact post or comment age, like a timeline: "now", "27m", "2h", "3d". */
export function compactAge(at: number) {
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60_000));
  if (minutes < 1) return translate('updates.time.now');
  if (minutes < 60) return translate('updates.time.minutes', { n: minutes });
  if (minutes < 1440) return translate('updates.time.hours', { n: Math.round(minutes / 60) });
  return translate('updates.time.days', { n: Math.round(minutes / 1440) });
}

export function homeUpdating(feed: HomeFeed | null) { return !!feed && !feed.setup && feed.error !== 'HOME_NO_CONTACTS' && (feed.status === 'updating' || feed.pending); }
/** A contact is answering a comment: poll like a run so the reply shows up soon. */
export function homeReplying(feed: HomeFeed | null) { return !!feed?.posts?.some(post => post.comments?.some(comment => comment.status === 'pending')); }

export function useHome() {
  async function refresh(force = false) {
    if (state.request) return state.request;
    if (state.saving || (!force && !homeUpdating(state.value) && !homeReplying(state.value) && Date.now() - state.loadedAt < 60_000)) return;
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
    comment: (postID: string, text: string) => mutate(`posts/${encodeURIComponent(postID)}/comments`, 'POST', { text }),
    dismissSuggestion: (title: string) => mutate('suggestions/dismiss', 'POST', { title }),
    dismissPost: (id: string) => mutate(`posts/${encodeURIComponent(id)}/dismiss`, 'POST', {}),
    setTopic: (id: string, patch: { status?: 'active' | 'hidden'; feedback?: 'more' | 'less' | null }) => mutate(`topics/${id}`, 'PATCH', patch),
  };
}
