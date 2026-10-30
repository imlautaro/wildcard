<script setup lang="ts">
import type { HomeCard } from '~/utils/types';
import type { AppIconName } from '~/utils/icons';

// One Updates card of the closed catalog (docs/updates.md#cards), drawn with Material 3
// surfaces like the iOS HomeCards layouts. `lead` is the first, larger card.
const props = defineProps<{ card: HomeCard; lead?: boolean }>();
const emit = defineEmits<{ action: [kind: 'more' | 'less' | 'hide' | 'message' | 'reply', prompt?: string] }>();
const content = computed(() => props.card.content);
const menuOpen = ref(false);
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
const avatar = computed(() => props.card.contactID ? contactPhotoPath({ id: props.card.contactID, photoVersion: props.card.contactPhotoVersion }) : null);
const attribution = computed(() => [props.card.contactName ?? 'A contact', relativeTime(props.card.generatedAt), props.card.reason].filter(Boolean).join(' · '));
const live = (status?: string) => !!status && /live|vivo|'/i.test(status);
const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

function relativeTime(at: number) {
  const minutes = Math.round((Date.now() - at) / 60_000);
  const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (Math.abs(minutes) < 60) return format.format(-minutes, 'minute');
  if (Math.abs(minutes) < 60 * 24) return format.format(-Math.round(minutes / 60), 'hour');
  return format.format(-Math.round(minutes / 1440), 'day');
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

function act(kind: 'more' | 'less' | 'hide' | 'message' | 'reply', prompt?: string) { menuOpen.value = false; emit('action', kind, prompt); }
</script>

<template>
  <article class="home-card" :class="[`accent-${content.accent}`, { lead }]">
    <header class="home-card-header">
      <span class="home-card-icon"><AppIcon :name="icon" filled /></span>
      <div class="home-card-titles">
        <h2>{{ content.title }}</h2>
        <p v-if="content.subtitle">{{ content.subtitle }}</p>
      </div>
      <div class="mini-menu">
        <button type="button" class="icon-button" aria-label="Card options" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen"><AppIcon name="more" /></button>
        <template v-if="menuOpen">
          <div class="backdrop" @click="menuOpen = false" />
          <div class="items" role="menu">
            <button v-if="card.contactID && card.contactName" type="button" role="menuitem" @click="act('message')"><AppIcon name="chat" /> Message {{ card.contactName }}</button>
            <button type="button" role="menuitem" @click="act('more')"><AppIcon name="thumb-up" :filled="card.feedback === 'more'" /> More like this</button>
            <button type="button" role="menuitem" @click="act('less')"><AppIcon name="thumb-down" :filled="card.feedback === 'less'" /> Less like this</button>
            <hr>
            <button type="button" role="menuitem" class="danger" @click="act('hide')"><AppIcon name="hide" /> Hide from Updates</button>
          </div>
        </template>
      </div>
    </header>

    <div v-if="content.kind === 'headlines'" class="headlines">
      <a v-if="lead" class="headline-lead" :href="lead.url" target="_blank" rel="noreferrer noopener" :class="{ inert: !lead.url }">
        <img v-if="image" :src="image" alt="" loading="lazy">
        <strong>{{ lead.title }}</strong>
        <span v-if="lead.summary" class="summary">{{ lead.summary }}</span>
        <span v-if="lead.source || lead.time" class="meta">{{ [lead.source, lead.time].filter(Boolean).join(' · ') }}</span>
      </a>
      <a v-for="(item, index) in rest" :key="index" class="headline-row" :href="item.url" target="_blank" rel="noreferrer noopener" :class="{ inert: !item.url }">
        <span class="dot" />
        <span class="copy"><strong>{{ item.title }}</strong><span v-if="item.source || item.time" class="meta">{{ [item.source, item.time].filter(Boolean).join(' · ') }}</span></span>
        <AppIcon v-if="item.url" name="open-in-new" class="open" />
      </a>
    </div>

    <div v-else-if="content.kind === 'matches'" class="matches">
      <div v-for="(match, index) in content.items" :key="index" class="match">
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
        <tbody><tr v-for="(row, index) in content.rows" :key="index" :class="{ highlight: index === content.highlight }"><td v-for="(cell, column) in row" :key="column">{{ cell }}</td></tr></tbody>
      </table>
      <p v-if="content.caption" class="caption">{{ content.caption }}</p>
    </div>

    <div v-else-if="content.kind === 'metrics'" class="metrics">
      <div v-for="(item, index) in content.items" :key="index" class="metric">
        <span class="label">{{ item.label }}</span>
        <span class="value">{{ item.value }}<small v-if="item.unit">{{ item.unit }}</small></span>
        <span v-if="item.change || item.trend" class="change" :class="item.trend"><AppIcon v-if="item.trend" :name="trendIcon(item.trend)" />{{ item.change }}</span>
        <span v-if="item.caption" class="caption">{{ item.caption }}</span>
      </div>
    </div>

    <div v-else-if="content.kind === 'chart'" class="chart">
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
      <p v-if="content.summary" class="caption">{{ content.summary }}</p>
    </div>

    <div v-else-if="content.kind === 'tracker'" class="tracker">
      <strong class="figure">{{ content.figure }}</strong>
      <span class="figure-label">{{ content.figureLabel }}</span>
      <div v-if="content.progress != null" class="meter" role="progressbar" :aria-valuenow="Math.round(content.progress * 100)" aria-valuemin="0" aria-valuemax="100">
        <span :style="{ width: `${Math.round(content.progress * 100)}%` }" />
      </div>
      <p v-if="content.status" class="status-line">{{ content.status }}</p>
      <ol v-if="content.steps?.length" class="steps">
        <li v-for="(step, index) in content.steps" :key="index" :class="step.state">
          <span class="marker"><AppIcon :name="step.state === 'done' ? 'check' : 'circle'" :filled="step.state !== 'upcoming'" /></span>
          <span class="copy"><strong>{{ step.label }}</strong><small v-if="step.detail">{{ step.detail }}</small></span>
        </li>
      </ol>
      <p v-if="content.note" class="tracker-note">{{ content.note }}</p>
    </div>

    <div v-else-if="content.kind === 'note'" class="note">
      <div class="note-row">
        <AppAvatar :name="card.contactName ?? '?'" :path="avatar" :size="34" />
        <p class="bubble-text">{{ content.text }}</p>
      </div>
      <button v-if="card.contactID" type="button" class="button secondary note-reply" @click="act(content.prompt ? 'reply' : 'message', content.prompt)">
        <AppIcon name="reply" /> {{ content.prompt ?? 'Reply' }}
      </button>
    </div>

    <ol v-else class="list">
      <li v-for="(item, index) in content.items" :key="index">
        <a :href="item.url" target="_blank" rel="noreferrer noopener" :class="{ inert: !item.url }">
          <span class="index">{{ index + 1 }}</span>
          <span class="copy"><strong>{{ item.title }}</strong><small v-if="item.detail">{{ item.detail }}</small></span>
          <span v-if="item.trailing" class="trailing">{{ item.trailing }}</span>
        </a>
      </li>
    </ol>

    <footer class="home-card-footer">
      <span class="attribution"><AppAvatar :name="card.contactName ?? '?'" :path="avatar" :size="18" />{{ attribution }}</span>
      <span v-if="content.sources.length" class="sources">
        <a v-for="source in content.sources" :key="source.url" :href="source.url" target="_blank" rel="noreferrer noopener" :title="source.title" class="chip">
          <AppIcon name="link" />{{ host(source.url) }}
        </a>
      </span>
    </footer>
  </article>
</template>

<style scoped>
.home-card { --card-accent: #1a73e8; display: flex; flex-direction: column; gap: 14px; padding: 16px; border-radius: var(--md-shape-xl); background: var(--md-surface-container-low); min-width: 0; break-inside: avoid; }
.home-card.lead { background: linear-gradient(180deg, color-mix(in srgb, var(--card-accent) 14%, var(--md-surface-container-low)), var(--md-surface-container-low) 55%); }
.accent-blue { --card-accent: #1a73e8; } .accent-green { --card-accent: #188038; } .accent-orange { --card-accent: #e8710a; }
.accent-red { --card-accent: #d93025; } .accent-purple { --card-accent: #9334e6; } .accent-teal { --card-accent: #12838f; }
.accent-pink { --card-accent: #d01884; } .accent-indigo { --card-accent: #3f51b5; } .accent-gray { --card-accent: #5f6368; }
@media (prefers-color-scheme: dark) {
  .accent-blue { --card-accent: #8ab4f8; } .accent-green { --card-accent: #81c995; } .accent-orange { --card-accent: #fcad70; }
  .accent-red { --card-accent: #f28b82; } .accent-purple { --card-accent: #c58af9; } .accent-teal { --card-accent: #78d9ec; }
  .accent-pink { --card-accent: #ff8bcb; } .accent-indigo { --card-accent: #9fa8da; } .accent-gray { --card-accent: #bdc1c6; }
}
.home-card-header { display: flex; align-items: flex-start; gap: 12px; }
.home-card-icon { width: 36px; height: 36px; flex: none; display: inline-flex; align-items: center; justify-content: center; border-radius: var(--md-shape-m);
  color: var(--card-accent); background: color-mix(in srgb, var(--card-accent) 14%, transparent); }
.home-card-icon :deep(svg) { width: 20px; height: 20px; }
.home-card-titles { flex: 1; min-width: 0; }
.home-card-titles h2 { font-size: 17px; font-weight: 700; }
.lead .home-card-titles h2 { font-size: 20px; }
.home-card-titles p { margin: 2px 0 0; font-size: 13px; color: var(--md-on-surface-variant); }
.home-card-header .mini-menu { margin: -6px -6px 0 0; }
.home-card-header .mini-menu .items button { gap: 12px; }
.home-card-header .mini-menu .items :deep(svg) { width: 20px; height: 20px; color: var(--md-on-surface-variant); }
.inert { pointer-events: none; }
a { color: inherit; }

.headlines { display: flex; flex-direction: column; }
.headline-lead { display: flex; flex-direction: column; gap: 6px; padding-bottom: 12px; }
.headline-lead img { width: 100%; height: 190px; object-fit: cover; border-radius: 18px; margin-bottom: 4px; }
.headline-lead strong { font-size: 20px; line-height: 1.25; }
.lead .headline-lead strong { font-size: 22px; }
.summary { color: var(--md-on-surface-variant); font-size: 15px; }
.meta { font-size: 12px; font-weight: 600; color: var(--md-on-surface-variant); }
.headline-row { display: flex; align-items: flex-start; gap: 10px; padding: 10px 0; border-top: 1px solid var(--md-outline-variant); }
.headline-row .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--card-accent); margin-top: 8px; flex: none; }
.headline-row .copy { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; font-size: 15px; }
.headline-row .open { width: 16px; height: 16px; color: var(--md-outline); margin-top: 3px; }

.matches { display: flex; flex-direction: column; gap: 8px; }
.match { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: var(--md-shape-l); background: var(--md-surface-container); }
.teams { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.teams div { display: flex; justify-content: space-between; gap: 8px; font-size: 15px; font-weight: 500; }
.teams div.wins { font-weight: 700; }
.teams b { font-size: 18px; font-variant-numeric: tabular-nums; }
.teams small { color: var(--md-on-surface-variant); font-size: 12px; }
.status { flex: none; padding: 6px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; color: var(--card-accent);
  background: color-mix(in srgb, var(--card-accent) 14%, transparent); font-variant-numeric: tabular-nums; }
.status.live { color: #fff; background: #d93025; }

.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 14px; font-variant-numeric: tabular-nums; }
th { text-align: right; font-size: 12px; font-weight: 700; color: var(--md-on-surface-variant); padding: 6px 8px; }
td { text-align: right; padding: 7px 8px; white-space: nowrap; }
th:first-child, td:first-child { text-align: left; }
tr.highlight td { font-weight: 700; background: color-mix(in srgb, var(--card-accent) 14%, transparent); }
tr.highlight td:first-child { border-radius: 8px 0 0 8px; } tr.highlight td:last-child { border-radius: 0 8px 8px 0; }
.caption { margin: 6px 0 0; font-size: 12px; color: var(--md-on-surface-variant); }

.metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; }
.metric { display: flex; flex-direction: column; gap: 4px; padding: 12px; border-radius: var(--md-shape-l); background: var(--md-surface-container); min-width: 0; }
.metric .label { font-size: 12px; font-weight: 600; color: var(--md-on-surface-variant); }
.metric .value { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.metric .value small, .chart-value small { font-size: 12px; font-weight: 600; color: var(--md-on-surface-variant); margin-left: 3px; white-space: nowrap; }
.change { display: inline-flex; align-items: center; gap: 2px; font-size: 13px; font-weight: 700; color: var(--md-on-surface-variant); }
.change :deep(svg) { width: 16px; height: 16px; }
.change.up { color: var(--md-success); } .change.down { color: var(--md-error); }

.chart > svg { width: 100%; height: 170px; display: block; overflow: visible; }
.chart-value { display: flex; align-items: baseline; gap: 6px; margin-bottom: 8px; }
.chart-value strong { font-size: 32px; font-variant-numeric: tabular-nums; }
.axis { display: flex; justify-content: space-between; font-size: 11px; color: var(--md-on-surface-variant); margin-top: 6px; }

.tracker { display: flex; flex-direction: column; gap: 6px; }
.figure { font-size: 34px; font-weight: 800; color: var(--card-accent); line-height: 1.1; }
.figure-label { font-size: 14px; font-weight: 500; color: var(--md-on-surface-variant); }
.tracker .meter { height: 8px; border-radius: 4px; margin: 8px 0 4px; background: color-mix(in srgb, var(--card-accent) 16%, transparent); }
.tracker .meter span { display: block; height: 100%; border-radius: inherit; background: var(--card-accent); }
.status-line { margin: 4px 0; font-size: 15px; }
.steps { list-style: none; margin: 4px 0 0; padding: 0; }
.steps li { position: relative; display: flex; gap: 12px; padding-bottom: 12px; }
.steps li:not(:last-child)::before { content: ''; position: absolute; left: 10px; top: 24px; bottom: 0; width: 2px; background: var(--md-outline-variant); }
.steps li.done:not(:last-child)::before { background: color-mix(in srgb, var(--card-accent) 50%, transparent); }
.marker { color: var(--card-accent); flex: none; }
.marker :deep(svg) { width: 22px; height: 22px; }
.steps li.upcoming .marker { color: var(--md-outline); }
.steps .copy { display: flex; flex-direction: column; gap: 1px; font-size: 15px; }
.steps li.current strong { font-weight: 800; }
.steps li.upcoming strong { color: var(--md-on-surface-variant); font-weight: 500; }
.steps small { font-size: 12px; color: var(--md-on-surface-variant); }
.tracker-note { margin: 4px 0 0; padding: 12px; border-radius: var(--md-shape-l); font-size: 14px; color: var(--md-on-surface-variant); background: color-mix(in srgb, var(--card-accent) 8%, transparent); }

.note { display: flex; flex-direction: column; gap: 12px; }
.note-row { display: flex; align-items: flex-start; gap: 10px; }
.bubble-text { margin: 0; padding: 10px 14px; border-radius: 6px 20px 20px 20px; background: color-mix(in srgb, var(--card-accent) 12%, transparent); font-size: 15px; line-height: 1.45; }
.note-reply { align-self: flex-start; margin-left: 44px; text-align: left; height: auto; min-height: 40px; padding-block: 8px; }

.list { list-style: none; margin: 0; padding: 0; }
.list li + li { border-top: 1px solid var(--md-outline-variant); }
.list a { display: flex; align-items: flex-start; gap: 12px; padding: 10px 0; }
.list .index { width: 16px; flex: none; font-size: 13px; font-weight: 700; color: var(--card-accent); padding-top: 1px; }
.list .copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; font-size: 15px; }
.list small { font-size: 13px; color: var(--md-on-surface-variant); }
.list .trailing { font-size: 12px; font-weight: 600; color: var(--md-on-surface-variant); text-align: right; }

.home-card-footer { display: flex; flex-direction: column; gap: 8px; }
.attribution { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--md-on-surface-variant); }
.sources { display: flex; flex-wrap: wrap; gap: 6px; }
.sources .chip { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600;
  color: var(--md-on-surface-variant); background: var(--md-surface-container-high); max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sources .chip :deep(svg) { width: 14px; height: 14px; flex: none; }
</style>
