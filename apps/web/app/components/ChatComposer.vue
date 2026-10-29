<script setup lang="ts">
import type { DraftAttachment } from '~/utils/types';
import type { ReplyPreview } from '~/utils/replies';

// Text plus one optional image/PDF attachment, matching the API's 4,000 character limit.
// The parent owns the reply target so it survives navigation with the draft.
// With `transcriptionPath`, an empty draft shows a microphone for voice dictation, as on iOS.
const props = defineProps<{ disabled?: boolean; sending?: boolean; placeholder?: string; reply?: ReplyPreview | null; transcriptionPath?: string | null }>();
const draft = defineModel<string>({ required: true });
const emit = defineEmits<{ send: [text: string, attachment: DraftAttachment | null]; typing: []; cancelReply: [] }>();

const attachment = ref<DraftAttachment | null>(null);
const preparing = ref(false);
const problem = ref<string | null>(null);
const textarea = ref<HTMLTextAreaElement>();
const picker = ref<HTMLInputElement>();
const length = computed(() => [...draft.value.trim()].length);
const canSend = computed(() => !props.disabled && !props.sending && !preparing.value && length.value <= 4000 && (length.value > 0 || !!attachment.value));
const voice = useVoiceDictation(() => props.transcriptionPath, (text) => {
  draft.value = draft.value ? `${draft.value} ${text}` : text;
  nextTick(() => textarea.value?.focus());
});
const supportsVoice = ref(false);
onMounted(() => { supportsVoice.value = dictationSupported(); });
// The microphone replaces the send button while there is nothing to send.
const showsMicrophone = computed(() => supportsVoice.value && !!props.transcriptionPath && !length.value && !attachment.value && !preparing.value);
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

function resize() {
  const element = textarea.value;
  if (!element) return;
  element.style.height = 'auto';
  element.style.height = `${element.scrollHeight}px`;
}
watch(draft, () => nextTick(resize));

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
    <div v-if="voice.phase.value === 'recording'" class="voice-status" role="status">
      <span class="voice-dot" />Recording {{ clock(voice.elapsed.value) }} / 1:00
      <button type="button" class="link-button" @click="voice.cancel()">Cancel</button>
    </div>
    <div v-else-if="voice.phase.value === 'transcribing' || voice.phase.value === 'requesting'" class="voice-status" role="status">
      <span class="spinner" />{{ voice.phase.value === 'requesting' ? 'Waiting for the microphone…' : 'Transcribing…' }}
      <button type="button" class="link-button" @click="voice.cancel()">Cancel</button>
    </div>
    <div v-else-if="voice.error.value" class="voice-status error" role="alert">
      <span>{{ voice.error.value }}</span>
      <template v-if="voice.hasRecording.value">
        <button type="button" class="link-button" @click="voice.transcribe()">Retry transcription</button>
        <button type="button" class="link-button danger" @click="voice.cancel()">Discard recording</button>
      </template>
    </div>
    <form @submit.prevent="submit">
      <button type="button" class="icon-button" aria-label="Attach an image or PDF" :disabled="disabled || preparing" @click="picker?.click()">
        <AppIcon name="attach" />
      </button>
      <input ref="picker" type="file" class="visually-hidden" :accept="attachmentTypes.join(',')" tabindex="-1" @change="choose">
      <div class="input">
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
      <button v-if="voice.phase.value === 'recording'" type="button" class="send recording" aria-label="Stop recording and transcribe" @click="voice.stop()"><AppIcon name="stop" /></button>
      <button v-else-if="showsMicrophone" type="button" class="send" aria-label="Record a voice message"
        :disabled="disabled || voice.phase.value === 'transcribing' || voice.phase.value === 'requesting'" @click="voice.start()"><AppIcon name="mic" /></button>
      <button v-else type="submit" class="send" :disabled="!canSend" aria-label="Send"><AppIcon name="send" /></button>
    </form>
    <p v-if="length > 4000" class="hint">Messages can contain up to 4,000 characters.</p>
    <p v-else-if="problem" class="hint">{{ problem }}</p>
  </div>
</template>

<style scoped>
.voice-status { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 0 8px 8px; font-size: 13px; color: var(--md-on-surface-variant); }
.voice-status .link-button { margin-left: auto; }
.voice-status .link-button + .link-button { margin-left: 0; }
.voice-status.error { color: var(--md-error); }
.voice-status .danger { color: var(--md-error); }
.voice-dot { width: 8px; height: 8px; border-radius: 999px; background: var(--md-error); animation: voice-pulse 1.2s ease-in-out infinite; }
.send.recording { background: var(--md-error); color: var(--md-on-error); }
@keyframes voice-pulse { 50% { opacity: 0.3; } }
@media (prefers-reduced-motion: reduce) { .voice-dot { animation: none; } }
</style>
