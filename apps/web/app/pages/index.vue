<script setup lang="ts">
// With no chat selected, wide screens show Updates beside the chat list. On a phone `/` is the
// chat list itself; its pane is hidden by CSS, so Updates must not be mounted there (it would
// poll and count as a visit while nobody sees it) and stays reachable at /updates.
const wide = useWideLayout();
</script>

<template>
  <UpdatesFeed v-if="wide" />
  <AppEmptyState v-else icon="chat" title="Select a chat" text="Choose a conversation, or open Contacts to start a new one.">
    <template #actions><AppButton to="/contacts" variant="tonal">Open Contacts</AppButton></template>
  </AppEmptyState>
</template>
