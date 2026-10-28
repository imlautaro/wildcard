<script setup lang="ts">
const props = defineProps<{ source: ImageBitmap }>();
const emit = defineEmits<{ cancel: []; save: [photo: Blob] }>();
const dialog = ref<HTMLDialogElement>();
const canvas = ref<HTMLCanvasElement>();
const zoom = ref(1);
const center = reactive({ x: props.source.width / 2, y: props.source.height / 2 });
const saving = ref(false);
const problem = ref<string | null>(null);
const titleID = useId();
const helpID = useId();
const zoomID = useId();
const pointers = new Map<number, { x: number; y: number }>();
let active = true;
const side = computed(() => Math.min(props.source.width, props.source.height) / zoom.value);

function draw() {
  const half = side.value / 2;
  center.x = Math.max(half, Math.min(props.source.width - half, center.x));
  center.y = Math.max(half, Math.min(props.source.height - half, center.y));
  const context = canvas.value?.getContext('2d');
  if (!context) { problem.value = 'Photo editing is unavailable in this browser.'; return; }
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 640, 640);
  context.drawImage(props.source, center.x - half, center.y - half, side.value, side.value, 0, 0, 640, 640);
}

function pointerDown(event: PointerEvent) {
  if (saving.value || (event.pointerType === 'mouse' && event.button !== 0)) return;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
}

function pointerMove(event: PointerEvent) {
  const previous = pointers.get(event.pointerId);
  if (!previous || saving.value) return;
  const others = [...pointers.entries()].filter(([id]) => id !== event.pointerId);
  const other = others[0]?.[1];
  if (other) {
    const before = Math.hypot(previous.x - other.x, previous.y - other.y);
    const after = Math.hypot(event.clientX - other.x, event.clientY - other.y);
    if (before > 0 && after > 0) zoom.value = Math.max(1, Math.min(4, zoom.value * after / before));
  } else {
    const scale = side.value / (event.currentTarget as HTMLElement).getBoundingClientRect().width;
    center.x -= (event.clientX - previous.x) * scale;
    center.y -= (event.clientY - previous.y) * scale;
  }
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  draw();
}

function keyMove(event: KeyboardEvent) {
  const directions: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
  };
  const direction = directions[event.key];
  if (!direction) return;
  event.preventDefault();
  if (saving.value) return;
  const step = side.value * (event.shiftKey ? 0.1 : 0.02);
  center.x -= direction[0] * step;
  center.y -= direction[1] * step;
  draw();
}

async function save() {
  if (saving.value) return;
  saving.value = true;
  problem.value = null;
  try {
    const photo = await croppedJPEG(props.source, center.x - side.value / 2, center.y - side.value / 2, side.value);
    if (active) emit('save', photo);
  } catch (error) { if (active) problem.value = errorMessage(error); }
  finally { saving.value = false; }
}

watch(zoom, draw);
onMounted(() => { dialog.value?.showModal(); draw(); });
onBeforeUnmount(() => { active = false; pointers.clear(); dialog.value?.close(); });
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="photo-crop-dialog" :aria-labelledby="titleID" :aria-describedby="helpID" @cancel.prevent="emit('cancel')">
      <div class="crop-content">
        <h2 :id="titleID">Crop Photo</h2>
        <p :id="helpID" class="small muted">Drag to reposition and pinch to zoom. You can also use the arrow keys and zoom slider.</p>
        <div class="crop-viewport" tabindex="0" role="group" aria-label="Photo crop position" :aria-disabled="saving"
          @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointers.delete($event.pointerId)"
          @pointercancel="pointers.delete($event.pointerId)" @lostpointercapture="pointers.delete($event.pointerId)" @keydown="keyMove">
          <canvas ref="canvas" width="640" height="640" aria-label="Selected photo crop preview" />
          <div class="crop-guide" aria-hidden="true" />
        </div>
        <label :for="zoomID" class="small">Photo zoom</label>
        <input :id="zoomID" v-model.number="zoom" type="range" min="1" max="4" step="0.01" :disabled="saving" :aria-valuetext="`${Math.round(zoom * 100)}%`">
        <p v-if="problem" class="notice" role="alert">{{ problem }}</p>
        <div class="crop-actions">
          <button type="button" class="button secondary" autofocus @click="emit('cancel')">Cancel</button>
          <button type="button" class="button" :disabled="saving" @click="save">{{ saving ? 'Preparing…' : 'Use Photo' }}</button>
        </div>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.photo-crop-dialog { width: min(420px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); overflow-y: auto; padding: 24px; border: 1px solid var(--separator); border-radius: 20px; background: var(--surface); color: var(--text); }
.photo-crop-dialog::backdrop { background: rgb(0 0 0 / 60%); }
.crop-content { display: flex; flex-direction: column; gap: 16px; }
.crop-content h2 { font-size: 20px; }
.crop-content p { margin: 0; }
.crop-viewport { position: relative; width: 100%; aspect-ratio: 1; overflow: hidden; cursor: grab; touch-action: none; user-select: none; }
.crop-viewport:active { cursor: grabbing; }
.crop-viewport canvas { display: block; width: 100%; height: 100%; }
.crop-guide { position: absolute; inset: 1px; border: 2px solid rgb(255 255 255 / 90%); border-radius: 50%; box-shadow: 0 0 0 100px rgb(0 0 0 / 45%); pointer-events: none; }
.crop-content input[type='range'] { width: 100%; margin: 0; accent-color: var(--accent); }
.crop-actions { display: flex; justify-content: flex-end; gap: 12px; }
</style>
