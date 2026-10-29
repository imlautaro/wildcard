<script setup lang="ts">
import type { VoiceInfo } from '~/utils/types';

// Voice bubble content (docs/voice.md#voice-bubbles): play/pause, a seekable progress
// bar and the elapsed time while playing (the duration otherwise). Outgoing messages
// show a microphone that turns the read-check color once a contact listened.
// `path` is the audio download path and the player key; `blob` is a pending local clip.
const props = defineProps<{ voice: VoiceInfo; path: string; blob?: Blob | null; outgoing?: boolean }>();
const active = computed(() => voicePlayer.key === props.path);
const playing = computed(() => active.value && voicePlayer.playing);
const loading = computed(() => active.value && voicePlayer.loading);
const failed = computed(() => voicePlayer.failed === props.path);
const total = computed(() => active.value && voicePlayer.duration > 0 ? voicePlayer.duration : props.voice.durationMs / 1000);
const position = computed(() => active.value ? Math.min(voicePlayer.position, total.value) : 0);
const listened = computed(() => props.voice.listenedAt != null);
const clock = (seconds: number) => {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};
const label = computed(() => clock(active.value && (voicePlayer.playing || voicePlayer.position > 0) ? position.value : total.value));

function toggle() {
  void toggleVoice(props.path, () => {
    // A pending clip plays from memory under its final path, so playback continues
    // when the accepted message replaces the pending bubble.
    if (props.blob) seedVoiceAudio(props.path, props.blob);
    return voiceAudioURL(props.path);
  });
}
function seek(event: Event) {
  seekVoice(props.path, Number((event.target as HTMLInputElement).value));
}
</script>

<template>
  <div class="voice-message">
    <button
      type="button" class="voice-play" :disabled="loading"
      :aria-label="failed ? 'Retry loading voice message' : playing ? 'Pause voice message' : 'Play voice message'" @click="toggle"
    >
      <span v-if="loading" class="spinner" />
      <AppIcon v-else :name="failed ? 'refresh' : playing ? 'pause' : 'play'" filled />
    </button>
    <div class="voice-track">
      <input
        type="range" min="0" :max="Math.max(total, 0.1)" step="0.1" :value="position" :disabled="!active || loading"
        aria-label="Playback position" :aria-valuetext="`${clock(position)} of ${clock(total)}`" @input="seek"
      >
      <div class="voice-info">
        <span v-if="failed" class="voice-error">Couldn't load audio</span>
        <span v-else>{{ label }}</span>
        <span v-if="outgoing" class="voice-mic" :class="{ listened }" role="img" :aria-label="listened ? 'Listened' : 'Not listened yet'"><AppIcon name="mic" filled /></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.voice-message { display: flex; align-items: center; gap: 10px; width: min(260px, 60vw); padding-top: 2px; white-space: normal; }
.voice-play { width: 40px; height: 40px; flex: none; border: 0; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: var(--md-primary); color: var(--md-on-primary); cursor: pointer; }
.voice-play svg { width: 24px; height: 24px; }
.voice-play:disabled { cursor: default; }
.voice-track { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.voice-track input[type='range'] { width: 100%; margin: 4px 0 0; accent-color: var(--md-primary); }
.voice-track input[type='range']:disabled { opacity: 0.6; }
.voice-info { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--md-on-surface-variant); font-variant-numeric: tabular-nums; }
.voice-error { color: var(--md-error); }
.voice-mic { display: inline-flex; color: var(--md-on-surface-variant); }
.voice-mic.listened { color: var(--read); }
.voice-mic svg { width: 14px; height: 14px; }
</style>
