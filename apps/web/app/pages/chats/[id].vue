<script setup lang="ts">
import type { ChatTurn, Contact, DraftAttachment } from '~/utils/types';

const route = useRoute();
const contactID = computed(() => String(route.params.id));
const chats = useChats();
const { state, load, loadEarlier, send, submit, discardPending, retryReply, markRead } = useConversation(contactID);
const activity = useChatActivity(contactID);
const fetched = ref<Contact | null>(null);
const contact = computed(() => chats.contacts.value.find((item) => item.id === contactID.value) ?? fetched.value);
const scroller = ref<HTMLElement>();
const composer = ref<{ focus: () => void }>();

useHead({ title: computed(() => contact.value?.name ?? 'Chat') });

type Item =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'turn'; key: string; turn: ChatTurn };

const items = computed<Item[]>(() => {
  const result: Item[] = [];
  let day = '';
  for (const turn of state.value.turns) {
    const label = dayLabel(turn.createdAt);
    if (label !== day) {
      day = label;
      result.push({ kind: 'day', key: `day-${turn.sequence}`, label });
    }
    result.push({ kind: 'turn', key: turn.id, turn });
  }
  return result;
});
const lastTurnID = computed(() => state.value.turns.at(-1)?.id);
const replying = computed(() => state.value.turns.some((turn) => turn.status === 'queued' || turn.status === 'running'));

function attachmentPath(turn: ChatTurn) {
  return `contacts/${contactID.value}/chat/turns/${turn.id}/attachment`;
}
function failureText(turn: ChatTurn) {
  if (turn.errorCode === 'SCHEDULE_CANCELLED') return 'Scheduled message cancelled.';
  if (turn.errorCode === 'GROUP_REQUEST_CANCELLED') return 'Group request cancelled.';
  return 'The reply could not be completed.';
}

function nearBottom() {
  const element = scroller.value;
  return !element || element.scrollHeight - element.scrollTop - element.clientHeight < 120;
}
function scrollToBottom() {
  nextTick(() => {
    const element = scroller.value;
    if (element) element.scrollTop = element.scrollHeight;
  });
}

async function refresh() {
  const stick = nearBottom();
  await load();
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
onBeforeUnmount(() => window.removeEventListener('focus', markRead));
</script>

<template>
  <PageBar>
    <template #title>
      <NuxtLink :to="`/contacts/${contactID}/edit`" class="title" aria-label="Contact details">
        <AppAvatar :name="contact?.name ?? ''" :path="contact ? contactPhotoPath(contact) : null" :size="36" />
        <div>
          <div class="name">{{ contact?.name ?? 'Chat' }}</div>
          <div class="subtitle">{{ presenceLabel(state.presence) }}</div>
        </div>
      </NuxtLink>
    </template>
  </PageBar>

  <div v-if="state.unavailable" class="empty">
    <h2>Contact unavailable</h2>
    <p>This contact is no longer available.</p>
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
      <div v-if="state.loaded && !state.turns.length && !state.pending" class="empty">
        <h2>Start a conversation</h2>
        <p>Send your first message.</p>
      </div>

      <template v-for="item in items" :key="item.key">
        <div v-if="item.kind === 'day'" class="day">{{ item.label }}</div>
        <template v-else>
          <div v-if="item.turn.scheduleID === null && (item.turn.userText || item.turn.attachment)" class="bubble-row outgoing">
            <MessageReactions :cache="state.reactions" :path="`contacts/${contactID}/chat/reactions`" :message-i-d="item.turn.id" side="user">
              <div class="private-message-content">
                <div v-if="item.turn.attachment" class="bubble media">
                  <MessageAttachment :attachment="item.turn.attachment" :path="attachmentPath(item.turn)" />
                  <div v-if="item.turn.userText && item.turn.attachment.mimeType.startsWith('image/')" class="caption">{{ item.turn.userText }}</div>
                  <div class="meta" style="padding: 0 6px 2px">{{ messageTime(item.turn.createdAt) }}<MessageReceipt :read-at="item.turn.readAt" /></div>
                </div>
                <div v-if="item.turn.userText && !item.turn.attachment?.mimeType.startsWith('image/')" class="bubble">{{ item.turn.userText }}<div class="meta">{{ messageTime(item.turn.createdAt) }}<MessageReceipt :read-at="item.turn.readAt" /></div></div>
              </div>
            </MessageReactions>
          </div>
          <div v-if="item.turn.assistantText" class="bubble-row incoming">
            <MessageReactions :cache="state.reactions" :path="`contacts/${contactID}/chat/reactions`" :message-i-d="item.turn.id" side="assistant"><div class="bubble">{{ item.turn.assistantText }}<div class="meta">{{ messageTime(item.turn.updatedAt) }}</div></div></MessageReactions>
          </div>
          <div v-else-if="item.turn.status === 'running' && state.presence?.status === 'typing'" class="bubble-row incoming">
            <div class="typing" aria-label="Typing"><span /><span /><span /></div>
          </div>
          <div v-else-if="item.turn.status === 'failed'" class="status-line">
            {{ failureText(item.turn) }}
            <button
              v-if="item.turn.scheduleID === null && item.turn.groupRequestID === null && item.turn.id === lastTurnID"
              class="link-button" :disabled="state.retrying || replying || !!state.pending" @click="retryReply(item.turn)"
            >Retry reply</button>
          </div>
        </template>
      </template>

      <template v-if="state.pending">
        <div v-if="state.pending.attachment" class="bubble-row outgoing">
          <div class="bubble media">
            <MessageAttachment :attachment="state.pending.attachment" :path="null" :local-url="state.pending.attachment.previewURL" />
            <div v-if="state.pending.text && state.pending.attachment.previewURL" class="caption">{{ state.pending.text }}</div>
            <div class="meta" style="padding: 0 6px 2px">{{ messageTime(state.pending.createdAt) }}<MessageReceipt sending /></div>
          </div>
        </div>
        <div v-if="state.pending.text && !state.pending.attachment?.previewURL" class="bubble-row outgoing">
          <div class="bubble">{{ state.pending.text }}<div class="meta">{{ messageTime(state.pending.createdAt) }}<MessageReceipt sending /></div></div>
        </div>
        <div v-if="state.pending.failed" class="status-line outgoing error">
          {{ state.pending.failed }}
          <button class="link-button" @click="submit">Retry</button>
          <button class="link-button danger" @click="discardPending">Edit</button>
        </div>
      </template>
    </div>
    <ChatComposer
      ref="composer" v-model="state.draft" :disabled="!!state.pending || !state.loaded"
      @send="onSend" @typing="activity.typing()"
    />
  </template>
</template>
