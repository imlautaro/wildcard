<script setup lang="ts">
import type { DraftAttachment, DraftVoice, HomePostReference, Sticker } from '~/utils/types';
import type { ReplyPreview } from '~/utils/replies';

// Text plus optional image/PDF attachments (picked, pasted, or dropped anywhere on the chat
// page, e.g. from Finder), sent as
// one message each with the text on the first, matching the API's 4,000 character limit.
// The parent owns the reply target so it survives navigation with the draft.
// With `voiceKey` (the conversation identity), an empty draft shows a microphone for
// voice messages (docs/voice.md): hold to record and release to send, slide left to
// cancel, slide up to lock. With a mouse, one click starts a locked recording and a
// second click sends it (no hold needed). Changing the key discards an active recording.
// With `stickers` (private chats and groups), a sticker button left of send opens the sticker
// picker (docs/stickers.md#web); `contactID` adds the contact's stickers tab (private chats).
const props = defineProps<{ disabled?: boolean; sending?: boolean; placeholder?: string; reply?: ReplyPreview | null; post?: HomePostReference | null; voiceKey?: string | null; stickers?: { contactID?: string | null; contactName?: string | null } | null }>();
const draft = defineModel<string>({ required: true });
const emit = defineEmits<{ send: [text: string, attachments: DraftAttachment[]]; voice: [clip: DraftVoice]; typing: []; cancelReply: []; cancelPost: []; sticker: [sticker: Sticker] }>();

const maxAttachments = 10;
const attachments = ref<DraftAttachment[]>([]);
const preparing = ref(false);
const problem = ref<string | null>(null);
const textarea = ref<HTMLTextAreaElement>();
const picker = ref<HTMLInputElement>();
const micButton = ref<HTMLButtonElement>();
const length = computed(() => [...draft.value.trim()].length);
const canSend = computed(() => !props.disabled && !props.sending && !preparing.value && length.value <= 4000 && (length.value > 0 || attachments.value.length > 0));
// Mouse users click to start and click again to send; touch and pen keep hold-to-record.
const mouseMode = ref(false);
const recorder = useVoiceRecorder((clip) => {
  if (props.disabled || props.sending) return;
  emit('voice', clip);
}, () => (mouseMode.value ? mouseRecordingHint : shortRecordingHint));
const supportsVoice = ref(false);
onMounted(() => { supportsVoice.value = voiceRecordingSupported(); });
const recording = computed(() => recorder.phase.value !== 'idle');
// The microphone replaces the send button while there is nothing to send.
const showsMicrophone = computed(() => recording.value
  || (supportsVoice.value && !!props.voiceKey && !length.value && !attachments.value.length && !preparing.value));
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
  // A mouse press only records the device; the click that follows starts a locked recording.
  mouseMode.value = event.pointerType === 'mouse';
  if (mouseMode.value) return;
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
function micKey() { ignoreClick = false; mouseMode.value = true; }
// Mouse clicks and keyboard or assistive technology activation (Space/Enter) start a locked
// recording; in the locked state the same button is Stop, which sends.
function micClick(event: MouseEvent) {
  if (ignoreClick) { ignoreClick = false; return; }
  if (locked.value) { sendRecording(); return; }
  if ((event.detail !== 0 && !mouseMode.value) || props.disabled || props.sending || recording.value) return;
  locked.value = true;
  void recorder.start();
}
watch(recorder.phase, (phase) => {
  // Auto-stop at one minute, failures and hidden tabs end the gesture too.
  if (phase === 'idle') { endHold(); locked.value = false; }
});
watch(() => props.voiceKey, () => discardRecording());

// Sticker picker and the Create sticker dialog; the picker returns after creating or cancelling.
const stickerButton = ref<{ $el: HTMLElement }>();
const stickerPanel = ref<'picker' | 'create' | null>(null);
function closeStickers(focus: 'button' | 'message' = 'button') {
  stickerPanel.value = null;
  void nextTick(() => { if (focus === 'message') textarea.value?.focus(); else stickerButton.value?.$el.focus(); });
}
function pickSticker(sticker: Sticker) {
  if (props.disabled || props.sending) return;
  closeStickers('message');
  emit('sticker', sticker);
}
watch(() => props.disabled, (value) => { if (value) stickerPanel.value = null; });

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

async function addFiles(files: File[]) {
  if (!files.length) return;
  preparing.value = true;
  problem.value = null;
  try {
    for (const file of files) {
      if (attachments.value.length >= maxAttachments) { problem.value = `Attach up to ${maxAttachments} files per message.`; break; }
      try {
        attachments.value.push(await draftAttachment(file));
      } catch (error) {
        problem.value = errorMessage(error);
      }
    }
  } finally {
    preparing.value = false;
  }
}
async function choose(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = [...input.files ?? []];
  input.value = '';
  await addFiles(files);
}
// Pasted images (screenshots, copied images) and files become attachments. Plain text
// pastes, including rich content that also carries text, keep the browser's behavior.
function onPaste(event: ClipboardEvent) {
  const data = event.clipboardData;
  if (!data || props.disabled || data.types.includes('text/plain')) return;
  const files = [...data.files];
  if (!files.length) return;
  event.preventDefault();
  void addFiles(files.map((file) => file.name ? file : new File([file], `pasted-image.${file.type.split('/')[1] ?? 'png'}`, { type: file.type })));
}
// Files dragged from the desktop can be dropped anywhere while the composer is mounted (the
// chat page). Every file drop is caught so the browser never opens the file in place of
// the chat; it attaches only when the paperclip would (not while disabled, preparing,
// recording, or behind an open dialog such as the sticker picker or image viewer).
const dropDepth = ref(0);
const dropActive = computed(() => dropDepth.value > 0);
const carriesFiles = (event: DragEvent) => !!event.dataTransfer && [...event.dataTransfer.types].includes('Files');
const acceptsDrop = () => !props.disabled && !preparing.value && !recording.value && !document.querySelector('dialog[open]');
function onDragEnter(event: DragEvent) {
  if (!carriesFiles(event)) return;
  event.preventDefault();
  if (acceptsDrop()) dropDepth.value += 1;
}
function onDragOver(event: DragEvent) {
  if (!carriesFiles(event)) return;
  event.preventDefault();
  const accepts = acceptsDrop();
  event.dataTransfer!.dropEffect = accepts ? 'copy' : 'none';
  if (!accepts) dropDepth.value = 0;
  else if (!dropDepth.value) dropDepth.value = 1;
}
function onDragLeave(event: DragEvent) {
  if (!carriesFiles(event) || !dropDepth.value) return;
  // Leaving the window resets; Safari reports a null relatedTarget for every leave, so
  // also require the pointer to be at or past the viewport edge. dragover restores a miss.
  const outside = event.clientX <= 0 || event.clientY <= 0 || event.clientX >= innerWidth || event.clientY >= innerHeight;
  dropDepth.value = !event.relatedTarget && outside ? 0 : Math.max(0, dropDepth.value - 1);
}
function onDrop(event: DragEvent) {
  if (!carriesFiles(event)) return;
  event.preventDefault();
  dropDepth.value = 0;
  if (!acceptsDrop()) return;
  void addFiles([...event.dataTransfer!.files]);
  textarea.value?.focus();
}
const resetDrop = () => { dropDepth.value = 0; };
const dropListeners = [['dragenter', onDragEnter], ['dragover', onDragOver], ['dragleave', onDragLeave], ['drop', onDrop], ['dragend', resetDrop]] as const;
function removeAttachment(item: DraftAttachment) {
  if (item.previewURL) URL.revokeObjectURL(item.previewURL);
  attachments.value = attachments.value.filter((candidate) => candidate !== item);
}
function clearAttachments() {
  for (const item of attachments.value) if (item.previewURL) URL.revokeObjectURL(item.previewURL);
  attachments.value = [];
}
function submit() {
  if (recording.value) return;
  if (!canSend.value) return;
  // Ownership of the preview URL moves to the pending send.
  emit('send', draft.value, attachments.value);
  attachments.value = [];
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
onMounted(() => {
  document.addEventListener('pointerdown', dismissKeyboardOutside, { passive: true });
  for (const [type, listener] of dropListeners) document.addEventListener(type, listener as EventListener);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', dismissKeyboardOutside);
  for (const [type, listener] of dropListeners) document.removeEventListener(type, listener as EventListener);
  clearAttachments();
});
defineExpose({ focus: () => textarea.value?.focus() });
</script>

<template>
  <div class="composer">
    <form @submit.prevent="submit">
      <div v-if="recording" class="voice-recording" :class="{ locked }" role="status">
        <AppIconButton v-if="locked" icon="delete" label="Delete recording" danger @click="discardRecording" />
        <span class="voice-dot" aria-hidden="true" />
        <span class="voice-timer">{{ recorder.phase.value === 'requesting' ? 'Waiting for the microphone…' : recorder.phase.value === 'processing' ? 'Sending…' : clock(recorder.elapsedMs.value) }}</span>
        <span v-if="recorder.phase.value === 'processing'" />
        <span v-else-if="!locked" class="voice-slide" :style="{ transform: `translateX(${drag.x}px)`, opacity: 1 + drag.x / cancelDistance }">‹ Slide to cancel</span>
        <span v-else class="voice-slide">Recording</span>
      </div>
      <AppIconButton v-else icon="attach" label="Attach images or PDFs" size="large" :disabled="disabled || preparing" @click="picker?.click()" />
      <input ref="picker" type="file" multiple class="visually-hidden" :accept="attachmentTypes.join(',')" tabindex="-1" @change="choose">
      <div v-show="!recording" class="input">
        <div v-if="post" class="draft-reply">
          <MessagePostReference :post="post" />
          <AppIconButton icon="close" label="Don’t reply to this post" size="small" :disabled="disabled" @click="emit('cancelPost')" />
        </div>
        <div v-if="reply" class="draft-reply">
          <MessageReplyQuote :preview="reply" />
          <AppIconButton icon="close" label="Cancel reply" size="small" :disabled="disabled" @click="emit('cancelReply')" />
        </div>
        <div v-for="item in attachments" :key="item.previewURL ?? item.name + item.size" class="draft-attachment">
          <img v-if="item.previewURL" :src="item.previewURL" alt="">
          <AppIcon v-else name="file" class="draft-file" />
          <span class="name">{{ item.name }} · {{ fileSize(item.size) }}</span>
          <AppIconButton icon="close" :label="`Remove ${item.name}`" size="small" @click="removeAttachment(item)" />
        </div>
        <div v-if="preparing" class="draft-attachment muted"><span class="spinner" /> Preparing attachment…</div>
        <textarea
          ref="textarea" v-model="draft" rows="1" :placeholder="placeholder ?? 'Message'" aria-label="Message"
          @keydown="onKey" @input="emit('typing')" @paste="onPaste"
        />
      </div>
      <AppIconButton
        v-if="stickers && !recording" ref="stickerButton" icon="sticker" label="Stickers" size="large"
        :disabled="disabled || sending" aria-haspopup="dialog" @click="stickerPanel = 'picker'"
      />
      <div v-if="showsMicrophone" class="mic-slot">
        <div v-if="holding && recorder.phase.value === 'recording'" class="voice-lock" :style="{ transform: `translateY(${Math.max(drag.y, -lockDistance) / 2}px)` }" aria-hidden="true">
          <AppIcon name="lock" /><AppIcon name="arrow-up" />
        </div>
        <button
          ref="micButton" type="button" class="send mic" data-ripple :class="{ recording: recording && !locked, locked }"
          :aria-label="locked ? 'Stop and send voice message' : 'Record a voice message'"
          :title="locked ? undefined : mouseMode ? 'Click to record' : 'Hold to record, release to send'"
          :disabled="(disabled || sending) && !recording"
          @pointerdown="micDown" @pointermove="micMove" @pointerup="micUp" @pointercancel="micCancel" @lostpointercapture="micCancel"
          @click="micClick" @keydown="micKey" @contextmenu.prevent
        ><AppIcon :name="locked ? 'stop' : 'mic'" /></button>
      </div>
      <button v-else type="submit" class="send" data-ripple :disabled="!canSend" aria-label="Send"><AppIcon name="send" /></button>
    </form>
    <StickerPicker
      v-if="stickers && stickerPanel === 'picker'" :contact-i-d="stickers.contactID" :contact-name="stickers.contactName"
      @close="closeStickers()" @pick="pickSticker" @create="stickerPanel = 'create'"
    />
    <CreateStickerDialog v-if="stickers && stickerPanel === 'create'" @close="stickerPanel = 'picker'" @created="stickerPanel = 'picker'" />
    <Teleport v-if="dropActive" to="body">
      <div class="drop-overlay" aria-hidden="true">
        <div class="drop-target">
          <AppIcon name="attach" />
          <strong>Drop to attach</strong>
          <span>Images or PDFs, up to 5 MB each</span>
        </div>
      </div>
    </Teleport>
    <p v-if="length > 4000" class="hint">Messages can contain up to 4,000 characters.</p>
    <p v-else-if="problem" class="hint">{{ problem }}</p>
    <p v-else-if="recorder.notice.value && !recording" class="hint" :class="{ info: !recorder.notice.value.error }" :role="recorder.notice.value.error ? 'alert' : 'status'">{{ recorder.notice.value.text }}</p>
  </div>
</template>

<style scoped>
.voice-recording {
  flex: 1; min-width: 0; min-height: 48px; display: flex; align-items: center; gap: 10px; padding: 0 var(--space-4); overflow: hidden;
  border-radius: var(--md-shape-full); background: var(--md-surface-container-high); color: var(--md-on-surface-variant);
  font: var(--type-body-medium); user-select: none;
}
.voice-recording.locked { padding-left: var(--space-1); }
.voice-timer { color: var(--md-on-surface); font-variant-numeric: tabular-nums; }
.voice-slide { margin-left: auto; white-space: nowrap; }
.voice-dot { width: 10px; height: 10px; flex: none; border-radius: var(--md-shape-full); background: var(--md-error); animation: voice-pulse 1.2s ease-in-out infinite; }
.draft-file { width: 28px; height: 28px; flex: none; color: var(--md-primary); }
.mic-slot { position: relative; flex: none; }
.send.mic { touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
.send.recording { background: var(--md-error); color: var(--md-on-error); transform: scale(1.15); }
.voice-lock {
  position: absolute; bottom: calc(100% + var(--space-2)); left: 50%; margin-left: -18px; width: 36px; padding: var(--space-2) 0;
  border-radius: var(--md-shape-full); display: flex; flex-direction: column; align-items: center; background: var(--md-surface-container-high);
  color: var(--md-on-surface-variant); box-shadow: var(--md-elevation-1); pointer-events: none;
}
.voice-lock svg { width: 18px; height: 18px; }
.hint.info { color: var(--md-on-surface-variant); }
/* pointer-events: none keeps drag events on the page underneath, so enter/leave counting stays stable. */
.drop-overlay {
  position: fixed; inset: 0; z-index: 1000; padding: var(--space-4); pointer-events: none;
  background: color-mix(in srgb, var(--md-surface) 80%, transparent);
}
.drop-target {
  height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-2);
  border: 2px dashed var(--md-primary); border-radius: var(--md-shape-l);
  color: var(--md-on-surface-variant); font: var(--type-body-medium); text-align: center;
}
.drop-target strong { color: var(--md-on-surface); font: var(--type-title-medium); }
.drop-target svg { width: 40px; height: 40px; color: var(--md-primary); }
@keyframes voice-pulse { 50% { opacity: 0.3; } }
@media (prefers-reduced-motion: reduce) { .voice-dot { animation: none; } .send.recording { transform: none; } }
</style>
