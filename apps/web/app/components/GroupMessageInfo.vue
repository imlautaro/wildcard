<script setup lang="ts">
const props = defineProps<{ groupID: string; messageID: string }>();
const emit = defineEmits<{ close: [] }>();
const { entry, refresh } = useGroupMessageInfo(props.groupID, props.messageID);
const read = computed(() => entry.value?.recipients.filter(person => person.readAt !== null) ?? []);
const unread = computed(() => entry.value?.recipients.filter(person => person.readAt === null) ?? []);
function timestamp(value: number) { return new Date(value).toLocaleString(appLocale()); }
const { now } = usePolling(refresh, () => 5000);
onMounted(now);
</script>

<template>
  <AppSheet :title="$t('groups.messageInfo.title')" @close="emit('close')">
    <AppLoading v-if="!entry.value && entry.request" />
    <AppNotice v-if="entry.error" tone="warning">{{ entry.error }}</AppNotice>
    <AppButton variant="text" :disabled="!!entry.request || entry.unavailable" @click="refresh">{{ $t('groups.messageInfo.refresh') }}</AppButton>
    <template v-if="entry.value">
      <p v-if="!entry.value.tracked">{{ $t('groups.messageInfo.untracked') }}</p>
      <template v-else>
        <h3>{{ $t('groups.messageInfo.readBy', { count: read.length }) }}</h3>
        <p v-if="!read.length" class="muted">{{ $t('groups.messageInfo.noneRead') }}</p>
        <ul class="people"><li v-for="person in read" :key="`${person.kind}/${person.id}`"><strong>{{ person.name }}</strong><span>{{ timestamp(person.readAt!) }}</span></li></ul>
        <h3>{{ $t('groups.messageInfo.notRead', { count: unread.length }) }}</h3>
        <ul class="people"><li v-for="person in unread" :key="`${person.kind}/${person.id}`"><strong>{{ person.name }}</strong><span>{{ person.deliveredAt === null ? $t('groups.messageInfo.sent') : $t('groups.messageInfo.received') }}</span></li></ul>
        <p v-if="!entry.value.recipients.length" class="muted">{{ $t('groups.messageInfo.noRecipients') }}</p>
        <p class="muted">{{ $t('groups.messageInfo.readNote') }}</p>
      </template>
    </template>
  </AppSheet>
</template>

<style scoped>
.people { list-style: none; padding: 0; }
.people li { display: flex; flex-direction: column; gap: 3px; padding: var(--space-2) 0; }
.people span, .muted { color: var(--md-on-surface-variant); font-size: 13px; }
</style>
