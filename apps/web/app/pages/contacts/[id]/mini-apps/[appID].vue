<script setup lang="ts">
const route = useRoute();
const contactID = computed(() => String(route.params.id));
const appID = computed(() => String(route.params.appID));
</script>

<template>
  <MiniAppScreen :key="appID" :base="`contacts/${contactID}`" :app-id="appID" :back="`/chats/${contactID}`" />
</template>
