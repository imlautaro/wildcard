<script setup lang="ts">
import type { DraftAttachment, DraftVoice } from '~/utils/types';
import type { ReplyPreview } from '~/utils/replies';

// Text plus one optional image/PDF attachment, matching the API's 4,000 character limit.
// The parent owns the reply target so it survives navigation with the draft.
// With `voiceKey` (the conversation identity), an empty draft shows a microphone for
// voice messages (docs/voice.md): hold to record and release to send, slide left to
// cancel, slide up to lock. Changing the key discards an active recording.
const props = defineProps<{ disabled?: boolean; sending?: boolean; placeholder?: string; reply?: ReplyPreview | null; voiceKey?: string | null }>();
const draft = defineModel<string>({ required: true });
const emit = defineEmits<{ send: [text: string, attachment: DraftAttachment | null]; voice: [clip: DraftVoice]; typing: []; cancelReply: [] }>();

const attachment = ref<DraftAttachment | null>(null);
const preparing = ref(false);
const problem = ref<string | null>(null);
const textarea = ref<HTMLTextAreaElement>();
const picker = ref<HTMLInputElement>();
const micButton = ref<HTMLButtonElement>();
const length = computed(() => [...draft.value.trim()].length);
const canSend = computed(() => !props.disabled && !props.sending && !preparing.value && length.value <= 4000 && (length.value > 0 || !!attachment.value));
const recorder = useVoiceRecorder((clip) => {
  if (props.disabled || props.sending) return;
  emit('voice', clip);
});
const supportsVoice = ref(false);
onMounted(() => { supportsVoice.value = voiceRecordingSupported(); });
const recording = computed(() => recorder.phase.value !== 'idle');
// The microphone replaces the send button while there is nothing to send.
const showsMicrophone = computed(() => recording.value
  || (supportsVoice.value && !!props.voiceKey && !length.value && !attachment.value && !preparing.value));
const clock = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

// Hold gesture state. Thresholds match iOS: about 100 px left cancels, 80 px up locks.
const cancelDistance = 100;
const lockDistance = 80;
const holding = ref(false);
const locked = ref(false);
const drag = reactive({ x: 0, y: 0 });
let origin: { x: number; y: number; pointer: number } | null = null;
// The click that follows releasing a hold must not act on the (now locked) button.
let ignoreClick = false;

function endHold() {
  holding.value = false;
  drag.x = 0; drag.y = 0;
  if (origin && micButton.value?.hasPointerCapture(origin.pointer)) micButton.value.releasePointerCapture(origin.pointer);
  origin = null;
}
function discardRecording() {
  endHold();
  locked.value = false;
  recorder.cancel();
}
// Stop sends; before the microphone is ready (for example at the permission prompt) nothing was recorded.
function sendRecording() {
  endHold();
  locked.value = false;
  if (recorder.phase.value === 'recording') recorder.stop();
  else if (recorder.phase.value === 'requesting') recorder.cancel();
}
function micDown(event: PointerEvent) {
  ignoreClick = false;
  if (event.button !== 0 || props.disabled || props.sending || locked.value || recording.value) return;
  event.preventDefault();
  micButton.value?.setPointerCapture(event.pointerId);
  origin = { x: event.clientX, y: event.clientY, pointer: event.pointerId };
  holding.value = true;
  ignoreClick = true;
  void recorder.start();
}
function micMove(event: PointerEvent) {
  if (!holding.value || !origin || event.pointerId !== origin.pointer) return;
  drag.x = Math.min(0, event.clientX - origin.x);
  drag.y = Math.min(0, event.clientY - origin.y);
  if (drag.x <= -cancelDistance) discardRecording();
  else if (drag.y <= -lockDistance && recorder.phase.value === 'recording') {
    endHold();
    locked.value = true;
  }
}
function micUp(event: PointerEvent) {
  if (holding.value && origin && event.pointerId === origin.pointer) sendRecording();
}
function micCancel(event: PointerEvent) {
  if (holding.value && origin && event.pointerId === origin.pointer) discardRecording();
}
// A key press always acts, even if a hold that ended away from the button left the flag set.
function micKey() { ignoreClick = false; }
// Keyboard and assistive technology activation (Space/Enter) starts a locked recording;
// in the locked state the same button is Stop, which sends.
function micClick(event: MouseEvent) {
  if (ignoreClick) { ignoreClick = false; return; }
  if (locked.value) { sendRecording(); return; }
  if (event.detail !== 0 || props.disabled || props.sending || recording.value) return;
  locked.value = true;
  void recorder.start();
}
watch(recorder.phase, (phase) => {
  // Auto-stop at one minute, failures and hidden tabs end the gesture too.
  if (phase === 'idle') { endHold(); locked.value = false; }
});
watch(() => props.voiceKey, () => discardRecording());

function resize() {
  const element = textarea.value;
  if (!element) return;
  element.style.height = 'auto';
  element.style.height = `${element.scrollHeight}px`;
}
watch(draft, () => {
  nextTick(resize);
  recorder.notice.value = null;
});

async function choose(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  (event.target as HTMLInputElement).value = '';
  if (!file) return;
  preparing.value = true;
  problem.value = null;
  try {
    clearAttachment();
    attachment.value = await draftAttachment(file);
  } catch (error) {
    problem.value = errorMessage(error);
  } finally {
    preparing.value = false;
  }
}
function clearAttachment() {
  if (attachment.value?.previewURL) URL.revokeObjectURL(attachment.value.previewURL);
  attachment.value = null;
}
function submit() {
  if (recording.value) return;
  if (!canSend.value) return;
  // Ownership of the preview URL moves to the pending send.
  emit('send', draft.value, attachment.value);
  attachment.value = null;
  problem.value = null;
  nextTick(() => textarea.value?.focus());
}
function onKey(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    submit();
  }
}
function dismissKeyboardOutside(event: PointerEvent) {
  if (document.activeElement !== textarea.value || !(event.target instanceof Node)) return;
  if (!textarea.value?.contains(event.target)) textarea.value?.blur();
}
onMounted(() => document.addEventListener('pointerdown', dismissKeyboardOutside, { passive: true }));
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', dismissKeyboardOutside);
  clearAttachment();
});
defineExpose({ focus: () => textarea.value?.focus() });
</script>

<template>
  <div class="composer">
    <form @submit.prevent="submit">
      <div v-if="recording" class="voice-recording" :class="{ locked }" role="status">
        <button v-if="locked" type="button" class="icon-button" aria-label="Delete recording" @click="discardRecording"><AppIcon name="delete" /></button>
        <span class="voice-dot" aria-hidden="true" />
        <span class="voice-timer">{{ recorder.phase.value === 'requesting' ? 'Waiting for the microphone…' : recorder.phase.value === 'processing' ? 'Sending…' : clock(recorder.elapsedMs.value) }}</span>
        <span v-if="recorder.phase.value === 'processing'" />
        <span v-else-if="!locked" class="voice-slide" :style="{ transform: `translateX(${drag.x}px)`, opacity: 1 + drag.x / cancelDistance }">‹ Slide to cancel</span>
        <span v-else class="voice-slide">Recording</span>
      </div>
      <template v-else>
        <button type="button" class="icon-button" aria-label="Attach an image or PDF" :disabled="disabled || preparing" @click="picker?.click()">
          <AppIcon name="attach" />
        </button>
      </template>
      <input ref="picker" type="file" class="visually-hidden" :accept="attachmentTypes.join(',')" tabindex="-1" @change="choose">
      <div v-show="!recording" class="input">
        <div v-if="reply" class="draft-reply">
          <MessageReplyQuote :preview="reply" />
          <button type="button" class="icon-button" aria-label="Cancel reply" :disabled="disabled" @click="emit('cancelReply')"><AppIcon name="close" /></button>
        </div>
        <div v-if="attachment" class="draft-attachment">
          <img v-if="attachment.previewURL" :src="attachment.previewURL" alt="">
          <AppIcon v-else name="file" style="width: 28px; height: 28px; color: var(--accent)" />
          <span class="name">{{ attachment.name }} · {{ fileSize(attachment.size) }}</span>
          <button type="button" class="icon-button" aria-label="Remove attachment" @click="clearAttachment"><AppIcon name="close" /></button>
        </div>
        <div v-else-if="preparing" class="draft-attachment muted"><span class="spinner" /> Preparing attachment…</div>
        <textarea
          ref="textarea" v-model="draft" rows="1" :placeholder="placeholder ?? 'Message'" aria-label="Message"
          @keydown="onKey" @input="emit('typing')"
        />
      </div>
      <div v-if="showsMicrophone" class="mic-slot">
        <div v-if="holding && recorder.phase.value === 'recording'" class="voice-lock" :style="{ transform: `translateY(${Math.max(drag.y, -lockDistance) / 2}px)` }" aria-hidden="true">
          <AppIcon name="lock" /><AppIcon name="arrow-up" />
        </div>
        <button
          ref="micButton" type="button" class="send mic" :class="{ recording: recording && !locked, locked }"
          :aria-label="locked ? 'Stop and send voice message' : 'Record a voice message'"
          :title="locked ? undefined : 'Hold to record, release to send'"
          :disabled="(disabled || sending) && !recording"
          @pointerdown="micDown" @pointermove="micMove" @pointerup="micUp" @pointercancel="micCancel" @lostpointercapture="micCancel"
          @click="micClick" @keydown="micKey" @contextmenu.prevent
        ><AppIcon :name="locked ? 'stop' : 'mic'" /></button>
      </div>
      <button v-else type="submit" class="send" :disabled="!canSend" aria-label="Send"><AppIcon name="send" /></button>
    </form>
    <p v-if="length > 4000" class="hint">Messages can contain up to 4,000 characters.</p>
    <p v-else-if="problem" class="hint">{{ problem }}</p>
    <p v-else-if="recorder.notice.value && !recording" class="hint" :class="{ info: !recorder.notice.value.error }" :role="recorder.notice.value.error ? 'alert' : 'status'">{{ recorder.notice.value.text }}</p>
  </div>
</template>

<style scoped>
.voice-recording { flex: 1; min-width: 0; min-height: 48px; display: flex; align-items: center; gap: 10px; padding: 0 16px; overflow: hidden; border-radius: 24px; background: var(--md-surface-container-high); color: var(--md-on-surface-variant); font-size: 14px; user-select: none; }
.voice-recording.locked { padding-left: 4px; }
.voice-recording .icon-button { width: 40px; height: 40px; color: var(--md-error); }
.voice-timer { color: var(--md-on-surface); font-variant-numeric: tabular-nums; }
.voice-slide { margin-left: auto; white-space: nowrap; }
.voice-dot { width: 10px; height: 10px; flex: none; border-radius: 999px; background: var(--md-error); animation: voice-pulse 1.2s ease-in-out infinite; }
.mic-slot { position: relative; flex: none; }
.send.mic { touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
.send.recording { background: var(--md-error); color: var(--md-on-error); transform: scale(1.15); }
.voice-lock { position: absolute; bottom: calc(100% + 8px); left: 50%; margin-left: -18px; width: 36px; padding: 8px 0; border-radius: 18px; display: flex; flex-direction: column; align-items: center; background: var(--md-surface-container-high); color: var(--md-on-surface-variant); box-shadow: var(--md-elevation-1); pointer-events: none; }
.voice-lock svg { width: 18px; height: 18px; }
.hint.info { color: var(--md-on-surface-variant); }
@keyframes voice-pulse { 50% { opacity: 0.3; } }
@media (prefers-reduced-motion: reduce) { .voice-dot { animation: none; } .send.recording { transform: none; } }
</style>
