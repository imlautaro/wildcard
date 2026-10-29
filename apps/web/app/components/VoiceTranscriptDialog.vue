<script setup lang="ts">
// "View transcript" for a voice message (docs/voice.md#voice-bubbles). The transcript
// stays reactive, so "Transcribing…" turns into the text when polling delivers it.
const props = defineProps<{ transcript: string | null }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
const titleID = useId();
const text = computed(() => props.transcript === null ? 'Transcribing…' : props.transcript === '' ? 'No speech was detected.' : props.transcript);

onMounted(() => { dialog.value?.showModal(); });
onBeforeUnmount(() => { dialog.value?.close(); });
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="transcript-dialog" :aria-labelledby="titleID" @cancel.prevent="emit('close')">
      <h2 :id="titleID">Transcript</h2>
      <p :class="{ muted: !transcript }" role="status">{{ text }}</p>
      <div class="transcript-actions">
        <button type="button" class="button text" autofocus @click="emit('close')">Close</button>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.transcript-dialog { width: min(420px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); overflow-y: auto; padding: 24px; border: 0; border-radius: var(--md-shape-xl); background: var(--md-surface-container-high); color: var(--md-on-surface); box-shadow: var(--md-elevation-3); }
.transcript-dialog::backdrop { background: var(--md-scrim); }
.transcript-dialog h2 { font-size: 24px; font-weight: 600; margin: 0 0 16px; }
.transcript-dialog p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.5; }
.transcript-actions { display: flex; justify-content: flex-end; margin-top: 24px; }
</style>
