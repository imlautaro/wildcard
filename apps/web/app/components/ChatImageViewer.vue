<script setup lang="ts">
// Full-screen viewer. Several images (a contact-generated album) page with the
// arrow buttons, the keyboard arrows or a horizontal swipe; zoom resets per image.
const props = defineProps<{ images: { source: string | null; name: string }[]; start?: number }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
const viewport = ref<HTMLDivElement>();
const zoomed = ref(false);
const index = ref(Math.min(Math.max(props.start ?? 0, 0), Math.max(props.images.length - 1, 0)));
const current = computed(() => props.images[index.value]);
const multiple = computed(() => props.images.length > 1);

function toggleZoom() {
  zoomed.value = !zoomed.value;
  if (!zoomed.value) viewport.value?.scrollTo(0, 0);
}
function go(step: number) {
  const next = index.value + step;
  if (next < 0 || next >= props.images.length) return;
  index.value = next;
  zoomed.value = false;
  viewport.value?.scrollTo(0, 0);
}
function onKey(event: KeyboardEvent) {
  if (!multiple.value) return;
  if (event.key === 'ArrowRight') { event.preventDefault(); go(1); }
  if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1); }
}
let touchX: number | null = null;
function touchStart(event: TouchEvent) { touchX = !zoomed.value && event.touches.length === 1 ? event.touches[0]!.clientX : null; }
function touchEnd(event: TouchEvent) {
  if (touchX === null || !multiple.value) return;
  const delta = event.changedTouches[0]!.clientX - touchX;
  touchX = null;
  if (Math.abs(delta) > 50) go(delta < 0 ? 1 : -1);
}

onMounted(() => { dialog.value?.showModal(); });
onBeforeUnmount(() => { dialog.value?.close(); });
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="chat-image-viewer" :aria-label="$t('chat.viewer.label', { name: current?.name ?? '' })" @cancel.prevent="emit('close')" @keydown="onKey">
      <div class="image-toolbar">
        <span v-if="multiple" class="counter" aria-live="polite">{{ index + 1 }} / {{ images.length }}</span>
        <button type="button" class="viewer-button" :aria-pressed="zoomed" @click="toggleZoom">{{ zoomed ? $t('chat.viewer.fit') : $t('chat.viewer.zoom') }}</button>
        <button type="button" class="viewer-button close" :aria-label="$t('chat.viewer.close')" autofocus @click="emit('close')"><AppIcon name="close" /></button>
      </div>
      <div ref="viewport" class="image-viewport" @dblclick.prevent="toggleZoom" @click.self="emit('close')" @touchstart.passive="touchStart" @touchend="touchEnd">
        <div class="image-stage" :class="{ zoomed }" @click.self="emit('close')">
          <img v-if="current?.source" :key="index" :src="current.source" :alt="current.name" draggable="false" @click.stop>
          <span v-else class="spinner" />
        </div>
      </div>
      <template v-if="multiple">
        <button type="button" class="viewer-button nav previous" :aria-label="$t('chat.viewer.previous')" :disabled="index === 0" @click="go(-1)">‹</button>
        <button type="button" class="viewer-button nav next" :aria-label="$t('chat.viewer.next')" :disabled="index === images.length - 1" @click="go(1)">›</button>
      </template>
    </dialog>
  </Teleport>
</template>

<style scoped>
.chat-image-viewer { position: fixed; inset: 0; width: 100%; height: 100dvh; max-width: none; max-height: none; margin: 0; padding: 0; border: 0; background: #000; color: #fff; overflow: hidden; }
.chat-image-viewer::backdrop { background: #000; }
.image-toolbar { position: absolute; top: 0; left: 0; right: 0; z-index: 1; display: flex; justify-content: flex-end; align-items: center; gap: var(--space-3); padding: max(var(--space-3), env(safe-area-inset-top)) max(var(--space-4), env(safe-area-inset-right)) var(--space-3); background: linear-gradient(#000b, transparent); }
.counter { margin-right: auto; font-variant-numeric: tabular-nums; }
.viewer-button { min-height: 44px; padding: var(--space-2) var(--space-4); border: 1px solid #ffffff80; border-radius: var(--md-shape-full); background: #222; color: #fff; cursor: pointer; }
.viewer-button.close { width: 44px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
.viewer-button.close svg { width: 22px; height: 22px; }
.viewer-button:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
.viewer-button.nav { position: absolute; top: 50%; z-index: 1; width: 44px; padding: 0; transform: translateY(-50%); font-size: 28px; line-height: 1; }
.viewer-button.nav:disabled { opacity: 0.3; cursor: default; }
.viewer-button.previous { left: max(var(--space-3), env(safe-area-inset-left)); }
.viewer-button.next { right: max(var(--space-3), env(safe-area-inset-right)); }
.image-viewport { width: 100%; height: 100%; overflow: auto; overscroll-behavior: contain; }
.image-stage { display: grid; place-items: center; width: 100%; height: 100%; padding: calc(72px + env(safe-area-inset-top)) var(--space-4) max(var(--space-4), env(safe-area-inset-bottom)); }
.image-stage.zoomed { width: 200%; height: 200%; }
.image-stage img { display: block; width: 100%; height: 100%; min-height: 0; object-fit: contain; user-select: none; }
</style>
