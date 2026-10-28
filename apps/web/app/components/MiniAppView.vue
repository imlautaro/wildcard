<script setup lang="ts">
import type { MiniAppComponent, MiniAppStateValue, MiniAppUpdate } from '~/utils/types';

// Renders the server-resolved component tree with the app's grouped-list styling.
// A lone stat becomes a hero number, consecutive stats share one grid and consecutive
// field-less actions share one button row, like the iOS renderer.
const props = defineProps<{ components: MiniAppComponent[]; busyAction?: string | null; state?: Record<string, MiniAppStateValue> }>();
const emit = defineEmits<{ action: [id: string, fields: Record<string, unknown>]; tap: [id: string, updates: MiniAppUpdate[]]; edit: [update: MiniAppUpdate] }>();
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
type Block = { kind: 'stats'; key: string; items: Stat[] } | { kind: 'buttons'; key: string; items: Action[] } | { kind: 'one'; key: string; item: Exclude<MiniAppComponent, Stat> };
const blocks = computed(() => props.components.reduce<Block[]>((result, item, index) => {
  const last = result.at(-1);
  if (item.type === 'stat') { if (last?.kind === 'stats') last.items.push(item); else result.push({ kind: 'stats', key: `s${index}`, items: [item] }); }
  else if (item.type === 'action' && !item.fields.length) { if (last?.kind === 'buttons') last.items.push(item); else result.push({ kind: 'buttons', key: `b${index}`, items: [item] }); }
  else result.push({ kind: 'one', key: `c${index}`, item });
  return result;
}, []));
function shown(stat: Stat) {
  const saved = stat.state ? props.state?.[stat.state] : undefined;
  const value = saved === undefined ? stat.value : typeof saved === 'boolean' ? String(saved) : Array.isArray(saved) ? saved.length : saved;
  return miniAppValue(value, stat.format, stat.currency);
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

function chart(points: { x: string; y: number }[], kind: 'bar' | 'line') {
  const max = Math.max(0, ...points.map(p => p.y)), min = Math.min(0, ...points.map(p => p.y));
  const span = max - min || 1, step = 100 / Math.max(points.length, 1);
  const y = (value: number) => 100 - ((value - min) / span) * 100;
  if (kind === 'bar') return { bars: points.map((p, i) => ({ x: i * step + step * 0.15, width: step * 0.7, y: Math.min(y(p.y), y(0)), height: Math.abs(y(p.y) - y(0)), point: p })), line: '' };
  return { bars: [], line: points.map((p, i) => `${points.length === 1 ? 50 : (i / (points.length - 1)) * 100},${y(p.y)}`).join(' ') };
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
      <MiniAppView :components="block.item.children" :busy-action="busyAction" :state="state" @action="(id, fields) => emit('action', id, fields)" @tap="(id, updates) => emit('tap', id, updates)" @edit="update => emit('edit', update)" />
    </template>
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
      <template v-else>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" :aria-label="block.item.title ?? 'Chart'">
          <rect v-for="(bar, index) in chart(block.item.points, block.item.kind).bars" :key="index" :x="bar.x" :y="bar.y" :width="bar.width" :height="Math.max(bar.height, 0.5)" rx="1.2" fill="var(--accent)">
            <title>{{ bar.point.x }}: {{ miniAppValue(bar.point.y, block.item.format, block.item.currency) }}</title>
          </rect>
          <polyline v-if="block.item.kind === 'line'" :points="chart(block.item.points, 'line').line" fill="none" stroke="var(--accent)" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" />
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
