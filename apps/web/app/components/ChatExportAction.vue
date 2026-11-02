<script setup lang="ts">
// "Export chat" row and sheet for a private chat or group details page (docs/chat-export.md).
const props = defineProps<{ kind: 'contact' | 'group'; id: string; busy?: boolean }>();
const { exportingKey, exportError, download, cancel } = useChatExport();
const open = ref(false);
const key = computed(() => `${props.kind}:${props.id}`);
const exporting = computed(() => exportingKey.value === key.value);
const error = computed(() => exportError.value?.key === key.value ? exportError.value.message : null);

function close() {
  if (exporting.value) cancel();
  open.value = false;
}
async function start() {
  await download(props.kind, props.id);
  if (!error.value) open.value = false;
}
onBeforeUnmount(() => { if (exporting.value) cancel(); });
</script>

<template>
  <AppListItem icon="file" opens :disabled="busy" @click="open = true">{{ $t('chat.export.title') }}</AppListItem>
  <AppSheet v-if="open" :title="$t('chat.export.title')" @close="close">
    <p>{{ kind === 'group' ? $t('chat.export.introGroup') : $t('chat.export.introChat') }}</p>
    <p class="group-footer">{{ kind === 'group' ? $t('chat.export.footerGroup') : $t('chat.export.footerChat') }}</p>
    <AppNotice v-if="error">{{ error }}</AppNotice>
    <template #actions>
      <AppButton variant="text" @click="close">{{ exporting ? $t('chat.export.cancel') : $t('common.close') }}</AppButton>
      <AppButton :disabled="exporting || !!exportingKey" @click="start">{{ exporting ? $t('chat.export.exporting') : $t('chat.export.download') }}</AppButton>
    </template>
  </AppSheet>
</template>
