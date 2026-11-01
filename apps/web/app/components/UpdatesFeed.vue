<script setup lang="ts">
import type { HomeFeed, HomePost } from '~/utils/types';
import type { HomePostAction } from './HomePost.vue';

// Updates: the feed a person's contacts curate together (docs/updates.md). On wide
// screens it fills the content pane beside the chat list as a single timeline column of
// posts, newest first; `?thread=<topic>` shows every post on one topic as a thread.
const route = useRoute();
const home = useHome();
const chats = useChats();
const { user } = useSession();
const feed = computed<HomeFeed | null>(() => home.state.value);
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
// A thread reads top to bottom, oldest first.
const threadPosts = computed(() => thread.value ? posts.value.filter(post => post.topicID === thread.value).reverse() : []);
const threadTitle = computed(() => threadPosts.value.at(-1)?.content.title ?? 'Thread');
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
  void navigateTo({ path: route.path, query: topicID ? { ...route.query, thread: topicID } : { ...route.query, thread: undefined } });
  if (topicID) page.value?.scrollTo({ top: 0 });
}

const greeting = computed(() => {
  const hour = new Date().getHours();
  const part = hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 19 ? 'Good afternoon' : 'Good evening';
  const name = user.value?.name.split(' ')[0];
  return name ? `${part}, ${name}` : part;
});
const today = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
const curators = computed(() => new Intl.ListFormat('en', { type: 'conjunction' }).format(feed.value?.contributors.map(item => item.name) ?? []));
const notice = computed(() => {
  if (home.state.error && !feed.value) return home.state.error;
  if (!feed.value) return null;
  if (!feed.value.enabled) return 'Curated cards are turned off on this server. Your apps and agenda still show here.';
  if (updating.value || !feed.value.error) return null;
  return feed.value.error === 'HOME_NO_CONTACTS' ? 'Add a contact so they can start curating your updates.'
    : 'Your contacts couldn’t finish your updates. They’ll try again in a few minutes.';
});
// A failed first load is an error; the other notices explain the feed's state.
const noticeTone = computed(() => home.state.error && !feed.value ? 'error'
  : feed.value?.enabled && feed.value.error && feed.value.error !== 'HOME_NO_CONTACTS' ? 'warning' : 'info');

usePolling(() => home.refresh(homeUpdating(home.state.value)), () => homeUpdating(home.state.value) ? 4000 : 60_000);
onMounted(() => { updatesOpened(true); void home.refresh(); });
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
function act(card: HomePost, kind: HomePostAction, prompt?: string) {
  if (kind === 'thread') return openThread(card.topicID);
  if (kind === 'message' && card.contactID) return navigateTo(`/chats/${card.contactID}`);
  if (kind === 'reply' && card.contactID) { if (prompt) suggestDraft(card.contactID, prompt); return navigateTo(`/chats/${card.contactID}`); }
  if (kind === 'hide') return run(() => home.setTopic(card.topicID, { status: 'hidden' }));
  const feedback = kind === 'more' || kind === 'less' ? (card.feedback === kind ? null : kind) : null;
  return run(() => home.setTopic(card.topicID, { feedback }));
}
const progressPhoto = computed(() => {
  const contact = chats.contacts.value.find(item => item.id === feed.value?.progress?.contactID);
  return contact ? contactPhotoPath(contact) : null;
});
const agendaPath = (item: HomeFeed['agenda'][number]) => item.contactID ? `/chats/${item.contactID}` : item.groupID ? `/groups/${item.groupID}` : '/';
const appPath = (app: HomeFeed['apps'][number]) => app.groupID ? `/groups/${app.groupID}/mini-apps/${app.id}` : `/contacts/${app.contactID}/mini-apps/${app.id}`;
function agendaDetail(item: HomeFeed['agenda'][number]) {
  if (item.at == null) return [item.name, item.kind === 'task' ? 'Assigned to you' : null].filter(Boolean).join(' · ');
  return [item.name, new Intl.DateTimeFormat('en', { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(item.at)].filter(Boolean).join(' · ');
}
function origin(topic: HomeFeed['topics'][number]) {
  const pending = topic.status === 'active' && !topic.hasCard ? ' · Waiting for its first card' : '';
  if (topic.source === 'person') return `You asked${pending}`;
  if (topic.source === 'contact') return `Suggested by ${chats.contacts.value.find(item => item.id === topic.contactID)?.name ?? 'a contact'}${pending}`;
  return `Picked by your contacts${pending}`;
}
</script>

<template>
  <div v-if="thread" ref="page" class="page home-page">
    <AppTopBar :title="threadTitle">
      <template #leading><AppIconButton icon="back" label="Back to Updates" :tooltip="false" @click="openThread(null)" /></template>
    </AppTopBar>
    <div class="home-inner thread">
      <AppNotice v-if="actionError">{{ actionError }}</AppNotice>
      <div v-if="threadPosts.length" class="timeline">
        <HomePost v-for="(post, index) in threadPosts" :key="post.id" :post="post" in-thread :chained="index < threadPosts.length - 1"
          @action="(kind, prompt) => act(post, kind, prompt)" />
      </div>
      <AppEmptyState v-else-if="feed" class="home-empty" icon="sparkle" title="This thread isn’t in Updates anymore"
        text="Its topic was hidden or retired, or its posts are older than two weeks." />
      <AppButton v-if="threadPosts.at(-1)?.contactID" variant="tonal" icon="chat" class="thread-reply"
        :to="`/chats/${threadPosts.at(-1)!.contactID}`">Reply to {{ threadPosts.at(-1)!.contactName ?? 'this contact' }} in chat</AppButton>
    </div>
  </div>
  <div v-else ref="page" class="page home-page" @scroll.passive="onScroll">
    <AppTopBar title="Updates">
      <template v-if="route.path !== '/'" #leading><AppIconButton to="/" icon="back" label="Back" class="back" :tooltip="false" /></template>
      <AppIconButton icon="list" label="Topics" @click="managing = true" />
      <AppIconButton icon="refresh" label="Update now" :disabled="!feed?.enabled || updating || busy" @click="run(home.update)" />
      <AppIconButton icon="plus" label="Follow something in Updates" variant="filled" @click="following = true" />
    </AppTopBar>
    <div class="home-inner">
      <section class="home-hero">
        <p class="home-date">{{ today }}</p>
        <h2 class="home-greeting">{{ greeting }}</h2>
        <p v-if="feed?.briefing" class="home-briefing">{{ feed.briefing }}</p>
        <div v-if="feed?.contributors.length" class="home-curators">
          <span class="stack">
            <AppAvatar v-for="contributor in feed.contributors.slice(0, 5)" :key="contributor.id" :name="contributor.name"
              :path="contactPhotoPath(contributor)" :size="28" />
          </span>
          <span>Curated by {{ curators }}</span>
        </div>
      </section>

      <div v-if="updating" class="home-status" role="status">
        <template v-if="feed?.progress">
          <AppAvatar :name="feed.progress.contactName ?? '?'" :path="progressPhoto" :size="24" />
          <span class="grow">{{ feed.progress.contactName ?? 'A contact' }} is preparing {{ feed.progress.title }}</span>
          <span class="count">{{ Math.min(feed.progress.done + 1, feed.progress.total) }}/{{ feed.progress.total }}</span>
        </template>
        <template v-else><span class="spinner" /><span class="grow">Your contacts are preparing updates…</span></template>
      </div>
      <AppNotice v-if="notice" :tone="noticeTone">
        {{ notice }}
        <template v-if="home.state.error && !feed" #actions><button class="link-button" @click="home.refresh(true)">Retry</button></template>
      </AppNotice>
      <AppNotice v-if="actionError">{{ actionError }}</AppNotice>

      <button class="composer" @click="following = true">
        <AppAvatar :name="user?.name ?? ''" :path="myPhoto" :size="36" />
        <span class="composer-hint">What should your contacts follow?</span>
        <span class="composer-action">Follow</span>
      </button>

      <section v-if="feed?.agenda.length" class="home-agenda" aria-label="Coming up">
        <NuxtLink v-for="item in feed.agenda" :key="item.id" :to="agendaPath(item)" class="agenda-row" data-ripple>
          <span class="agenda-icon" :class="item.kind"><AppIcon :name="item.kind === 'task' ? 'tasks' : 'clock'" /></span>
          <span class="copy"><strong>{{ item.title }}</strong><small>{{ agendaDetail(item) }}</small></span>
        </NuxtLink>
      </section>

      <section v-if="feed?.apps.length" class="home-apps" aria-label="Your apps">
        <div class="apps-row">
          <NuxtLink v-for="app in feed.apps" :key="app.id" :to="appPath(app)" class="app-tile" data-ripple :title="app.ownerName ?? undefined">
            <span class="mini-app-glyph"><AppIcon :name="miniAppIcon(app.icon)" /></span>
            <span>{{ app.title }}</span>
          </NuxtLink>
        </div>
      </section>

      <button v-if="fresh" class="fresh" @click="showFresh"><AppIcon name="arrow-up" />{{ fresh === 1 ? '1 new post' : `${fresh} new posts` }}</button>
      <div v-if="posts.length" class="timeline">
        <HomePost v-for="post in posts" :key="post.id" :post="post" :thread-count="threadCounts.get(post.topicID)"
          @action="(kind, prompt) => act(post, kind, prompt)" />
      </div>
      <div v-else-if="updating || (!feed && !home.state.error)" class="timeline" aria-hidden="true">
        <div v-for="index in 3" :key="index" class="placeholder"><span class="avatar-dot" /><span class="lines"><span /><span /><span /></span></div>
      </div>
      <AppEmptyState v-else-if="feed?.enabled" class="home-empty" icon="sparkle" title="Your contacts are getting to know you"
        text="As you chat, they’ll bring news, figures and reminders about what matters to you here. You can also tell them what to follow.">
        <template #actions><AppButton @click="following = true">Follow something</AppButton></template>
      </AppEmptyState>
    </div>

    <AppSheet v-if="following" title="Follow in Updates" @close="following = false">
      <form id="home-follow" @submit.prevent="follow">
        <textarea v-model="followText" class="follow-input" rows="3" maxlength="400" autofocus
          placeholder="For example: processing times for my I-130" aria-label="What should your contacts follow?" />
        <p class="muted small">Your contacts decide how to show it and who keeps it up to date. Public questions may be searched on the web.</p>
      </form>
      <template #actions>
        <AppButton variant="text" @click="following = false">Cancel</AppButton>
        <AppButton type="submit" form="home-follow" :disabled="!followText.trim() || busy">Add</AppButton>
      </template>
    </AppSheet>

    <AppSheet v-if="managing" title="Topics" @close="managing = false">
      <p class="muted small">Your contacts add and retire their own picks as your interests change. Topics you or a contact asked for stay until you hide them.</p>
      <ul class="topics">
        <li v-for="topic in feed?.topics ?? []" :key="topic.id" :class="{ hidden: topic.status === 'hidden' }">
          <span class="copy"><strong>{{ topic.title }}</strong><small>{{ topic.status === 'hidden' ? 'Hidden' : origin(topic) }}</small></span>
          <AppButton variant="outlined" :disabled="busy"
            @click="run(() => home.setTopic(topic.id, { status: topic.status === 'hidden' ? 'active' : 'hidden' }))">
            {{ topic.status === 'hidden' ? 'Show' : 'Hide' }}
          </AppButton>
        </li>
        <li v-if="!feed?.topics.length" class="muted">Nothing yet.</li>
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
.home-hero, .follow-more { padding-inline: var(--space-4); }
.home-hero { display: flex; flex-direction: column; gap: var(--space-1-5); padding-top: var(--space-1); }
.home-date { margin: 0; font: var(--type-label-medium); font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--md-on-surface-variant); }
.home-greeting { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; }
.home-briefing { margin: 0; font-size: 15px; line-height: 1.45; color: var(--md-on-surface-variant); display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.home-curators { display: flex; align-items: center; gap: var(--space-2); font-size: 13px; font-weight: 600; color: var(--md-on-surface-variant); margin-top: var(--space-1); }
.home-curators .stack { display: inline-flex; }
.home-curators .stack > * + * { margin-left: calc(-1 * var(--space-1)); }
.home-curators .stack :deep(.avatar) { box-shadow: 0 0 0 2px var(--md-surface); }
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
.timeline { display: flex; flex-direction: column; border-top: 1px solid var(--md-outline-variant); }
.placeholder { display: grid; grid-template-columns: 40px minmax(0, 1fr); gap: var(--space-3); padding: var(--space-4); border-bottom: 1px solid var(--md-outline-variant); animation: pulse 1.4s ease-in-out infinite alternate; }
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
.thread .timeline { border-top: 0; }
.thread-reply { align-self: flex-start; margin: var(--space-2) var(--space-4) 0 calc(var(--space-4) + 36px + var(--space-3)); }
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
</style>
