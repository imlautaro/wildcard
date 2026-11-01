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
  <AppListItem icon="file" opens :disabled="busy" @click="open = true">Export chat</AppListItem>
  <AppSheet v-if="open" title="Export chat" @close="close">
    <p>Download this {{ kind === 'group' ? 'group' : 'chat' }} as a JSON file with every message you can read, who sent it and when, replies and reactions.</p>
    <p class="group-footer">
      {{ kind === 'group' ? 'It includes messages from every member. ' : '' }}Attachments are listed by name only; files, images and audio are not included.
      Review the file before sharing it with anyone or with an AI. Nothing is sent to an AI by this download.
    </p>
    <AppNotice v-if="error">{{ error }}</AppNotice>
    <template #actions>
      <AppButton variant="text" @click="close">{{ exporting ? 'Cancel export' : 'Close' }}</AppButton>
      <AppButton :disabled="exporting || !!exportingKey" @click="start">{{ exporting ? 'Exporting…' : 'Download JSON' }}</AppButton>
    </template>
  </AppSheet>
</template>
