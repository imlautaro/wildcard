<script setup lang="ts">
const route = useRoute();
const contactID = computed(() => String(route.params.id));
</script>

<template>
  <MiniAppList :base="`contacts/${contactID}`" :back="`/contacts/${contactID}/edit`"
    empty="Ask this contact in chat to build one from your connections, for example “Make me a mini app for last week’s expenses.”"
    footer="Mini apps use this contact’s connections and are visible only to you." />
</template>
