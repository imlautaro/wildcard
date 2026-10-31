<script setup lang="ts">
// On-device countdown, like the iOS timer: it is not saved and stops when the page closes.
const props = defineProps<{ label: string; seconds: number }>();
const endsAt = ref<number | null>(null);
const remaining = ref<number | null>(null);
const now = ref(Date.now());
let tick: ReturnType<typeof setInterval> | undefined;
const left = computed(() => endsAt.value !== null ? Math.max(0, Math.ceil((endsAt.value - now.value) / 1000)) : remaining.value ?? props.seconds);
const shown = computed(() => {
  const h = Math.floor(left.value / 3600), m = Math.floor(left.value % 3600 / 60), s = left.value % 60;
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(s).padStart(2, '0')}`;
});
function start() { endsAt.value = Date.now() + (left.value === 0 ? props.seconds : left.value) * 1000; remaining.value = null; now.value = Date.now(); }
function pause() { remaining.value = left.value; endsAt.value = null; }
function reset() { endsAt.value = null; remaining.value = null; }
onMounted(() => { tick = setInterval(() => { now.value = Date.now(); }, 500); });
onBeforeUnmount(() => clearInterval(tick));
</script>

<template>
  <div class="mini-timer">
    <span class="label">{{ label }}</span>
    <span class="value" :class="{ done: left === 0 }">{{ shown }}</span>
    <div class="row">
      <button v-if="endsAt !== null" type="button" class="mini-button" data-ripple @click="pause">Pause</button>
      <button v-else type="button" class="mini-button primary" data-ripple @click="start">{{ remaining === null || left === 0 ? 'Start' : 'Resume' }}</button>
      <button type="button" class="mini-button" data-ripple @click="reset">Reset</button>
    </div>
  </div>
</template>
