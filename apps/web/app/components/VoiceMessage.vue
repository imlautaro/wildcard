<script setup lang="ts">
import type { VoiceInfo } from '~/utils/types';

// Voice bubble content (docs/voice.md#voice-bubbles): play/pause, a seekable progress
// waveform and the elapsed time while playing (the duration otherwise). Outgoing messages
// show a microphone that turns the read-check color once a contact listened.
// `path` is the audio download path and the player key; `blob` is a pending local clip.
const props = defineProps<{ voice: VoiceInfo; path: string; blob?: Blob | null; outgoing?: boolean; senderName?: string; senderPhoto?: string | null }>();
const { user } = useSession();
const ownPhoto = computed(() => user.value?.photoVersion ? `me/photo?version=${encodeURIComponent(user.value.photoVersion)}` : null);
const root = ref<HTMLElement>();
const samples = ref<number[]>();
const selectedTime = ref(0);
const visible = ref(false);
let observer: IntersectionObserver | undefined;
const bars = computed(() => samples.value ?? cachedVoiceWaveform(props.path) ?? Array<number>(37).fill(0));
const progress = computed(() => total.value > 0 ? Math.min(1, position.value / total.value) : 0);
let waveformRun = 0;
async function loadWaveform() {
  const run = ++waveformRun;
  const path = props.path;
  try {
    if (props.blob) seedVoiceAudio(path, props.blob);
    const values = await voiceWaveform(path);
    if (run === waveformRun && path === props.path) samples.value = values;
  } catch { /* A neutral baseline keeps playback usable if analysis is unavailable. */ }
}
watch(() => `${user.value?.id}/${props.path}`, () => {
  waveformRun++;
  samples.value = undefined;
  selectedTime.value = 0;
  if (visible.value) void loadWaveform();
});
onMounted(() => {
  observer = new IntersectionObserver(([entry]) => {
    visible.value = !!entry?.isIntersecting;
    if (visible.value) void loadWaveform();
  });
  if (root.value) observer.observe(root.value);
});
onBeforeUnmount(() => { waveformRun++; observer?.disconnect(); });
const active = computed(() => voicePlayer.key === props.path);
const playing = computed(() => active.value && voicePlayer.playing);
const loading = computed(() => active.value && voicePlayer.loading);
const failed = computed(() => voicePlayer.failed === props.path);
const total = computed(() => active.value && voicePlayer.duration > 0 ? voicePlayer.duration : props.voice.durationMs / 1000);
const position = computed(() => active.value ? Math.min(voicePlayer.position, total.value) : selectedTime.value);
const listened = computed(() => props.voice.listenedAt != null);
const clock = (seconds: number) => {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};
const label = computed(() => clock(playing.value || position.value > 0 ? position.value : total.value));
watch(() => voicePlayer.key, (current, previous) => {
  if (previous === props.path && current !== props.path) selectedTime.value = 0;
});

function toggle() {
  void loadWaveform();
  void toggleVoice(props.path, () => {
    // A pending clip plays from memory under its final path, so playback continues
    // when the accepted message replaces the pending bubble.
    if (props.blob) seedVoiceAudio(props.path, props.blob);
    return voiceAudioURL(props.path);
  }, selectedTime.value, true, props.outgoing ? ownPhoto.value : props.senderPhoto);
}
function seek(event: Event) {
  selectedTime.value = Number((event.target as HTMLInputElement).value);
  seekVoice(props.path, selectedTime.value);
}
</script>

<template>
  <div ref="root" class="voice-message">
    <div class="voice-controls">
      <div v-if="outgoing" class="voice-avatar">
        <button v-if="playing" type="button" class="voice-speed"
          :aria-label="`Playback speed: ${voicePlayer.rate}x`"
          title="Cycle playback speed: 1x, 1.5x, 2x" @click.stop="cycleVoicePlaybackRate">
          {{ voicePlayer.rate }}x
        </button>
        <AppAvatar v-else :name="user?.name ?? 'You'" :path="ownPhoto" :size="40" />
      </div>
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
            <span v-for="(height, index) in bars" :key="index" :class="{ played: index / bars.length < progress }" :style="{ height: `${3 + 19 * height}px` }" />
          </div>
          <span class="voice-thumb" aria-hidden="true" :style="{ left: `calc(6px + (100% - 12px) * ${progress})` }" />
          <input
            type="range" min="0" :max="Math.max(total, 0.1)" step="0.1" :value="position" :disabled="loading"
            aria-label="Playback position" :aria-valuetext="`${clock(position)} of ${clock(total)}`" @input="seek"
          >
        </div>
      </div>
      <div v-if="!outgoing" class="voice-avatar">
        <button v-if="playing" type="button" class="voice-speed"
          :aria-label="`Playback speed: ${voicePlayer.rate}x`"
          title="Cycle playback speed: 1x, 1.5x, 2x" @click.stop="cycleVoicePlaybackRate">
          {{ voicePlayer.rate }}x
        </button>
        <AppAvatar v-else :name="senderName ?? 'Contact'" :path="senderPhoto" :size="40" />
      </div>
    </div>
    <div class="voice-info">
      <span v-if="failed" class="voice-error">Couldn't load audio</span>
      <span v-else>{{ label }}</span>
      <span v-if="outgoing" class="voice-mic" :class="{ listened }" role="img" :aria-label="listened ? 'Listened' : 'Not listened yet'"><AppIcon name="mic" filled /></span>
    </div>
  </div>
</template>

<style scoped>
.voice-message { width: min(290px, 66vw); padding-top: 2px; white-space: normal; }
.voice-controls { display: flex; align-items: center; gap: 10px; }
.voice-avatar { width: 44px; height: 44px; flex: none; display: inline-flex; align-items: center; justify-content: center; }
.voice-speed { width: 44px; height: 44px; flex: none; border: 2px solid transparent; border-radius: 50%; background: var(--md-surface-container-highest); background-clip: padding-box; color: inherit; font: inherit; font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; cursor: pointer; }
.voice-speed:focus-visible { outline: 2px solid var(--md-primary); outline-offset: 2px; }
.voice-play { width: 44px; height: 44px; flex: none; border: 0; border-radius: 0; display: inline-flex; align-items: center; justify-content: center; background: transparent; color: var(--md-on-surface-variant); cursor: pointer; }
.voice-play svg { width: 24px; height: 24px; }
.voice-play:disabled { cursor: default; }
.voice-track { flex: 1; min-width: 0; }
.voice-waveform { position: relative; height: 44px; }
.voice-bars { position: absolute; inset: 0 6px; display: grid; grid-template-columns: repeat(37, minmax(0, 1fr)); align-items: center; justify-items: center; pointer-events: none; }
.voice-bars span { width: min(2.2px, 65%); min-width: 1px; border-radius: 2px; background: var(--md-on-surface-variant); opacity: 0.4; }
.voice-bars span.played { background: var(--md-primary); opacity: 1; }
.voice-track input[type='range'] { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; appearance: none; background: transparent; touch-action: pan-y; }
.voice-track input[type='range']::-webkit-slider-thumb { appearance: none; width: 12px; height: 44px; background: transparent; }
.voice-track input[type='range']::-moz-range-thumb { width: 12px; height: 44px; border: 0; background: transparent; }
.voice-track input[type='range']::-webkit-slider-runnable-track { height: 44px; background: transparent; }
.voice-track input[type='range']::-moz-range-track { height: 44px; background: transparent; }
.voice-thumb { position: absolute; top: 50%; width: 12px; height: 12px; border-radius: 50%; background: var(--md-primary); transform: translate(-50%, -50%); pointer-events: none; }
.voice-waveform:focus-within { outline: 2px solid var(--md-primary); outline-offset: 3px; border-radius: 4px; }
.voice-track input[type='range']:disabled { cursor: default; }
.voice-info { display: flex; align-items: center; gap: 4px; min-height: 16px; font-size: 12px; color: var(--md-on-surface-variant); font-variant-numeric: tabular-nums; }
.voice-error { color: var(--md-error); }
.voice-mic { display: inline-flex; color: var(--md-on-surface-variant); }
.voice-mic.listened { color: var(--read); }
.voice-mic svg { width: 14px; height: 14px; }
</style>
