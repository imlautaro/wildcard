<script setup lang="ts">
// Navigation bar for secondary pages. The back link is shown on narrow screens,
// or always when `back` points somewhere other than the chat list.
const props = defineProps<{ title?: string; back?: string; alwaysBack?: boolean }>();
</script>

<template>
  <AppTopBar :title="title">
    <template #leading>
      <AppIconButton :to="props.back ?? '/'" icon="back" label="Back" :tooltip="false" :class="{ back: !alwaysBack }" />
    </template>
    <template v-if="$slots.title" #title><slot name="title" /></template>
    <slot />
  </AppTopBar>
</template>
