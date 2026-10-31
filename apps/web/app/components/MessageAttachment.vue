<script setup lang="ts">
import type { Attachment } from '~/utils/types';

// Images load through the private image cache; files open from a temporary blob URL.
// A contact-generated album (2–3 images, docs/generated-images.md#albums) renders as
// a grid; each image is addressed with `image=N` and the viewer pages through them.
const props = defineProps<{ attachment: Attachment; attachments?: Attachment[] | null; path: string | null; localUrl?: string | null }>();
const isImage = computed(() => props.attachment.mimeType.startsWith('image/'));
const album = computed(() => (props.attachments?.length ?? 0) > 1 ? props.attachments!.slice(0, 3) : null);
const remote = usePrivateImage(() => (isImage.value && !album.value && !props.localUrl ? props.path : null));
const source = computed(() => props.localUrl ?? remote.value);
// The first album image keeps the message's base path, so its cache key matches a
// single image; later images add their index.
const albumPath = (index: number) => !props.path || !album.value || index >= album.value.length ? null
  : albumImagePath(props.path, index);
const albumSources = [0, 1, 2].map(index => usePrivateImage(() => albumPath(index)));
const opening = ref(false);
const viewing = ref<number | null>(null);
const viewerImages = computed(() => album.value
  ? album.value.map((item, index) => ({ source: albumSources[index]!.value, name: item.name }))
  : [{ source: source.value, name: props.attachment.name }]);

watch(() => [source.value, props.path], () => { viewing.value = null; });
watch(() => useSession().user.value?.id, () => { viewing.value = null; });

async function open() {
  if (isImage.value) {
    if (source.value) viewing.value = 0;
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
  <div v-if="album" class="chat-album" :class="`count-${album.length}`" role="group" :aria-label="`${album.length} photos`">
    <button
      v-for="(item, index) in album" :key="index" type="button" class="link-button chat-album-item"
      :disabled="!albumSources[index]!.value" :aria-label="`Open photo ${index + 1} of ${album.length} full screen: ${item.name}`" @click.stop="viewing = index"
    >
      <img v-if="albumSources[index]!.value" :src="albumSources[index]!.value!" :alt="item.name">
      <span v-else class="center"><span class="spinner" /></span>
    </button>
  </div>
  <button v-else-if="isImage" type="button" class="link-button chat-image-thumbnail" :disabled="!source" :aria-label="`Open image full screen: ${attachment.name}`" @click.stop="open">
    <img v-if="source" class="chat-image" :src="source" :alt="attachment.name">
    <span v-else class="center"><span class="spinner" /></span>
  </button>
  <button v-else type="button" class="file link-button" @click="open">
    <AppIcon name="file" />
    <span><span class="name">{{ attachment.name }}</span><br><span class="small muted">PDF · {{ fileSize(attachment.size) }}</span></span>
  </button>
  <ChatImageViewer v-if="viewing !== null && viewerImages[viewing]?.source" :images="viewerImages" :start="viewing" @close="viewing = null" />
</template>

<style scoped>
/* The layer's .link-button doesn't wrap; long file names must. */
.file { white-space: normal; }
</style>
