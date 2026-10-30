<script setup lang="ts">
const route = useRoute();
</script>
<template><ConversationLearningPanel :base="`contacts/${String(route.params.id)}`" /></template>
