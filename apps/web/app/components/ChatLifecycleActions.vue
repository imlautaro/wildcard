<script setup lang="ts">
defineProps<{ archived: boolean; canClear: boolean; busy: boolean; group?: boolean; chatId: string }>();
const emit = defineEmits<{ archive: []; clear: [clearMemory: boolean] }>();
</script>

<template>
  <ChatExportAction :kind="group ? 'group' : 'contact'" :id="chatId" :busy="busy" />
  <AppListItem icon="archive" :disabled="busy" @click="emit('archive')">{{ archived ? $t('chat.lifecycle.unarchive') : $t('chat.lifecycle.archive') }}</AppListItem>
  <ChatClearActions v-if="canClear" :busy="busy" :group="group" @clear="memory => emit('clear', memory)" />
</template>
