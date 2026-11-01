<script setup lang="ts">
import type { ChatTurn, Contact, DraftAttachment, DraftVoice, ReplyQuote } from '~/utils/types';
import type { RemoteNativeDevice } from '~/composables/useRemoteNative';

const route = useRoute();
const contactID = computed(() => String(route.params.id));
const chats = useChats();
const { state, load, loadEarlier, send, submit, discardPending, retryReply, markRead } = useConversation(contactID);
const activity = useChatActivity(contactID);
const remote = useRemoteNative(contactID);
useVisibleConversation(() => `contact/${contactID.value}`);
const miniApps = useMiniApps(() => `contacts/${contactID.value}`);
const documents = useDocuments(() => `contacts/${contactID.value}`);
// Cards appear under the reply that created a document; refresh when new replies arrive.
watch(() => state.value.turns.at(-1)?.assistantMessages?.length, () => documents.refresh(), { immediate: true });
const remoteError = ref<string | null>(null);
// Receipt copy names the phone; deviceName already reads "Ana’s iPhone" for a shared phone.
function remoteStatus(action: { status: string; deviceName: string }) {
  const device = action.deviceName;
  return ({ completed: `Set on ${device}`, pending: `Sending to ${device}…`, running: `Reached ${device} · not confirmed yet`, expired: `${device} didn’t respond in time`, failed: `${device} couldn’t set it`, cancelled: `Cancelled on ${device}` } as Record<string, string>)[action.status] ?? `Not confirmed · check ${device}`;
}
// Visual tone per status; the same mapping as NativeActionTone on iOS.
function remoteTone(status: string) {
  return ({ completed: 'done', pending: 'waiting', running: 'attention', unknown: 'attention', failed: 'failed' } as Record<string, string>)[status] ?? 'inactive';
}
const remoteToneIcons = { done: 'check', waiting: 'clock', attention: 'alert', failed: 'x-circle', inactive: 'minus' } as const;
// The destination chip appears once a phone is available to this chat; setup lives on the iPhone.
const showRemote = computed(() => remote.state.value.devices.length > 0 || !!state.value.remoteDeviceID || !!remoteError.value || !!remote.state.value.error);
const selectedRemote = computed(() => remote.state.value.devices.find(device => device.id === state.value.remoteDeviceID));
const remoteUnavailable = computed(() => !!state.value.remoteDeviceID && remote.state.value.loaded && !selectedRemote.value);
const ownedRemotes = computed(() => remote.state.value.devices.filter(device => device.owned));
const remoteSheet = ref(false);
// "Your iPhone" for this account, "Ana’s iPhone" for a shared one; a suffix only when two read the same.
function deviceLabel(device: RemoteNativeDevice) {
  const base = (d: RemoteNativeDevice) => d.owned ? `Your ${d.name}` : d.name;
  const name = base(device);
  return remote.state.value.devices.filter(d => base(d) === name).length > 1 ? `${name} · ${device.id.slice(-4)}` : name;
}
const remoteChipLabel = computed(() => remoteUnavailable.value ? 'Selected iPhone unavailable'
  : selectedRemote.value ? `Timers & alarms: ${deviceLabel(selectedRemote.value)}` : 'Timers & alarms: Off');
function delegated(deviceID: string, participantID: string) {
  return remote.state.value.delegations.some(g => g.deviceID === deviceID && g.participantID === participantID);
}
async function setDelegate(deviceID: string, participantID: string, event: Event) {
  const input = event.target as HTMLInputElement;
  try { await remote.delegate(deviceID, participantID, input.checked); remoteError.value = null; }
  catch (failure) { input.checked = !input.checked; remoteError.value = errorMessage(failure); }
}
async function revokeRemote(deviceID: string) {
  try {
    await remote.revoke(deviceID);
    if (state.value.remoteDeviceID === deviceID) state.value.remoteDeviceID = null;
    remoteError.value = null;
  } catch (failure) { remoteError.value = errorMessage(failure); }
}
const fetched = ref<Contact | null>(null);
const contact = computed(() => chats.contacts.value.find((item) => item.id === contactID.value) ?? fetched.value);
const scroller = ref<HTMLElement>();
const messageContent = ref<HTMLElement>();
const composer = ref<{ focus: () => void }>();


// `part` is the index of a contact message within its turn (voice downloads use it).
type MessageItem = { kind: 'user' | 'assistant' | 'status'; key: string; turn: ChatTurn; timestamp: number; text?: string; first?: boolean; part?: number };
type PendingItem = { kind: 'pending'; key: string; timestamp: number };
type Item = { kind: 'day'; key: string; label: string } | MessageItem | PendingItem;

// Server turns retain sequence order for paging. Render each side independently
// so a reply created after another human message cannot appear ahead of it.
const items = computed<Item[]>(() => {
  const turns = state.value.turns;
  const latestTimestamp = Math.max(0, ...turns.map(turn => Math.max(turn.createdAt, turn.updatedAt)), state.value.pending?.createdAt ?? 0);
  const messages: (MessageItem | PendingItem)[] = turns.flatMap((turn): MessageItem[] => [
    ...((turn.scheduleID === null && (!!turn.userText || !!turn.attachment || !!turn.voice))
      || remote.state.value.actions.some(action => action.turnID === turn.id)
      ? [{ kind: 'user' as const, key: `${turn.id}-user`, turn, timestamp: turn.createdAt }] : []),
    ...(turn.assistantMessages?.length
      ? turn.assistantMessages.map((message, index) => ({ kind: 'assistant' as const, key: message.id, turn, timestamp: message.createdAt, text: message.text, first: index === 0, part: index }))
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
const { positioned, pinned, onScroll, onWheel, onTouchStart, onTouchMove, onKeydown, scrollToBottom } = useChatScroll(
  scroller, messageContent, contactID, () => state.value.loaded, () => items.value,
);

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
// A contact voice message: its audio is addressed by side and message index.
function assistantVoice(item: MessageItem) {
  return item.part === undefined ? null : item.turn.assistantMessages?.[item.part]?.voice ?? null;
}
function assistantVoicePath(item: MessageItem) {
  return `${attachmentPath(item.turn)}?side=assistant&part=${item.part ?? 0}`;
}
function failureText(turn: ChatTurn) {
  if (turn.errorCode === 'SCHEDULE_CANCELLED') return 'Scheduled message cancelled.';
  if (turn.errorCode === 'GROUP_REQUEST_CANCELLED') return 'Group request cancelled.';
  if (turn.errorCode === 'VOICE_TRANSCRIPTION_FAILED') return "This voice message couldn't be transcribed.";
  return "The reply to this message couldn't be completed.";
}

async function refresh() {
  await Promise.all([load(), remote.refresh(), miniApps.refresh()]);
  if (document.visibilityState === 'visible') markRead();
}

async function earlier() {
  await loadEarlier();
}

async function onSend(text: string, attachments: DraftAttachment[]) {
  scrollToBottom();
  activity.sent();
  // One message per attachment, text on the first; stop if one fails so the error stays visible.
  const queue = attachments.length ? attachments : [null];
  for (const [index, attachment] of queue.entries()) {
    await send(index === 0 ? text : '', attachment);
    if (state.value.pending?.failed) { for (const rest of queue.slice(index + 1)) if (rest?.previewURL) URL.revokeObjectURL(rest.previewURL); break; }
  }
}
async function onVoice(clip: DraftVoice) {
  scrollToBottom();
  activity.sent();
  await send('', null, clip);
}

// One-second tick while visible, like the iOS session synchronizer.
const { now: pollNow } = usePolling(refresh, () => 1000);
// The Tasks button only shows while this chat has an active list (docs/tasks.md#opening-tasks);
// the board is otherwise reachable from the chat details. Uses the shared board cache.
const taskBoard = useTasks(() => `contacts/${contactID.value}`);
const hasTasks = computed(() => !!taskBoard.state.value.value?.lists.some(list => list.status === 'active'));
usePolling(() => taskBoard.refresh(), () => 20_000);
onMounted(() => { void taskBoard.refresh(); });
watch(contactID, () => { void taskBoard.refresh(); });

watch(contactID, async () => {
  fetched.value = null;
  await pollNow();
});

onMounted(async () => {
  window.addEventListener('focus', markRead);
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
    <AppIconButton v-if="hasTasks" :to="`/contacts/${contactID}/tasks`" icon="tasks" label="Tasks" />
  </PageBar>

  <AppEmptyState v-if="state.unavailable" icon="person" title="Contact unavailable" text="This contact is no longer available.">
    <template #actions><AppButton to="/" variant="tonal">Back to Chats</AppButton></template>
  </AppEmptyState>
  <template v-else>
    <div class="message-viewport">
    <div ref="scroller" class="messages" :style="{ visibility: state.loaded && !positioned ? 'hidden' : undefined }" aria-live="polite" tabindex="0" @scroll.passive="onScroll" @wheel.passive="onWheel" @touchstart.passive="onTouchStart" @touchmove.passive="onTouchMove" @keydown="onKeydown">
      <div ref="messageContent" class="message-content">
      <div class="spacer" />
      <div v-if="state.nextBefore" class="center">
        <AppButton variant="text" :disabled="state.loadingEarlier" @click="earlier">Load earlier messages</AppButton>
      </div>
      <AppLoading v-if="!state.loaded && !state.error" label="Loading messages…" />
      <AppNotice v-if="state.error" tone="warning">
        {{ state.error }}
        <template #actions><button class="link-button" @click="refresh">Retry</button></template>
      </AppNotice>
      <AppEmptyState v-if="state.loaded && !state.turns.length && !state.pending" icon="chat" title="Start a conversation" text="Send your first message." />

      <template v-for="item in items" :key="item.key">
        <div v-if="item.kind === 'day'" class="day">{{ item.label }}</div>
      <template v-else-if="item.kind === 'pending' && state.pending">
        <div v-if="state.pending.voice" class="bubble-row outgoing">
          <div class="bubble">
            <MessageReplyQuote v-if="state.pending.replyTo" :preview="replyPreview(state.pending.replyTo)" />
            <VoiceMessage :voice="{ durationMs: state.pending.voice.durationMs, listenedAt: null, transcript: null }" :path="`contacts/${contactID}/chat/turns/${state.pending.id}/attachment`" :blob="state.pending.voice.blob" outgoing />
            <div class="meta">{{ messageTime(state.pending.createdAt) }}<MessageReceipt sending /></div>
          </div>
        </div>
        <div v-if="state.pending.attachment" class="bubble-row outgoing">
          <div class="bubble media">
            <MessageReplyQuote v-if="state.pending.replyTo" :preview="replyPreview(state.pending.replyTo)" />
            <MessageAttachment :attachment="state.pending.attachment" :path="null" :local-url="state.pending.attachment.previewURL" />
            <div v-if="state.pending.text && state.pending.attachment.previewURL" class="caption"><LinkifiedText :text="state.pending.text" /></div>
            <div class="meta">{{ messageTime(state.pending.createdAt) }}<MessageReceipt sending /></div>
          </div>
        </div>
        <div v-if="state.pending.text && !state.pending.attachment?.previewURL" class="bubble-row outgoing">
          <div class="bubble"><MessageReplyQuote v-if="state.pending.replyTo && !state.pending.attachment" :preview="replyPreview(state.pending.replyTo)" /><LinkifiedText :text="state.pending.text" /><div class="meta">{{ messageTime(state.pending.createdAt) }}<MessageReceipt sending /></div></div>
        </div>
        <div v-if="state.pending.failed" class="status-line outgoing error">
          {{ state.pending.failed }}
          <button class="link-button" @click="submit">Retry</button>
          <button class="link-button danger" @click="discardPending">{{ state.pending.voice ? 'Delete' : 'Edit' }}</button>
        </div>
      </template>
        <template v-else-if="item.kind !== 'pending'">
          <div
            v-if="item.kind === 'user' && item.turn.scheduleID === null && (item.turn.userText || item.turn.attachment || item.turn.voice)" :id="`message-${item.turn.id}-user`"
            class="bubble-row outgoing" :class="{ highlighted: highlighted === `${item.turn.id}-user` }"
          >
            <MessageReactions :cache="state.reactions" :path="`contacts/${contactID}/chat/reactions`" :message-i-d="item.turn.id" side="user" :replyable="canReply"
              :voice="!!item.turn.voice" :transcript="item.turn.voice?.transcript" @reply="startReply(item.turn, 'user')">
              <div class="private-message-content">
                <div v-if="item.turn.voice" class="bubble">
                  <MessageReplyQuote v-if="item.turn.replyTo" :preview="replyPreview(item.turn.replyTo)" interactive @open="showQuoted(item.turn.replyTo)" />
                  <VoiceMessage :voice="item.turn.voice" :path="attachmentPath(item.turn)" outgoing />
                  <div class="meta">{{ messageTime(item.turn.createdAt) }}<MessageReceipt :read-at="item.turn.readAt" /></div>
                </div>
                <template v-else>
                <div v-if="item.turn.attachment" class="bubble media">
                  <MessageReplyQuote v-if="item.turn.replyTo" :preview="replyPreview(item.turn.replyTo)" interactive @open="showQuoted(item.turn.replyTo)" />
                  <MessageAttachment :attachment="item.turn.attachment" :path="attachmentPath(item.turn)" />
                  <div v-if="item.turn.userText && item.turn.attachment.mimeType.startsWith('image/')" class="caption"><LinkifiedText :text="item.turn.userText" /></div>
                  <div class="meta">{{ messageTime(item.turn.createdAt) }}<MessageReceipt :read-at="item.turn.readAt" /></div>
                </div>
                <div v-if="item.turn.userText && !item.turn.attachment?.mimeType.startsWith('image/')" class="bubble"><MessageReplyQuote v-if="item.turn.replyTo && !item.turn.attachment" :preview="replyPreview(item.turn.replyTo)" interactive @open="showQuoted(item.turn.replyTo)" /><LinkifiedText :text="item.turn.userText" /><LinkPreviewCard :url="previewLink(item.turn.userText, false)" /><div class="meta">{{ messageTime(item.turn.createdAt) }}<MessageReceipt :read-at="item.turn.readAt" /></div></div>
                </template>
              </div>
            </MessageReactions>
          </div>
          <div
            v-if="item.kind === 'assistant' && item.turn.assistantText" :id="item.first ? `message-${item.turn.id}-assistant` : item.key"
            class="bubble-row incoming" :class="{ highlighted: highlighted === `${item.turn.id}-assistant` }"
          >
            <MessageReactions :cache="state.reactions" :path="`contacts/${contactID}/chat/reactions`" :message-i-d="item.turn.id" side="assistant" :replyable="canReply"
              :voice="!!assistantVoice(item)" :transcript="item.text ?? null" @reply="startReply(item.turn, 'assistant')">
              <div class="bubble" :class="{ media: item.first && item.turn.assistantMessages?.[0]?.attachment }">
                <MessageReplyQuote v-if="item.first && item.turn.assistantMessages?.[0]?.replyTo" :preview="replyPreview(item.turn.assistantMessages[0].replyTo)" interactive @open="showQuoted(item.turn.assistantMessages[0].replyTo)" />
                <MessageAttachment v-if="item.first && item.turn.assistantMessages?.[0]?.attachment" :attachment="item.turn.assistantMessages[0].attachment" :attachments="item.turn.assistantMessages[0].attachments" :path="`contacts/${contactID}/chat/turns/${item.turn.id}/attachment?side=assistant`" />
                <VoiceMessage v-if="assistantVoice(item)" :voice="assistantVoice(item)!" :path="assistantVoicePath(item)" :sender-name="contact?.name" :sender-photo="contact ? contactPhotoPath(contact) : null" />
                <div v-else :class="{ caption: item.first && item.turn.assistantMessages?.[0]?.attachment }"><MessageMarkdown :text="item.text ?? item.turn.assistantText" /><LinkPreviewCard :url="previewLink(item.text ?? item.turn.assistantText, true)" /></div>
                <template v-if="item.first">
                  <MiniAppCard v-for="app in miniApps.state.value.apps.filter(a => a.turnID === item.turn.id)" :key="app.id" :app="app" :base="`contacts/${contactID}`" />
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
            <div class="typing"><ActivityIndicator :activity="state.presence?.isResearching ? 'researching' : state.presence?.isRecording ? 'recording' : 'typing'" :name="contact?.name" /></div>
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
              <span class="status"><AppIcon :name="remoteToneIcons[remoteTone(action.status) as keyof typeof remoteToneIcons]" />{{ remoteStatus(action) }}</span>
            </div>
          </div>
        </template>
      </template>


      </div>
    </div>
    <ChatScrollDown v-if="positioned && !pinned" @click="scrollToBottom" />
    </div>
    <div v-if="showRemote" class="remote-target">
      <button
        type="button" class="remote-chip" :class="{ active: !!selectedRemote, error: remoteUnavailable }"
        aria-haspopup="dialog" :aria-label="`Where timers and alarms go: ${remoteChipLabel}`" @click="remoteSheet = true"
      >
        <AppIcon :name="remoteUnavailable ? 'alert' : selectedRemote ? 'iphone' : 'timer'" />
        <span>{{ remoteChipLabel }}</span>
        <AppIcon name="expand" />
      </button>
      <p v-if="remoteUnavailable" class="remote-note error">That phone’s access was turned off or it signed out. Choose where to send timers before asking again.</p>
      <p v-if="remoteError || remote.state.value.error" class="remote-note error">{{ remoteError || remote.state.value.error }}</p>
    </div>
    <AppSheet v-if="remoteSheet" title="Timers and alarms" @close="remoteSheet = false">
      <p class="muted small sheet-lead">
        Pick a phone, then ask {{ contact?.name ?? 'your contact' }} for a timer or alarm here. The phone gets it as a notification, even while locked, and this chat shows when it’s set.
      </p>
      <AppListGroup title="Send from this chat to" role="radiogroup" aria-label="Send timers and alarms to"
        :footer="state.pending ? 'You can change this once the current message is sent.' : undefined">
        <label class="choice-row">
          <input v-model="state.remoteDeviceID" type="radio" name="remote-device" :value="null" :disabled="!!state.pending">
          <span>Don’t send to a phone</span>
        </label>
        <label v-if="remoteUnavailable" class="choice-row">
          <input v-model="state.remoteDeviceID" type="radio" name="remote-device" :value="state.remoteDeviceID" disabled>
          <span><strong>Selected iPhone unavailable</strong><span class="small muted">Access was turned off or the phone signed out</span></span>
        </label>
        <label v-for="device in remote.state.value.devices" :key="device.id" class="choice-row">
          <input v-model="state.remoteDeviceID" type="radio" name="remote-device" :value="device.id" :disabled="!!state.pending">
          <span>{{ deviceLabel(device) }}</span>
        </label>
      </AppListGroup>
      <template v-for="device in ownedRemotes" :key="device.id">
        <AppListGroup :title="`Who can send to ${deviceLabel(device).replace(/^Your /, 'your ')}`"
          footer="They can’t see your chats or anything else on your phone. Turning this off doesn’t remove alarms already set. To receive again after stopping, turn it on in the iPhone app.">
          <AppListItem plain icon="person" supporting="From this browser and your other devices">You</AppListItem>
          <AppSwitch
            v-for="participant in remote.state.value.participants" :key="participant.id" icon="person"
            :label="participant.name" :supporting="`Asks ${contact?.name ?? 'this contact'} in their own chat`"
            :checked="delegated(device.id, participant.id)" :disabled="remote.state.value.mutating"
            @change="setDelegate(device.id, participant.id, $event)"
          />
          <AppListItem danger icon="block" @click="revokeRemote(device.id)">Stop receiving on {{ deviceLabel(device).replace(/^Your /, 'your ') }}</AppListItem>
        </AppListGroup>
      </template>
      <template #actions><AppButton @click="remoteSheet = false">Done</AppButton></template>
    </AppSheet>
    <ChatComposer
      ref="composer" v-model="state.draft" :disabled="!state.loaded || state.unavailable || contact?.clearing === 1" :sending="!!state.pending" :reply="replyTarget"
      :voice-key="contactID" @send="onSend" @voice="onVoice" @typing="activity.typing()" @cancel-reply="state.replyTo = null"
    />
  </template>
</template>

<style scoped>
.remote-target { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-1); padding: var(--space-2) var(--space-4) 0; }
.remote-chip {
  display: inline-flex; align-items: center; gap: var(--space-1-5); max-width: 100%; min-height: 32px; padding: 0 var(--space-2) 0 var(--space-3);
  border: 0; border-radius: var(--md-shape-full, 999px); font: var(--type-label-large); cursor: pointer;
  color: var(--md-on-surface-variant); background: var(--md-surface-container-high);
}
.remote-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.remote-chip svg { width: 18px; height: 18px; flex: none; }
.remote-chip.active { color: var(--md-on-primary-container); background: var(--md-primary-container); }
.remote-chip.error { color: var(--md-on-error-container); background: var(--md-error-container); }
.remote-note { margin: 0; font: var(--type-body-small); color: var(--md-on-surface-variant); }
.remote-note.error { color: var(--md-error); }
.sheet-lead { margin: 0 0 var(--space-3); }
/* Media bubbles have a 4 px inset, so the time needs its own side padding. */
.bubble.media > .meta { padding: 0 var(--space-1-5) var(--space-0-5); }
</style>
