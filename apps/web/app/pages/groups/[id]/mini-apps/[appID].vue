<script setup lang="ts">
const route = useRoute();
const groupID = computed(() => String(route.params.id));
const appID = computed(() => String(route.params.appID));
</script>

<template>
  <MiniAppScreen :key="appID" :base="`groups/${groupID}`" :app-id="appID" :back="`/groups/${groupID}`" />
</template>
