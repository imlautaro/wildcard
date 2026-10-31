<script setup lang="ts">
defineProps<{ source: string; name: string }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
const viewport = ref<HTMLDivElement>();
const zoomed = ref(false);

function toggleZoom() {
  zoomed.value = !zoomed.value;
  if (!zoomed.value) viewport.value?.scrollTo(0, 0);
}

onMounted(() => { dialog.value?.showModal(); });
onBeforeUnmount(() => { dialog.value?.close(); });
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="chat-image-viewer" :aria-label="`Image: ${name}`" @cancel.prevent="emit('close')">
      <div class="image-toolbar">
        <button type="button" class="viewer-button" :aria-pressed="zoomed" @click="toggleZoom">{{ zoomed ? 'Fit image' : 'Zoom in' }}</button>
        <button type="button" class="viewer-button close" aria-label="Close image" autofocus @click="emit('close')"><AppIcon name="close" /></button>
      </div>
      <div ref="viewport" class="image-viewport" @dblclick.prevent="toggleZoom" @click.self="emit('close')">
        <div class="image-stage" :class="{ zoomed }" @click.self="emit('close')">
          <img :src="source" :alt="name" draggable="false" @click.stop>
        </div>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.chat-image-viewer { position: fixed; inset: 0; width: 100%; height: 100dvh; max-width: none; max-height: none; margin: 0; padding: 0; border: 0; background: #000; color: #fff; overflow: hidden; }
.chat-image-viewer::backdrop { background: #000; }
.image-toolbar { position: absolute; top: 0; left: 0; right: 0; z-index: 1; display: flex; justify-content: flex-end; gap: var(--space-3); padding: max(var(--space-3), env(safe-area-inset-top)) max(var(--space-4), env(safe-area-inset-right)) var(--space-3); background: linear-gradient(#000b, transparent); }
.viewer-button { min-height: 44px; padding: var(--space-2) var(--space-4); border: 1px solid #ffffff80; border-radius: var(--md-shape-full); background: #222; color: #fff; cursor: pointer; }
.viewer-button.close { width: 44px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
.viewer-button.close svg { width: 22px; height: 22px; }
.viewer-button:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
.image-viewport { width: 100%; height: 100%; overflow: auto; overscroll-behavior: contain; }
.image-stage { display: grid; place-items: center; width: 100%; height: 100%; padding: calc(72px + env(safe-area-inset-top)) var(--space-4) max(var(--space-4), env(safe-area-inset-bottom)); }
.image-stage.zoomed { width: 200%; height: 200%; }
.image-stage img { display: block; width: 100%; height: 100%; min-height: 0; object-fit: contain; user-select: none; }
</style>
