<script setup lang="ts">
// `/` has no page of its own: wide screens open Updates, phones the chat list (docs/web.md#design).
const wide = useWideLayout();
await navigateTo(wide.value ? '/updates' : '/chats', { replace: true });
</script>

<template>
  <div />
</template>
