<script setup lang="ts">
import type { Attachment } from '~/utils/types';

// Images load through the private image cache; files open from a temporary blob URL.
const props = defineProps<{ attachment: Attachment; path: string | null; localUrl?: string | null }>();
const isImage = computed(() => props.attachment.mimeType.startsWith('image/'));
const remote = usePrivateImage(() => (isImage.value && !props.localUrl ? props.path : null));
const source = computed(() => props.localUrl ?? remote.value);
const opening = ref(false);
const showImage = ref(false);

watch(source, () => { showImage.value = false; });
watch(() => useSession().user.value?.id, () => { showImage.value = false; });

async function open() {
  if (isImage.value) {
    if (source.value) showImage.value = true;
    return;
  }
  if (!props.path || opening.value) return;
  opening.value = true;
  const popup = window.open('', '_blank');
  try {
    const url = URL.createObjectURL(await apiBlob(props.path));
    if (popup) popup.location.href = url;
    else window.location.assign(url);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    popup?.close();
  } finally {
    opening.value = false;
  }
}
</script>

<template>
  <button v-if="isImage" type="button" class="link-button chat-image-thumbnail" :disabled="!source" :aria-label="`Open image full screen: ${attachment.name}`" @click.stop="open">
    <img v-if="source" class="chat-image" :src="source" :alt="attachment.name">
    <span v-else class="center"><span class="spinner" /></span>
  </button>
  <button v-else type="button" class="file link-button" @click="open">
    <AppIcon name="file" />
    <span><span class="name">{{ attachment.name }}</span><br><span class="small muted">PDF · {{ fileSize(attachment.size) }}</span></span>
  </button>
  <ChatImageViewer v-if="showImage && source" :source="source" :name="attachment.name" @close="showImage = false" />
</template>

<style scoped>
/* The layer's .link-button doesn't wrap; long file names must. */
.file { white-space: normal; }
</style>
