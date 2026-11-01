<script setup lang="ts">
import type { HomeCardContent, HomePost } from '~/utils/types';

export type HomePostAction = 'more' | 'less' | 'hide' | 'message' | 'reply' | 'thread' | 'comment';

// One For you post (docs/updates.md#posts), like a Threads or X post: the contact (avatar, name,
// topic, age), the contact's text, and the card of the closed catalog (docs/updates.md#cards)
// attached in a frame that shows one headline, figure or line of each kind until "Show more".
// In a thread the attachments start expanded and a line joins the avatars.
const props = defineProps<{ post: HomePost; threadCount?: number; inThread?: boolean; chained?: boolean }>();
const emit = defineEmits<{ action: [kind: HomePostAction, prompt?: string] }>();
const card = computed(() => props.post);
const content = computed(() => props.post.content);
const menuOpen = ref(false);
const expanded = ref(!!props.inThread);
const icons: Record<string, AppIconName> = { news: 'news', sport: 'sport', trophy: 'trophy', chart: 'chart', money: 'money', globe: 'globe',
  calendar: 'calendar', clock: 'clock', book: 'book', heart: 'heart', star: 'star', bolt: 'bolt', list: 'list', check: 'check', person: 'person',
  chat: 'chat', home: 'home', folder: 'folder', cart: 'cart', plane: 'plane', doc: 'doc', weather: 'weather' };
const icon = computed(() => icons[content.value.icon] ?? 'sparkle');
const trendIcon = (trend?: string): AppIconName => trend === 'up' ? 'trend-up' : trend === 'down' ? 'trend-down' : 'trend-flat';
const lead = computed(() => content.value.kind === 'headlines' ? content.value.items?.[0] ?? null : null);
const rest = computed(() => content.value.kind === 'headlines' ? content.value.items?.slice(1) ?? [] : []);
const preview = useLinkPreview(() => lead.value?.url ?? null);
const image = usePrivateImage(() => preview.value?.status === 'ready' && preview.value.imageVersion
  ? `link-previews/${preview.value.hash}/image?v=${preview.value.imageVersion}` : null);
const avatar = computed(() => props.post.contactID ? contactPhotoPath({ id: props.post.contactID, photoVersion: props.post.contactPhotoVersion }) : null);
const name = computed(() => props.post.contactName ?? 'A contact');
const time = computed(() => relativeTime(props.post.createdAt));
const exactTime = computed(() => new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(props.post.createdAt));
// A note's text is the post; any other post shows the contact's text above its card.
const note = computed(() => content.value.kind === 'note');

// How much of each kind shows before "Show more".
const collapsedCount: Partial<Record<HomeCardContent['kind'], number>> = { matches: 2, metrics: 3, list: 3 };
const collapsedRows = 4;
const items = computed(() => content.value.items ?? []);
const shownItems = computed(() => {
  const cap = collapsedCount[content.value.kind];
  return expanded.value || cap === undefined ? items.value : items.value.slice(0, cap);
});
const shownRest = computed(() => expanded.value ? rest.value : []);
const rows = computed(() => (content.value.rows ?? []).map((cells, index) => ({ cells, index })));
const keptRow = (row: { index: number }) => row.index < collapsedRows || row.index === content.value.highlight;
const shownRows = computed(() => expanded.value ? rows.value : rows.value.filter(keptRow));
const hidden = computed(() => {
  const kind = content.value.kind;
  if (kind === 'headlines') return rest.value.length;
  if (kind === 'table') return rows.value.filter(row => !keptRow(row)).length;
  const cap = collapsedCount[kind];
  return cap === undefined ? 0 : Math.max(0, items.value.length - cap);
});
const extras = computed(() => content.value.kind === 'chart' ? !!content.value.summary
  : content.value.kind === 'tracker' ? !!(content.value.steps?.length || content.value.note) : false);
const expandable = computed(() => hidden.value > 0 || extras.value || !!props.post.reason || content.value.sources.length > 0);
const live = (status?: string) => !!status && /live|vivo|'/i.test(status);
const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

// Compact, like a timeline: "now", "27m", "2h", "3d", then the date.
function relativeTime(at: number) {
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60_000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h`;
  if (minutes < 60 * 24 * 7) return `${Math.round(minutes / 1440)}d`;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(at);
}

// Smooth line/area or bars in a 100×100 box, like the mini app charts.
const chart = computed(() => {
  const points = content.value.points ?? [];
  if (points.length < 2) return null;
  const values = points.map(point => point.value);
  const bar = content.value.style === 'bar';
  const min = bar ? Math.min(0, ...values) : Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const x = (index: number) => bar ? (index + 0.5) * (100 / points.length) : (index / (points.length - 1)) * 100;
  const y = (value: number) => 96 - ((value - min) / span) * (bar ? 92 : 84);
  const line = points.map((point, index) => `${x(index).toFixed(2)},${y(point.value).toFixed(2)}`).join(' ');
  const width = 100 / points.length * 0.62;
  return { bar, line, area: `0,100 ${line} 100,100`,
    bars: points.map((point, index) => ({ point, x: x(index) - width / 2, y: y(point.value), width, height: 96 - y(point.value) })),
    labels: [points[0]!.label, points[Math.floor(points.length / 2)]!.label, points.at(-1)!.label] };
});

function act(kind: HomePostAction, prompt?: string) { menuOpen.value = false; emit('action', kind, prompt); }
</script>

<template>
  <article class="home-post" :class="[`accent-${content.accent}`, { chained, 'in-thread': inThread }]">
    <div class="post-rail">
      <AppAvatar class="post-avatar" :name="name" :path="avatar" :size="36" />
    </div>
    <div class="post-main">
      <header class="post-head">
        <strong class="who">{{ name }}</strong>
        <template v-if="!inThread">
          <AppIcon name="chevron" class="topic-sep" />
          <span class="topic" :title="content.title">{{ content.title }}</span>
        </template>
        <button v-if="!inThread" class="when link-button" :title="exactTime" @click="act('thread')">{{ time }}</button>
        <span v-else class="when" :title="exactTime">{{ time }}</span>
        <div class="mini-menu">
          <AppIconButton icon="more" label="Post options" size="small" :tooltip="false" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen" />
          <template v-if="menuOpen">
            <div class="backdrop" @click="menuOpen = false" />
            <div class="menu card-menu" role="menu">
              <AppMenuItem v-if="card.contactID && card.contactName" icon="chat" role="menuitem" @click="act('message')">Message {{ card.contactName }}</AppMenuItem>
              <AppMenuItem icon="thumb-down" role="menuitem" @click="act('less')">{{ card.feedback === 'less' ? 'Undo less like this' : 'Less like this' }}</AppMenuItem>
              <AppMenuItem icon="hide" danger role="menuitem" @click="act('hide')">Hide from For you</AppMenuItem>
            </div>
          </template>
        </div>
      </header>
      <p v-if="post.replyTo" class="replying">Replying to {{ post.replyTo.contactName ?? 'a contact' }}</p>
      <p v-if="post.text" class="post-text" :class="{ open: !inThread }" @click="!inThread && act('thread')">{{ post.text }}</p>

      <div :class="note ? 'note-body' : 'attachment'">
      <p v-if="!note && (content.subtitle || !post.text)" class="attachment-head">
        <AppIcon :name="icon" filled /><span>{{ post.text ? content.subtitle : content.subtitle ?? content.title }}</span>
      </p>

      <div v-if="content.kind === 'headlines'" class="headlines">
        <a v-if="lead" class="headline-lead" :href="lead.url" target="_blank" rel="noreferrer noopener" :class="{ inert: !lead.url }">
          <img v-if="image" :src="image" alt="" loading="lazy">
          <span class="headline-text">
            <strong>{{ lead.title }}</strong>
            <span v-if="lead.summary" class="summary">{{ lead.summary }}</span>
            <span v-if="lead.source || lead.time" class="meta">{{ [lead.source, lead.time].filter(Boolean).join(' · ') }}</span>
          </span>
        </a>
        <a v-for="(item, index) in shownRest" :key="index" class="headline-row" :href="item.url" target="_blank" rel="noreferrer noopener" :class="{ inert: !item.url }">
          <span class="dot" />
          <span class="copy"><strong>{{ item.title }}</strong><span v-if="item.source || item.time" class="meta">{{ [item.source, item.time].filter(Boolean).join(' · ') }}</span></span>
          <AppIcon v-if="item.url" name="open-in-new" class="open" />
        </a>
      </div>

      <div v-else-if="content.kind === 'matches'" class="matches">
        <div v-for="(match, index) in shownItems" :key="index" class="match">
          <div class="teams">
            <div :class="{ wins: (match.homeScore ?? 0) > (match.awayScore ?? 0) }"><span>{{ match.home }}</span><b v-if="match.homeScore != null">{{ match.homeScore }}</b></div>
            <div :class="{ wins: (match.awayScore ?? 0) > (match.homeScore ?? 0) }"><span>{{ match.away }}</span><b v-if="match.awayScore != null">{{ match.awayScore }}</b></div>
            <small v-if="match.detail">{{ match.detail }}</small>
          </div>
          <span class="status" :class="{ live: live(match.status) }">{{ match.status }}</span>
        </div>
      </div>

      <div v-else-if="content.kind === 'table'" class="table-wrap">
        <table>
          <thead><tr><th v-for="(column, index) in content.columns" :key="index">{{ column }}</th></tr></thead>
          <tbody><tr v-for="row in shownRows" :key="row.index" :class="{ highlight: row.index === content.highlight }"><td v-for="(cell, column) in row.cells" :key="column">{{ cell }}</td></tr></tbody>
        </table>
        <p v-if="content.caption && expanded" class="caption">{{ content.caption }}</p>
      </div>

      <div v-else-if="content.kind === 'metrics'" class="metrics">
        <div v-for="(item, index) in shownItems" :key="index" class="metric">
          <span class="label">{{ item.label }}</span>
          <span class="value">{{ item.value }}<small v-if="item.unit">{{ item.unit }}</small></span>
          <span v-if="item.change || item.trend" class="change" :class="item.trend"><AppIcon v-if="item.trend" :name="trendIcon(item.trend)" />{{ item.change }}</span>
          <span v-if="item.caption && expanded" class="caption">{{ item.caption }}</span>
        </div>
      </div>

      <div v-else-if="content.kind === 'chart'" class="chart" :class="{ compact: !expanded }">
        <div v-if="content.value || content.change" class="chart-value">
          <strong>{{ content.value }}</strong><small v-if="content.unit">{{ content.unit }}</small>
          <span v-if="content.change" class="change" :class="content.trend"><AppIcon :name="trendIcon(content.trend)" />{{ content.change }}</span>
        </div>
        <svg v-if="chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" :aria-label="content.title">
          <template v-if="chart.bar">
            <rect v-for="(bar, index) in chart.bars" :key="index" :x="bar.x" :y="bar.y" :width="bar.width" :height="Math.max(bar.height, 0.5)" rx="1.4" fill="var(--card-accent)"><title>{{ bar.point.label }}: {{ bar.point.value }}</title></rect>
          </template>
          <template v-else>
            <polygon :points="chart.area" fill="color-mix(in srgb, var(--card-accent) 18%, transparent)" />
            <polyline :points="chart.line" fill="none" stroke="var(--card-accent)" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" />
          </template>
        </svg>
        <div v-if="chart" class="axis"><span v-for="(label, index) in chart.labels" :key="index">{{ label }}</span></div>
        <p v-if="content.summary && expanded" class="caption">{{ content.summary }}</p>
      </div>

      <div v-else-if="content.kind === 'tracker'" class="tracker">
        <strong class="figure">{{ content.figure }}</strong>
        <span class="figure-label">{{ content.figureLabel }}</span>
        <div v-if="content.progress != null" class="meter" role="progressbar" :aria-valuenow="Math.round(content.progress * 100)" aria-valuemin="0" aria-valuemax="100">
          <span :style="{ width: `${Math.round(content.progress * 100)}%` }" />
        </div>
        <p v-if="content.status" class="status-line">{{ content.status }}</p>
        <ol v-if="content.steps?.length && expanded" class="steps">
          <li v-for="(step, index) in content.steps" :key="index" :class="step.state">
            <span class="marker"><AppIcon :name="step.state === 'done' ? 'check' : 'circle'" :filled="step.state !== 'upcoming'" /></span>
            <span class="copy"><strong>{{ step.label }}</strong><small v-if="step.detail">{{ step.detail }}</small></span>
          </li>
        </ol>
        <p v-if="content.note && expanded" class="tracker-note">{{ content.note }}</p>
      </div>

      <div v-else-if="content.kind === 'note'" class="note">
        <p class="note-text">{{ content.text }}</p>
        <HomeReplyTemplate v-if="card.contactID && content.prompt" :prompt="content.prompt" class="note-reply" @use="text => act('reply', text)" />
      </div>

      <ol v-else class="list">
        <li v-for="(item, index) in shownItems" :key="index">
          <a :href="item.url" target="_blank" rel="noreferrer noopener" :class="{ inert: !item.url }">
            <span class="index">{{ index + 1 }}</span>
            <span class="copy"><strong>{{ item.title }}</strong><small v-if="item.detail">{{ item.detail }}</small></span>
            <span v-if="item.trailing" class="trailing">{{ item.trailing }}</span>
          </a>
        </li>
      </ol>

      <div v-if="expanded && (card.reason || content.sources.length)" class="post-details">
        <p v-if="card.reason" class="reason">{{ card.reason }}</p>
        <span v-if="content.sources.length" class="sources">
          <a v-for="source in content.sources" :key="source.url" :href="source.url" target="_blank" rel="noreferrer noopener" :title="source.title" class="chip">
            <AppIcon name="link" />{{ host(source.url) }}
          </a>
        </span>
      </div>
      <button v-if="expandable" class="expand link-button" :aria-expanded="expanded" @click="expanded = !expanded">
        {{ expanded ? 'Show less' : hidden ? `Show ${hidden} more` : 'Show more' }}
      </button>
      </div>

      <footer class="post-actions">
        <AppIconButton icon="heart" label="More like this" size="small" class="like" :selected="card.feedback === 'more'" @click="act('more')" />
        <button v-if="card.contactID" class="comment-button" :aria-label="`Comment on ${name}’s post`" :title="`Comment on ${name}’s post`" @click="act('comment')">
          <AppIcon name="chat" /><span v-if="post.comments?.length">{{ post.comments.length }}</span>
        </button>
        <button v-if="!inThread && (threadCount ?? 0) > 1" class="thread-link link-button" @click="act('thread')">{{ threadCount }} posts in this thread</button>
      </footer>
    </div>
  </article>
</template>

<style scoped>
/* The accents are the catalog's fixed palette (docs/updates.md#cards), not theme roles. */
/* A post: avatar column, then the content column. Posts are separated by the feed's dividers;
   in a thread a line joins each avatar to the next post's instead. */
.home-post { --card-accent: #1a73e8; display: grid; grid-template-columns: 36px minmax(0, 1fr); column-gap: var(--space-3); padding: var(--space-3) var(--space-4) var(--space-1); min-width: 0; }
.home-post + .home-post:not(.in-thread) { border-top: 1px solid var(--md-outline-variant); }
.post-rail { display: flex; flex-direction: column; align-items: center; }
.home-post.chained .post-rail::after { content: ''; flex: 1; width: 2px; margin: var(--space-1-5) 0 calc(-1 * var(--space-3)); border-radius: 1px; background: var(--md-outline-variant); }
.accent-blue { --card-accent: #1a73e8; } .accent-green { --card-accent: #188038; } .accent-orange { --card-accent: #e8710a; }
.accent-red { --card-accent: #d93025; } .accent-purple { --card-accent: #9334e6; } .accent-teal { --card-accent: #12838f; }
.accent-pink { --card-accent: #d01884; } .accent-indigo { --card-accent: #3f51b5; } .accent-gray { --card-accent: #5f6368; }
:root[data-theme="dark"] .accent-blue { --card-accent: #8ab4f8; } :root[data-theme="dark"] .accent-green { --card-accent: #81c995; }
:root[data-theme="dark"] .accent-orange { --card-accent: #fcad70; } :root[data-theme="dark"] .accent-red { --card-accent: #f28b82; }
:root[data-theme="dark"] .accent-purple { --card-accent: #c58af9; } :root[data-theme="dark"] .accent-teal { --card-accent: #78d9ec; }
:root[data-theme="dark"] .accent-pink { --card-accent: #ff8bcb; } :root[data-theme="dark"] .accent-indigo { --card-accent: #9fa8da; }
:root[data-theme="dark"] .accent-gray { --card-accent: #bdc1c6; }
.post-main { display: flex; flex-direction: column; gap: var(--space-1-5); min-width: 0; }
.post-head { display: flex; align-items: center; gap: var(--space-1); min-height: 24px; font-size: 15px; }
.who { flex: none; max-width: 45%; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.topic-sep { flex: none; width: 16px; height: 16px; color: var(--md-on-surface-variant); }
.topic { min-width: 0; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.when { flex: none; margin-left: var(--space-1); font-size: 15px; color: var(--md-on-surface-variant); }
.when.link-button { min-height: 0; padding: 0; font: inherit; color: var(--md-on-surface-variant); letter-spacing: normal; }
.when.link-button:hover { text-decoration: underline; }
.post-head .mini-menu { margin: calc(-1 * var(--space-2)) calc(-1 * var(--space-2)) calc(-1 * var(--space-2)) auto; }
.replying { margin: calc(-1 * var(--space-1)) 0 0; font-size: 13px; color: var(--md-on-surface-variant); }
.post-text { margin: 0; font-size: 15px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
.post-text.open { cursor: pointer; }
/* The card is attached to the post like a quoted post or a link preview. */
.attachment { display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-1); padding: var(--space-3); border: 1px solid var(--md-outline-variant); border-radius: 18px; min-width: 0; }
.note-body { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
.attachment-head { display: flex; align-items: center; gap: var(--space-1-5); margin: 0; min-width: 0; font: var(--type-label-medium); font-weight: 600; color: var(--md-on-surface-variant); }
.attachment-head :deep(svg) { width: 16px; height: 16px; flex: none; color: var(--card-accent); }
.attachment-head span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.expand { align-self: flex-start; min-height: 0; padding: 0; font: var(--type-label-large); }
/* The layer's .menu is only the surface; it drops down from the options button. */
.card-menu { position: absolute; right: 0; top: 36px; z-index: 6; min-width: 224px; transform-origin: top right; }
.inert { pointer-events: none; }
a { color: inherit; }

.headlines { display: flex; flex-direction: column; container-type: inline-size; }
.headline-lead { display: flex; flex-direction: column; gap: var(--space-1-5); }
.headline-lead img { width: 100%; aspect-ratio: 16 / 9; max-height: 190px; object-fit: cover; border-radius: 18px; margin-bottom: var(--space-1); }
.headline-text { display: flex; flex-direction: column; gap: var(--space-1-5); min-width: 0; }
/* Wide cards (desktop) put the image beside the text instead of stretching it into a banner. */
@container (min-width: 440px) {
  .headline-lead:has(> img) { display: grid; grid-template-columns: clamp(140px, 36%, 300px) minmax(0, 1fr); align-items: start; gap: var(--space-4); }
  .headline-lead img { height: auto; max-height: none; aspect-ratio: 4 / 3; margin: 0; }
}
.headline-lead strong { font-size: 17px; line-height: 1.3; }
.summary { color: var(--md-on-surface-variant); font-size: 14px; line-height: 1.4; }
.meta { font: var(--type-label-medium); color: var(--md-on-surface-variant); }
.headline-lead + .headline-row { margin-top: var(--space-3); }
.headline-row { display: flex; align-items: flex-start; gap: 10px; padding: 10px 0; border-top: 1px solid var(--md-outline-variant); }
.headline-row .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--card-accent); margin-top: var(--space-2); flex: none; }
.headline-row .copy { flex: 1; display: flex; flex-direction: column; gap: var(--space-0-5); min-width: 0; font-size: 15px; }
.headline-row .open { width: 16px; height: 16px; color: var(--md-outline); margin-top: 3px; }

.matches { display: flex; flex-direction: column; gap: var(--space-2); }
.match { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3); border-radius: var(--md-shape-l); background: var(--md-surface-container); }
.teams { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--space-1-5); }
.teams div { display: flex; justify-content: space-between; gap: var(--space-2); font-size: 15px; font-weight: 500; }
.teams div.wins { font-weight: 700; }
.teams b { font-size: 18px; font-variant-numeric: tabular-nums; }
.teams small { color: var(--md-on-surface-variant); font: var(--type-body-small); }
.status { flex: none; padding: var(--space-1-5) 10px; border-radius: var(--md-shape-full); font-size: 12px; font-weight: 700; color: var(--card-accent);
  background: color-mix(in srgb, var(--card-accent) 14%, transparent); font-variant-numeric: tabular-nums; }
.status.live { color: var(--md-on-error); background: var(--md-error); }

.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 14px; font-variant-numeric: tabular-nums; }
th { text-align: right; font-size: 12px; font-weight: 700; color: var(--md-on-surface-variant); padding: var(--space-1-5) var(--space-2); }
td { text-align: right; padding: 7px var(--space-2); white-space: nowrap; }
th:first-child, td:first-child { text-align: left; }
tr.highlight td { font-weight: 700; background: color-mix(in srgb, var(--card-accent) 14%, transparent); }
tr.highlight td:first-child { border-radius: var(--md-shape-s) 0 0 var(--md-shape-s); } tr.highlight td:last-child { border-radius: 0 var(--md-shape-s) var(--md-shape-s) 0; }
.caption { margin: var(--space-1-5) 0 0; font: var(--type-body-small); color: var(--md-on-surface-variant); }

.metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--space-2); }
.metric { display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-3); border-radius: var(--md-shape-l); background: var(--md-surface-container); min-width: 0; }
.metric .label { font: var(--type-label-medium); color: var(--md-on-surface-variant); }
.metric .value { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.metric .value small, .chart-value small { font-size: 12px; font-weight: 600; color: var(--md-on-surface-variant); margin-left: 3px; white-space: nowrap; }
.change { display: inline-flex; align-items: center; gap: var(--space-0-5); font-size: 13px; font-weight: 700; color: var(--md-on-surface-variant); }
.change :deep(svg) { width: 16px; height: 16px; }
.change.up { color: var(--md-success); } .change.down { color: var(--md-error); }

.chart > svg { width: 100%; height: 150px; display: block; overflow: visible; }
.chart.compact > svg { height: 96px; }
.chart-value { display: flex; align-items: baseline; gap: var(--space-1-5); margin-bottom: var(--space-2); }
.chart-value strong { font-size: 28px; font-variant-numeric: tabular-nums; }
.axis { display: flex; justify-content: space-between; font-size: 11px; color: var(--md-on-surface-variant); margin-top: var(--space-1-5); }

.tracker { display: flex; flex-direction: column; gap: var(--space-1-5); }
.figure { font-size: 30px; font-weight: 800; color: var(--card-accent); line-height: 1.1; }
.figure-label { font-size: 14px; font-weight: 500; color: var(--md-on-surface-variant); }
.tracker .meter { height: 8px; border-radius: var(--md-shape-xs); margin: var(--space-2) 0 var(--space-1); background: color-mix(in srgb, var(--card-accent) 16%, transparent); }
.tracker .meter span { display: block; height: 100%; border-radius: inherit; background: var(--card-accent); }
.status-line { margin: var(--space-1) 0; font-size: 15px; }
.steps { list-style: none; margin: var(--space-1) 0 0; padding: 0; }
.steps li { position: relative; display: flex; gap: var(--space-3); padding-bottom: var(--space-3); }
.steps li:not(:last-child)::before { content: ''; position: absolute; left: 10px; top: 24px; bottom: 0; width: 2px; background: var(--md-outline-variant); }
.steps li.done:not(:last-child)::before { background: color-mix(in srgb, var(--card-accent) 50%, transparent); }
.marker { color: var(--card-accent); flex: none; }
.marker :deep(svg) { width: 22px; height: 22px; }
.steps li.upcoming .marker { color: var(--md-outline); }
.steps .copy { display: flex; flex-direction: column; gap: 1px; font-size: 15px; }
.steps li.current strong { font-weight: 800; }
.steps li.upcoming strong { color: var(--md-on-surface-variant); font-weight: 500; }
.steps small { font: var(--type-body-small); color: var(--md-on-surface-variant); }
.tracker-note { margin: var(--space-1) 0 0; padding: var(--space-3); border-radius: var(--md-shape-l); font: var(--type-body-medium); color: var(--md-on-surface-variant); background: color-mix(in srgb, var(--card-accent) 8%, transparent); }

.note { display: flex; flex-direction: column; gap: var(--space-3); }
.note-text { margin: 0; font-size: 15px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
.note-reply { align-self: flex-start; max-width: 100%; }

.list { list-style: none; margin: 0; padding: 0; }
.list li + li { border-top: 1px solid var(--md-outline-variant); }
.list a { display: flex; align-items: flex-start; gap: var(--space-3); padding: 10px 0; }
.list .index { width: 16px; flex: none; font-size: 13px; font-weight: 700; color: var(--card-accent); padding-top: 1px; }
.list .copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--space-0-5); font-size: 15px; }
.list small { font-size: 13px; color: var(--md-on-surface-variant); }
.list .trailing { font: var(--type-label-medium); color: var(--md-on-surface-variant); text-align: right; }

.post-details { display: flex; flex-direction: column; gap: var(--space-2); }
.reason { margin: 0; font: var(--type-body-small); color: var(--md-on-surface-variant); }
/* Actions sit on the content column's left edge; the icon buttons' padding is pulled out of it. */
.post-actions { display: flex; align-items: center; gap: var(--space-1); margin-left: calc(-1 * var(--space-2)); color: var(--md-on-surface-variant); }
.post-actions .like.selected { color: #e0245e; }
.comment-button { display: inline-flex; align-items: center; gap: var(--space-1); min-height: 32px; padding: 0 var(--space-2); border: 0; border-radius: var(--md-shape-full);
  background: none; color: inherit; font: var(--type-label-large); cursor: pointer; }
.comment-button:hover { background: color-mix(in srgb, currentColor 8%, transparent); }
.comment-button :deep(svg) { width: 20px; height: 20px; }
.thread-link { margin-left: auto; min-height: 32px; padding: 0 var(--space-2); font: var(--type-label-large); color: var(--md-on-surface-variant); }
.sources { display: flex; flex-wrap: wrap; gap: var(--space-1-5); }
/* Link chips: AppChip renders a <span>, so these stay `a.chip`. */
.sources .chip { display: inline-flex; align-items: center; gap: var(--space-1); padding: var(--space-1) 10px; border-radius: var(--md-shape-full); font: var(--type-label-medium);
  color: var(--md-on-surface-variant); background: var(--md-surface-container-high); max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sources .chip :deep(svg) { width: 14px; height: 14px; flex: none; }
</style>
