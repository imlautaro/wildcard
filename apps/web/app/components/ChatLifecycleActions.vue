<script setup lang="ts">
defineProps<{ archived: boolean; canClear: boolean; busy: boolean; group?: boolean }>();
const emit = defineEmits<{ archive: []; clear: [clearMemory: boolean] }>();
</script>

<template>
  <AppListItem icon="archive" :disabled="busy" @click="emit('archive')">{{ archived ? 'Unarchive' : 'Archive' }}</AppListItem>
  <ChatClearActions v-if="canClear" :busy="busy" :group="group" @clear="memory => emit('clear', memory)" />
</template>
