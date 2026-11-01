<script setup lang="ts">
// Solar icons rendered as inline SVG from the client bundle; glyphs fill
// with currentColor. `filled` selects the filled variant for active states.
const props = defineProps<{ name: AppIconName; filled?: boolean }>();
const icon = computed(() => appIcons[props.name][props.filled ? 1 : 0]);
</script>

<template>
  <Icon :name="icon" class="app-icon" />
</template>
