<script setup lang="ts">
import type { MiniAppComponent } from '~/utils/types';

// Renders the server-resolved component tree with the app's grouped-list styling.
// Consecutive stats share one grid, like the iOS renderer.
const props = defineProps<{ components: MiniAppComponent[]; busyAction?: string | null }>();
const emit = defineEmits<{ action: [id: string, fields: Record<string, unknown>] }>();
type Stat = Extract<MiniAppComponent, { type: 'stat' }>;
type Block = { kind: 'stats'; key: string; items: Stat[] } | { kind: 'one'; key: string; item: Exclude<MiniAppComponent, Stat> };
const blocks = computed(() => props.components.reduce<Block[]>((result, item, index) => {
  const last = result.at(-1);
  if (item.type === 'stat') { if (last?.kind === 'stats') last.items.push(item); else result.push({ kind: 'stats', key: `s${index}`, items: [item] }); }
  else result.push({ kind: 'one', key: `c${index}`, item });
  return result;
}, []));

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
    <div v-if="block.kind === 'stats'" class="mini-stats">
      <div v-for="(stat, index) in block.items" :key="index" class="mini-stat">
        <span class="label">{{ stat.label }}</span>
        <span class="value">{{ miniAppValue(stat.value, stat.format, stat.currency) }}</span>
        <span v-if="stat.caption" class="caption">{{ stat.caption }}</span>
      </div>
    </div>
    <template v-else-if="block.item.type === 'section'">
      <div v-if="block.item.title" class="group-title">{{ block.item.title }}</div>
      <MiniAppView :components="block.item.children" :busy-action="busyAction" @action="(id, fields) => emit('action', id, fields)" />
    </template>
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
        {{ busyAction === block.item.id ? 'Working…' : block.item.label }}
      </button>
    </form>
  </template>
</template>
