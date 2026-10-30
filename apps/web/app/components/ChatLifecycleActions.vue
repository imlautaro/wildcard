<script setup lang="ts">
defineProps<{ archived: boolean; canClear: boolean; busy: boolean; group?: boolean }>();
const emit = defineEmits<{ archive: []; clear: [clearMemory: boolean] }>();
</script>

<template>
  <button type="button" class="button-row" :disabled="busy" @click="emit('archive')">
    <AppIcon name="archive" />{{ archived ? 'Unarchive' : 'Archive' }}
  </button>
  <ChatClearActions v-if="canClear" :busy="busy" :group="group" @clear="memory => emit('clear', memory)" />
</template>
