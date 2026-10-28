<script setup lang="ts">
// Shared avatar and photo controls for contacts and the account, like ProfileIdentityView.
const props = defineProps<{ name: string; path: string | null; editable?: boolean; busy?: boolean }>();
const emit = defineEmits<{ photo: [photo: Blob | null] }>();
const picker = ref<HTMLInputElement>();
const problem = ref<string | null>(null);
const source = shallowRef<ImageBitmap | null>(null);
const loading = ref(false);
const { user } = useSession();
const route = useRoute();
let selection = 0;

function cancel() {
  selection += 1;
  source.value?.close();
  source.value = null;
  loading.value = false;
}

function confirm(photo: Blob) {
  if (!props.editable || props.busy || !source.value) return;
  cancel();
  emit('photo', photo);
}

watch(() => [user.value?.id, route.fullPath, props.editable, props.busy], cancel, { flush: 'sync' });
onBeforeUnmount(cancel);

async function choose(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  (event.target as HTMLInputElement).value = '';
  if (!file) return;
  if (!props.editable || props.busy) return;
  cancel();
  const current = selection;
  loading.value = true;
  problem.value = null;
  try {
    const bitmap = await photoCropSource(file);
    if (current !== selection) { bitmap.close(); return; }
    source.value = bitmap;
  }
  catch (error) { if (current === selection) problem.value = errorMessage(error); }
  finally { if (current === selection) loading.value = false; }
}
</script>

<template>
  <div class="identity">
    <AppAvatar :name="name" :path="path" :size="104" />
    <div v-if="editable" class="actions">
      <button type="button" class="link-button" :disabled="busy || loading" @click="picker?.click()">{{ loading ? 'Preparing…' : path ? 'Replace photo' : 'Add photo' }}</button>
      <button v-if="path" type="button" class="link-button danger" :disabled="busy || loading" @click="emit('photo', null)">Remove photo</button>
      <input ref="picker" type="file" accept="image/jpeg,image/png,image/webp,image/gif" class="visually-hidden" tabindex="-1" @change="choose">
    </div>
    <p v-if="editable" class="small muted" style="margin: 0">Move and zoom your photo before saving.</p>
    <p v-if="problem" class="small" style="color: var(--danger); margin: 0">{{ problem }}</p>
  </div>
  <PhotoCropDialog v-if="source" :source="source" @cancel="cancel" @save="confirm" />
</template>
