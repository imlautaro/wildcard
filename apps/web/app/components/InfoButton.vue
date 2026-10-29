<script setup lang="ts">
// Explains a setting on demand instead of a footer paragraph, like InfoButton on iOS.
defineProps<{ label: string; text: string }>();
const open = ref(false);
</script>

<template>
  <button type="button" class="icon-button info-button" :aria-label="`About ${label}`" @click.prevent.stop="open = true"><AppIcon name="info" /></button>
  <AppSheet v-if="open" :title="label" @close="open = false"><p class="sheet-text">{{ text }}</p></AppSheet>
</template>
