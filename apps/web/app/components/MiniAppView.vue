<script setup lang="ts">
import type { MiniAppAction, MiniAppComponent, MiniAppItem, MiniAppRowTarget, MiniAppStateValue, MiniAppUpdate } from '~/utils/types';

// Renders the server-resolved component tree with the app's grouped-list styling.
// A lone stat becomes a hero number, consecutive stats share one grid, consecutive
// field-less actions share one button row and grids lay out cards side by side, like
// the iOS renderer. Composers and toolbar buttons are drawn by the page. Actions with fields
// open a sheet form (`open`); rows of a list state can be edited, deleted or run row actions.
// `pending` (taps not yet confirmed) pauses row controls of lists drawn from the resolved
// view, whose row indexes are only valid once the server has applied earlier taps.
const props = defineProps<{ components: MiniAppComponent[]; busyAction?: string | null; state?: Record<string, MiniAppStateValue>; pending?: boolean }>();
const emit = defineEmits<{ action: [id: string, fields: Record<string, unknown>]; tap: [id: string, updates: MiniAppUpdate[]]; edit: [update: MiniAppUpdate]; selectTab: [tab: string];
  open: [action: MiniAppAction, row?: MiniAppRowTarget, values?: MiniAppItem]; rowAction: [action: MiniAppAction, row: MiniAppRowTarget] }>();
type Checklist = Extract<MiniAppComponent, { type: 'checklist' }>;
// Rows come from saved state (with pending taps applied) when available, so toggles show instantly.
function checklistRows(list: Checklist) {
  const items = props.state?.[list.state];
  if (!Array.isArray(items)) return list.items;
  const text = (item: Record<string, unknown>, key: string | null) => key && item[key] !== undefined && item[key] !== '' ? String(item[key]) : null;
  // Edit prefills come from the resolved rows, which share the saved state's order.
  return items.map((item, index) => ({ title: text(item, list.title) ?? '—', subtitle: text(item, list.subtitle),
    value: list.value && item[list.value] !== undefined ? item[list.value] as number | string : null, done: list.done ? item[list.done] === true : null,
    index, values: list.items.find(row => row.index === index)?.values }));
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
  else if (item.type === 'composer' || item.type === 'toolbar') return result;
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
const palette = ['var(--accent)', '#34c759', '#ff9500', '#af52de', '#ff2d55', '#5ac8fa', '#ffcc00', '#a2845e', '#5856d6', '#30b0c7', '#ff6482', '#8f8f8f'];
function slices(points: { x: string; y: number }[]) {
  const total = points.reduce((sum, p) => sum + Math.max(p.y, 0), 0) || 1;
  let offset = 0;
  return points.map((p, index) => {
    const share = Math.max(p.y, 0) / total * 100, slice = { point: p, share, offset, color: palette[index % palette.length]! };
    offset += share;
    return slice;
  });
}
// Short symbols (+, −) share one row; longer labels stack below.
const short = (items: Action[]) => items.filter(a => [...a.label].length <= 3);
const long = (items: Action[]) => items.filter(a => [...a.label].length > 3);
// Only the adding action (+, increment, append) is prominent, so peer options never look selected;
// a lone button stays prominent.
const primary = (items: Action[]) => (items.find(a => a.style !== 'destructive' && (a.label.startsWith('+') || !!a.updates?.some(u => u.op === 'increment' || u.op === 'append')))
  ?? (items.length === 1 && items[0]!.style !== 'destructive' ? items[0] : undefined))?.id;
function press(action: Action) {
  if (action.fields.length) emit('open', action);
  else if (action.kind === 'state' && !action.confirm && action.updates) emit('tap', action.id, action.updates);
  else emit('action', action.id, {});
}
// Row controls: an action with fields opens prefilled; a field-less one runs on the row.
function runRow(action: MiniAppAction, row: MiniAppRowTarget, values?: MiniAppItem) {
  if (action.fields.length) emit('open', action, row, values);
  else emit('rowAction', action, row);
}
type ListBlock = Extract<MiniAppComponent, { type: 'list' }>;
const rowTarget = (list: ListBlock, index: number | undefined): MiniAppRowTarget | null => list.state && index !== undefined ? { state: list.state, index } : null;

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
        <button v-for="action in short(block.items)" :key="action.id" type="button" class="mini-button symbol" data-ripple :class="{ primary: action.id === primary(block.items), danger: action.style === 'destructive' }"
          :disabled="!!busyAction && action.kind === 'remote'" @click="press(action)">{{ action.label === '-' ? '−' : action.label }}</button>
      </div>
      <button v-for="action in long(block.items)" :key="action.id" type="button" class="mini-button" data-ripple :class="{ primary: action.id === primary(block.items), danger: action.style === 'destructive' }"
        :disabled="!!busyAction && action.kind === 'remote'" @click="press(action)">{{ busyAction === action.id && action.kind === 'remote' ? $t('miniapps.view.working') : action.label }}</button>
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
      <MiniAppView :components="block.item.children" :busy-action="busyAction" :state="state" :pending="pending" @action="(id, fields) => emit('action', id, fields)" @tap="(id, updates) => emit('tap', id, updates)" @edit="update => emit('edit', update)" @select-tab="tab => emit('selectTab', tab)"
        @open="(action, row, values) => emit('open', action, row, values)" @row-action="(action, row) => emit('rowAction', action, row)" />
    </template>
    <div v-else-if="block.item.type === 'grid'" class="mini-grid" :style="{ '--columns': block.item.columns }">
      <template v-for="(card, index) in block.item.children" :key="index">
        <button v-if="card.type === 'action'" type="button" class="mini-card mini-card-button" data-ripple :class="{ danger: card.style === 'destructive' }"
          :disabled="!!busyAction && card.kind === 'remote'" @click="press(card)">{{ busyAction === card.id && card.kind === 'remote' ? $t('miniapps.view.working') : card.label }}</button>
        <button v-else-if="card.type === 'tile'" type="button" class="mini-card mini-tile" data-ripple :disabled="!card.tab && !card.action" @click="openTile(card)">
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
      <button type="button" class="mini-row mini-tile-row" data-ripple :disabled="!block.item.tab && !block.item.action" @click="openTile(block.item)">
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
      <span class="caption">{{ block.item.caption ?? $t('miniapps.view.ofGoal', { goal: miniAppValue(block.item.goal, block.item.format, block.item.currency) }) }}</span>
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
        <!-- With an edit action the text opens it; the checkbox stays the only toggle. -->
        <button v-if="block.item.edit" type="button" class="copy mini-row-open" :disabled="pending" @click="runRow(block.item.edit, { state: block.item.state, index }, row.values)">
          <strong>{{ row.title }}</strong><span v-if="row.subtitle">{{ row.subtitle }}</span>
        </button>
        <span v-else class="copy"><strong>{{ row.title }}</strong><span v-if="row.subtitle">{{ row.subtitle }}</span></span>
        <span v-if="row.value !== null" class="value">{{ miniAppValue(row.value, block.item.format, block.item.currency) }}</span>
        <AppButton v-for="action in block.item.actions ?? []" :key="action.id" variant="tonal" size="small" class="mini-row-action" :disabled="pending || !!busyAction"
          @click="runRow(action, { state: block.item.state, index })">{{ busyAction === action.id ? '…' : action.label }}</AppButton>
        <AppIconButton v-if="block.item.removable" icon="close" :label="$t('common.delete')" class="remove" @click="emit('edit', { state: block.item.state, op: 'remove_item', index })" />
      </div>
    </div>
    <div v-else-if="block.item.type === 'toggle'" class="group">
      <label class="toggle"><span>{{ block.item.label }}</span><input type="checkbox" role="switch" :checked="saved(block.item.state, block.item.value) === true" @change="emit('edit', { state: block.item.state, op: 'toggle' })"></label>
    </div>
    <div v-else-if="block.item.type === 'choice'" class="mini-choice">
      <span class="label">{{ block.item.label }}</span>
      <div class="segmented mini-segmented" role="group" :aria-label="block.item.label">
        <!-- A number state compares as text: option values are strings such as "15". -->
        <button v-for="option in block.item.options" :key="option.value" type="button" :aria-pressed="String(saved(block.item.state, block.item.value)) === option.value" @click="emit('edit', { state: block.item.state, op: 'set', value: option.value })">{{ option.label }}</button>
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
        <button v-if="block.item.edit && rowTarget(block.item, row.index)" type="button" class="copy mini-row-open" :disabled="pending" @click="runRow(block.item.edit!, rowTarget(block.item, row.index)!, row.values)">
          <strong>{{ row.title }}</strong><span v-if="row.subtitle">{{ row.subtitle }}</span>
        </button>
        <span v-else class="copy"><strong>{{ row.title }}</strong><span v-if="row.subtitle">{{ row.subtitle }}</span></span>
        <span v-if="row.value !== null" class="value">{{ miniAppValue(row.value, block.item.format, block.item.currency) }}</span>
        <template v-if="rowTarget(block.item, row.index)">
          <AppButton v-for="action in block.item.actions ?? []" :key="action.id" variant="tonal" size="small" class="mini-row-action" :disabled="pending || !!busyAction"
            @click="runRow(action, rowTarget(block.item, row.index)!)">{{ busyAction === action.id ? '…' : action.label }}</AppButton>
          <AppIconButton v-if="block.item.removable" icon="close" :label="$t('common.delete')" class="remove" :disabled="pending" @click="emit('edit', { state: block.item.state!, op: 'remove_item', index: row.index! })" />
        </template>
      </div>
    </div>
    <div v-else-if="block.item.type === 'chart'" class="group mini-chart">
      <strong v-if="block.item.title" class="small">{{ block.item.title }}</strong>
      <div v-if="!block.item.points.length" class="text-block">{{ $t('miniapps.view.nothingToChart') }}</div>
      <div v-else-if="block.item.kind === 'pie'" class="mini-pie">
        <svg viewBox="0 0 42 42" role="img" :aria-label="block.item.title ?? $t('miniapps.view.chart')">
          <circle v-for="(slice, index) in slices(block.item.points)" :key="index" cx="21" cy="21" :r="ringRadius" fill="none" :stroke="slice.color" stroke-width="7"
            :stroke-dasharray="`${slice.share} ${100 - slice.share}`" :stroke-dashoffset="25 - slice.offset"><title>{{ slice.point.x }}: {{ miniAppValue(slice.point.y, block.item.format, block.item.currency) }}</title></circle>
        </svg>
        <ul class="legend">
          <li v-for="(slice, index) in slices(block.item.points)" :key="index"><span class="swatch" :style="{ background: slice.color }" />{{ slice.point.x }}<span class="amount">{{ miniAppValue(slice.point.y, block.item.format, block.item.currency) }}</span></li>
        </ul>
      </div>
      <template v-else>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" :aria-label="block.item.title ?? $t('miniapps.view.chart')">
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
    <!-- An action with fields is a button that opens its form in a sheet. -->
    <div v-else-if="block.item.type === 'action'" class="mini-buttons">
      <button type="button" class="mini-button" data-ripple :class="{ danger: block.item.style === 'destructive' }" :disabled="!!busyAction" @click="press(block.item as Action)">
        {{ busyAction === block.item.id && block.item.kind === 'remote' ? $t('miniapps.view.working') : block.item.label }}
      </button>
    </div>
  </template>
</template>
