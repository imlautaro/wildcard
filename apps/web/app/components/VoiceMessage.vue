<script setup lang="ts">
import type { VoiceInfo } from '~/utils/types';

// Voice bubble content (docs/voice.md#voice-bubbles): play/pause, a seekable progress
// waveform and the elapsed time while playing (the duration otherwise). Outgoing messages
// show a microphone that turns the read-check color once a contact listened.
// `path` is the audio download path and the player key; `blob` is a pending local clip.
const props = defineProps<{ voice: VoiceInfo; path: string; blob?: Blob | null; outgoing?: boolean; senderName?: string; senderPhoto?: string | null }>();
const { user } = useSession();
const ownPhoto = computed(() => user.value?.photoVersion ? `me/photo?version=${encodeURIComponent(user.value.photoVersion)}` : null);
// Decorative bars rather than decoded audio amplitudes; color follows playback.
const bars = computed(() => Array.from({ length: 27 }, (_, index) => 5 + (index * 17 + props.voice.durationMs % 23) % 24));
const progress = computed(() => total.value > 0 ? position.value / total.value : 0);
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
    <AppAvatar v-if="outgoing" :name="user?.name ?? 'You'" :path="ownPhoto" :size="40" />
    <button
      type="button" class="voice-play" :disabled="loading"
      :aria-label="failed ? 'Retry loading voice message' : playing ? 'Pause voice message' : 'Play voice message'" @click="toggle"
    >
      <span v-if="loading" class="spinner" />
      <AppIcon v-else :name="failed ? 'refresh' : playing ? 'pause' : 'play'" filled />
    </button>
    <div class="voice-track">
      <div class="voice-waveform">
        <div class="voice-bars" aria-hidden="true">
          <span v-for="(height, index) in bars" :key="index" :class="{ played: index / bars.length < progress }" :style="{ height: `${height}px` }" />
        </div>
        <input
          type="range" min="0" :max="Math.max(total, 0.1)" step="0.1" :value="position" :disabled="!active || loading"
        aria-label="Playback position" :aria-valuetext="`${clock(position)} of ${clock(total)}`" @input="seek"
      >
      </div>
      <div class="voice-info">
        <span v-if="failed" class="voice-error">Couldn't load audio</span>
        <span v-else>{{ label }}</span>
        <span v-if="outgoing" class="voice-mic" :class="{ listened }" role="img" :aria-label="listened ? 'Listened' : 'Not listened yet'"><AppIcon name="mic" filled /></span>
      </div>
    </div>
    <AppAvatar v-if="!outgoing" :name="senderName ?? 'Contact'" :path="senderPhoto" :size="40" />
  </div>
</template>

<style scoped>
.voice-message { display: flex; align-items: center; gap: 10px; width: min(290px, 66vw); padding-top: 2px; white-space: normal; }
.voice-play { width: 40px; height: 40px; flex: none; border: 0; border-radius: 0; display: inline-flex; align-items: center; justify-content: center; background: transparent; color: var(--md-on-surface-variant); cursor: pointer; }
.voice-play svg { width: 24px; height: 24px; }
.voice-play:disabled { cursor: default; }
.voice-track { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.voice-waveform { position: relative; height: 32px; }
.voice-bars { height: 100%; display: flex; align-items: center; gap: 2px; }
.voice-bars span { flex: 1; min-width: 1px; border-radius: 3px; background: var(--md-on-surface-variant); opacity: 0.4; }
.voice-bars span.played { background: var(--md-primary); opacity: 1; }
.voice-track input[type='range'] { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
.voice-waveform:focus-within { outline: 2px solid var(--md-primary); outline-offset: 3px; border-radius: 4px; }
.voice-track input[type='range']:disabled { cursor: default; }
.voice-info { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--md-on-surface-variant); font-variant-numeric: tabular-nums; }
.voice-error { color: var(--md-error); }
.voice-mic { display: inline-flex; color: var(--md-on-surface-variant); }
.voice-mic.listened { color: var(--read); }
.voice-mic svg { width: 14px; height: 14px; }
</style>
