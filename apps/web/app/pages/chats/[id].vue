<script setup lang="ts">
import type { ChatTurn, Contact, DraftAttachment, ReplyQuote } from '~/utils/types';

const route = useRoute();
const contactID = computed(() => String(route.params.id));
const chats = useChats();
const { state, load, loadEarlier, send, submit, discardPending, retryReply, markRead } = useConversation(contactID);
const activity = useChatActivity(contactID);
const remote = useRemoteNative(contactID);
const miniApps = useMiniApps(contactID);
const documents = useDocuments(() => `contacts/${contactID.value}`);
// Cards appear under the reply that created a document; refresh when new replies arrive.
watch(() => state.value.turns.at(-1)?.assistantMessages?.length, () => documents.refresh(), { immediate: true });
const remoteError = ref<string | null>(null);
function remoteStatus(status: string) {
  return ({ completed: 'Scheduled on iPhone', pending: 'Sent · waiting for iPhone', running: 'Claimed · outcome not yet confirmed', expired: 'Expired without confirmation', failed: 'Could not schedule', cancelled: 'Cancelled', unknown: 'Outcome unknown · check iPhone' } as Record<string, string>)[status] ?? status;
}
// Visual tone per status; the same mapping as NativeActionTone on iOS.
function remoteTone(status: string) {
  return ({ completed: 'done', pending: 'waiting', running: 'attention', unknown: 'attention', failed: 'failed' } as Record<string, string>)[status] ?? 'inactive';
}
const remoteToneIcons = { done: 'check', waiting: 'clock', attention: 'alert', failed: 'x-circle', inactive: 'minus' } as const;
// The device picker appears once this account has a linked iPhone; setup lives in /native.
const showRemote = computed(() => remote.state.value.devices.length > 0 || !!state.value.remoteDeviceID || !!remoteError.value || !!remote.state.value.error);
async function revokeRemote() {
  const deviceID = state.value.remoteDeviceID;
  if (!deviceID) return;
  try { await remote.revoke(deviceID); state.value.remoteDeviceID = null; remoteError.value = null; }
  catch (failure) { remoteError.value = errorMessage(failure); }
}
const fetched = ref<Contact | null>(null);
const contact = computed(() => chats.contacts.value.find((item) => item.id === contactID.value) ?? fetched.value);
const scroller = ref<HTMLElement>();
const composer = ref<{ focus: () => void }>();

useHead({ title: computed(() => contact.value?.name ?? 'Chat') });

type MessageItem = { kind: 'user' | 'assistant' | 'status'; key: string; turn: ChatTurn; timestamp: number; text?: string; first?: boolean };
type PendingItem = { kind: 'pending'; key: string; timestamp: number };
type Item = { kind: 'day'; key: string; label: string } | MessageItem | PendingItem;

// Server turns retain sequence order for paging. Render each side independently
// so a reply created after another human message cannot appear ahead of it.
const items = computed<Item[]>(() => {
  const turns = state.value.turns;
  const latestTimestamp = Math.max(0, ...turns.map(turn => Math.max(turn.createdAt, turn.updatedAt)), state.value.pending?.createdAt ?? 0);
  const messages: (MessageItem | PendingItem)[] = turns.flatMap((turn): MessageItem[] => [
    ...((turn.scheduleID === null && (!!turn.userText || !!turn.attachment))
      || remote.state.value.actions.some(action => action.turnID === turn.id)
      ? [{ kind: 'user' as const, key: `${turn.id}-user`, turn, timestamp: turn.createdAt }] : []),
    ...(turn.assistantMessages?.length
      ? turn.assistantMessages.map((message, index) => ({ kind: 'assistant' as const, key: message.id, turn, timestamp: message.createdAt, text: message.text, first: index === 0 }))
      : turn.assistantText !== null
        ? [{ kind: 'assistant' as const, key: `${turn.id}-assistant`, turn, timestamp: turn.updatedAt, text: turn.assistantText, first: true }] : []),
    ...(turn.status === 'queued' || turn.status === 'running' || turn.status === 'failed'
      ? [{ kind: 'status' as const, key: `${turn.id}-status`, turn, timestamp: latestTimestamp + 1 }] : []),
  ]);
  if (state.value.pending) messages.push({ kind: 'pending', key: state.value.pending.id, timestamp: state.value.pending.createdAt });
  const rank = { user: 0, pending: 0, assistant: 1, status: 2 };
  messages.sort((a, b) => a.timestamp - b.timestamp || rank[a.kind] - rank[b.kind]
    || ('turn' in a && 'turn' in b ? a.turn.sequence - b.turn.sequence : 0) || a.key.localeCompare(b.key));
  const result: Item[] = [];
  let day = '';
  for (const item of messages) {
    const label = dayLabel(item.timestamp);
    if (label !== day) {
      day = label;
      result.push({ kind: 'day', key: `day-${item.key}`, label });
    }
    result.push(item);
  }
  return result;
});
const lastTurnID = computed(() => state.value.turns.at(-1)?.id);
const replying = computed(() => state.value.turns.some((turn) => turn.status === 'queued' || turn.status === 'running'));
// A task work turn has no human message; say what the contact is working on instead.
const working = computed(() => state.value.turns.find((turn) => turn.taskID && (turn.status === 'queued' || turn.status === 'running')));
const workLabel = (turn: ChatTurn) => turn.taskTitle ? `Working on “${turn.taskTitle}”` : 'Working on a task';

function replyPreview(quote: ReplyQuote) {
  return quote.side === 'user'
    ? { quote, author: 'You', color: ownReplyColor }
    : { quote, author: contact.value?.name ?? 'Contact', color: replyColor(contactID.value, 'contact') };
}
const replyTarget = computed(() => state.value.replyTo ? replyPreview(state.value.replyTo) : null);
const canReply = computed(() => state.value.loaded && !state.value.unavailable);
function startReply(turn: ChatTurn, side: 'user' | 'assistant') {
  state.value.replyTo = side === 'assistant'
    ? localReplyQuote(turn.id, side, turn.assistantText ?? '', null)
    : localReplyQuote(turn.id, side, turn.userText, turn.attachment ?? null);
  composer.value?.focus();
}

// Scroll to a quoted message, paging earlier history within a bound when needed.
const highlighted = ref<string | null>(null);
let highlightTimer: ReturnType<typeof setTimeout> | undefined;
async function showQuoted(quote: ReplyQuote) {
  if (!quote.available) return;
  for (let pages = 0; pages < 20 && !state.value.turns.some((turn) => turn.id === quote.messageID); pages += 1) {
    const cursor = state.value.nextBefore;
    if (!cursor) break;
    await earlier();
    if (state.value.nextBefore === cursor) break;
  }
  await nextTick();
  const key = `${quote.messageID}-${quote.side}`;
  const element = document.getElementById(`message-${key}`);
  if (!element) return;
  element.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  highlighted.value = key;
  clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => { highlighted.value = null; }, 1200);
}

function attachmentPath(turn: ChatTurn) {
  return `contacts/${contactID.value}/chat/turns/${turn.id}/attachment`;
}
function failureText(turn: ChatTurn) {
  if (turn.errorCode === 'SCHEDULE_CANCELLED') return 'Scheduled message cancelled.';
  if (turn.errorCode === 'GROUP_REQUEST_CANCELLED') return 'Group request cancelled.';
  return "The reply to this message couldn't be completed.";
}

function nearBottom() {
  const element = scroller.value;
  return !element || element.scrollHeight - element.scrollTop - element.clientHeight < 120;
}
// Photos size themselves when they load, after the first scroll to the bottom;
// keep the view pinned while they grow if the reader was already at the end.
let pinned = true;
function onScroll() { pinned = nearBottom(); }
function onMediaLoad() { if (pinned) scrollToBottom(); }
function scrollToBottom() {
  nextTick(() => {
    const element = scroller.value;
    if (element) element.scrollTop = element.scrollHeight;
  });
}

async function refresh() {
  const stick = nearBottom();
  await Promise.all([load(), remote.refresh(), miniApps.refresh()]);
  if (remote.state.value.loaded && state.value.remoteDeviceID && !remote.state.value.devices.some(d => d.id === state.value.remoteDeviceID)) state.value.remoteDeviceID = null;
  if (stick) scrollToBottom();
  if (document.visibilityState === 'visible') markRead();
}

async function earlier() {
  const element = scroller.value;
  const previousHeight = element?.scrollHeight ?? 0;
  await loadEarlier();
  // Preserve the reading position when older history is prepended.
  nextTick(() => { if (element) element.scrollTop += element.scrollHeight - previousHeight; });
}

async function onSend(text: string, attachment: DraftAttachment | null) {
  scrollToBottom();
  activity.sent();
  await send(text, attachment);
  scrollToBottom();
}

// One-second tick while visible, like the iOS session synchronizer.
const { now: pollNow } = usePolling(refresh, () => 1000);

watch(contactID, async () => {
  fetched.value = null;
  scrollToBottom();
  await pollNow();
});

onMounted(async () => {
  window.addEventListener('focus', markRead);
  scrollToBottom();
  await pollNow();
  if (!contact.value) {
    try { fetched.value = (await api<{ contact: Contact }>(`contacts/${contactID.value}`)).contact; }
    catch { /* The conversation request reports availability. */ }
  }
  composer.value?.focus();
});
onBeforeUnmount(() => {
  window.removeEventListener('focus', markRead);
  clearTimeout(highlightTimer);
});
</script>

<template>
  <PageBar>
    <template #title>
      <NuxtLink :to="`/contacts/${contactID}/edit`" class="title" aria-label="Contact details">
        <AppAvatar :name="contact?.name ?? ''" :path="contact ? contactPhotoPath(contact) : null" :size="36" />
        <div>
          <div class="name">{{ contact?.name ?? 'Chat' }}</div>
          <div class="subtitle">{{ working ? `${workLabel(working)}…` : presenceLabel(state.presence) }}</div>
        </div>
      </NuxtLink>
    </template>
    <NuxtLink :to="`/contacts/${contactID}/tasks`" class="icon-button" aria-label="Tasks" title="Tasks"><AppIcon name="tasks" /></NuxtLink>
  </PageBar>

  <div v-if="state.unavailable" class="empty">
    <h2>Contact unavailable</h2>
    <p>This contact is no longer available.</p>
    <NuxtLink to="/" class="button secondary">Back to Chats</NuxtLink>
  </div>
  <template v-else>
    <div v-if="showRemote" class="remote-native-bar">
      <span class="native-glyph small" data-kind="timer"><AppIcon name="iphone" /></span>
      <div class="remote-copy">
        <label for="remote-device">Timers and alarms</label>
        <p v-if="state.remoteDeviceID">Requests go to your iPhone through a visible notification, even while locked. Device confirmation is required before reporting success.</p>
        <p v-else>Choose your iPhone to schedule timers and alarms from this chat.</p>
        <p v-if="remote.state.value.error || remoteError" class="error">{{ remoteError || remote.state.value.error }}</p>
      </div>
      <div class="remote-actions">
        <AppSelect
          id="remote-device" v-model="state.remoteDeviceID" variant="tonal" class="device-select" :disabled="!!state.pending || !remote.state.value.loaded"
          :options="[{ value: null, label: 'No remote device' }, ...remote.state.value.devices.map(device => ({ value: device.id, label: `${device.name} · ${device.id.slice(-6)}` }))]"
        />
        <button type="button" class="icon-button" title="Refresh devices" aria-label="Refresh devices" @click="remote.refresh(true)"><AppIcon name="refresh" /></button>
        <button v-if="state.remoteDeviceID" type="button" class="link-button danger" @click="revokeRemote">Revoke access</button>
      </div>
    </div>
    <div ref="scroller" class="messages" aria-live="polite" @scroll.passive="onScroll" @load.capture="onMediaLoad">
      <div class="spacer" />
      <div v-if="state.nextBefore" class="center">
        <button class="link-button" :disabled="state.loadingEarlier" @click="earlier">Load earlier messages</button>
      </div>
      <div v-if="!state.loaded && !state.error" class="center"><span class="spinner" /> Loading messages…</div>
      <div v-if="state.error" class="notice" role="status">
        {{ state.error }}
        <button class="link-button" @click="refresh">Retry</button>
      </div>
      <div v-if="state.loaded && !state.turns.length && !state.pending" class="empty">
        <h2>Start a conversation</h2>
        <p>Send your first message.</p>
      </div>

      <template v-for="item in items" :key="item.key">
        <div v-if="item.kind === 'day'" class="day">{{ item.label }}</div>
      <template v-else-if="item.kind === 'pending' && state.pending">
        <div v-if="state.pending.attachment" class="bubble-row outgoing">
          <div class="bubble media">
            <MessageReplyQuote v-if="state.pending.replyTo" :preview="replyPreview(state.pending.replyTo)" />
            <MessageAttachment :attachment="state.pending.attachment" :path="null" :local-url="state.pending.attachment.previewURL" />
            <div v-if="state.pending.text && state.pending.attachment.previewURL" class="caption">{{ state.pending.text }}</div>
            <div class="meta" style="padding: 0 6px 2px">{{ messageTime(state.pending.createdAt) }}<MessageReceipt sending /></div>
          </div>
        </div>
        <div v-if="state.pending.text && !state.pending.attachment?.previewURL" class="bubble-row outgoing">
          <div class="bubble"><MessageReplyQuote v-if="state.pending.replyTo && !state.pending.attachment" :preview="replyPreview(state.pending.replyTo)" />{{ state.pending.text }}<div class="meta">{{ messageTime(state.pending.createdAt) }}<MessageReceipt sending /></div></div>
        </div>
        <div v-if="state.pending.failed" class="status-line outgoing error">
          {{ state.pending.failed }}
          <button class="link-button" @click="submit">Retry</button>
          <button class="link-button danger" @click="discardPending">Edit</button>
        </div>
      </template>
        <template v-else-if="item.kind !== 'pending'">
          <div
            v-if="item.kind === 'user' && item.turn.scheduleID === null && (item.turn.userText || item.turn.attachment)" :id="`message-${item.turn.id}-user`"
            class="bubble-row outgoing" :class="{ highlighted: highlighted === `${item.turn.id}-user` }"
          >
            <MessageReactions :cache="state.reactions" :path="`contacts/${contactID}/chat/reactions`" :message-i-d="item.turn.id" side="user" :replyable="canReply" @reply="startReply(item.turn, 'user')">
              <div class="private-message-content">
                <div v-if="item.turn.attachment" class="bubble media">
                  <MessageReplyQuote v-if="item.turn.replyTo" :preview="replyPreview(item.turn.replyTo)" interactive @open="showQuoted(item.turn.replyTo)" />
                  <MessageAttachment :attachment="item.turn.attachment" :path="attachmentPath(item.turn)" />
                  <div v-if="item.turn.userText && item.turn.attachment.mimeType.startsWith('image/')" class="caption">{{ item.turn.userText }}</div>
                  <div class="meta" style="padding: 0 6px 2px">{{ messageTime(item.turn.createdAt) }}<MessageReceipt :read-at="item.turn.readAt" /></div>
                </div>
                <div v-if="item.turn.userText && !item.turn.attachment?.mimeType.startsWith('image/')" class="bubble"><MessageReplyQuote v-if="item.turn.replyTo && !item.turn.attachment" :preview="replyPreview(item.turn.replyTo)" interactive @open="showQuoted(item.turn.replyTo)" />{{ item.turn.userText }}<div class="meta">{{ messageTime(item.turn.createdAt) }}<MessageReceipt :read-at="item.turn.readAt" /></div></div>
              </div>
            </MessageReactions>
          </div>
          <div
            v-if="item.kind === 'assistant' && item.turn.assistantText" :id="item.first ? `message-${item.turn.id}-assistant` : item.key"
            class="bubble-row incoming" :class="{ highlighted: highlighted === `${item.turn.id}-assistant` }"
          >
            <MessageReactions :cache="state.reactions" :path="`contacts/${contactID}/chat/reactions`" :message-i-d="item.turn.id" side="assistant" :replyable="canReply" @reply="startReply(item.turn, 'assistant')">
              <div class="bubble" :class="{ media: item.first && item.turn.assistantMessages?.[0]?.attachment }">
                <MessageReplyQuote v-if="item.first && item.turn.assistantMessages?.[0]?.replyTo" :preview="replyPreview(item.turn.assistantMessages[0].replyTo)" interactive @open="showQuoted(item.turn.assistantMessages[0].replyTo)" />
                <MessageAttachment v-if="item.first && item.turn.assistantMessages?.[0]?.attachment" :attachment="item.turn.assistantMessages[0].attachment" :path="`contacts/${contactID}/chat/turns/${item.turn.id}/attachment?side=assistant`" />
                <div :class="{ caption: item.first && item.turn.assistantMessages?.[0]?.attachment }"><MessageMarkdown :text="item.text ?? item.turn.assistantText" /></div>
                <template v-if="item.first">
                  <MiniAppCard v-for="app in miniApps.state.value.apps.filter(a => a.turnID === item.turn.id)" :key="app.id" :app="app" :contact-id="contactID" />
                  <DocumentCard v-for="doc in documents.state.value.items.filter(d => d.sourceID === item.turn.id)" :key="doc.id" :document="doc" :to="`/contacts/${contactID}/documents/${doc.id}`" />
                </template>
                <div class="meta">{{ messageTime(item.timestamp) }}</div>
              </div>
            </MessageReactions>
          </div>
          <div v-else-if="item.kind === 'status' && item.turn.taskID && (item.turn.status === 'queued' || item.turn.status === 'running')" class="bubble-row incoming">
            <div class="work-status" role="status"><span class="typing-dots" aria-hidden="true"><span /><span /><span /></span>{{ workLabel(item.turn) }}</div>
          </div>
          <div v-else-if="item.kind === 'status' && item.turn.status === 'running' && state.presence?.status === 'typing'" class="bubble-row incoming">
            <div class="typing" aria-label="Typing"><span /><span /><span /></div>
          </div>
          <div v-else-if="item.kind === 'status' && item.turn.status === 'failed' && !state.turns.some((later) => later.sequence > item.turn.sequence && later.assistantText !== null)" class="status-line">
            {{ failureText(item.turn) }}
            <button
              v-if="item.turn.scheduleID === null && item.turn.groupRequestID === null && !item.turn.taskID && item.turn.id === lastTurnID"
              class="link-button" :disabled="state.retrying || replying || !!state.pending" @click="retryReply(item.turn)"
            >Retry reply</button>
          </div>
          <div v-for="action in remote.state.value.actions.filter(a => item.kind === 'user' && a.turnID === item.turn.id)" :key="action.id" class="native-receipt" :class="remoteTone(action.status)">
            <span class="native-glyph" :data-kind="action.kind"><AppIcon :name="action.kind === 'alarm' ? 'alarm' : 'timer'" /></span>
            <div>
              <strong>{{ action.title }}</strong>
              <span class="status"><AppIcon :name="remoteToneIcons[remoteTone(action.status) as keyof typeof remoteToneIcons]" />{{ action.deviceName }} · {{ remoteStatus(action.status) }}</span>
            </div>
          </div>
        </template>
      </template>


    </div>
    <ChatComposer
      ref="composer" v-model="state.draft" :disabled="!state.loaded || state.unavailable" :sending="!!state.pending" :reply="replyTarget"
      @send="onSend" @typing="activity.typing()" @cancel-reply="state.replyTo = null"
    />
  </template>
</template>

<style scoped>
.remote-native-bar { display: flex; align-items: center; gap: 12px; padding: 8px 12px 8px 16px; border-bottom: 1px solid var(--separator); background: var(--background); }
.remote-copy { flex: 1; min-width: 0; }
.remote-copy label { display: block; font-size: 14px; font-weight: 700; }
.remote-copy p { margin: 1px 0 0; font-size: 12px; color: var(--secondary); }
.remote-copy p.error { color: var(--danger); }
.remote-actions { display: flex; align-items: center; gap: 4px; flex: none; }
.device-select { min-width: 0; max-width: 220px; }
.remote-actions .icon-button svg { width: 18px; height: 18px; }
@media (max-width: 560px) {
  .remote-native-bar { flex-wrap: wrap; }
  .remote-actions { width: 100%; padding-left: 38px; }
  .device-select { flex: 1; max-width: none; }
}
</style>
