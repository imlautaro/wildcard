<script setup lang="ts">
// Chats root. Wide screens show this beside the chat list; below 860px the list itself fills
// the screen and this pane is hidden.
</script>

<template>
  <AppEmptyState icon="chat" :title="$t('chat.index.title')" :text="$t('chat.index.text')">
    <template #actions><AppButton to="/contacts" variant="tonal">{{ $t('chat.index.openContacts') }}</AppButton></template>
  </AppEmptyState>
</template>
