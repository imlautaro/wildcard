<script setup lang="ts">
import type { DraftAttachment, GroupMember, GroupMessage } from '~/utils/types';

const route = useRoute();
const groupID = computed(() => String(route.params.id));
const chats = useChats();
const { user } = useSession();
const { state, load, loadEarlier, send, submit, discardPending, retryReply, markRead } = useGroupConversation(groupID);
const scroller = ref<HTMLElement>();
const composer = ref<{ focus: () => void }>();

const group = computed(() => state.value.snapshot?.group ?? chats.groups.value.find((item) => item.id === groupID.value) ?? null);
useHead({ title: computed(() => group.value?.name ?? 'Group') });

const members = computed(() => new Map((state.value.snapshot?.members ?? []).map((member) => [`${member.kind}/${member.id}`, member])));
const memberLine = computed(() => (state.value.snapshot?.members ?? []).map((member) => member.kind === 'user' && member.id === user.value?.id ? 'You' : member.name).join(', '));
const activeReplies = computed(() => (state.value.snapshot?.replies ?? []).filter((reply) => reply.status === 'queued' || reply.status === 'running'));
const failedReplies = computed(() => (state.value.snapshot?.replies ?? []).filter((reply) => reply.status === 'failed'));

type Item = { kind: 'day'; key: string; label: string } | { kind: 'message'; key: string; message: GroupMessage; first: boolean; last: boolean };
const items = computed<Item[]>(() => {
  const result: Item[] = [];
  let day = '';
  const messages = state.value.messages;
  messages.forEach((message, index) => {
    const label = dayLabel(message.createdAt);
    const sender = (value: GroupMessage | undefined) => value && `${value.userID ?? ''}/${value.agentID ?? ''}`;
    if (label !== day) {
      day = label;
      result.push({ kind: 'day', key: `day-${message.sequence}`, label });
    }
    const previous = messages[index - 1];
    const next = messages[index + 1];
    result.push({
      kind: 'message', key: message.id, message,
      first: !previous || sender(previous) !== sender(message) || dayLabel(previous.createdAt) !== label,
      last: !next || sender(next) !== sender(message) || dayLabel(next.createdAt) !== label,
    });
  });
  return result;
});

function isMine(message: GroupMessage) {
  return message.userID !== null && message.userID === user.value?.id;
}
function senderOf(message: GroupMessage): GroupMember | undefined {
  return message.agentID ? members.value.get(`agent/${message.agentID}`) : members.value.get(`user/${message.userID}`);
}
function senderPhoto(message: GroupMessage) {
  const member = senderOf(message);
  return member?.photoVersion
    ? `groups/${groupID.value}/photos/${member.kind}/${member.id}?version=${encodeURIComponent(member.photoVersion)}`
    : null;
}
function attachmentPath(message: GroupMessage) {
  return `groups/${groupID.value}/messages/${message.id}/attachment`;
}

function nearBottom() {
  const element = scroller.value;
  return !element || element.scrollHeight - element.scrollTop - element.clientHeight < 120;
}
function scrollToBottom() {
  nextTick(() => { if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight; });
}
async function refresh() {
  const stick = nearBottom();
  await load();
  if (stick) scrollToBottom();
  if (document.visibilityState === 'visible' && document.hasFocus()) void markRead();
}
async function earlier() {
  const element = scroller.value;
  const previousHeight = element?.scrollHeight ?? 0;
  await loadEarlier();
  nextTick(() => { if (element) element.scrollTop += element.scrollHeight - previousHeight; });
}
async function onSend(text: string, attachment: DraftAttachment | null) {
  scrollToBottom();
  await send(text, attachment);
  scrollToBottom();
}

const { now: pollNow } = usePolling(refresh, () => (activeReplies.value.length || state.value.pending ? 2000 : 6000));
watch(groupID, async () => { scrollToBottom(); await pollNow(); });
onMounted(async () => {
  window.addEventListener('focus', markRead);
  scrollToBottom();
  await pollNow();
  composer.value?.focus();
});
onBeforeUnmount(() => window.removeEventListener('focus', markRead));
</script>

<template>
  <PageBar>
    <template #title>
      <NuxtLink :to="`/groups/${groupID}/members`" class="title" aria-label="Group details">
        <AppAvatar :name="group?.name ?? ''" :path="group ? groupPhotoPath(group) : null" :size="36" />
        <div>
          <div class="name">{{ group?.name ?? 'Group' }}</div>
          <div class="subtitle">{{ activeReplies.length ? `${activeReplies.map((reply) => reply.name).join(', ')} replying…` : memberLine }}</div>
        </div>
      </NuxtLink>
    </template>
  </PageBar>

  <div v-if="state.unavailable" class="empty">
    <h2>Group unavailable</h2>
    <p>This group is no longer available.</p>
    <NuxtLink to="/" class="button secondary">Back to Chats</NuxtLink>
  </div>
  <template v-else>
    <div ref="scroller" class="messages" aria-live="polite">
      <div class="spacer" />
      <div v-if="state.nextBefore" class="center">
        <button class="link-button" :disabled="state.loadingEarlier" @click="earlier">Load earlier messages</button>
      </div>
      <div v-if="!state.loaded && !state.error" class="center"><span class="spinner" /> Loading messages…</div>
      <div v-if="state.error" class="notice" role="status">
        {{ state.error }}
        <button class="link-button" @click="refresh">Retry</button>
      </div>
      <div v-if="state.loaded && !state.messages.length && !state.pending" class="empty">
        <h2>Start the conversation</h2>
        <p>Send your first message.</p>
      </div>

      <template v-for="item in items" :key="item.key">
        <div v-if="item.kind === 'day'" class="day">{{ item.label }}</div>
        <div v-else class="bubble-row" :class="isMine(item.message) ? 'outgoing' : 'incoming'" :style="{ marginTop: item.first ? '6px' : '0' }">
          <div v-if="!isMine(item.message)" class="avatar-slot">
            <AppAvatar v-if="item.last" :name="item.message.senderName" :path="senderPhoto(item.message)" :size="28" />
          </div>
          <div class="bubble" :class="{ media: item.message.attachment?.mimeType.startsWith('image/') }">
            <span v-if="!isMine(item.message) && item.first" class="sender" :style="item.message.attachment?.mimeType.startsWith('image/') ? 'padding: 4px 8px 0' : ''">{{ item.message.senderName }}</span>
            <MessageAttachment v-if="item.message.attachment" :attachment="item.message.attachment" :path="attachmentPath(item.message)" />
            <div v-if="item.message.text" :class="{ caption: item.message.attachment?.mimeType.startsWith('image/') }">{{ item.message.text }}</div>
            <div class="meta" :style="item.message.attachment?.mimeType.startsWith('image/') ? 'padding: 0 6px 2px' : ''">{{ messageTime(item.message.createdAt) }}</div>
          </div>
        </div>
      </template>

      <template v-if="state.pending">
        <div class="bubble-row outgoing">
          <div class="bubble" :class="{ media: state.pending.attachment?.previewURL }" style="opacity: 0.75">
            <MessageAttachment v-if="state.pending.attachment" :attachment="state.pending.attachment" :path="null" :local-url="state.pending.attachment.previewURL" />
            <div v-if="state.pending.text" :class="{ caption: state.pending.attachment?.previewURL }">{{ state.pending.text }}</div>
          </div>
        </div>
        <div class="status-line outgoing" :class="{ error: state.pending.failed }">
          <template v-if="state.pending.failed">
            {{ state.pending.failed }}
            <button class="link-button" @click="submit">Retry</button>
            <button class="link-button danger" @click="discardPending">Edit</button>
          </template>
          <template v-else>Sending…</template>
        </div>
      </template>

      <div v-for="reply in activeReplies" :key="reply.id" class="bubble-row incoming">
        <div class="avatar-slot" />
        <div class="typing" :aria-label="`${reply.name} is replying`"><span /><span /><span /></div>
      </div>
      <div v-for="reply in failedReplies" :key="reply.id" class="status-line">
        {{ reply.name }} could not reply.
        <button class="link-button" @click="retryReply(reply.id)">Retry</button>
      </div>
    </div>
    <ChatComposer ref="composer" v-model="state.draft" :disabled="!!state.pending || !state.loaded" @send="onSend" />
  </template>
</template>
