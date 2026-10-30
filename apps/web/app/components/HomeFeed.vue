<script setup lang="ts">
import type { HomeCard, HomeFeed } from '~/utils/types';

// Home: the feed a person's contacts curate together (docs/home.md). On wide
// screens it fills the content pane beside the chat list; cards flow into two
// columns, the lead card spans both.
defineProps<{ back?: boolean }>();
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
  return feed.value.error === 'HOME_NO_CONTACTS' ? 'Add a contact so they can start curating your Home.'
    : 'Your contacts couldn’t finish updating Home. They’ll try again in a few minutes.';
});

usePolling(() => home.refresh(homeUpdating(home.state.value)), () => homeUpdating(home.state.value) ? 4000 : 60_000);
onMounted(() => { void home.refresh(); });

async function run(operation: () => Promise<unknown>) {
  actionError.value = null;
  try { await operation(); } catch (failure) { actionError.value = errorMessage(failure); }
}
async function follow() {
  const text = followText.value.trim();
  if (!text) return;
  await run(async () => { await home.follow(text); following.value = false; followText.value = ''; });
}
function act(card: HomeCard, kind: 'more' | 'less' | 'hide' | 'message' | 'reply', prompt?: string) {
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
  <div class="page home-page">
    <header class="bar">
      <NuxtLink v-if="back" to="/" class="icon-button back" aria-label="Back"><AppIcon name="back" /></NuxtLink>
      <h1 class="title">Home</h1>
      <button class="icon-button" aria-label="Home topics" title="Home topics" @click="managing = true"><AppIcon name="list" /></button>
      <button class="icon-button" aria-label="Update now" title="Update now" :disabled="!feed?.enabled || updating || busy" @click="run(home.update)"><AppIcon name="refresh" /></button>
      <button class="icon-button primary" aria-label="Follow something on Home" title="Follow something" @click="following = true"><AppIcon name="plus" /></button>
    </header>
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
        <template v-else><span class="spinner" /><span class="grow">Your contacts are updating Home…</span></template>
      </div>
      <div v-if="notice" class="notice">{{ notice }} <button v-if="home.state.error && !feed" class="link-button" @click="home.refresh(true)">Retry</button></div>
      <div v-if="actionError" class="notice">{{ actionError }}</div>

      <section v-if="feed?.agenda.length" class="home-agenda">
        <h3>Coming up</h3>
        <NuxtLink v-for="item in feed.agenda" :key="item.id" :to="agendaPath(item)" class="agenda-row" data-ripple>
          <span class="agenda-icon" :class="item.kind"><AppIcon :name="item.kind === 'task' ? 'tasks' : 'clock'" /></span>
          <span class="copy"><strong>{{ item.title }}</strong><small>{{ agendaDetail(item) }}</small></span>
          <AppIcon name="chevron" class="chevron" />
        </NuxtLink>
      </section>

      <section v-if="feed?.apps.length" class="home-apps">
        <h3>Your apps</h3>
        <div class="apps-row">
          <NuxtLink v-for="app in feed.apps" :key="app.id" :to="appPath(app)" class="app-tile" data-ripple :title="app.ownerName ?? undefined">
            <span class="mini-app-glyph"><AppIcon :name="miniAppIcon(app.icon)" /></span>
            <span>{{ app.title }}</span>
          </NuxtLink>
        </div>
      </section>

      <div v-if="feed?.cards.length" class="home-grid">
        <HomeCard v-for="(card, index) in feed.cards" :key="card.id" :card="card" :lead="index === 0" :class="{ wide: index === 0 }"
          @action="(kind, prompt) => act(card, kind, prompt)" />
      </div>
      <div v-else-if="updating || (!feed && !home.state.error)" class="home-grid">
        <div v-for="index in 3" :key="index" class="placeholder" :class="{ wide: index === 1 }" />
      </div>
      <div v-else-if="feed?.enabled" class="home-empty">
        <AppIcon name="sparkle" />
        <h3>Your contacts are getting to know you</h3>
        <p>As you chat, they’ll bring news, figures and reminders about what matters to you here. You can also tell them what to follow.</p>
        <button class="button" @click="following = true">Follow something</button>
      </div>
      <button v-if="feed?.cards.length" class="button secondary block follow" @click="following = true">
        <AppIcon name="sparkle" /> Ask your contacts to follow something
      </button>
    </div>

    <AppSheet v-if="following" title="Follow on Home" @close="following = false">
      <form id="home-follow" @submit.prevent="follow">
        <textarea v-model="followText" class="follow-input" rows="3" maxlength="400" autofocus
          placeholder="For example: processing times for my I-130" aria-label="What should your contacts follow?" />
        <p class="muted small">Your contacts decide how to show it and who keeps it up to date. Public questions may be searched on the web.</p>
      </form>
      <template #actions>
        <button type="button" class="button text" @click="following = false">Cancel</button>
        <button type="submit" form="home-follow" class="button" :disabled="!followText.trim() || busy">Add</button>
      </template>
    </AppSheet>

    <AppSheet v-if="managing" title="Home topics" @close="managing = false">
      <p class="muted small">Your contacts add and retire their own picks as your interests change. Topics you or a contact asked for stay until you hide them.</p>
      <ul class="topics">
        <li v-for="topic in feed?.topics ?? []" :key="topic.id" :class="{ hidden: topic.status === 'hidden' }">
          <span class="copy"><strong>{{ topic.title }}</strong><small>{{ topic.status === 'hidden' ? 'Hidden' : origin(topic) }}</small></span>
          <button type="button" class="button outlined" :disabled="busy"
            @click="run(() => home.setTopic(topic.id, { status: topic.status === 'hidden' ? 'active' : 'hidden' }))">
            {{ topic.status === 'hidden' ? 'Show' : 'Hide' }}
          </button>
        </li>
        <li v-if="!feed?.topics.length" class="muted">Nothing yet.</li>
      </ul>
    </AppSheet>
  </div>
</template>

<style scoped>
.home-page { display: flex; flex-direction: column; }
.home-page .bar { background: var(--md-surface); }
.home-inner { width: 100%; max-width: 1040px; margin: 0 auto; padding: 0 20px 48px; display: flex; flex-direction: column; gap: 16px; }
.home-hero { display: flex; flex-direction: column; gap: 6px; padding-top: 4px; }
.home-date { margin: 0; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--md-on-surface-variant); }
.home-greeting { font-size: 32px; font-weight: 800; letter-spacing: -0.02em; }
.home-briefing { margin: 0; font-size: 17px; color: var(--md-on-surface-variant); max-width: 720px; }
.home-curators { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--md-on-surface-variant); margin-top: 4px; }
.home-curators .stack { display: inline-flex; }
.home-curators .stack > * + * { margin-left: -4px; }
.home-curators .stack :deep(.avatar) { box-shadow: 0 0 0 2px var(--md-surface); }
.home-status { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-radius: 999px; background: var(--md-secondary-container);
  color: var(--md-on-secondary-container); font-size: 14px; font-weight: 600; align-self: flex-start; max-width: 100%; }
.home-status .grow { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.home-status .count { font-variant-numeric: tabular-nums; opacity: 0.8; }
h3 { font-size: 15px; font-weight: 700; margin: 0 0 8px; }
.home-agenda { padding: 16px; border-radius: var(--md-shape-xl); background: var(--md-surface-container-low); }
.agenda-row { display: flex; align-items: center; gap: 12px; padding: 8px; margin: 0 -8px; border-radius: var(--md-shape-l); color: inherit; }
.agenda-icon { width: 36px; height: 36px; flex: none; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
  color: var(--md-primary); background: color-mix(in srgb, var(--md-primary) 14%, transparent); }
.agenda-icon.task { color: var(--md-warning); background: color-mix(in srgb, var(--md-warning) 14%, transparent); }
.agenda-icon :deep(svg) { width: 20px; height: 20px; }
.agenda-row .copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; font-size: 15px; }
.agenda-row small { font-size: 12px; color: var(--md-on-surface-variant); }
.agenda-row .chevron { color: var(--md-outline); }
.apps-row { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 4px; }
.app-tile { width: 84px; flex: none; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px 4px; border-radius: var(--md-shape-l);
  color: inherit; font-size: 12px; font-weight: 600; text-align: center; }
.app-tile .mini-app-glyph { width: 56px; height: 56px; border-radius: 16px; }
.home-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; align-items: start; }
.home-grid .wide { grid-column: 1 / -1; }
.placeholder { height: 180px; border-radius: var(--md-shape-xl); background: var(--md-surface-container-low); animation: pulse 1.4s ease-in-out infinite alternate; }
.placeholder.wide { height: 260px; }
@keyframes pulse { from { opacity: 1; } to { opacity: 0.5; } }
@media (prefers-reduced-motion: reduce) { .placeholder { animation: none; } }
.home-empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; padding: 32px 24px; border-radius: var(--md-shape-xl);
  background: var(--md-surface-container-low); color: var(--md-on-surface-variant); }
.home-empty :deep(svg) { width: 40px; height: 40px; color: var(--md-primary); }
.home-empty h3 { color: var(--md-on-surface); margin: 0; }
.home-empty p { margin: 0 0 8px; max-width: 420px; }
.follow { gap: 8px; }
.follow-input { width: 100%; padding: 12px 16px; border: 1px solid var(--md-outline); border-radius: var(--md-shape-xs); background: transparent;
  font-size: 16px; resize: vertical; outline: none; }
.follow-input:focus { border-color: var(--md-primary); box-shadow: inset 0 0 0 1px var(--md-primary); }
.topics { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.topics li { display: flex; align-items: center; gap: 12px; padding: 8px 0; }
.topics .copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.topics small { font-size: 12px; color: var(--md-on-surface-variant); }
.topics li.hidden strong { color: var(--md-on-surface-variant); }
@media (max-width: 860px) { .home-grid { grid-template-columns: minmax(0, 1fr); } .home-inner { padding: 0 12px 32px; } .home-greeting { font-size: 28px; } }
</style>
