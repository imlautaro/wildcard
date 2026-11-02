<script setup lang="ts">
import type { Attachment, DraftAttachment, DraftVoice, GroupMember, GroupMessage, ReplyQuote, Sticker, StickerChoice } from '~/utils/types';

const route = useRoute();
const { t } = useI18n();
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
const memberLine = computed(() => (state.value.snapshot?.members ?? []).map((member) => member.kind === 'user' && member.id === user.value?.id ? t('common.you') : member.name).join(', '));
const activeReplies = computed(() => (state.value.snapshot?.replies ?? []).filter((reply) => reply.status === 'queued' || reply.status === 'running'));
// Task work turns show what the contact is working on; other replies show typing dots.
const workingReplies = computed(() => activeReplies.value.filter((reply) => reply.taskID));
const typingReplies = computed(() => activeReplies.value.filter((reply) => !reply.taskID && reply.status === 'running' && reply.isTyping === 1));
// Localized by composables/useReplyActivityLabel.ts (shared/activity.ts stays English for the API).
const subtitle = computed(() => typingReplies.value.length ? localizedReplyActivityLabel(typingReplies.value.map((reply) => ({ name: reply.name,
    activity: reply.replyActivity === 'researching' || reply.replyActivity === 'recording' ? reply.replyActivity : 'typing' }))) ?? memberLine.value
  : localizedWorkingLabel(workingReplies.value.map((reply) => reply.name)) ?? memberLine.value);
// Join banners are rebuilt from the structured event so they follow the app language.
// The API's English text (resolved for this viewer) stays the fallback when a name
// the banner needs is no longer in the member list.
function eventText(message: GroupMessage) {
  const event = message.event;
  if (event?.kind !== 'member_joined') return message.text;
  if (event.memberKind === 'agent') {
    const member = members.value.get(`agent/${event.memberID}`)?.name;
    const actor = members.value.get(`user/${event.actorID}`)?.name ?? message.senderName;
    return member && actor ? t('groups.chat.events.added', { actor, member }) : message.text;
  }
  const name = members.value.get(`user/${event.memberID}`)?.name ?? message.senderName;
  if (!name) return message.text;
  if (!event.invitedByID) return t('groups.chat.events.joined', { name });
  const inviter = members.value.get(`user/${event.invitedByID}`)?.name;
  return inviter ? t('groups.chat.events.joinedInvited', { name, inviter }) : message.text;
}
function failedRepliesFor(message: GroupMessage) {
  return (state.value.snapshot?.replies ?? []).filter((reply) => reply.status === 'failed' && reply.sourceID === message.id
    && !state.value.messages.some((later) => later.agentID === reply.agentID && later.sequence > message.sequence));
}

// Membership notices (`event`) render as centered banners and break bubble runs.
type Item = { kind: 'day'; key: string; label: string } | { kind: 'event'; key: string; message: GroupMessage }
  | { kind: 'message'; key: string; message: GroupMessage; first: boolean; last: boolean };
const items = computed<Item[]>(() => {
  const result: Item[] = [];
  let day = '';
  const messages = state.value.messages;
  messages.forEach((message, index) => {
    const label = dayLabel(message.createdAt);
    const sender = (value: GroupMessage | undefined) => value && (value.event ? `event/${value.id}` : `${value.userID ?? ''}/${value.agentID ?? ''}`);
    if (label !== day) {
      day = label;
      result.push({ kind: 'day', key: `day-${message.sequence}`, label });
    }
    if (message.event) {
      result.push({ kind: 'event', key: message.id, message });
      return;
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
  if (quote.agentID === null && quote.userID !== null && quote.userID === user.value?.id) return { quote, author: t('common.you'), color: ownReplyColor };
  const member = quote.agentID ? members.value.get(`agent/${quote.agentID}`) : members.value.get(`user/${quote.userID}`);
  const identity = quote.agentID ? `agent/${quote.agentID}` : quote.userID ? `user/${quote.userID}` : `message/${quote.messageID}`;
  return { quote, author: member?.name ?? quote.senderName ?? t('groups.chat.unknownMember'), color: replyColor(groupID.value, identity) };
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
  // Quotes from before the viewer joined cannot be opened (that history is not readable).
  if (!quote.available || quote.beforeJoin) return;
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

async function onSend(text: string, attachments: DraftAttachment[]) {
  scrollToBottom();
  // One message per attachment, text on the first; stop if one fails so the error stays visible.
  const queue = attachments.length ? attachments : [null];
  for (const [index, attachment] of queue.entries()) {
    await send(index === 0 ? text : '', attachment);
    if (state.value.pending?.failed) { for (const rest of queue.slice(index + 1)) if (rest?.previewURL) URL.revokeObjectURL(rest.previewURL); break; }
  }
}
// A library sticker is sent alone (docs/stickers.md#sending); the optimistic bubble reuses the
// picker's cached image. Groups have no contact stickers tab: contacts do not send stickers there.
async function onSticker(sticker: Sticker) {
  scrollToBottom();
  await send('', null, null, { id: sticker.id, emoji: sticker.emoji, path: stickerImagePath(sticker) });
}
const groupStickers = {};
const stickerAttachment = (choice: StickerChoice): Attachment => ({ name: 'Sticker.png', mimeType: 'image/png', size: 0, sticker: { id: choice.id, emoji: choice.emoji } });
// Photos use the media bubble; stickers are bare images without one.
const isSticker = (message: GroupMessage) => !!message.attachment?.sticker;
const isMedia = (message: GroupMessage) => !!message.attachment?.mimeType.startsWith('image/') && !isSticker(message);
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
// The Tasks button only shows while this chat has an active list (docs/tasks.md#opening-tasks);
// the board is otherwise reachable from the chat details. Uses the shared board cache.
const taskBoard = useTasks(() => `groups/${groupID.value}`);
const hasTasks = computed(() => !!taskBoard.state.value.value?.lists.some(list => list.status === 'active'));
usePolling(() => taskBoard.refresh(), () => 20_000);
onMounted(() => { void taskBoard.refresh(); });
watch(groupID, () => { void taskBoard.refresh(); });
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
      <NuxtLink :to="`/groups/${groupID}/members`" class="title" :aria-label="$t('groups.chat.details')">
        <AppAvatar :name="group?.name ?? ''" :path="group ? groupPhotoPath(group) : null" :size="36" />
        <div>
          <div class="name">{{ group?.name ?? $t('groups.chat.fallbackName') }}</div>
          <div class="subtitle">{{ subtitle }}</div>
        </div>
      </NuxtLink>
    </template>
    <AppIconButton v-if="hasTasks" :to="`/groups/${groupID}/tasks`" icon="tasks" :label="$t('groups.chat.tasks')" />
  </PageBar>

  <AppEmptyState v-if="state.unavailable" icon="people" :title="$t('groups.chat.unavailableTitle')" :text="$t('groups.chat.unavailableText')">
    <template #actions><AppButton to="/chats" variant="tonal">{{ $t('groups.chat.backToChats') }}</AppButton></template>
  </AppEmptyState>
  <template v-else>
    <div class="message-viewport">
    <div ref="scroller" class="messages" :style="{ visibility: state.loaded && !positioned ? 'hidden' : undefined }" aria-live="polite" tabindex="0" @scroll.passive="onScroll" @wheel.passive="onWheel" @touchstart.passive="onTouchStart" @touchmove.passive="onTouchMove" @keydown="onKeydown">
      <div ref="messageContent" class="message-content">
      <div class="spacer" />
      <div v-if="state.nextBefore" class="center">
        <AppButton variant="text" :disabled="state.loadingEarlier" @click="earlier">{{ $t('groups.chat.loadEarlier') }}</AppButton>
      </div>
      <AppLoading v-if="!state.loaded && !state.error" :label="$t('groups.chat.loading')" />
      <AppNotice v-if="state.error" tone="warning">
        {{ state.error }}
        <template #actions><button class="link-button" @click="refresh">{{ $t('common.retry') }}</button></template>
      </AppNotice>
      <AppEmptyState v-if="state.loaded && !state.messages.length && !state.pending" icon="chat" :title="$t('groups.chat.emptyTitle')" :text="$t('groups.chat.emptyText')" />

      <template v-for="item in items" :key="item.key">
        <div v-if="item.kind === 'day'" class="day">{{ item.label }}</div>
        <div v-else-if="item.kind === 'event'" class="system-banner" role="note">{{ eventText(item.message) }}</div>
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
          <div class="bubble" :class="{ media: isMedia(item.message), sticker: isSticker(item.message) }">
            <span
              v-if="!isMine(item.message) && item.first" class="sender"
              :style="[senderStyle(item.message), isMedia(item.message) ? { padding: '4px 8px 0' } : {}]"
            >{{ senderOf(item.message)?.name ?? item.message.senderName }}</span>
            <MessageReplyQuote v-if="item.message.replyTo" :preview="replyPreview(item.message.replyTo)" interactive @open="showQuoted(item.message.replyTo)" />
            <VoiceMessage v-if="item.message.voice" :voice="item.message.voice" :path="attachmentPath(item.message)" :outgoing="isMine(item.message)" :sender-name="item.message.senderName" :sender-photo="senderPhoto(item.message)" />
            <MessageAttachment v-else-if="item.message.attachment" :attachment="item.message.attachment" :attachments="item.message.attachments" :path="attachmentPath(item.message)" />
            <div v-if="item.message.text && !item.message.voice" :class="{ caption: isMedia(item.message) }"><MessageMarkdown v-if="item.message.agentID" :text="item.message.text" /><template v-else><LinkifiedText :text="item.message.text" /></template><LinkPreviewCard :url="previewLink(item.message.text, !!item.message.agentID)" /></div>
            <MiniAppCard v-for="app in miniApps.state.value.apps.filter(a => a.replyID === item.message.id)" :key="app.id" :app="app" :base="`groups/${groupID}`" />
            <DocumentCard v-for="doc in documents.state.value.items.filter(d => d.sourceID === item.message.id)" :key="doc.id" :document="doc" :to="`/groups/${groupID}/documents/${doc.id}`" />
            <div class="meta" :style="isMedia(item.message) ? 'padding: 0 6px 2px' : ''">
              {{ messageTime(item.message.createdAt) }}<MessageReceipt v-if="isMine(item.message)" :receipt-state="item.message.receiptState ?? 'sent'" />
            </div>
          </div>
          </MessageReactions>
        </div>
        <template v-if="item.kind !== 'day'">
          <div v-for="reply in failedRepliesFor(item.message)" :key="reply.id" class="status-line" role="status">
            {{ $t('groups.chat.replyFailed', { name: reply.name }) }}
            <button class="link-button" :disabled="activeReplies.length > 0" @click="retryReply(reply.id)">{{ $t('groups.chat.retryReply') }}</button>
          </div>
        </template>
      </template>

      <template v-if="state.pending">
        <div class="bubble-row outgoing">
          <div class="bubble" :class="{ media: state.pending.attachment?.previewURL, sticker: !!state.pending.sticker }">
            <MessageReplyQuote v-if="state.pending.replyTo" :preview="replyPreview(state.pending.replyTo)" />
            <MessageAttachment v-if="state.pending.sticker" :attachment="stickerAttachment(state.pending.sticker)" :path="state.pending.sticker.path" />
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
          <NuxtLink v-if="state.pending.failedCode === 'GROUP_CONTRIBUTOR_CONSENT_REQUIRED'" class="link-button" :to="`/groups/${groupID}/members`">{{ $t('groups.members.members') }}</NuxtLink>
          <button class="link-button" @click="submit">{{ $t('common.retry') }}</button>
          <button class="link-button danger" @click="discardPending">{{ state.pending.voice || state.pending.sticker ? $t('common.delete') : $t('common.edit') }}</button>
        </div>
      </template>

      <div v-for="reply in workingReplies" :key="reply.id" class="bubble-row incoming">
        <div class="avatar-slot"><AppAvatar :name="reply.name" :path="memberPhoto(members.get(`agent/${reply.agentID}`))" :size="28" /></div>
        <div class="work-status" role="status"><span class="typing-dots" aria-hidden="true"><span /><span /><span /></span><span><strong>{{ reply.name }}</strong> · {{ reply.taskTitle ? $t('groups.chat.workingOn', { title: reply.taskTitle }) : $t('groups.chat.workingOnTask') }}</span></div>
      </div>
      <div v-for="reply in typingReplies" :key="reply.id" class="bubble-row incoming">
        <div class="avatar-slot" />
        <div class="typing"><ActivityIndicator :activity="reply.replyActivity === 'researching' ? 'researching' : reply.replyActivity === 'recording' ? 'recording' : 'typing'" :name="reply.name" /></div>
      </div>
      </div>
    </div>
    <ChatScrollDown v-if="positioned && !pinned" @click="scrollToBottom" />
    </div>
    <ChatComposer
      ref="composer" v-model="state.draft" :disabled="!!state.pending || !state.loaded || state.snapshot?.group.clearing === 1" :reply="replyTarget"
      :voice-key="groupID" :stickers="groupStickers" @send="onSend" @voice="onVoice" @sticker="onSticker" @cancel-reply="state.replyTo = null"
    />
  </template>
</template>
