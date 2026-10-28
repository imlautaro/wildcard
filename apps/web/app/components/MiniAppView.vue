<script setup lang="ts">
import type { MiniAppComponent, MiniAppStateValue, MiniAppUpdate } from '~/utils/types';

// Renders the server-resolved component tree with the app's grouped-list styling.
// A lone stat becomes a hero number, consecutive stats share one grid, consecutive
// field-less actions share one button row and grids lay out cards side by side, like
// the iOS renderer. Composers are drawn by the page, pinned to the bottom.
const props = defineProps<{ components: MiniAppComponent[]; busyAction?: string | null; state?: Record<string, MiniAppStateValue> }>();
const emit = defineEmits<{ action: [id: string, fields: Record<string, unknown>]; tap: [id: string, updates: MiniAppUpdate[]]; edit: [update: MiniAppUpdate]; selectTab: [tab: string] }>();
type Checklist = Extract<MiniAppComponent, { type: 'checklist' }>;
// Rows come from saved state (with pending taps applied) when available, so toggles show instantly.
function checklistRows(list: Checklist) {
  const items = props.state?.[list.state];
  if (!Array.isArray(items)) return list.items;
  const text = (item: Record<string, unknown>, key: string | null) => key && item[key] !== undefined && item[key] !== '' ? String(item[key]) : null;
  return items.map(item => ({ title: text(item, list.title) ?? '—', subtitle: text(item, list.subtitle),
    value: list.value && item[list.value] !== undefined ? item[list.value] as number | string : null, done: list.done ? item[list.done] === true : null }));
}
function saved<T>(stateID: string | null, fallback: T): T | MiniAppStateValue {
  const value = stateID ? props.state?.[stateID] : undefined;
  return value === undefined ? fallback : value;
}
function progress(item: Extract<MiniAppComponent, { type: 'progress' }>) {
  const value = saved(item.state, item.value ?? 0);
  return typeof value === 'number' ? value : Number(value) || 0;
}
function saveInput(item: Extract<MiniAppComponent, { type: 'input' }>, raw: string) {
  if (item.kind === 'number') { const value = Number(raw); if (raw.trim() && Number.isFinite(value)) emit('edit', { state: item.state, op: 'set', value }); }
  else emit('edit', { state: item.state, op: 'set', value: raw.slice(0, 500) });
}
type Stat = Extract<MiniAppComponent, { type: 'stat' }>;
type Action = Extract<MiniAppComponent, { type: 'action' }>;
type Tile = Extract<MiniAppComponent, { type: 'tile' }>;
type Block = { kind: 'stats'; key: string; items: Stat[] } | { kind: 'buttons'; key: string; items: Action[] } | { kind: 'one'; key: string; item: Exclude<MiniAppComponent, Stat> };
const blocks = computed(() => props.components.reduce<Block[]>((result, item, index) => {
  const last = result.at(-1);
  if (item.type === 'stat') { if (last?.kind === 'stats') last.items.push(item); else result.push({ kind: 'stats', key: `s${index}`, items: [item] }); }
  else if (item.type === 'action' && !item.fields.length) { if (last?.kind === 'buttons') last.items.push(item); else result.push({ kind: 'buttons', key: `b${index}`, items: [item] }); }
  else if (item.type === 'composer') return result;
  else result.push({ kind: 'one', key: `c${index}`, item });
  return result;
}, []));
// Saved state (with pending taps) wins over the resolved value.
function shown(stat: Stat | Tile) {
  const saved = stat.state ? props.state?.[stat.state] : undefined;
  const value = saved === undefined ? stat.value : typeof saved === 'boolean' ? String(saved) : Array.isArray(saved) ? saved.length : saved;
  return miniAppValue(value, stat.format, stat.currency);
}
type Lesson = Extract<MiniAppComponent, { type: 'lesson' }>;
// Finishing a lesson adds its correct answers to its XP state, shown at once like any tap.
function finishLesson(lesson: Lesson, correct: number) {
  if (lesson.xp && correct > 0) emit('edit', { state: lesson.xp, op: 'increment', value: correct });
}
function openTile(tile: Tile) {
  if (tile.tab) emit('selectTab', tile.tab);
  else if (tile.action) press(tile.action);
}
// Ring and donut arcs use a circle of circumference 100, so dash lengths are percentages.
const ringRadius = 100 / (2 * Math.PI);
function ring(item: Extract<MiniAppComponent, { type: 'progress' }>) {
  return Math.min(100, Math.max(0, progress(item) / item.goal * 100));
}
const palette = ['var(--accent)', '#34c759', '#ff9500', '#af52de', '#ff2d55', '#5ac8fa', '#ffcc00', '#a2845e', '#5856d6', '#30b0c7', '#ff6482', '#8e8e93'];
function slices(points: { x: string; y: number }[]) {
  const total = points.reduce((sum, p) => sum + Math.max(p.y, 0), 0) || 1;
  let offset = 0;
  return points.map((p, index) => {
    const share = Math.max(p.y, 0) / total * 100, slice = { point: p, share, offset, color: palette[index % palette.length]! };
    offset += share;
    return slice;
  });
}
// Short symbols (+, −) share one row; longer labels stack below. The first non-destructive action is prominent.
const short = (items: Action[]) => items.filter(a => [...a.label].length <= 3);
const long = (items: Action[]) => items.filter(a => [...a.label].length > 3);
// The action that adds (+, increment, append) is prominent; otherwise the first non-destructive one.
const primary = (items: Action[]) => (items.find(a => a.style !== 'destructive' && (a.label.startsWith('+') || !!a.updates?.some(u => u.op === 'increment' || u.op === 'append')))
  ?? items.find(a => a.style !== 'destructive'))?.id;
function press(action: Action) {
  if (action.kind === 'state' && !action.confirm && action.updates) emit('tap', action.id, action.updates);
  else emit('action', action.id, {});
}

function chart(points: { x: string; y: number }[], kind: 'bar' | 'line' | 'area' | 'pie') {
  const max = Math.max(0, ...points.map(p => p.y)), min = Math.min(0, ...points.map(p => p.y));
  const span = max - min || 1, step = 100 / Math.max(points.length, 1);
  const y = (value: number) => 100 - ((value - min) / span) * 100;
  if (kind === 'bar') return { bars: points.map((p, i) => ({ x: i * step + step * 0.15, width: step * 0.7, y: Math.min(y(p.y), y(0)), height: Math.abs(y(p.y) - y(0)), point: p })), line: '', area: '' };
  const coordinates = points.map((p, i) => `${points.length === 1 ? 50 : (i / (points.length - 1)) * 100},${y(p.y)}`);
  const first = points.length === 1 ? 50 : 0, last = points.length === 1 ? 50 : 100;
  return { bars: [], line: coordinates.join(' '), area: `${first},${y(0)} ${coordinates.join(' ')} ${last},${y(0)}` };
}
function axis(points: { x: string }[]) {
  if (points.length <= 6) return points.map(p => p.x);
  return [points[0]!.x, points[Math.floor(points.length / 2)]!.x, points.at(-1)!.x];
}
const forms = reactive<Record<string, Record<string, unknown>>>({});
function form(id: string) { return (forms[id] ??= {}); }
function submit(id: string) {
  emit('action', id, { ...form(id) });
}
</script>

<template>
  <template v-for="block in blocks" :key="block.key">
    <div v-if="block.kind === 'stats' && block.items.length === 1" class="mini-hero">
      <span class="label">{{ block.items[0]!.label }}</span>
      <span class="value">{{ shown(block.items[0]!) }}</span>
      <span v-if="block.items[0]!.caption" class="caption">{{ block.items[0]!.caption }}</span>
    </div>
    <div v-else-if="block.kind === 'buttons'" class="mini-buttons">
      <div v-if="short(block.items).length" class="row">
        <button v-for="action in short(block.items)" :key="action.id" type="button" class="mini-button symbol" :class="{ primary: action.id === primary(block.items), danger: action.style === 'destructive' }"
          :disabled="!!busyAction && action.kind === 'remote'" @click="press(action)">{{ action.label === '-' ? '−' : action.label }}</button>
      </div>
      <button v-for="action in long(block.items)" :key="action.id" type="button" class="mini-button" :class="{ primary: action.id === primary(block.items), danger: action.style === 'destructive' }"
        :disabled="!!busyAction && action.kind === 'remote'" @click="press(action)">{{ busyAction === action.id && action.kind === 'remote' ? 'Working…' : action.label }}</button>
    </div>
    <div v-else-if="block.kind === 'stats'" class="mini-stats">
      <div v-for="(stat, index) in block.items" :key="index" class="mini-stat">
        <span class="label">{{ stat.label }}</span>
        <span class="value">{{ shown(stat) }}</span>
        <span v-if="stat.caption" class="caption">{{ stat.caption }}</span>
      </div>
    </div>
    <template v-else-if="block.item.type === 'section'">
      <div v-if="block.item.title" class="group-title">{{ block.item.title }}</div>
      <MiniAppView :components="block.item.children" :busy-action="busyAction" :state="state" @action="(id, fields) => emit('action', id, fields)" @tap="(id, updates) => emit('tap', id, updates)" @edit="update => emit('edit', update)" @select-tab="tab => emit('selectTab', tab)" />
    </template>
    <div v-else-if="block.item.type === 'grid'" class="mini-grid" :style="{ '--columns': block.item.columns }">
      <template v-for="(card, index) in block.item.children" :key="index">
        <button v-if="card.type === 'action'" type="button" class="mini-card mini-card-button" :class="{ danger: card.style === 'destructive' }"
          :disabled="!!busyAction && card.kind === 'remote'" @click="press(card)">{{ busyAction === card.id && card.kind === 'remote' ? 'Working…' : card.label }}</button>
        <button v-else-if="card.type === 'tile'" type="button" class="mini-card mini-tile" :disabled="!card.tab && !card.action" @click="openTile(card)">
          <AppIcon :name="miniAppIcon(card.icon)" class="icon" />
          <span v-if="card.value !== null || card.state" class="value">{{ shown(card) }}</span>
          <strong>{{ card.title }}</strong>
          <span v-if="card.caption" class="caption">{{ card.caption }}</span>
        </button>
        <div v-else-if="card.type === 'stat'" class="mini-card mini-stat">
          <span class="label">{{ card.label }}</span><span class="value">{{ shown(card) }}</span><span v-if="card.caption" class="caption">{{ card.caption }}</span>
        </div>
        <div v-else-if="card.type === 'progress'" class="mini-card" :class="card.style === 'ring' ? 'mini-ring-card' : 'mini-progress'">
          <template v-if="card.style === 'ring'">
            <svg viewBox="0 0 42 42" class="mini-ring" role="img" :aria-label="`${card.label}: ${miniAppValue(progress(card), card.format, card.currency)}`">
              <circle cx="21" cy="21" :r="ringRadius" class="track" /><circle cx="21" cy="21" :r="ringRadius" class="fill" :class="{ met: progress(card) >= card.goal }" :stroke-dasharray="`${ring(card)} ${100 - ring(card)}`" stroke-dashoffset="25" />
              <text x="21" y="21">{{ miniAppValue(progress(card), card.format, card.currency) }}</text>
            </svg>
            <strong>{{ card.label }}</strong><span v-if="card.caption" class="caption">{{ card.caption }}</span>
          </template>
          <template v-else>
            <div class="top"><strong>{{ card.label }}</strong></div>
            <span :class="{ met: progress(card) >= card.goal }">{{ miniAppValue(progress(card), card.format, card.currency) }} / {{ miniAppValue(card.goal, card.format, card.currency) }}</span>
            <div class="track"><div class="fill" :class="{ met: progress(card) >= card.goal }" :style="{ width: `${ring(card)}%` }" /></div>
          </template>
        </div>
        <div v-else-if="card.type === 'chart'" class="mini-card mini-card-chart"><MiniAppView :components="[card]" :state="state" /></div>
        <p v-else-if="card.type === 'text'" class="mini-card mini-text" :class="card.style">{{ card.text }}</p>
        <div v-else-if="card.type === 'notice'" class="mini-card text-block">{{ miniAppIssue(card.code) }}</div>
      </template>
    </div>
    <div v-else-if="block.item.type === 'tile'" class="group">
      <button type="button" class="mini-row mini-tile-row" :disabled="!block.item.tab && !block.item.action" @click="openTile(block.item)">
        <span class="mini-app-glyph small-glyph"><AppIcon :name="miniAppIcon(block.item.icon)" /></span>
        <span class="copy"><strong>{{ block.item.title }}</strong><span v-if="block.item.caption">{{ block.item.caption }}</span></span>
        <span v-if="block.item.value !== null || block.item.state" class="value">{{ shown(block.item) }}</span>
        <AppIcon v-if="block.item.tab" name="chevron" class="chevron" />
      </button>
    </div>
    <div v-else-if="block.item.type === 'progress' && block.item.style === 'ring'" class="group"><div class="mini-ring-card">
      <svg viewBox="0 0 42 42" class="mini-ring large" role="img" :aria-label="`${block.item.label}: ${miniAppValue(progress(block.item), block.item.format, block.item.currency)}`">
        <circle cx="21" cy="21" :r="ringRadius" class="track" /><circle cx="21" cy="21" :r="ringRadius" class="fill" :class="{ met: progress(block.item) >= block.item.goal }" :stroke-dasharray="`${ring(block.item)} ${100 - ring(block.item)}`" stroke-dashoffset="25" />
        <text x="21" y="21">{{ miniAppValue(progress(block.item), block.item.format, block.item.currency) }}</text>
      </svg>
      <strong>{{ block.item.label }}</strong>
      <span class="caption">{{ block.item.caption ?? `of ${miniAppValue(block.item.goal, block.item.format, block.item.currency)}` }}</span>
    </div></div>
    <div v-else-if="block.item.type === 'progress'" class="group"><div class="mini-progress">
      <div class="top"><strong>{{ block.item.label }}</strong><span :class="{ met: progress(block.item) >= block.item.goal }">{{ miniAppValue(progress(block.item), block.item.format, block.item.currency) }} / {{ miniAppValue(block.item.goal, block.item.format, block.item.currency) }}</span></div>
      <div class="track"><div class="fill" :class="{ met: progress(block.item) >= block.item.goal }" :style="{ width: `${Math.min(100, Math.max(0, progress(block.item) / block.item.goal * 100))}%` }" /></div>
      <span v-if="block.item.caption" class="caption">{{ block.item.caption }}</span>
    </div></div>
    <div v-else-if="block.item.type === 'checklist'" class="group">
      <div v-if="!checklistRows(block.item).length" class="text-block">{{ block.item.empty }}</div>
      <div v-for="(row, index) in checklistRows(block.item)" :key="index" class="mini-row mini-check" :class="{ done: row.done }">
        <button v-if="row.done !== null" type="button" class="check" :aria-pressed="row.done" :aria-label="row.title" @click="emit('edit', { state: block.item.state, op: 'toggle_item', index, field: block.item.done! })">
          <AppIcon v-if="row.done" name="check" /><span v-else class="ring" />
        </button>
        <span class="copy"><strong>{{ row.title }}</strong><span v-if="row.subtitle">{{ row.subtitle }}</span></span>
        <span v-if="row.value !== null" class="value">{{ miniAppValue(row.value, block.item.format, block.item.currency) }}</span>
        <button v-if="block.item.removable" type="button" class="icon-button remove" aria-label="Delete" @click="emit('edit', { state: block.item.state, op: 'remove_item', index })"><AppIcon name="close" /></button>
      </div>
    </div>
    <div v-else-if="block.item.type === 'toggle'" class="group">
      <label class="toggle"><span>{{ block.item.label }}</span><input type="checkbox" role="switch" :checked="saved(block.item.state, block.item.value) === true" @change="emit('edit', { state: block.item.state, op: 'toggle' })"></label>
    </div>
    <div v-else-if="block.item.type === 'choice'" class="mini-choice">
      <span class="label">{{ block.item.label }}</span>
      <div class="mini-segmented" role="group" :aria-label="block.item.label">
        <button v-for="option in block.item.options" :key="option.value" type="button" :aria-pressed="saved(block.item.state, block.item.value) === option.value" @click="emit('edit', { state: block.item.state, op: 'set', value: option.value })">{{ option.label }}</button>
      </div>
    </div>
    <div v-else-if="block.item.type === 'input'" class="group">
      <label class="field mini-field"><span>{{ block.item.label }}</span>
        <input :type="block.item.kind === 'number' ? 'number' : 'text'" step="any" :inputmode="block.item.kind === 'number' ? 'decimal' : 'text'" :placeholder="block.item.placeholder ?? ''" maxlength="500"
          :value="String(saved(block.item.state, block.item.value))" @change="saveInput(block.item, ($event.target as HTMLInputElement).value)">
      </label>
    </div>
    <MiniAppTimer v-else-if="block.item.type === 'timer'" :label="block.item.label" :seconds="block.item.seconds" />
    <MiniAppLesson v-else-if="block.item.type === 'lesson'" :lesson="block.item" @complete="correct => finishLesson(block.item as Lesson, correct)" />
    <div v-else-if="block.item.type === 'list'" class="group">
      <div v-if="!block.item.items.length" class="text-block">{{ block.item.empty }}</div>
      <div v-for="(row, index) in block.item.items" :key="index" class="mini-row">
        <span class="copy"><strong>{{ row.title }}</strong><span v-if="row.subtitle">{{ row.subtitle }}</span></span>
        <span v-if="row.value !== null" class="value">{{ miniAppValue(row.value, block.item.format, block.item.currency) }}</span>
      </div>
    </div>
    <div v-else-if="block.item.type === 'chart'" class="group mini-chart">
      <strong v-if="block.item.title" class="small">{{ block.item.title }}</strong>
      <div v-if="!block.item.points.length" class="text-block">Nothing to chart.</div>
      <div v-else-if="block.item.kind === 'pie'" class="mini-pie">
        <svg viewBox="0 0 42 42" role="img" :aria-label="block.item.title ?? 'Chart'">
          <circle v-for="(slice, index) in slices(block.item.points)" :key="index" cx="21" cy="21" :r="ringRadius" fill="none" :stroke="slice.color" stroke-width="7"
            :stroke-dasharray="`${slice.share} ${100 - slice.share}`" :stroke-dashoffset="25 - slice.offset"><title>{{ slice.point.x }}: {{ miniAppValue(slice.point.y, block.item.format, block.item.currency) }}</title></circle>
        </svg>
        <ul class="legend">
          <li v-for="(slice, index) in slices(block.item.points)" :key="index"><span class="swatch" :style="{ background: slice.color }" />{{ slice.point.x }}<span class="amount">{{ miniAppValue(slice.point.y, block.item.format, block.item.currency) }}</span></li>
        </ul>
      </div>
      <template v-else>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" :aria-label="block.item.title ?? 'Chart'">
          <rect v-for="(bar, index) in chart(block.item.points, block.item.kind).bars" :key="index" :x="bar.x" :y="bar.y" :width="bar.width" :height="Math.max(bar.height, 0.5)" rx="1.2" fill="var(--accent)">
            <title>{{ bar.point.x }}: {{ miniAppValue(bar.point.y, block.item.format, block.item.currency) }}</title>
          </rect>
          <polygon v-if="block.item.kind === 'area'" :points="chart(block.item.points, 'area').area" fill="color-mix(in srgb, var(--accent) 22%, transparent)" />
          <polyline v-if="block.item.kind === 'line' || block.item.kind === 'area'" :points="chart(block.item.points, block.item.kind).line" fill="none" stroke="var(--accent)" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" />
        </svg>
        <div class="axis"><span v-for="(label, index) in axis(block.item.points)" :key="index">{{ label }}</span></div>
      </template>
    </div>
    <p v-else-if="block.item.type === 'text'" class="mini-text" :class="block.item.style">{{ block.item.text }}</p>
    <div v-else-if="block.item.type === 'notice'" class="group"><div class="text-block">{{ miniAppIssue(block.item.code) }}</div></div>
    <form v-else-if="block.item.type === 'action'" class="group" @submit.prevent="submit(block.item.id)">
      <label v-for="field in block.item.fields" :key="field.id" :class="field.kind === 'toggle' ? 'toggle' : 'field mini-field'">
        <span>{{ field.label }}</span>
        <input v-if="field.kind === 'toggle'" v-model="form(block.item.id)[field.id]" type="checkbox" role="switch">
        <input v-else-if="field.kind === 'number'" v-model.number="form(block.item.id)[field.id]" type="number" step="any" :required="field.required" inputmode="decimal">
        <input v-else v-model="form(block.item.id)[field.id]" :type="field.kind === 'date' ? 'date' : 'text'" :required="field.required" maxlength="500">
      </label>
      <button type="submit" class="button-row" :class="{ danger: block.item.style === 'destructive' }" :disabled="!!busyAction">
        {{ busyAction === block.item.id && block.item.kind === 'remote' ? 'Working…' : block.item.label }}
      </button>
    </form>
  </template>
</template>
