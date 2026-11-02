<script setup lang="ts">
// `src` shows a local image (an unsent upload) instead of the private `path`;
// `icon` replaces the initials when there is no image.
const props = withDefaults(defineProps<{ name: string; path?: string | null; src?: string | null; icon?: AppIconName; size?: number }>(), { path: null, src: null, icon: undefined, size: 44 });
const url = usePrivateImage(() => props.path);
</script>

<template>
  <span class="avatar" :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.38)}px` }" aria-hidden="true">
    <img v-if="src || url" :src="src || url!" alt="">
    <AppIcon v-else-if="icon" :name="icon" />
    <template v-else>{{ initials(name) }}</template>
  </span>
</template>
