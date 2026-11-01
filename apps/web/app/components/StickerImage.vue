<script setup lang="ts">
// A sticker picture from the private image cache (docs/stickers.md#web): the path carries the
// sticker digest, so the cached blob URL is per account, sticker and version.
const props = defineProps<{ path: string | null; emoji: string }>();
const source = usePrivateImage(() => props.path);
</script>

<template>
  <img v-if="source" class="sticker-image" :src="source" :alt="`Sticker ${emoji}`" draggable="false">
  <span v-else class="sticker-image sticker-loading"><span class="spinner" aria-hidden="true" /></span>
</template>

<style scoped>
.sticker-image { display: block; width: 100%; height: 100%; object-fit: contain; }
.sticker-loading { display: flex; align-items: center; justify-content: center; }
</style>
