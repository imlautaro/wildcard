<script setup lang="ts">
import type { DraftAttachment, DraftVoice, GroupMember, GroupMessage, ReplyQuote } from '~/utils/types';

const route = useRoute();
const groupID = computed(() => String(route.params.id));
const chats = useChats();
const { user } = useSession();
const { state, load, loadEarlier, send, submit, discardPending, retryReply, noteSeen, markRead } = useGroupConversation(groupID);
useVisibleConversation(() => `group/${groupID.value}`);
const scroller = ref<HTMLElement>();
const messageContent = ref<HTMLElement>();
const composer = ref<{ focus: () => void }>();

const group = computed(() => state.value.snapshot?.group ?? chats.groups.value.find((item) => item.id === groupID.value) ?? null);

const members = computed(() => new Map((state.value.snapshot?.members ?? []).map((member) => [`${member.kind}/${member.id}`, member])));
const memberLine = computed(() => (state.value.snapshot?.members ?? []).map((member) => member.kind === 'user' && member.id === user.value?.id ? 'You' : member.name).join(', '));
const activeReplies = computed(() => (state.value.snapshot?.replies ?? []).filter((reply) => reply.status === 'queued' || reply.status === 'running'));
// Task work turns show what the contact is working on; other replies show typing dots.
const workingReplies = computed(() => activeReplies.value.filter((reply) => reply.taskID));
const typingReplies = computed(() => activeReplies.value.filter((reply) => !reply.taskID && reply.status === 'running' && reply.isTyping === 1));
const subtitle = computed(() => typingReplies.value.length ? typingReplies.value.map((reply) => `${reply.name} ${reply.replyActivity === 'researching' ? 'researching' : reply.replyActivity === 'recording' ? 'recording' : 'typing'}…`).join(', ')
  : workingReplies.value.length ? `${[...new Set(workingReplies.value.map((reply) => reply.name))].join(', ')} working…` : memberLine.value);
function failedRepliesFor(message: GroupMessage) {
  return (state.value.snapshot?.replies ?? []).filter((reply) => reply.status === 'failed' && reply.sourceID === message.id
    && !state.value.messages.some((later) => later.agentID === reply.agentID && later.sequence > message.sequence));
}

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

const { positioned, pinned, onScroll, onWheel, onTouchStart, onTouchMove, onKeydown, scrollToBottom } = useChatScroll(
  scroller, messageContent, groupID, () => state.value.loaded, () => items.value,
);

function isMine(message: GroupMessage) {
  return message.userID !== null && message.userID === user.value?.id;
}
function senderOf(message: GroupMessage): GroupMember | undefined {
  return message.agentID ? members.value.get(`agent/${message.agentID}`) : members.value.get(`user/${message.userID}`);
}
function senderPhoto(message: GroupMessage) {
  return memberPhoto(senderOf(message));
}
function memberPhoto(member: GroupMember | undefined) {
  return member?.photoVersion
    ? `groups/${groupID.value}/photos/${member.kind}/${member.id}?version=${encodeURIComponent(member.photoVersion)}`
    : null;
}
// Stable per-group color from the message's own identity, so former members keep theirs.
function senderStyle(message: GroupMessage) {
  const identity = message.agentID ? `agent/${message.agentID}` : message.userID ? `user/${message.userID}` : `message/${message.id}`;
  return senderColor(groupID.value, identity);
}
function replyPreview(quote: ReplyQuote) {
  if (quote.agentID === null && quote.userID !== null && quote.userID === user.value?.id) return { quote, author: 'You', color: ownReplyColor };
  const member = quote.agentID ? members.value.get(`agent/${quote.agentID}`) : members.value.get(`user/${quote.userID}`);
  const identity = quote.agentID ? `agent/${quote.agentID}` : quote.userID ? `user/${quote.userID}` : `message/${quote.messageID}`;
  return { quote, author: member?.name ?? quote.senderName ?? 'Unknown member', color: replyColor(groupID.value, identity) };
}
const replyTarget = computed(() => state.value.replyTo ? replyPreview(state.value.replyTo) : null);
const canReply = computed(() => !!state.value.snapshot && !state.value.unavailable);
function startReply(message: GroupMessage) {
  state.value.replyTo = localReplyQuote(message.id, 'group', message.text, message.attachment,
    { userID: message.userID, agentID: message.agentID, senderName: message.senderName });
  composer.value?.focus();
}

// Scroll to a quoted message, paging earlier history within a bound when needed.
const highlighted = ref<string | null>(null);
let highlightTimer: ReturnType<typeof setTimeout> | undefined;
async function showQuoted(quote: ReplyQuote) {
  if (!quote.available) return;
  for (let pages = 0; pages < 20 && !state.value.messages.some((message) => message.id === quote.messageID); pages += 1) {
    const cursor = state.value.nextBefore;
    if (!cursor) break;
    await earlier();
    if (state.value.nextBefore === cursor) break;
  }
  await nextTick();
  const element = document.getElementById(`message-${quote.messageID}`);
  if (!element) return;
  element.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  highlighted.value = quote.messageID;
  clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => { highlighted.value = null; }, 1200);
}
function attachmentPath(message: { id: string }) {
  return `groups/${groupID.value}/messages/${message.id}/attachment`;
}

async function refresh() {
  await load();
  if (document.visibilityState === 'visible') markRead();
}
async function earlier() {
  await loadEarlier();
}

async function onSend(text: string, attachment: DraftAttachment | null) {
  scrollToBottom();
  await send(text, attachment);
}
async function onVoice(clip: DraftVoice) {
  scrollToBottom();
  await send('', null, clip);
}
// Contact voice messages keep the spoken text as their transcript.
function transcriptOf(message: GroupMessage) {
  return message.agentID ? message.text : message.voice?.transcript ?? null;
}

// Recipient read receipts: a message from someone else counts as read once at
// least half of it is on screen while the tab is visible.
let observer: IntersectionObserver | null = null;
function observeRows() {
  if (!observer || !scroller.value) return;
  for (const element of scroller.value.querySelectorAll('[data-read-id]')) observer.observe(element);
}
function rescan() {
  observer?.disconnect();
  observeRows();
}
function onVisibility() {
  if (document.visibilityState === 'visible') rescan();
}
watch(items, () => nextTick(observeRows));

// One-second tick while visible, like the iOS session synchronizer.
const { now: pollNow } = usePolling(refresh, () => 1000);
watch(groupID, async () => { rescan(); await pollNow(); });
onMounted(async () => {
  observer = new IntersectionObserver((entries) => {
    if (document.visibilityState !== 'visible') return;
    noteSeen(entries.filter((entry) => entry.isIntersecting).map((entry) => (entry.target as HTMLElement).dataset.readId!));
  }, { root: scroller.value, threshold: 0.5 });
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', markRead);
  await pollNow();
  nextTick(observeRows);
  composer.value?.focus();
});
onBeforeUnmount(() => {
  clearTimeout(highlightTimer);
  observer?.disconnect();
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('focus', markRead);
});
const documents = useDocuments(() => `groups/${groupID.value}`);
// Cards appear under the reply that created a document; refresh when messages arrive.
watch(() => state.value.messages.at(-1)?.id, () => documents.refresh(), { immediate: true });
// Shared mini apps are created before the message that shows their card is published.
const miniApps = useMiniApps(() => `groups/${groupID.value}`);
watch(() => state.value.messages.at(-1)?.id, () => miniApps.refresh(true), { immediate: true });
</script>

<template>
  <PageBar>
    <template #title>
      <NuxtLink :to="`/groups/${groupID}/members`" class="title" aria-label="Group details">
        <AppAvatar :name="group?.name ?? ''" :path="group ? groupPhotoPath(group) : null" :size="36" />
        <div>
          <div class="name">{{ group?.name ?? 'Group' }}</div>
          <div class="subtitle">{{ subtitle }}</div>
        </div>
      </NuxtLink>
    </template>
    <NuxtLink :to="`/groups/${groupID}/tasks`" class="icon-button" aria-label="Tasks" title="Tasks"><AppIcon name="tasks" /></NuxtLink>
  </PageBar>

  <div v-if="state.unavailable" class="empty">
    <h2>Group unavailable</h2>
    <p>This group is no longer available.</p>
    <NuxtLink to="/" class="button secondary">Back to Chats</NuxtLink>
  </div>
  <template v-else>
    <div class="message-viewport">
    <div ref="scroller" class="messages" :style="{ visibility: state.loaded && !positioned ? 'hidden' : undefined }" aria-live="polite" tabindex="0" @scroll.passive="onScroll" @wheel.passive="onWheel" @touchstart.passive="onTouchStart" @touchmove.passive="onTouchMove" @keydown="onKeydown">
      <div ref="messageContent" class="message-content">
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
        <div
          v-else :id="`message-${item.message.id}`" class="bubble-row"
          :class="[isMine(item.message) ? 'outgoing' : 'incoming', { highlighted: highlighted === item.message.id }]" :style="{ marginTop: item.first ? '6px' : '0' }"
          :data-read-id="isMine(item.message) ? undefined : item.message.id"
        >
          <div v-if="!isMine(item.message)" class="avatar-slot">
            <AppAvatar v-if="item.last" :name="item.message.senderName" :path="senderPhoto(item.message)" :size="28" />
          </div>
          <MessageReactions :cache="state.reactions" :path="`groups/${groupID}/reactions`" :message-i-d="item.message.id" side="group" :replyable="canReply"
            :receipt-group-i-d="groupID" :voice="!!item.message.voice" :transcript="transcriptOf(item.message)" @reply="startReply(item.message)">
          <div class="bubble" :class="{ media: item.message.attachment?.mimeType.startsWith('image/') }">
            <span
              v-if="!isMine(item.message) && item.first" class="sender"
              :style="[senderStyle(item.message), item.message.attachment?.mimeType.startsWith('image/') ? { padding: '4px 8px 0' } : {}]"
            >{{ senderOf(item.message)?.name ?? item.message.senderName }}</span>
            <MessageReplyQuote v-if="item.message.replyTo" :preview="replyPreview(item.message.replyTo)" interactive @open="showQuoted(item.message.replyTo)" />
            <VoiceMessage v-if="item.message.voice" :voice="item.message.voice" :path="attachmentPath(item.message)" :outgoing="isMine(item.message)" :sender-name="item.message.senderName" :sender-photo="senderPhoto(item.message)" />
            <MessageAttachment v-else-if="item.message.attachment" :attachment="item.message.attachment" :path="attachmentPath(item.message)" />
            <div v-if="item.message.text && !item.message.voice" :class="{ caption: item.message.attachment?.mimeType.startsWith('image/') }"><MessageMarkdown v-if="item.message.agentID" :text="item.message.text" /><template v-else><LinkifiedText :text="item.message.text" /></template><LinkPreviewCard :url="previewLink(item.message.text, !!item.message.agentID)" /></div>
            <MiniAppCard v-for="app in miniApps.state.value.apps.filter(a => a.replyID === item.message.id)" :key="app.id" :app="app" :base="`groups/${groupID}`" />
            <DocumentCard v-for="doc in documents.state.value.items.filter(d => d.sourceID === item.message.id)" :key="doc.id" :document="doc" :to="`/groups/${groupID}/documents/${doc.id}`" />
            <div class="meta" :style="item.message.attachment?.mimeType.startsWith('image/') ? 'padding: 0 6px 2px' : ''">
              {{ messageTime(item.message.createdAt) }}<MessageReceipt v-if="isMine(item.message)" :receipt-state="item.message.receiptState ?? 'sent'" />
            </div>
          </div>
          </MessageReactions>
        </div>
        <template v-if="item.kind === 'message'">
          <div v-for="reply in failedRepliesFor(item.message)" :key="reply.id" class="status-line" role="status">
            {{ reply.name }} couldn't finish replying to this message.
            <button class="link-button" :disabled="activeReplies.length > 0" @click="retryReply(reply.id)">Retry reply</button>
          </div>
        </template>
      </template>

      <template v-if="state.pending">
        <div class="bubble-row outgoing">
          <div class="bubble" :class="{ media: state.pending.attachment?.previewURL }">
            <MessageReplyQuote v-if="state.pending.replyTo" :preview="replyPreview(state.pending.replyTo)" />
            <VoiceMessage v-if="state.pending.voice" :voice="{ durationMs: state.pending.voice.durationMs, listenedAt: null, transcript: null }" :path="attachmentPath(state.pending)" :blob="state.pending.voice.blob" outgoing />
            <MessageAttachment v-if="state.pending.attachment" :attachment="state.pending.attachment" :path="null" :local-url="state.pending.attachment.previewURL" />
            <div v-if="state.pending.text" :class="{ caption: state.pending.attachment?.previewURL }"><LinkifiedText :text="state.pending.text" /></div>
            <div class="meta" :style="state.pending.attachment?.previewURL ? 'padding: 0 6px 2px' : ''">
              {{ messageTime(state.pending.createdAt) }}<MessageReceipt :sending="!state.pending.accepted" receipt-state="sent" />
            </div>
          </div>
        </div>
        <div v-if="state.pending.failed" class="status-line outgoing error">
          {{ state.pending.failed }}
          <button class="link-button" @click="submit">Retry</button>
          <button class="link-button danger" @click="discardPending">{{ state.pending.voice ? 'Delete' : 'Edit' }}</button>
        </div>
      </template>

      <div v-for="reply in workingReplies" :key="reply.id" class="bubble-row incoming">
        <div class="avatar-slot"><AppAvatar :name="reply.name" :path="memberPhoto(members.get(`agent/${reply.agentID}`))" :size="28" /></div>
        <div class="work-status" role="status"><span class="typing-dots" aria-hidden="true"><span /><span /><span /></span><span><strong>{{ reply.name }}</strong> · {{ reply.taskTitle ? `Working on “${reply.taskTitle}”` : 'Working on a task' }}</span></div>
      </div>
      <div v-for="reply in typingReplies" :key="reply.id" class="bubble-row incoming">
        <div class="avatar-slot" />
        <div class="typing" role="status">{{ reply.replyActivity === 'researching' ? 'Researching' : reply.replyActivity === 'recording' ? 'Recording' : 'Typing' }}<span /><span /><span /></div>
      </div>
      </div>
    </div>
    <ChatScrollDown v-if="positioned && !pinned" @click="scrollToBottom" />
    </div>
    <ChatComposer
      ref="composer" v-model="state.draft" :disabled="!!state.pending || !state.loaded || state.snapshot?.group.clearing === 1" :reply="replyTarget"
      :voice-key="groupID" @send="onSend" @voice="onVoice" @cancel-reply="state.replyTo = null"
    />
  </template>
</template>
