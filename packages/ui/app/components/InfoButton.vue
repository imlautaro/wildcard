<script setup lang="ts">
// Explains a setting on demand instead of a footer paragraph, like InfoButton on iOS.
defineProps<{ label: string; text: string }>();
const open = ref(false);
</script>

<template>
  <AppIconButton icon="info" class="info-button" :label="`About ${label}`" :tooltip="false" @click.prevent.stop="open = true" />
  <AppSheet v-if="open" :title="label" @close="open = false"><p class="sheet-text">{{ text }}</p></AppSheet>
</template>
