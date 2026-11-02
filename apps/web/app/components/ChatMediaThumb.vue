<script setup lang="ts">
// A square grid cell for chat details; bytes come from the shared private image cache.
const props = defineProps<{ name: string; path: string }>();
const source = usePrivateImage(() => props.path);
const open = ref(false);
watch(() => useSession().user.value?.id, () => { open.value = false; });
</script>

<template>
  <button type="button" class="media-cell" :disabled="!source" :aria-label="$t('chat.attachment.openImage', { name })" @click="open = true">
    <img v-if="source" :src="source" :alt="name">
    <span v-else class="spinner" />
  </button>
  <ChatImageViewer v-if="open && source" :images="[{ source, name }]" @close="open = false" />
</template>
