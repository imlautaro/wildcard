<script setup lang="ts">
const props = defineProps<{ groupID: string; messageID: string }>();
const emit = defineEmits<{ close: [] }>();
const { entry, refresh } = useGroupMessageInfo(props.groupID, props.messageID);
const read = computed(() => entry.value?.recipients.filter(person => person.readAt !== null) ?? []);
const unread = computed(() => entry.value?.recipients.filter(person => person.readAt === null) ?? []);
function timestamp(value: number) { return new Date(value).toLocaleString(); }
const { now } = usePolling(refresh, () => 5000);
onMounted(now);
</script>

<template>
  <AppSheet title="Message info" @close="emit('close')">
    <AppLoading v-if="!entry.value && entry.request" />
    <AppNotice v-if="entry.error" tone="warning">{{ entry.error }}</AppNotice>
    <AppButton variant="text" :disabled="!!entry.request || entry.unavailable" @click="refresh">Refresh</AppButton>
    <template v-if="entry.value">
      <p v-if="!entry.value.tracked">Read information is unavailable for this older message.</p>
      <template v-else>
        <h3>Read by · {{ read.length }}</h3>
        <p v-if="!read.length" class="muted">No one has read this message yet.</p>
        <ul class="people"><li v-for="person in read" :key="`${person.kind}/${person.id}`"><strong>{{ person.name }}</strong><span>{{ timestamp(person.readAt!) }}</span></li></ul>
        <h3>Not read yet · {{ unread.length }}</h3>
        <ul class="people"><li v-for="person in unread" :key="`${person.kind}/${person.id}`"><strong>{{ person.name }}</strong><span>{{ person.deliveredAt === null ? 'Sent' : 'Received' }}</span></li></ul>
        <p v-if="!entry.value.recipients.length" class="muted">No other recipients.</p>
        <p class="muted">Read does not mean someone replied. Contacts can acknowledge reading before preparing a response.</p>
      </template>
    </template>
  </AppSheet>
</template>

<style scoped>
.people { list-style: none; padding: 0; }
.people li { display: flex; flex-direction: column; gap: 3px; padding: var(--space-2) 0; }
.people span, .muted { color: var(--md-on-surface-variant); font-size: 13px; }
</style>
