<script setup lang="ts">
// On wide screens Home fills the content pane beside the chat list. Narrow screens
// show only the chat list at `/` and open Home from its header (/home), so a hidden
// feed never polls or counts as a Home visit.
const wide = ref(false);
let query: MediaQueryList | null = null;
const update = (event: MediaQueryList | MediaQueryListEvent) => { wide.value = event.matches; };
onMounted(() => { query = window.matchMedia('(min-width: 861px)'); update(query); query.addEventListener('change', update); });
onBeforeUnmount(() => query?.removeEventListener('change', update));
</script>

<template>
  <HomeFeed v-if="wide" />
</template>
