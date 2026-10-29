<script setup lang="ts">
import { speechAccents } from '../../../../../../shared/voice';
import type { ChatMediaItem, Contact, VoiceOption } from '~/utils/types';

const route = useRoute();
const id = computed(() => String(route.params.id));
const chats = useChats();
const session = useSession();
const ownerID = session.user.value?.id;
const contact = ref<Contact | null>(chats.contacts.value.find((item) => item.id === id.value) ?? null);
const name = ref(contact.value?.name ?? '');
const busy = ref(false);
const error = ref<string | null>(null);
const saved = ref(false);
const canManage = computed(() => contact.value?.role !== 'member');
const changed = computed(() => !!contact.value && name.value.trim() !== contact.value.name);
const valid = computed(() => name.value.trim().length > 0 && [...name.value.trim()].length <= 100);
useHead({ title: computed(() => contact.value?.name ?? 'Contact') });

function apply(updated: Contact) {
  if (session.user.value?.id !== ownerID || updated.id !== id.value) return;
  contact.value = { ...contact.value, ...updated };
  chats.upsertContact(updated);
}

async function run(task: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  saved.value = false;
  try { await task(); }
  catch (failure) { error.value = errorMessage(failure); }
  finally { busy.value = false; }
}

const saveName = () => run(async () => {
  if (!valid.value) return;
  apply((await api<{ contact: Contact }>(`contacts/${id.value}`, { method: 'PATCH', json: { name: name.value.trim() } })).contact);
  name.value = contact.value!.name;
  saved.value = true;
});

const setInitiative = (event: Event) => run(async () => {
  const input = event.target as HTMLInputElement;
  try {
    const updated = await chats.setInitiative(id.value, input.checked);
    if (updated) apply(updated);
  } finally {
    input.checked = contact.value?.initiativeEnabled !== 0;
  }
});

// Voice section (docs/voice.md#contact-voices): shown while the server feature is on.
// The opt-in belongs to this participant; only the creator picks the shared voice.
const voiceFeature = computed(() => !!session.features.value?.voiceMessages);
const voiceCatalog = useVoices();
const choosingVoice = ref(false);
const setVoiceMessages = (event: Event) => run(async () => {
  const input = event.target as HTMLInputElement;
  try {
    apply((await api<{ contact: Contact }>(`contacts/${id.value}/voice-messages`, { method: 'PUT', json: { enabled: input.checked } })).contact);
  } finally {
    input.checked = contact.value?.voiceMessagesEnabled === 1;
  }
});
const chooseVoice = (voiceID: string) => run(async () => {
  if (contact.value?.voiceID === voiceID) return;
  apply((await api<{ contact: Contact }>(`contacts/${id.value}/voice`, { method: 'PUT', json: { voiceID } })).contact);
});
const setSpeechAccent = (event: Event) => run(async () => {
  const input = event.target as HTMLSelectElement;
  try {
    apply((await api<{ contact: Contact }>(`contacts/${id.value}/speech-accent`, {
      method: 'PUT', json: { speechAccent: input.value || null },
    })).contact);
  } finally { input.value = contact.value?.speechAccent ?? ''; }
});
function toggleVoicePicker() {
  choosingVoice.value = !choosingVoice.value;
  if (choosingVoice.value) void voiceCatalog.load();
}
function voiceDetails(voice: VoiceOption) {
  return [voice.gender, voice.age?.replace('_', ' '), voice.accent].filter(Boolean).join(' · ');
}
function previewVoice(voice: VoiceOption) {
  const path = voicePreviewPath(voice.id);
  void toggleVoice(path, () => voiceAudioURL(path));
}
onBeforeUnmount(() => { if (voicePlayer.key?.startsWith('voices/')) stopVoicePlayback(); });

// Media paths match the chat bubbles, so thumbnails share the private image cache.
function mediaPath(item: ChatMediaItem) {
  return `contacts/${id.value}/chat/turns/${item.messageID}/attachment${item.side === 'assistant' ? '?side=assistant' : ''}`;
}

const savePhoto = (photo: Blob | null) => run(async () => {
  const path = `contacts/${id.value}/photo`;
  const result = photo
    ? await api<{ contact: Contact }>(path, { method: 'PUT', body: photo })
    : await api<{ contact: Contact }>(path, { method: 'DELETE' });
  apply(result.contact);
});

const remove = () => run(async () => {
  const message = canManage.value
    ? `This permanently deletes ${contact.value?.name ?? 'this contact'} for everyone, including all participants' chats, schedules, and memories.`
    : 'This removes your access and deletes your private chat, schedules, and contributed memories. Other participants keep the contact.';
  if (!window.confirm(message)) return;
  await api(`contacts/${id.value}`, { method: 'DELETE' });
  chats.removeContact(id.value);
  forgetContactEnergy(id.value);
  forgetPersonality(id.value);
  forgetMcpConnections(id.value);
  forgetMiniApps(`contacts/${id.value}`);
  forgetRead(`contact:${id.value}`);
  await navigateTo('/', { replace: true });
});

onMounted(() => { void session.refreshProfile().catch(() => {}); });
onMounted(() => run(async () => {
  const fresh = (await api<{ contact: Contact }>(`contacts/${id.value}`)).contact;
  const untouched = !contact.value || name.value === contact.value.name;
  apply(fresh);
  if (untouched) name.value = fresh.name;
}));
</script>

<template>
  <PageBar :title="contact?.name ?? 'Contact'" :back="`/chats/${id}`" always-back />
  <div class="page">
    <div v-if="!contact && busy" class="center"><span class="spinner" /> Loading…</div>
    <div v-else-if="!contact" class="page-inner"><p class="notice">{{ error ?? 'This contact is no longer available.' }}</p></div>
    <form v-else class="page-inner" @submit.prevent="saveName">
      <IdentityEditor :name="contact.name" :path="contactPhotoPath(contact)" :editable="canManage" :busy="busy" @photo="savePhoto" />
      <div class="group">
        <div class="field">
          <label for="contact-name">Name</label>
          <input id="contact-name" v-model="name" type="text" maxlength="100" :readonly="!canManage">
        </div>
      </div>
      <p v-if="!canManage" class="group-footer">This is a shared contact. Its creator manages its name, photo, and participants.</p>
      <p v-if="error" class="notice" style="margin: 0 0 12px">{{ error }}</p>
      <p v-if="saved" class="group-footer" role="status">Saved.</p>
      <button v-if="canManage" type="submit" class="button block" :disabled="!changed || !valid || busy" style="margin-bottom: 20px">Save</button>

      <div class="group">
        <label class="toggle">
          <span>Conversation initiative</span>
          <input type="checkbox" role="switch" :checked="contact.initiativeEnabled !== 0" :disabled="busy" @change="setInitiative">
        </label>
      </div>
      <p class="group-footer">Allow thoughtful follow-ups when you have not replied. Stops after a few unanswered messages. Applies only to your private chat.</p>

      <template v-if="voiceFeature">
        <div class="group-title">Voice</div>
        <div class="group">
          <label class="toggle">
            <span>Voice messages</span>
            <input type="checkbox" role="switch" :checked="contact.voiceMessagesEnabled === 1" :disabled="busy" @change="setVoiceMessages">
          </label>
          <div class="field">
            <label for="speech-accent">Speech accent</label>
            <select id="speech-accent" :value="contact.speechAccent ?? ''" :disabled="!canManage || busy" @change="setSpeechAccent">
              <option value="">Voice default</option>
              <option v-for="accent in speechAccents" :key="accent.code" :value="accent.code">{{ accent.name }}</option>
            </select>
          </div>
          <button v-if="canManage" type="button" class="voice-row" :aria-expanded="choosingVoice" aria-controls="voice-options" @click="toggleVoicePicker">
            <span>Voice</span><span class="muted">{{ contact.voiceName ?? 'Chosen automatically' }}</span><AppIcon name="dropdown" />
          </button>
          <div v-else class="voice-row"><span>Voice</span><span class="muted">{{ contact.voiceName ?? 'Chosen automatically' }}</span></div>
        </div>
        <div v-if="canManage && choosingVoice" id="voice-options" class="group voice-options" role="radiogroup" aria-label="Contact voice">
          <div v-if="!voiceCatalog.voices.value && !voiceCatalog.error.value" class="voice-row"><span class="spinner" /> Loading voices…</div>
          <div v-else-if="!voiceCatalog.voices.value" class="voice-row">
            <span class="muted">{{ voiceCatalog.error.value }}</span>
            <button type="button" class="link-button" @click="voiceCatalog.load(true)">Retry</button>
          </div>
          <div v-for="voice in voiceCatalog.voices.value ?? []" :key="voice.id" class="voice-option">
            <label>
              <input type="radio" name="contact-voice" :checked="contact.voiceID === voice.id" :disabled="busy" @change="chooseVoice(voice.id)">
              <span><strong>{{ voice.name }}</strong><span v-if="voiceDetails(voice)" class="small muted">{{ voiceDetails(voice) }}</span></span>
            </label>
            <button
              type="button" class="icon-button" :disabled="voicePlayer.key === voicePreviewPath(voice.id) && voicePlayer.loading"
              :aria-label="voicePlayer.key === voicePreviewPath(voice.id) && voicePlayer.playing ? `Pause ${voice.name} sample` : `Play ${voice.name} sample`"
              @click="previewVoice(voice)"
            >
              <span v-if="voicePlayer.key === voicePreviewPath(voice.id) && voicePlayer.loading" class="spinner" />
              <AppIcon v-else :name="voicePlayer.failed === voicePreviewPath(voice.id) ? 'refresh' : voicePlayer.key === voicePreviewPath(voice.id) && voicePlayer.playing ? 'pause' : 'play'" />
            </button>
          </div>
        </div>
        <p class="group-footer">
          With voice messages on, {{ contact.name }} sometimes answers your private chat with a short voice message.
          Accent applies to new messages for everyone. Results depend on the voice; samples keep their original accent.
          {{ canManage ? 'Everyone who chats with this contact hears the voice you choose.' : "The contact's creator chooses its voice." }}
        </p>
      </template>

      <ContactEnergySection v-if="contact.role === 'owner'" :contact-id="id" />

      <ChatMediaTabs :base="`contacts/${id}/chat`" :attachment-path="mediaPath" :documents-base="`contacts/${id}`" :document-route="`/contacts/${id}/documents`" />

      <div class="group" style="margin-top: 20px">
        <NuxtLink :to="`/contacts/${id}/connections`" class="button-row"><AppIcon name="link" />Connections</NuxtLink>
        <NuxtLink :to="`/contacts/${id}/personality`" class="button-row"><AppIcon name="person" />Personality</NuxtLink>
        <NuxtLink :to="`/contacts/${id}/mini-apps`" class="button-row"><AppIcon name="grid" />Mini apps</NuxtLink>
        <NuxtLink :to="`/contacts/${id}/tasks`" class="button-row"><AppIcon name="tasks" />Tasks</NuxtLink>
        <NuxtLink :to="`/chats/${id}`" class="button-row"><AppIcon name="chat" />Open chat</NuxtLink>
        <NuxtLink v-if="canManage" :to="`/contacts/${id}/sharing`" class="button-row"><AppIcon name="share" />Share contact</NuxtLink>
      </div>
      <div class="group" style="margin-top: 20px">
        <button type="button" class="button-row danger" :disabled="busy" @click="remove">{{ canManage ? 'Delete contact' : 'Leave shared contact' }}</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.voice-row { display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 8px 16px; width: 100%; border: 0; color: inherit; font: inherit; text-align: left; }
button.voice-row { cursor: pointer; }
.voice-row > .muted { margin-left: auto; }
.voice-row svg { width: 24px; height: 24px; flex: none; }
.voice-option { display: flex; align-items: center; gap: 8px; min-height: 56px; padding: 4px 8px 4px 16px; }
.voice-option label { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; cursor: pointer; }
.voice-option label > span { display: flex; flex-direction: column; min-width: 0; }
.voice-option input { accent-color: var(--md-primary); width: 20px; height: 20px; flex: none; }
</style>
