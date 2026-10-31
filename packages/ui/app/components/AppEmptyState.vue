<script setup lang="ts">
// Empty or failed content: an optional icon in a tonal circle, a title, a short
// explanation and the actions that resolve it.
defineProps<{ icon?: AppIconName; title?: string; text?: string | null }>();
</script>

<template>
  <div class="empty">
    <span v-if="icon" class="empty-icon" aria-hidden="true"><AppIcon :name="icon" /></span>
    <h2 v-if="title">{{ title }}</h2>
    <p v-if="text">{{ text }}</p>
    <slot />
    <div v-if="$slots.actions" class="empty-actions"><slot name="actions" /></div>
  </div>
</template>
