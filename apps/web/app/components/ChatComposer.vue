<script setup lang="ts">
import type { DraftAttachment } from '~/utils/types';
import type { ReplyPreview } from '~/utils/replies';

// Text plus one optional image/PDF attachment, matching the API's 4,000 character limit.
// The parent owns the reply target so it survives navigation with the draft.
const props = defineProps<{ disabled?: boolean; placeholder?: string; reply?: ReplyPreview | null }>();
const draft = defineModel<string>({ required: true });
const emit = defineEmits<{ send: [text: string, attachment: DraftAttachment | null]; typing: []; cancelReply: [] }>();

const attachment = ref<DraftAttachment | null>(null);
const preparing = ref(false);
const problem = ref<string | null>(null);
const textarea = ref<HTMLTextAreaElement>();
const picker = ref<HTMLInputElement>();
const length = computed(() => [...draft.value.trim()].length);
const canSend = computed(() => !props.disabled && !preparing.value && length.value <= 4000 && (length.value > 0 || !!attachment.value));

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
onBeforeUnmount(clearAttachment);
defineExpose({ focus: () => textarea.value?.focus() });
</script>

<template>
  <div class="composer">
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
      <button type="submit" class="send" :disabled="!canSend" aria-label="Send"><AppIcon name="send" /></button>
    </form>
    <p v-if="length > 4000" class="hint">Messages can contain up to 4,000 characters.</p>
    <p v-else-if="problem" class="hint">{{ problem }}</p>
  </div>
</template>
