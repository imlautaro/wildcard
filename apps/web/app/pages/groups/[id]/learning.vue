<script setup lang="ts">
const route = useRoute();
</script>
<template><ConversationLearningPanel :base="`groups/${String(route.params.id)}`" /></template>
