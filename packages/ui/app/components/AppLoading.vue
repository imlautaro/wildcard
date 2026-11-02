<script setup lang="ts">
// A centered spinner with a label, for the first load of a list or page.
// `fill` gives it the generous padding of a page placeholder.
defineProps<{ label?: string; fill?: boolean }>();
const strings = useUiStrings();
</script>

<template>
  <div class="center" :class="{ loading: fill }" role="status">
    <span class="spinner" aria-hidden="true" />
    <slot>{{ label ?? strings.loading }}</slot>
  </div>
</template>
