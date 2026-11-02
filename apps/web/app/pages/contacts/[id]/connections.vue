<script setup lang="ts">
const route = useRoute();
const id = computed(() => String(route.params.id));
</script>
<template><PageBar :title="$t('contacts.connections.title')" :back="`/contacts/${id}/edit`" always-back /><div class="page"><div class="page-inner"><McpAccessPanel :path="`contacts/${id}/mcp`" /></div></div></template>
