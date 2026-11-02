<script setup lang="ts">
// "View transcript" for a voice message (docs/voice.md#voice-bubbles). The transcript
// stays reactive, so "Transcribing…" turns into the text when polling delivers it.
const props = defineProps<{ transcript: string | null }>();
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const text = computed(() => props.transcript === null ? t('chat.transcript.transcribing') : props.transcript === '' ? t('chat.transcript.noSpeech') : props.transcript);
</script>

<template>
  <AppSheet :title="$t('chat.transcript.title')" @close="emit('close')">
    <p class="sheet-text" :class="{ muted: !transcript }" role="status">{{ text }}</p>
  </AppSheet>
</template>
