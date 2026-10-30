<script setup lang="ts">
const route = useRoute();
const id = computed(() => String(route.params.id));
</script>
<template><PageBar title="Connections" :back="`/groups/${id}/members`" always-back /><div class="page"><div class="page-inner"><McpAccessPanel :path="`groups/${id}/mcp`" group /></div></div></template>
