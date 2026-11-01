<script setup lang="ts">
import type { Sticker } from '~/utils/types';

// Create sticker flow (docs/stickers.md#web): choose a photo, prepare a JPEG in the browser,
// cut out the subject on the server, pick an emoji, save. The source JPEG and the preview PNG
// exist only in this component's memory and are released on cancel, close, unmount or account
// change. Every async step checks `attempt`, so a response that arrives after Cancel or
// "Choose another photo" is ignored.
const emit = defineEmits<{ close: []; created: [sticker: Sticker] }>();
const stickers = useStickers();
type Step = 'choose' | 'processing' | 'preview' | 'failed';
const step = ref<Step>('choose');
const processing = ref('Preparing photo…');
const problem = ref<string | null>(null);
const noSubject = ref(false);
const subject = ref('');
const emoji = ref('');
const saving = ref(false);
const preview = shallowRef<{ blob: Blob; url: string } | null>(null);
const picker = ref<HTMLInputElement>();
const now = ref(Date.now());
const retryAt = ref(0);
// The API accepts 2–40 letters, digits, spaces and hyphens for the optional subject.
const subjectPattern = /^[\p{L}\p{N} -]{2,40}$/u;
let source: Blob | null = null;
let attempt = 0;
let controller: AbortController | null = null;
let ticker: ReturnType<typeof setInterval> | undefined;

const subjectProblem = computed(() => subject.value.trim() && !subjectPattern.test(subject.value.trim()) ? 'Use 2–40 letters, for example “dog”.' : null);
const waitSeconds = computed(() => Math.max(0, Math.ceil((retryAt.value - now.value) / 1000)));
const hasSource = ref(false);
const canRetry = computed(() => hasSource.value && waitSeconds.value === 0 && !subjectProblem.value);

function releasePreview() {
  if (preview.value) URL.revokeObjectURL(preview.value.url);
  preview.value = null;
}
function release() {
  attempt++;
  controller?.abort();
  controller = null;
  source = null;
  hasSource.value = false;
  releasePreview();
  clearInterval(ticker);
}
function cancel() {
  release();
  emit('close');
}
function startWait(seconds: number) {
  retryAt.value = Date.now() + seconds * 1000;
  now.value = Date.now();
  clearInterval(ticker);
  ticker = setInterval(() => {
    now.value = Date.now();
    if (now.value >= retryAt.value) clearInterval(ticker);
  }, 500);
}
function chooseAnother() {
  release();
  step.value = 'choose';
  problem.value = null; noSubject.value = false; subject.value = ''; emoji.value = ''; retryAt.value = 0;
}

async function choose(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  release();
  const token = attempt;
  problem.value = null; noSubject.value = false; subject.value = ''; emoji.value = ''; retryAt.value = 0;
  processing.value = 'Preparing photo…';
  step.value = 'processing';
  try {
    const prepared = await stickerSourceJPEG(file);
    if (token !== attempt) return;
    source = prepared;
    hasSource.value = true;
  } catch (failure) {
    if (token !== attempt) return;
    problem.value = errorMessage(failure);
    step.value = 'failed';
    return;
  }
  await cutOut();
}

async function cutOut() {
  if (!source) return;
  const token = ++attempt;
  controller?.abort();
  const mine = controller = new AbortController();
  const name = subject.value.trim();
  releasePreview();
  problem.value = null;
  processing.value = 'Cutting out the subject… This takes a few seconds.';
  step.value = 'processing';
  try {
    const blob = await apiBlob('stickers/cutout', { body: source, query: { subject: name && subjectPattern.test(name) ? name : undefined }, signal: mine.signal });
    if (token !== attempt) return;
    preview.value = { blob, url: URL.createObjectURL(blob) };
    noSubject.value = false;
    step.value = 'preview';
  } catch (failure) {
    if (token !== attempt || isAbort(failure)) return;
    noSubject.value = failure instanceof ApiError && failure.status === 422 && failure.code === 'NO_SUBJECT';
    problem.value = errorMessage(failure);
    if (failure instanceof ApiError && failure.status === 429) startWait(failure.retryAfter ?? 60);
    step.value = 'failed';
  } finally {
    if (controller === mine) controller = null;
  }
}

async function save() {
  const current = preview.value;
  if (!current || !emoji.value || saving.value) return;
  const token = attempt;
  saving.value = true;
  problem.value = null;
  try {
    const sticker = await stickers.create(emoji.value, base64(new Uint8Array(await current.blob.arrayBuffer())));
    if (token !== attempt) return;
    release();
    emit('created', sticker);
  } catch (failure) {
    if (token !== attempt) return;
    problem.value = errorMessage(failure);
    if (failure instanceof ApiError && failure.status === 429) startWait(failure.retryAfter ?? 60);
  } finally { saving.value = false; }
}

watch(() => useSession().user.value?.id, cancel);
onBeforeUnmount(release);
</script>

<template>
  <AppSheet title="Create sticker" wide @close="cancel">
    <input ref="picker" type="file" class="visually-hidden" tabindex="-1" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" @change="choose">

    <div v-if="step === 'choose'" class="sticker-step">
      <p>Pick a photo. Wildcard cuts out the subject and makes it a sticker you can send in any chat.</p>
      <p class="small muted">The photo is sent to Wildcard only to cut it out; nothing is stored until you save the sticker.</p>
      <AppButton icon="image" @click="picker?.click()">Choose photo</AppButton>
    </div>

    <div v-else-if="step === 'processing'" class="sticker-step" role="status">
      <AppLoading :label="processing" />
    </div>

    <div v-else-if="step === 'failed'" class="sticker-step">
      <AppNotice>{{ problem }}</AppNotice>
      <AppTextField v-if="noSubject" v-model="subject" label="What should be cut out?" autocomplete="off" maxlength="40" :error="subjectProblem" supporting="Optional: 2–40 letters, for example “dog” or “guitar”." @keydown.enter.prevent="canRetry && cutOut()" />
      <p v-if="waitSeconds" class="small muted" role="status">You can try again in {{ waitSeconds }} s.</p>
    </div>

    <div v-else class="sticker-step">
      <div class="checkerboard"><img v-if="preview" :src="preview.url" alt="Sticker preview with a transparent background"></div>
      <StickerEmojiPicker v-model="emoji" />
      <AppNotice v-if="problem">{{ problem }}</AppNotice>
      <p v-if="waitSeconds" class="small muted" role="status">You can save again in {{ waitSeconds }} s.</p>
    </div>

    <template #actions>
      <AppButton variant="text" @click="cancel">Cancel</AppButton>
      <template v-if="step === 'failed'">
        <AppButton variant="tonal" @click="chooseAnother">Choose another photo</AppButton>
        <AppButton :disabled="!canRetry" @click="cutOut">Try again</AppButton>
      </template>
      <template v-else-if="step === 'preview'">
        <AppButton variant="tonal" :disabled="saving" @click="chooseAnother">Choose another photo</AppButton>
        <AppButton :loading="saving" :disabled="!emoji || waitSeconds > 0" @click="save">Save</AppButton>
      </template>
    </template>
  </AppSheet>
</template>

<style scoped>
.sticker-step { display: flex; flex-direction: column; gap: var(--space-3); }
.sticker-step > p { margin: 0; }
.checkerboard {
  width: min(256px, 100%); aspect-ratio: 1; margin: 0 auto; border-radius: var(--md-shape-l); overflow: hidden;
  background-color: var(--md-surface-container-lowest);
  background-image: conic-gradient(var(--md-surface-container-highest) 25%, transparent 25% 50%, var(--md-surface-container-highest) 50% 75%, transparent 75%);
  background-size: 16px 16px;
}
.checkerboard img { display: block; width: 100%; height: 100%; object-fit: contain; }
</style>
