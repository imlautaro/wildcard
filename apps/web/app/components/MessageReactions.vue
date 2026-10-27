<script setup lang="ts">
import type { ReactionCache } from '~/composables/useMessageReactions';
const props = defineProps<{ cache: ReactionCache; path: string; messageID: string; side: string; replyable?: boolean }>();
const emit = defineEmits<{ reply: [] }>();
const { user } = useSession();
const open = ref(false);
const root = ref<HTMLElement>();
const key = computed(() => `${props.messageID}/${props.side}`);
const rows = computed(() => props.cache.rows.filter((row) => row.messageID === props.messageID && row.side === props.side));
const own = computed(() => rows.value.find((row) => row.actorID === `user/${user.value?.id}`)?.emoji);
const summaries = computed(() => reactionEmojis.map((emoji) => ({ emoji, rows: rows.value.filter((row) => row.emoji === emoji) })).filter((value) => value.rows.length));
function choose(emoji: string | null) {
  open.value = false;
  void setMessageReaction(props.cache, props.path, props.messageID, props.side, emoji);
}
function reply() {
  open.value = false;
  emit('reply');
}
function outside(event: Event) { if (!root.value?.contains(event.target as Node)) open.value = false; }
let timer: ReturnType<typeof setTimeout> | undefined;
let held = false;
let start: { x: number; y: number } | null = null;
function cancel() { clearTimeout(timer); start = null; }
function down(event: PointerEvent) {
  held = false;
  if (event.button !== 0 || (event.target as HTMLElement).closest('.reaction-badges, .reaction-picker, .reaction-error')) return;
  start = { x: event.clientX, y: event.clientY };
  timer = setTimeout(() => { held = true; open.value = true; }, 450);
}
function click(event: MouseEvent) {
  if (held) { held = false; event.preventDefault(); event.stopPropagation(); }
}
function move(event: PointerEvent) { if (start && Math.hypot(start.x - event.clientX, start.y - event.clientY) > 10) cancel(); }
onMounted(() => document.addEventListener('pointerdown', outside));
onBeforeUnmount(() => { cancel(); document.removeEventListener('pointerdown', outside); });
</script>

<template>
  <div ref="root" class="reaction-message" @click.capture="click" @pointerdown="down" @pointermove="move" @pointerup="cancel" @pointercancel="cancel" @contextmenu.prevent="open = true" @keydown.esc="open = false">
    <slot />
    <div class="reaction-badges">
      <button v-for="item in summaries" :key="item.emoji" class="reaction-badge" :class="{ selected: own === item.emoji }"
        :title="item.rows.map((row) => row.name).join(', ')" :aria-label="`${item.emoji}: ${item.rows.map((row) => row.name).join(', ')}`" @click="open = !open">{{ item.emoji }} {{ item.rows.length }}</button>
      <button v-if="replyable" class="reaction-trigger" aria-label="Reply to message" @click="reply"><AppIcon name="reply" /></button>
      <button class="reaction-trigger" aria-label="React to message" :aria-expanded="open" @click="open = !open">☺</button>
    </div>
    <div v-if="open && !cache.invalidated" class="reaction-picker" role="group" aria-label="Message reactions">
      <button v-for="emoji in reactionEmojis" :key="emoji" :disabled="cache.busy.includes(key)" :aria-pressed="own === emoji" :aria-label="`React ${emoji}`" @click="choose(own === emoji ? null : emoji)">{{ emoji }}</button>
      <button v-if="replyable" class="reaction-reply" @click="reply"><AppIcon name="reply" /> Reply</button>
      <button v-if="own" :disabled="cache.busy.includes(key)" @click="choose(null)">Remove</button>
      <div v-if="rows.length" class="reaction-people"><div v-for="row in rows" :key="row.actorID">{{ row.emoji }} {{ row.name }}</div></div>
    </div>
    <div v-if="cache.pending[key] && cache.errors[key]" role="status" class="reaction-error">
      {{ cache.errors[key] }} <button @click="choose(cache.pending[key]!.emoji)">Retry reaction</button>
    </div>
  </div>
</template>

<style scoped>
.reaction-message { position: relative; min-width: 0; max-width: min(78%, 560px); }
.reaction-badges { display: flex; gap: 3px; align-items: center; flex-wrap: wrap; }
.reaction-badge, .reaction-trigger { border: 1px solid var(--border, #ddd); border-radius: 20px; padding: 2px 7px; background: var(--surface); color: var(--text); font-size: 13px; cursor: pointer; }
.reaction-badge.selected { border-color: #5185df; background: #e3edff; }
.reaction-trigger { opacity: 0; }
.reaction-trigger svg { width: 13px; height: 13px; vertical-align: -2px; }
.reaction-picker .reaction-reply { font-size: 15px; display: inline-flex; align-items: center; gap: 4px; }
.reaction-reply svg { width: 16px; height: 16px; }
.reaction-message:hover .reaction-trigger, .reaction-trigger:focus-visible { opacity: 1; }
.reaction-picker { position: relative; z-index: 2; margin: 5px 0; border-radius: 18px; padding: 8px; background: var(--surface); color: var(--text); box-shadow: 0 2px 15px #0003; display: flex; gap: 6px; flex-wrap: wrap; max-width: 320px; }
.reaction-picker button { background: transparent; border: 0; font-size: 22px; cursor: pointer; padding: 4px; border-radius: 8px; }
.reaction-picker button[aria-pressed=true] { background: #e3edff; }
.reaction-people { flex-basis: 100%; font-size: 13px; max-height: 140px; overflow-y: auto; }
.reaction-error { font-size: 12px; max-width: 280px; }
@media (hover: none) { .reaction-trigger { opacity: 1; } }
</style>
