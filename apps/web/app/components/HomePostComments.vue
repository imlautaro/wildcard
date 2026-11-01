<script setup lang="ts">
import type { HomePost } from '~/utils/types';

// Comments under one Updates post (docs/updates.md#comments), like the replies of a Threads
// post: the person's comment, then the answer of the contact who wrote the post. The reply is
// written in the background; the feed polls until it arrives. "Continue in chat" opens the
// contact's private chat with this post attached to the next message, so the contact answers
// about this exact post (docs/updates.md#continue-in-chat). Connector posts never enter a
// private chat, so for them it only opens the chat.
const props = defineProps<{ post: HomePost }>();
const home = useHome();
const { user } = useSession();
const text = ref('');
const error = ref<string | null>(null);
const sending = ref(false);
const input = ref<HTMLTextAreaElement | null>(null);
const name = computed(() => props.post.contactName ?? 'this contact');
const comments = computed(() => props.post.comments ?? []);
const waiting = computed(() => comments.value.some(comment => comment.status === 'pending'));
const myPhoto = computed(() => user.value?.photoVersion ? `me/photo?version=${encodeURIComponent(user.value.photoVersion)}` : null);
function continueInChat(contactID: string) {
  if (!props.post.connector) continueFromPost(contactID, props.post);
  void navigateTo(`/chats/${contactID}`);
}
const contactPhoto = computed(() => props.post.contactID ? contactPhotoPath({ id: props.post.contactID, photoVersion: props.post.contactPhotoVersion }) : null);
const age = (at: number) => {
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60_000));
  return minutes < 1 ? 'now' : minutes < 60 ? `${minutes}m` : minutes < 1440 ? `${Math.round(minutes / 60)}h` : `${Math.round(minutes / 1440)}d`;
};

async function send() {
  const value = text.value.trim();
  if (!value || waiting.value || sending.value) return;
  error.value = null;
  sending.value = true;
  try { await home.comment(props.post.id, value); text.value = ''; }
  catch (failure) { error.value = errorMessage(failure); }
  finally { sending.value = false; }
}
function keydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); void send(); }
}
onMounted(() => input.value?.focus({ preventScroll: true }));
</script>

<template>
  <section class="comments" aria-label="Comments">
    <template v-for="comment in comments" :key="comment.id">
      <div class="comment">
        <AppAvatar :name="user?.name ?? 'You'" :path="myPhoto" :size="32" />
        <div class="bubble-copy">
          <p class="head"><strong>You</strong><span>{{ age(comment.createdAt) }}</span></p>
          <p class="body">{{ comment.text }}</p>
        </div>
      </div>
      <div class="comment reply">
        <AppAvatar :name="name" :path="contactPhoto" :size="32" />
        <div class="bubble-copy">
          <p class="head"><strong>{{ name }}</strong><span v-if="comment.repliedAt">{{ age(comment.repliedAt) }}</span></p>
          <p v-if="comment.status === 'complete'" class="body">{{ comment.reply }}</p>
          <p v-else-if="comment.status === 'pending'" class="body typing" role="status" :aria-label="`${name} is replying`"><span /><span /><span /></p>
          <p v-else class="body failed">{{ name }} couldn’t answer this one. Try again or continue in the chat.</p>
        </div>
      </div>
    </template>

    <form class="composer" @submit.prevent="send">
      <AppAvatar :name="user?.name ?? 'You'" :path="myPhoto" :size="32" />
      <textarea ref="input" v-model="text" rows="1" maxlength="1000" :placeholder="waiting ? `${name} is replying…` : `Reply to ${name}…`"
        :disabled="waiting" :aria-label="`Comment on ${name}’s post`" @keydown="keydown" />
      <AppIconButton type="submit" icon="send" label="Send comment" variant="filled" size="small" :disabled="!text.trim() || waiting || sending" />
    </form>
    <AppNotice v-if="error">{{ error }}</AppNotice>
    <AppButton v-if="post.contactID" variant="tonal" icon="chat" class="continue" @click="continueInChat(post.contactID)">Continue in chat with {{ name }}</AppButton>
  </section>
</template>

<style scoped>
.comments { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-2) var(--space-4) 0 calc(var(--space-4) + 36px + var(--space-3)); }
.comment { display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: var(--space-2); }
.bubble-copy { min-width: 0; }
.head { display: flex; align-items: baseline; gap: var(--space-1-5); margin: 0; font-size: 14px; }
.head span { color: var(--md-on-surface-variant); }
.body { margin: var(--space-0-5) 0 0; font-size: 15px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
.failed { color: var(--md-on-surface-variant); font-style: italic; }
.typing { display: inline-flex; gap: 4px; padding: var(--space-1-5) 0; }
.typing span { width: 6px; height: 6px; border-radius: 50%; background: var(--md-on-surface-variant); animation: blink 1.2s infinite ease-in-out; }
.typing span:nth-child(2) { animation-delay: 0.15s; } .typing span:nth-child(3) { animation-delay: 0.3s; }
@keyframes blink { 0%, 80%, 100% { opacity: 0.25; } 40% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .typing span { animation: none; opacity: 0.6; } }
.composer { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; align-items: center; gap: var(--space-2); padding: var(--space-1-5) var(--space-1-5) var(--space-1-5) var(--space-2);
  border: 1px solid var(--md-outline-variant); border-radius: 22px; }
.composer textarea { border: 0; outline: none; resize: none; background: transparent; font: var(--type-body-large); field-sizing: content; max-height: 160px; min-height: 24px; }
.composer:focus-within { border-color: var(--md-primary); }
.continue { align-self: flex-start; }
</style>
