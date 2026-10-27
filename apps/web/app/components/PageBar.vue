<script setup lang="ts">
// Navigation bar for secondary pages. The back link is shown on narrow screens,
// or always when `back` points somewhere other than the chat list.
const props = defineProps<{ title?: string; back?: string; alwaysBack?: boolean }>();
</script>

<template>
  <header class="bar">
    <NuxtLink :to="props.back ?? '/'" class="icon-button" :class="{ back: !alwaysBack }" aria-label="Back"><AppIcon name="back" /></NuxtLink>
    <slot name="title"><h1 class="title">{{ title }}</h1></slot>
    <slot />
  </header>
</template>
