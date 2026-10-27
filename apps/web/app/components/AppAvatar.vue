<script setup lang="ts">
const props = withDefaults(defineProps<{ name: string; path?: string | null; size?: number }>(), { path: null, size: 44 });
const url = usePrivateImage(() => props.path);
</script>

<template>
  <span class="avatar" :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.38)}px` }" aria-hidden="true">
    <img v-if="url" :src="url" alt="">
    <template v-else>{{ initials(name) }}</template>
  </span>
</template>
