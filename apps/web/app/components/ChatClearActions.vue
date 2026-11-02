<script setup lang="ts">
// Clear chat with the optional memory removal, shared by the details pages and the chat-list menu.
const props = defineProps<{ busy: boolean; group?: boolean }>();
const emit = defineEmits<{ clear: [clearMemory: boolean] }>();
const { t } = useI18n();
const clearMemory = ref(false);

function clear() {
  const memory = t(clearMemory.value ? 'chat.clear.memoryDeleted' : 'chat.clear.memoryKept');
  if (window.confirm(t(props.group ? 'chat.clear.confirmGroup' : 'chat.clear.confirmPrivate', { memory }))) {
    emit('clear', clearMemory.value);
  }
}
</script>

<template>
  <p class="text-block">{{ group ? $t('chat.clear.introGroup') : $t('chat.clear.introPrivate') }}</p>
  <label class="toggle">
    <span>{{ $t('chat.clear.deleteMemory') }}</span>
    <input v-model="clearMemory" type="checkbox" :disabled="busy">
  </label>
  <AppListItem danger :disabled="busy" @click="clear">{{ $t('chat.clear.action') }}</AppListItem>
</template>
