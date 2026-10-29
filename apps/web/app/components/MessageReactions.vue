<script setup lang="ts">
import type { ReactionCache } from '~/composables/useMessageReactions';
// `voice` adds "View transcript" to the menu; `transcript` follows docs/voice.md.
const props = defineProps<{ cache: ReactionCache; path: string; messageID: string; side: string; replyable?: boolean; voice?: boolean; transcript?: string | null }>();
const emit = defineEmits<{ reply: [] }>();
const { user } = useSession();
const open = ref(false);
const root = ref<HTMLElement>();
const picker = ref<HTMLElement>();
// The picker floats over the conversation (fixed to the viewport) instead of pushing messages down.
const position = ref<{ top: number; left: number } | null>(null);
const key = computed(() => `${props.messageID}/${props.side}`);
const rows = computed(() => props.cache.rows.filter((row) => row.messageID === props.messageID && row.side === props.side));
const own = computed(() => rows.value.find((row) => row.actorID === `user/${user.value?.id}`)?.emoji);
const summaries = computed(() => reactionEmojis.map((emoji) => ({ emoji, rows: rows.value.filter((row) => row.emoji === emoji) })).filter((value) => value.rows.length));
function choose(emoji: string | null) {
  open.value = false;
  void setMessageReaction(props.cache, props.path, props.messageID, props.side, emoji);
}
const showsTranscript = ref(false);
function viewTranscript() {
  open.value = false;
  showsTranscript.value = true;
}
function reply() {
  open.value = false;
  emit('reply');
}
// Above the message when there is room, otherwise below it; aligned with the message's side.
async function place() {
  position.value = null;
  await nextTick();
  const anchor = root.value?.getBoundingClientRect(), panel = picker.value;
  if (!anchor || !panel || !open.value) return;
  const { width, height } = panel.getBoundingClientRect(), gap = 8, margin = 8;
  const outgoing = !!root.value?.closest('.bubble-row.outgoing');
  const top = anchor.top - height - gap >= margin ? anchor.top - height - gap : Math.min(anchor.bottom + gap, window.innerHeight - height - margin);
  const left = outgoing ? anchor.right - width : anchor.left;
  position.value = { top: Math.max(margin, top), left: Math.min(Math.max(margin, left), window.innerWidth - width - margin) };
}
watch(open, (value) => { if (value) void place(); else position.value = null; });
function outside(event: Event) {
  const target = event.target as Node;
  if (!root.value?.contains(target) && !picker.value?.contains(target)) open.value = false;
}
// A fixed panel would drift away from its message, so scrolling or resizing closes it.
function dismiss(event: Event) { if (open.value && !picker.value?.contains(event.target as Node)) open.value = false; }
let timer: ReturnType<typeof setTimeout> | undefined;
let held = false;
let start: { x: number; y: number } | null = null;
function cancel() { clearTimeout(timer); start = null; }
function down(event: PointerEvent) {
  held = false;
  if (event.button !== 0 || (event.target as HTMLElement).closest('.reaction-badges, .message-actions, .reaction-error')) return;
  start = { x: event.clientX, y: event.clientY };
  timer = setTimeout(() => { held = true; open.value = true; }, 450);
}
function click(event: MouseEvent) {
  if (held) { held = false; event.preventDefault(); event.stopPropagation(); }
}
function move(event: PointerEvent) { if (start && Math.hypot(start.x - event.clientX, start.y - event.clientY) > 10) cancel(); }
onMounted(() => {
  document.addEventListener('pointerdown', outside);
  document.addEventListener('scroll', dismiss, true);
  window.addEventListener('resize', dismiss);
});
onBeforeUnmount(() => {
  cancel();
  document.removeEventListener('pointerdown', outside);
  document.removeEventListener('scroll', dismiss, true);
  window.removeEventListener('resize', dismiss);
});
</script>

<template>
  <div ref="root" class="reaction-message" :class="{ active: open }" @click.capture="click" @pointerdown="down" @pointermove="move" @pointerup="cancel" @pointercancel="cancel" @contextmenu.prevent="open = true" @keydown.esc="open = false">
    <slot />
    <!-- Hover actions float beside the message, so they take no space in the conversation. -->
    <div class="message-actions">
      <button v-if="replyable" class="reaction-trigger" aria-label="Reply to message" @click="reply"><AppIcon name="reply" /></button>
      <button class="reaction-trigger" aria-label="React to message" :aria-expanded="open" @click="open = !open"><AppIcon name="add-reaction" /></button>
    </div>
    <div v-if="summaries.length" class="reaction-badges">
      <button v-for="item in summaries" :key="item.emoji" class="reaction-badge" :class="{ selected: own === item.emoji }"
        :title="item.rows.map((row) => row.name).join(', ')" :aria-label="`${item.emoji}: ${item.rows.map((row) => row.name).join(', ')}`" @click="open = !open">{{ item.emoji }} {{ item.rows.length }}</button>
    </div>
    <Teleport to="body">
      <div v-if="open && !cache.invalidated" ref="picker" class="reaction-picker" role="group" aria-label="Message reactions"
        :style="position ? { top: `${position.top}px`, left: `${position.left}px` } : { visibility: 'hidden', top: '0', left: '0' }" @keydown.esc="open = false">
        <button v-for="emoji in reactionEmojis" :key="emoji" :disabled="cache.busy.includes(key)" :aria-pressed="own === emoji" :aria-label="`React ${emoji}`" @click="choose(own === emoji ? null : emoji)">{{ emoji }}</button>
        <button v-if="replyable" class="reaction-reply" @click="reply"><AppIcon name="reply" /> Reply</button>
        <button v-if="voice" class="reaction-reply" @click="viewTranscript"><AppIcon name="file" /> View transcript</button>
        <button v-if="own" :disabled="cache.busy.includes(key)" @click="choose(null)">Remove</button>
        <div v-if="rows.length" class="reaction-people"><div v-for="row in rows" :key="row.actorID">{{ row.emoji }} {{ row.name }}</div></div>
      </div>
    </Teleport>
    <VoiceTranscriptDialog v-if="voice && showsTranscript" :transcript="transcript ?? null" @close="showsTranscript = false" />
    <div v-if="cache.pending[key] && cache.errors[key]" role="status" class="reaction-error">
      {{ cache.errors[key] }} <button @click="choose(cache.pending[key]!.emoji)">Retry reaction</button>
    </div>
  </div>
</template>

<style scoped>
.reaction-message { position: relative; min-width: 0; max-width: min(78%, 560px); }
.reaction-badges { display: flex; gap: 3px; align-items: center; flex-wrap: wrap; margin-top: 2px; }
.reaction-badge, .reaction-trigger { display: inline-flex; align-items: center; gap: 2px; min-height: 26px; border: 1px solid var(--md-outline-variant); border-radius: 8px; padding: 2px 8px; background: var(--md-surface-container-low); color: var(--md-on-surface-variant); font-size: 13px; cursor: pointer; }
.reaction-badge.selected { border-color: transparent; background: var(--md-secondary-container); color: var(--md-on-secondary-container); }
.message-actions { position: absolute; top: 50%; left: calc(100% + 4px); z-index: 1; display: flex; gap: 3px; transform: translateY(-50%); opacity: 0; pointer-events: none; transition: opacity 120ms; }
:global(.bubble-row.outgoing .message-actions) { left: auto; right: calc(100% + 4px); flex-direction: row-reverse; }
.reaction-trigger { padding: 2px 6px; border-radius: 999px; box-shadow: var(--md-elevation-1); }
.reaction-trigger svg { width: 16px; height: 16px; }
.reaction-message:hover .message-actions, .reaction-message:focus-within .message-actions, .reaction-message.active .message-actions { opacity: 1; pointer-events: auto; }
.reaction-picker { position: fixed; z-index: 50; border-radius: var(--md-shape-l); padding: 8px; background: var(--md-surface-container); color: var(--md-on-surface); box-shadow: var(--md-elevation-2); display: flex; gap: 6px; flex-wrap: wrap; max-width: min(320px, calc(100vw - 16px)); }
.reaction-picker button { background: transparent; border: 0; font-size: 22px; cursor: pointer; padding: 4px 6px; border-radius: 999px; }
.reaction-picker button:hover:not(:disabled) { background: var(--hover); }
.reaction-picker button[aria-pressed=true] { background: var(--md-secondary-container); }
.reaction-picker .reaction-reply { font-size: 14px; font-weight: 600; padding: 4px 12px; display: inline-flex; align-items: center; gap: 4px; }
.reaction-reply svg { width: 16px; height: 16px; }
.reaction-people { flex-basis: 100%; font-size: 13px; max-height: 140px; overflow-y: auto; }
.reaction-error { font-size: 12px; max-width: 280px; }
/* Touch screens open the same menu with a long press, so the hover actions stay hidden. */
@media (hover: none) { .reaction-message:hover .message-actions { opacity: 0; pointer-events: none; } }
</style>
