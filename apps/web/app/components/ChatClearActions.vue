<script setup lang="ts">
// Clear chat with the optional memory removal, shared by the details pages and the chat-list menu.
const props = defineProps<{ busy: boolean; group?: boolean }>();
const emit = defineEmits<{ clear: [clearMemory: boolean] }>();
const clearMemory = ref(false);

function clear() {
  const scope = props.group ? 'for everyone in this group' : 'from your private chat';
  const memory = clearMemory.value ? 'Memory learned here will also be deleted.' : 'Extracted memories will be kept without the original messages.';
  if (window.confirm(`Permanently clear all messages, files, tasks, documents, mini apps, and scheduled work ${scope}? ${memory}`)) {
    emit('clear', clearMemory.value);
  }
}
</script>

<template>
  <p class="text-block">{{ group ? 'Clear the group for everyone.' : 'Clear your private conversation.' }} This also removes files, tasks, documents, mini apps, and scheduled work.</p>
  <label class="toggle">
    <span>Also delete memory learned in this chat</span>
    <input v-model="clearMemory" type="checkbox" :disabled="busy">
  </label>
  <AppListItem danger :disabled="busy" @click="clear">Clear chat</AppListItem>
</template>
