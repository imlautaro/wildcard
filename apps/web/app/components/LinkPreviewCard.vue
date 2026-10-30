<script setup lang="ts">
// One card per bubble for its previewed link; nothing renders until a ready
// preview exists. The image is the API's copy, never the linked site's URL.
const props = defineProps<{ url: string | null }>();
const preview = useLinkPreview(() => props.url);
const ready = computed(() => preview.value?.status === 'ready' && preview.value.title ? preview.value : null);
const image = usePrivateImage(() => ready.value?.imageVersion
  ? `link-previews/${ready.value.hash}/image?v=${ready.value.imageVersion}` : null);
</script>

<template>
  <a v-if="ready" class="link-card" :href="ready.url" target="_blank" rel="noreferrer noopener" @click.stop>
    <img v-if="image" class="link-card-image" :src="image" alt="" loading="lazy">
    <span class="link-card-text">
      <span class="link-card-site">{{ ready.siteName }}</span>
      <span class="link-card-title">{{ ready.title }}</span>
      <span v-if="ready.description" class="link-card-description">{{ ready.description }}</span>
    </span>
  </a>
</template>

<style scoped>
.link-card { display: flex; flex-direction: column; margin: 6px 0 4px; border-radius: 12px; overflow: hidden; color: inherit; text-decoration: none;
  background: color-mix(in srgb, currentColor 7%, transparent); max-width: 320px; }
.link-card-image { width: 100%; max-height: 168px; object-fit: cover; display: block; }
.link-card-text { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; min-width: 0; }
.link-card-site { font-size: 0.75rem; opacity: 0.7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.link-card-title { font-weight: 600; font-size: 0.875rem; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.link-card-description { font-size: 0.8125rem; opacity: 0.8; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
</style>
