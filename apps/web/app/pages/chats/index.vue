<script setup lang="ts">
// Chats root. Wide screens show this beside the chat list; below 860px the list itself fills
// the screen and this pane is hidden.
</script>

<template>
  <AppEmptyState icon="chat" title="Select a chat" text="Choose a conversation, or open Contacts to start a new one.">
    <template #actions><AppButton to="/contacts" variant="tonal">Open Contacts</AppButton></template>
  </AppEmptyState>
</template>
