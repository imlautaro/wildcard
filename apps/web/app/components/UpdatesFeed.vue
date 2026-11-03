<script setup lang="ts">
import type { HomeFeed, HomePost } from '~/utils/types';
import type { HomePostAction } from './HomePost.vue';

// For you: the feed a person's contacts curate together (docs/updates.md). On wide
// screens it fills the content pane beside the chat list as a single timeline column of
// posts, newest first; `?thread=<topic>` shows every post on one topic as a thread and
// `?post=<id>` one post with its comments (docs/updates.md#comments). When the pane is wide
// enough, "Topics to follow" sits in a column beside the timeline (docs/updates.md#topics-to-follow).
const route = useRoute();
const home = useHome();
const chats = useChats();
const { user } = useSession();
const { t } = useI18n();
const feed = computed<HomeFeed | null>(() => home.state.value);
const setup = computed(() => feed.value?.setup ?? (feed.value?.error === 'HOME_NO_CONTACTS' ? 'needs_contacts' : null));
const updating = computed(() => homeUpdating(feed.value));
const following = ref(false);
const managing = ref(false);
const followText = ref('');
const actionError = ref<string | null>(null);
const busy = computed(() => home.state.saving > 0);
const page = ref<HTMLElement | null>(null);
const posts = computed(() => homePosts(feed.value));
const threadCounts = computed(() => {
  const counts = new Map<string, number>();
  for (const post of posts.value) counts.set(post.topicID, (counts.get(post.topicID) ?? 0) + 1);
  return counts;
});
const thread = computed(() => typeof route.query.thread === 'string' ? route.query.thread : null);
// A thread shows its newest post first, like the timeline.
const threadPosts = computed(() => thread.value ? posts.value.filter(post => post.topicID === thread.value) : []);
const focusID = computed(() => typeof route.query.post === 'string' ? route.query.post : null);
const focusPost = computed(() => focusID.value ? posts.value.find(post => post.id === focusID.value) ?? null : null);
const suggestions = computed(() => setup.value ? [] : feed.value?.suggestions ?? []);
const threadTitle = computed(() => threadPosts.value[0]?.content.title ?? t('updates.feed.thread'));
const myPhoto = computed(() => user.value?.photoVersion ? `me/photo?version=${encodeURIComponent(user.value.photoVersion)}` : null);

// "N new posts": posts that arrive while the person is scrolled down are announced instead
// of appearing silently above them; at the top they just show.
const known = new Set<string>();
const fresh = ref(0);
watch(posts, (list) => {
  const added = list.filter(post => !known.has(post.id));
  const first = !known.size;
  for (const post of added) known.add(post.id);
  if (!first && added.length && !thread.value && (page.value?.scrollTop ?? 0) > 120) fresh.value += added.length;
}, { immediate: true });
function showFresh() { fresh.value = 0; page.value?.scrollTo({ top: 0, behavior: 'smooth' }); }
function onScroll() { if (fresh.value && (page.value?.scrollTop ?? 0) < 40) fresh.value = 0; }
function openThread(topicID: string | null) {
  void navigateTo({ path: route.path, query: topicID ? { ...route.query, post: undefined, thread: topicID } : { ...route.query, thread: undefined } });
  if (topicID) page.value?.scrollTo({ top: 0 });
}
function openPost(postID: string | null) {
  if (!postID) { void navigateTo({ path: route.path, query: { ...route.query, post: undefined } }); return; }
  void navigateTo({ path: route.path, query: { ...route.query, post: postID } });
  page.value?.scrollTo({ top: 0 });
}

const notice = computed(() => {
  if (home.state.error && !feed.value) return home.state.error;
  if (!feed.value) return null;
  if (!feed.value.enabled) return t('updates.feed.disabled');
  if (setup.value || updating.value || !feed.value.error) return null;
  return t('updates.feed.failed');
});
// A failed first load is an error; the other notices explain the feed's state.
const noticeTone = computed(() => home.state.error && !feed.value ? 'error'
  : feed.value?.enabled && feed.value.error && feed.value.error !== 'HOME_NO_CONTACTS' ? 'warning' : 'info');

// Poll quickly while contacts prepare posts or answer a comment.
const busyFeed = () => home.state.value?.setup === 'creating_contacts' || homeUpdating(home.state.value) || homeReplying(home.state.value);
const polling = usePolling(() => home.refresh(busyFeed()), () => busyFeed() ? 4000 : 60_000);
// The interval is chosen after each tick, so a comment or Update now must not wait out a 60-second timer.
watch(busyFeed, busy => { if (busy) void polling.now(); });
// Contact readiness can change while setup finishes or a contact is added/removed.
// The server decides availability; the local list only invalidates the existing snapshot.
watch(() => chats.contacts.value.map(contact => `${contact.id}:${contact.setupPending ?? 0}:${contact.clearing ?? 0}:${contact.archivedAt ?? ''}`).sort().join('|'), () => staleHome());
onMounted(() => { updatesOpened(true); void home.refresh(!!setup.value); });
onBeforeUnmount(() => updatesOpened(false));

async function run(operation: () => Promise<unknown>) {
  actionError.value = null;
  try { await operation(); } catch (failure) { actionError.value = errorMessage(failure); }
}
async function follow() {
  const text = followText.value.trim();
  if (!text) return;
  await run(async () => { await home.follow(text); following.value = false; followText.value = ''; });
}
const followingSuggestion = ref<string | null>(null);
async function followSuggestion(title: string) {
  followingSuggestion.value = title;
  try { await run(() => home.follow(title)); } finally { followingSuggestion.value = null; }
}
const dismissingSuggestion = ref<string | null>(null);
async function dismissSuggestion(title: string) {
  dismissingSuggestion.value = title;
  try { await run(() => home.dismissSuggestion(title)); } finally { dismissingSuggestion.value = null; }
}
// "Less like this" keeps the post in place as a short notice (docs/updates.md#less-like-this):
// Undo restores it, X hides that one post. Only the post it was chosen on turns into the
// notice, and only once the feedback is saved; undoing it on another post of the topic clears it.
const lessNotices = reactive(new Set<string>());
const showsLessNotice = (post: HomePost) => lessNotices.has(post.id) && post.feedback === 'less';
async function undoLess(post: HomePost) {
  await run(() => home.setTopic(post.topicID, { feedback: null }));
  if (home.state.value && homePosts(home.state.value).find(item => item.id === post.id)?.feedback !== 'less') lessNotices.delete(post.id);
}
async function dismissPost(post: HomePost) {
  await run(() => home.dismissPost(post.id));
  if (!homePosts(home.state.value).some(item => item.id === post.id)) lessNotices.delete(post.id);
}
function act(card: HomePost, kind: HomePostAction, prompt?: string) {
  if (kind === 'thread') return openThread(card.topicID);
  if (kind === 'comment') return openPost(card.id);
  if (kind === 'quote' && card.quote) return openPost(card.quote.id);
  if (kind === 'message' && card.contactID) return navigateTo(`/chats/${card.contactID}`);
  if (kind === 'reply' && card.contactID) { if (prompt) suggestDraft(card.contactID, prompt); return navigateTo(`/chats/${card.contactID}`); }
  if (kind === 'hide') return run(() => home.setTopic(card.topicID, { status: 'hidden' }));
  const feedback = kind === 'more' || kind === 'less' ? (card.feedback === kind ? null : kind) : null;
  return run(async () => {
    await home.setTopic(card.topicID, { feedback });
    if (feedback === 'less') lessNotices.add(card.id);
    else if (kind === 'less') for (const post of posts.value) if (post.topicID === card.topicID) lessNotices.delete(post.id);
  });
}
const progressPhoto = computed(() => {
  const contact = chats.contacts.value.find(item => item.id === feed.value?.progress?.contactID);
  return contact ? contactPhotoPath(contact) : null;
});
const agendaPath = (item: HomeFeed['agenda'][number]) => item.contactID ? `/chats/${item.contactID}` : item.groupID ? `/groups/${item.groupID}` : '/chats';
const appPath = (app: HomeFeed['apps'][number]) => app.groupID ? `/groups/${app.groupID}/mini-apps/${app.id}` : `/contacts/${app.contactID}/mini-apps/${app.id}`;
function agendaDetail(item: HomeFeed['agenda'][number]) {
  if (item.at == null) return [item.name, item.kind === 'task' ? t('updates.feed.assignedToYou') : null].filter(Boolean).join(' · ');
  return [item.name, new Intl.DateTimeFormat(appLocale(), { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(item.at)].filter(Boolean).join(' · ');
}
function origin(topic: HomeFeed['topics'][number]) {
  const pending = topic.status === 'active' && !topic.hasCard;
  if (topic.source === 'person') return pending ? t('updates.feed.origin.personWaiting') : t('updates.feed.origin.person');
  if (topic.source === 'contact') {
    const name = chats.contacts.value.find(item => item.id === topic.contactID)?.name ?? t('updates.aContactLower');
    return pending ? t('updates.feed.origin.contactWaiting', { name }) : t('updates.feed.origin.contact', { name });
  }
  return pending ? t('updates.feed.origin.contactsWaiting') : t('updates.feed.origin.contacts');
}
</script>

<template>
  <div v-if="focusID" ref="page" class="page home-page">
    <AppTopBar :title="$t('updates.feed.post')">
      <template #leading><AppIconButton icon="back" :label="$t('common.back')" :tooltip="false" @click="openPost(null)" /></template>
    </AppTopBar>
    <div class="home-inner thread">
      <AppNotice v-if="actionError">{{ actionError }}</AppNotice>
      <template v-if="focusPost">
        <div class="timeline">
          <HomePost :post="focusPost" in-thread :chained="!!focusPost.comments?.length" :thread-count="threadCounts.get(focusPost.topicID)"
            @action="(kind, prompt) => act(focusPost!, kind, prompt)" />
        </div>
        <HomePostComments :post="focusPost" />
        <button v-if="(threadCounts.get(focusPost.topicID) ?? 0) > 1" class="link-button thread-more" @click="openThread(focusPost.topicID)">
          {{ $t('updates.feed.seeAllPosts', { count: threadCounts.get(focusPost.topicID), title: focusPost.content.title }) }}
        </button>
      </template>
      <AppEmptyState v-else-if="feed" class="home-empty" icon="sparkle" :title="$t('updates.feed.postGoneTitle')"
        :text="$t('updates.feed.postGoneText')" />
    </div>
  </div>
  <div v-else-if="thread" ref="page" class="page home-page">
    <AppTopBar :title="threadTitle">
      <template #leading><AppIconButton icon="back" :label="$t('updates.feed.backToForYou')" :tooltip="false" @click="openThread(null)" /></template>
    </AppTopBar>
    <div class="home-inner thread">
      <AppNotice v-if="actionError">{{ actionError }}</AppNotice>
      <div v-if="threadPosts.length" class="timeline">
        <template v-for="(post, index) in threadPosts" :key="post.id">
          <HomePostLessNotice v-if="showsLessNotice(post)" :busy="busy" @undo="undoLess(post)" @dismiss="dismissPost(post)" />
          <HomePost v-else :post="post" in-thread :chained="index < threadPosts.length - 1"
            @action="(kind, prompt) => act(post, kind, prompt)" />
        </template>
      </div>
      <AppEmptyState v-else-if="feed" class="home-empty" icon="sparkle" :title="$t('updates.feed.threadGoneTitle')"
        :text="$t('updates.feed.threadGoneText')" />
    </div>
  </div>
  <div v-else ref="page" class="page home-page main-feed" @scroll.passive="onScroll">
    <AppTopBar :title="$t('updates.feed.title')">
      <template #leading><AppIconButton to="/chats" icon="back" :label="$t('updates.feed.chats')" class="back" :tooltip="false" /></template>
      <AppIconButton icon="list" :label="$t('updates.feed.topics')" @click="managing = true" />
      <AppIconButton v-if="!setup" icon="refresh" :label="$t('updates.feed.updateNow')" :disabled="!feed?.enabled || updating || busy" @click="run(home.update)" />
      <AppIconButton v-if="!setup" icon="plus" :label="$t('updates.feed.followSomethingInForYou')" variant="filled" @click="following = true" />
    </AppTopBar>
    <div class="home-body">
    <div class="home-inner">
      <div v-if="updating && !setup" class="home-status" role="status">
        <template v-if="feed?.progress">
          <AppAvatar :name="feed.progress.contactName ?? '?'" :path="progressPhoto" :size="24" />
          <span class="grow">{{ $t('updates.feed.preparing', { name: feed.progress.contactName ?? $t('updates.aContact'), title: feed.progress.title }) }}</span>
          <span class="count">{{ Math.min(feed.progress.done + 1, feed.progress.total) }}/{{ feed.progress.total }}</span>
        </template>
        <template v-else><span class="spinner" /><span class="grow">{{ $t('updates.feed.preparingAll') }}</span></template>
      </div>
      <AppNotice v-if="notice" :tone="noticeTone">
        {{ notice }}
        <template v-if="home.state.error && !feed" #actions><button class="link-button" @click="home.refresh(true)">{{ $t('common.retry') }}</button></template>
      </AppNotice>
      <AppNotice v-if="actionError">{{ actionError }}</AppNotice>

      <button v-if="!setup" class="composer" @click="following = true">
        <AppAvatar :name="user?.name ?? ''" :path="myPhoto" :size="36" />
        <span class="composer-hint">{{ $t('updates.feed.composerHint') }}</span>
        <span class="composer-action">{{ $t('updates.feed.follow') }}</span>
      </button>

      <section v-if="feed?.agenda.length" class="home-agenda" :aria-label="$t('updates.feed.comingUp')">
        <NuxtLink v-for="item in feed.agenda" :key="item.id" :to="agendaPath(item)" class="agenda-row" data-ripple>
          <span class="agenda-icon" :class="item.kind"><AppIcon :name="item.kind === 'task' ? 'tasks' : 'clock'" /></span>
          <span class="copy"><strong>{{ item.title }}</strong><small>{{ agendaDetail(item) }}</small></span>
        </NuxtLink>
      </section>

      <section v-if="feed?.apps.length" class="home-apps" :aria-label="$t('updates.feed.yourApps')">
        <div class="apps-row">
          <NuxtLink v-for="app in feed.apps" :key="app.id" :to="appPath(app)" class="app-tile" data-ripple :title="app.ownerName ?? undefined">
            <span class="mini-app-glyph"><AppIcon :name="miniAppIcon(app.icon)" /></span>
            <span>{{ app.title }}</span>
          </NuxtLink>
        </div>
      </section>

      <button v-if="fresh" class="fresh" @click="showFresh"><AppIcon name="arrow-up" />{{ $t('updates.feed.newPosts', fresh) }}</button>
      <div v-if="posts.length" class="timeline">
        <template v-for="post in posts" :key="post.id">
          <HomePostLessNotice v-if="showsLessNotice(post)" :busy="busy" @undo="undoLess(post)" @dismiss="dismissPost(post)" />
          <HomePost v-else :post="post" :thread-count="threadCounts.get(post.topicID)"
            @action="(kind, prompt) => act(post, kind, prompt)" />
        </template>
      </div>
      <AppEmptyState v-else-if="setup === 'creating_contacts'" class="home-empty" icon="sparkle" :title="$t('updates.feed.circleTitle')"
        :text="$t('updates.feed.circleText')">
        <template #actions><AppButton to="/chats">{{ $t('updates.feed.goToChats') }}</AppButton></template>
      </AppEmptyState>
      <AppEmptyState v-else-if="setup === 'needs_contacts'" class="home-empty" icon="sparkle" :title="$t('updates.feed.welcomeTitle')"
        :text="$t('updates.feed.welcomeText')">
        <template #actions><AppButton to="/contacts" icon="plus">{{ $t('updates.feed.addContact') }}</AppButton></template>
      </AppEmptyState>
      <div v-else-if="updating || (!feed && !home.state.error)" class="timeline" aria-hidden="true">
        <div v-for="index in 3" :key="index" class="placeholder"><span class="avatar-dot" /><span class="lines"><span /><span /><span /></span></div>
      </div>
      <AppEmptyState v-else-if="feed?.enabled" class="home-empty" icon="sparkle" :title="$t('updates.feed.emptyTitle')"
        :text="$t('updates.feed.emptyText')">
        <template #actions>
          <AppButton to="/chats">{{ $t('updates.feed.startChat') }}</AppButton>
          <AppButton variant="text" @click="following = true">{{ $t('updates.feed.followSomething') }}</AppButton>
        </template>
      </AppEmptyState>
    </div>
    <aside v-if="suggestions.length" class="home-aside" :aria-label="$t('updates.feed.topicsToFollow')">
      <section class="suggestions">
        <h2>{{ $t('updates.feed.topicsToFollow') }}</h2>
        <ul>
          <li v-for="item in suggestions" :key="item.title">
            <span class="copy"><strong>{{ item.title }}</strong><small v-if="item.reason">{{ item.reason }}</small></span>
            <AppButton variant="outlined" :disabled="busy" :aria-label="$t('updates.feed.followTopic', { title: item.title })"
              @click="followSuggestion(item.title)">
              {{ followingSuggestion === item.title ? $t('updates.feed.followingTopic') : $t('updates.feed.follow') }}
            </AppButton>
            <AppIconButton icon="close" size="small" :disabled="busy" :tooltip="false"
              :label="$t('updates.feed.notInterestedIn', { title: item.title })" @click="dismissSuggestion(item.title)" />
          </li>
        </ul>
        <button class="link-button" @click="following = true">{{ $t('updates.feed.followSomethingElse') }}</button>
      </section>
    </aside>
    </div>

    <AppSheet v-if="following" :title="$t('updates.feed.followSheetTitle')" @close="following = false">
      <form id="home-follow" @submit.prevent="follow">
        <textarea v-model="followText" class="follow-input" rows="3" maxlength="400" autofocus
          :placeholder="$t('updates.feed.followPlaceholder')" :aria-label="$t('updates.feed.composerHint')" />
        <p class="muted small">{{ $t('updates.feed.followNote') }}</p>
      </form>
      <template #actions>
        <AppButton variant="text" @click="following = false">{{ $t('common.cancel') }}</AppButton>
        <AppButton type="submit" form="home-follow" :disabled="!followText.trim() || busy">{{ $t('common.add') }}</AppButton>
      </template>
    </AppSheet>

    <AppSheet v-if="managing" :title="$t('updates.feed.topics')" @close="managing = false">
      <p class="muted small">{{ $t('updates.feed.topicsNote') }}</p>
      <ul class="topics">
        <li v-for="topic in feed?.topics ?? []" :key="topic.id" :class="{ hidden: topic.status === 'hidden' }">
          <span class="copy"><strong>{{ topic.title }}</strong><small>{{ topic.status === 'hidden' ? $t('updates.feed.hidden') : origin(topic) }}</small></span>
          <AppButton variant="outlined" :disabled="busy"
            @click="run(() => home.setTopic(topic.id, { status: topic.status === 'hidden' ? 'active' : 'hidden' }))">
            {{ topic.status === 'hidden' ? $t('updates.feed.show') : $t('updates.feed.hide') }}
          </AppButton>
        </li>
        <li v-if="!feed?.topics.length" class="muted">{{ $t('updates.feed.nothingYet') }}</li>
      </ul>
    </AppSheet>
  </div>
</template>

<style scoped>
.home-page { display: flex; flex-direction: column; }
.home-page .bar { background: var(--md-surface); }
.home-inner { width: 100%; max-width: 640px; margin: 0 auto; padding: 0 0 var(--space-12); display: flex; flex-direction: column; gap: var(--space-3); }
/* The column's gap spaces the notices. */
.home-inner > .notice, .home-inner > .home-status { margin: 0 var(--space-4); }
.home-status { display: flex; align-items: center; gap: 10px; padding: 10px var(--space-4); border-radius: var(--md-shape-full); background: var(--md-secondary-container);
  color: var(--md-on-secondary-container); font: var(--type-label-large); align-self: flex-start; max-width: 100%; }
.home-status .grow { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.home-status .count { font-variant-numeric: tabular-nums; opacity: 0.8; }
/* Agenda and apps are one thin strip of chips above the timeline, not sections of their own. */
.home-agenda, .apps-row { display: flex; gap: var(--space-2); overflow-x: auto; padding: 0 var(--space-4); scrollbar-width: none; }
.agenda-row { flex: none; max-width: 240px; display: flex; align-items: center; gap: var(--space-2); padding: var(--space-1-5) var(--space-3) var(--space-1-5) var(--space-1-5); border-radius: var(--md-shape-full);
  color: inherit; background: var(--md-surface-container-low); }
.agenda-icon { width: 28px; height: 28px; flex: none; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
  color: var(--md-primary); background: color-mix(in srgb, var(--md-primary) 14%, transparent); }
.agenda-icon.task { color: var(--md-warning); background: color-mix(in srgb, var(--md-warning) 14%, transparent); }
.agenda-icon :deep(svg) { width: 16px; height: 16px; }
.agenda-row .copy { min-width: 0; display: flex; flex-direction: column; font-size: 13px; line-height: 1.25; }
.agenda-row strong, .agenda-row small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.agenda-row small { font-size: 11px; color: var(--md-on-surface-variant); }
.app-tile { flex: none; display: flex; align-items: center; gap: var(--space-2); padding: var(--space-1-5) var(--space-3) var(--space-1-5) var(--space-1-5);
  border-radius: var(--md-shape-full); color: inherit; background: var(--md-surface-container-low); font: var(--type-label-large); }
.app-tile .mini-app-glyph { width: 28px; height: 28px; border-radius: 50%; }
.app-tile .mini-app-glyph :deep(svg) { width: 16px; height: 16px; }
/* For you: each post is its own rounded card. Threads keep a flat column, where a rail joins
   each avatar to the next post. */
.timeline { display: flex; flex-direction: column; gap: var(--space-3); margin: 0 var(--space-4); }
.timeline > :deep(.home-post) { padding: var(--space-5) var(--space-5) var(--space-2); border: 1px solid var(--md-outline-variant); border-radius: var(--ui-pane-radius); }
.thread .timeline { gap: 0; margin: 0; }
.thread .timeline > :deep(.home-post) { padding: var(--space-3) var(--space-4) var(--space-1); border: 0; border-radius: 0; }
.timeline > :deep(.home-post.less-notice) { padding: var(--space-3) var(--space-3) var(--space-3) var(--space-5); }
.thread .timeline > :deep(.home-post.less-notice) { padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4); }
.suggestions li > :last-child { margin-inline-start: calc(-1 * var(--space-2)); }
.placeholder { display: grid; grid-template-columns: 40px minmax(0, 1fr); gap: var(--space-3); padding: var(--space-5); border: 1px solid var(--md-outline-variant); border-radius: var(--ui-pane-radius); animation: pulse 1.4s ease-in-out infinite alternate; }
.placeholder .avatar-dot { width: 40px; height: 40px; border-radius: 50%; background: var(--md-surface-container-high); }
.placeholder .lines { display: flex; flex-direction: column; gap: var(--space-2); padding-top: var(--space-1); }
.placeholder .lines span { height: 12px; border-radius: var(--md-shape-full); background: var(--md-surface-container-high); }
.placeholder .lines span:nth-child(1) { width: 35%; } .placeholder .lines span:nth-child(2) { width: 90%; height: 56px; border-radius: var(--md-shape-m); } .placeholder .lines span:nth-child(3) { width: 60%; }
@keyframes pulse { from { opacity: 1; } to { opacity: 0.5; } }
@media (prefers-reduced-motion: reduce) { .placeholder { animation: none; } }
.composer { display: flex; align-items: center; gap: var(--space-3); margin: var(--space-1) var(--space-4) 0; padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
  border: 1px solid var(--md-outline-variant); border-radius: var(--md-shape-full); background: var(--md-surface); color: inherit; text-align: left; cursor: pointer; }
.composer:hover { background: var(--md-surface-container-low); }
.composer-hint { flex: 1; min-width: 0; font-size: 15px; color: var(--md-on-surface-variant); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.composer-action { flex: none; padding: var(--space-1-5) var(--space-4); border: 1px solid var(--md-outline-variant); border-radius: var(--md-shape-full); font: var(--type-label-large); }
/* Stays under the top bar while the person scrolls the timeline. */
.fresh { position: sticky; top: var(--space-3); z-index: 3; align-self: center; display: inline-flex; align-items: center; gap: var(--space-1-5); margin-bottom: calc(-1 * var(--space-10));
  padding: var(--space-2) var(--space-4); border: 0; border-radius: var(--md-shape-full); font: var(--type-label-large); color: var(--md-on-primary); background: var(--md-primary);
  box-shadow: var(--md-elevation-2, 0 2px 6px rgb(0 0 0 / 0.2)); cursor: pointer; }
.fresh :deep(svg) { width: 18px; height: 18px; }
.thread-more { align-self: flex-start; margin-left: calc(var(--space-4) + 36px + var(--space-3) - var(--space-3)); }
.home-empty { flex: none; margin: 0 var(--space-4); padding: var(--space-8) var(--space-6); border-radius: var(--md-shape-xl); background: var(--md-surface-container-low); }
.follow-input { width: 100%; padding: var(--space-3) var(--space-4); border: 1px solid var(--md-outline); border-radius: var(--md-shape-xs); background: transparent;
  font: var(--type-body-large); resize: vertical; outline: none; }
.follow-input:focus { border-color: var(--md-primary); box-shadow: inset 0 0 0 1px var(--md-primary); }
.topics { list-style: none; margin: var(--space-3) 0 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); }
.topics li { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) 0; }
.topics .copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--space-0-5); }
.topics small { font: var(--type-body-small); color: var(--md-on-surface-variant); }
.topics li.hidden strong { color: var(--md-on-surface-variant); }
@media (max-width: 860px) { .home-inner { padding-bottom: var(--space-8); } }
/* Topics to follow: a second column on wide screens, like X's right sidebar. A media query, not a
   container query: containment on the scrolling page would trap the fixed ⋯ menu backdrop. At 1100px
   the pane beside the navigation rail is about 1000px. */
.home-aside { display: none; }
@media (min-width: 1100px) {
  .home-body { display: grid; grid-template-columns: minmax(0, 620px) 300px; justify-content: center; align-items: start; gap: var(--space-6); padding: 0 var(--space-4); }
  .home-body > .home-inner { margin: 0; }
  /* Below the sticky top bar. */
  .home-aside { display: block; position: sticky; top: calc(var(--ui-bar-height) + var(--space-2)); }
}
.suggestions { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-4); border: 1px solid var(--md-outline-variant); border-radius: var(--ui-pane-radius); }
.suggestions h2 { margin: 0; font: var(--type-title-medium); }
.suggestions ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.suggestions li { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) 0; }
.suggestions .copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--space-0-5); }
.suggestions strong { font: var(--type-title-small); overflow-wrap: anywhere; }
.suggestions small { font: var(--type-body-small); color: var(--md-on-surface-variant); }
.suggestions .link-button { align-self: flex-start; }
</style>
