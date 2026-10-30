<script setup lang="ts">
import type { ReactionCache } from '~/composables/useMessageReactions';
// `voice` adds "View transcript" to the menu; `transcript` follows docs/voice.md.
const props = defineProps<{ cache: ReactionCache; path: string; messageID: string; side: string; replyable?: boolean; voice?: boolean; transcript?: string | null; receiptGroupID?: string }>();
const emit = defineEmits<{ reply: [] }>();
const { user } = useSession();
const open = ref(false);
const root = ref<HTMLElement>();
const overlay = ref<HTMLElement>();
const bar = ref<HTMLElement>();
const menu = ref<HTMLElement>();
// The menu opens at a point: the cursor for a right click, the finger for a hold, or the
// pressed control. `top`/`bottom` span the control so the panels clear it.
type Anchor = { x: number; top: number; bottom: number };
type Placement = { top: number; left: number; arrowX: number; arrow: 'arrow-down' | 'arrow-up' | null };
const anchor = ref<Anchor | null>(null);
// Both panels float over the conversation (fixed to the viewport) instead of pushing messages down.
const position = ref<{ bar: Placement; menu: Placement | null } | null>(null);
const key = computed(() => `${props.messageID}/${props.side}`);
const rows = computed(() => props.cache.rows.filter((row) => row.messageID === props.messageID && row.side === props.side));
const own = computed(() => rows.value.find((row) => row.actorID === `user/${user.value?.id}`)?.emoji);
const summaries = computed(() => reactionEmojis.map((emoji) => ({ emoji, rows: rows.value.filter((row) => row.emoji === emoji) })).filter((value) => value.rows.length));
const hasMenu = computed(() => props.replyable || !!props.receiptGroupID || props.voice || !!own.value || rows.value.length > 0);
function choose(emoji: string | null) {
  open.value = false;
  void setMessageReaction(props.cache, props.path, props.messageID, props.side, emoji);
}
const showsTranscript = ref(false);
const showsReaders = ref(false);
function viewTranscript() {
  open.value = false;
  showsTranscript.value = true;
}
function reply() {
  open.value = false;
  emit('reply');
}
function openAt(value: Anchor) {
  anchor.value = value;
  open.value = true;
}
function openFrom(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  openAt({ x: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom });
}
function toggleFrom(event: MouseEvent) {
  if (open.value) open.value = false;
  else openFrom(event.currentTarget as HTMLElement);
}
// Reactions sit above the anchor and actions below it, each with an arrow pointing at it.
// Without room above, reactions move below and the actions stack under them; without room
// below, the actions stack above the reactions. Arrows stay on the anchor when panels clamp.
async function place() {
  position.value = null;
  await nextTick();
  const point = anchor.value, strip = bar.value?.getBoundingClientRect(), list = menu.value?.getBoundingClientRect();
  if (!point || !strip || !open.value) return;
  const gap = 12, stack = 6, margin = 8, width = window.innerWidth, height = window.innerHeight;
  const horizontal = (size: number) => {
    const left = Math.min(Math.max(margin, point.x - size / 2), width - size - margin);
    // Keep the arrow clear of the rounded corners.
    return { left, arrowX: Math.min(Math.max(24, point.x - left), size - 24) };
  };
  const above = point.top - gap - strip.height >= margin;
  const barTop = above ? point.top - gap - strip.height : Math.min(point.bottom + gap, height - strip.height - margin);
  const placed = { bar: { top: barTop, ...horizontal(strip.width), arrow: above ? 'arrow-down' as const : 'arrow-up' as const }, menu: null as Placement | null };
  if (list) {
    const below = above ? point.bottom + gap : barTop + strip.height + stack;
    const top = below + list.height <= height - margin ? below
      : above && barTop - stack - list.height >= margin ? barTop - stack - list.height : Math.max(margin, height - list.height - margin);
    placed.menu = { top, ...horizontal(list.width), arrow: above && top === below ? 'arrow-up' : null };
  }
  position.value = placed;
}
watch([open, anchor], ([value]) => { if (value) void place(); else position.value = null; });
function panelStyle(placement: Placement | null | undefined) {
  return placement ? { top: `${placement.top}px`, left: `${placement.left}px`, '--arrow-x': `${placement.arrowX}px` } : { visibility: 'hidden' as const, top: '0', left: '0' };
}
function outside(event: Event) {
  const target = event.target as Node;
  if (!root.value?.contains(target) && !overlay.value?.contains(target)) open.value = false;
}
// Fixed panels would drift away from their message, so scrolling or resizing closes them.
function dismiss(event: Event) { if (open.value && !overlay.value?.contains(event.target as Node)) open.value = false; }
let timer: ReturnType<typeof setTimeout> | undefined;
let held = false;
let start: { x: number; y: number } | null = null;
function cancel() { clearTimeout(timer); start = null; }
function down(event: PointerEvent) {
  held = false;
  if (event.button !== 0 || (event.target as HTMLElement).closest('.reaction-badges, .message-actions, .reaction-error')) return;
  const point = { x: event.clientX, y: event.clientY };
  start = point;
  timer = setTimeout(() => { held = true; openAt({ x: point.x, top: point.y, bottom: point.y }); }, 450);
}
// Right-clicking a link keeps the browser's own menu (open, copy address, ...).
// The keyboard context-menu key reports no pointer position, so it opens from the message.
function contextMenu(event: MouseEvent) {
  if ((event.target as HTMLElement).closest('a[href]')) return;
  event.preventDefault();
  if (event.clientX || event.clientY) openAt({ x: event.clientX, top: event.clientY, bottom: event.clientY });
  else if (root.value) openFrom(root.value);
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
  <div ref="root" class="reaction-message" :class="{ active: open }" @click.capture="click" @pointerdown="down" @pointermove="move" @pointerup="cancel" @pointercancel="cancel" @contextmenu="contextMenu" @keydown.esc="open = false">
    <slot />
    <!-- Hover actions float beside the message, so they take no space in the conversation. -->
    <div class="message-actions">
      <button v-if="replyable" class="reaction-trigger" aria-label="Reply to message" @click="reply"><AppIcon name="reply" /></button>
      <button class="reaction-trigger" aria-label="React to message" :aria-expanded="open" @click="toggleFrom"><AppIcon name="add-reaction" /></button>
    </div>
    <div v-if="summaries.length" class="reaction-badges">
      <button v-for="item in summaries" :key="item.emoji" class="reaction-badge" :class="{ selected: own === item.emoji }"
        :title="item.rows.map((row) => row.name).join(', ')" :aria-label="`${item.emoji}: ${item.rows.map((row) => row.name).join(', ')}`" @click="toggleFrom">{{ item.emoji }} {{ item.rows.length }}</button>
    </div>
    <Teleport to="body">
      <div v-if="open && !cache.invalidated" ref="overlay" class="reaction-overlay" @keydown.esc="open = false" @contextmenu.prevent>
        <div ref="bar" class="reaction-panel reaction-picker" :class="position?.bar.arrow" role="group" aria-label="Message reactions" :style="panelStyle(position?.bar)">
          <button v-for="emoji in reactionEmojis" :key="emoji" :disabled="cache.busy.includes(key)" :aria-pressed="own === emoji" :aria-label="`React ${emoji}`" @click="choose(own === emoji ? null : emoji)">{{ emoji }}</button>
        </div>
        <div v-if="hasMenu" ref="menu" class="reaction-panel reaction-menu" :class="position?.menu?.arrow" role="group" aria-label="Message actions" :style="panelStyle(position?.menu)">
          <button v-if="replyable" @click="reply"><AppIcon name="reply" /> Reply</button>
          <button v-if="receiptGroupID" @click="open = false; showsReaders = true"><AppIcon name="check" /> Message info</button>
          <button v-if="voice" @click="viewTranscript"><AppIcon name="file" /> View transcript</button>
          <button v-if="own" :disabled="cache.busy.includes(key)" @click="choose(null)"><AppIcon name="close" /> Remove reaction</button>
          <div v-if="rows.length" class="reaction-people"><div v-for="row in rows" :key="row.actorID">{{ row.emoji }} {{ row.name }}</div></div>
        </div>
      </div>
    </Teleport>
    <GroupMessageInfo v-if="receiptGroupID && showsReaders" :group-i-d="receiptGroupID" :message-i-d="messageID" @close="showsReaders = false" />
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
.message-actions { position: absolute; top: 50%; left: 100%; padding-left: 8px; z-index: 1; display: flex; gap: 3px; transform: translateY(-50%); opacity: 0; pointer-events: none; transition: opacity 120ms; }
:global(.bubble-row.outgoing .message-actions) { left: auto; right: 100%; padding-left: 0; padding-right: 8px; flex-direction: row-reverse; }
.reaction-trigger { padding: 2px 6px; border-radius: 999px; box-shadow: var(--md-elevation-1); }
.reaction-trigger svg { width: 16px; height: 16px; }
/* The whole conversation row is the hover target, so the pointer can reach the buttons from any direction. */
:global(.bubble-row:hover .message-actions), .reaction-message:focus-within .message-actions, .reaction-message.active .message-actions { opacity: 1; pointer-events: auto; }
.reaction-overlay { display: contents; }
.reaction-panel { position: fixed; z-index: 50; background: var(--md-surface-container); color: var(--md-on-surface); box-shadow: var(--md-elevation-2); }
/* The arrow is a rotated square half outside the panel, pointing at the anchor. */
.reaction-panel.arrow-down::after, .reaction-panel.arrow-up::after { content: ''; position: absolute; left: var(--arrow-x); width: 10px; height: 10px; background: inherit; transform: translateX(-50%) rotate(45deg); }
.reaction-panel.arrow-down::after { bottom: -5px; }
.reaction-panel.arrow-up::after { top: -5px; }
.reaction-picker { border-radius: 999px; padding: 6px; display: flex; gap: 2px; flex-wrap: wrap; justify-content: center; max-width: calc(100vw - 16px); }
.reaction-picker button { background: transparent; border: 0; font-size: 22px; line-height: 1; cursor: pointer; padding: 6px; border-radius: 999px; }
.reaction-picker button:hover:not(:disabled) { background: var(--hover); }
.reaction-picker button[aria-pressed=true] { background: var(--md-secondary-container); }
.reaction-menu { min-width: 200px; max-width: min(280px, calc(100vw - 16px)); padding: 8px 0; border-radius: var(--md-shape-m); }
.reaction-menu button { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 40px; padding: 0 16px; border: 0; background: transparent; color: inherit; font-size: 14px; text-align: left; cursor: pointer; }
.reaction-menu button:hover:not(:disabled) { background: var(--hover); }
.reaction-menu button svg { width: 20px; height: 20px; color: var(--md-on-surface-variant); }
.reaction-people { padding: 8px 16px 0; font-size: 13px; max-height: 140px; overflow-y: auto; color: var(--md-on-surface-variant); }
.reaction-menu button + .reaction-people { margin-top: 8px; border-top: 1px solid var(--md-outline-variant); }
.reaction-error { font-size: 12px; max-width: 280px; }
/* Touch screens open the same menu with a long press, so the hover actions stay hidden. */
@media (hover: none) { :global(.bubble-row:hover .reaction-message .message-actions) { opacity: 0; pointer-events: none; } }
</style>
