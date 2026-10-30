<script setup lang="ts">
import { speechAccents } from '../../../../../../shared/voice';
import type { ChatMediaItem, Contact, VoiceOption } from '~/utils/types';

const route = useRoute();
const id = computed(() => String(route.params.id));
const chats = useChats();
const session = useSession();
const ownerID = session.user.value?.id;
const contact = ref<Contact | null>(chats.contacts.value.find((item) => item.id === id.value) ?? null);
const busy = ref(false);
const error = ref<string | null>(null);
const canManage = computed(() => contact.value?.role !== 'member');
const archived = computed(() => (chats.contacts.value.find(item => item.id === id.value) ?? contact.value)?.archivedAt != null);
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
  try { await task(); }
  catch (failure) { error.value = errorMessage(failure); }
  finally { busy.value = false; }
}

const rename = (name: string) => run(async () => {
  apply((await api<{ contact: Contact }>(`contacts/${id.value}`, { method: 'PATCH', json: { name } })).contact);
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
const voiceSheet = ref(false);
const voiceSummary = computed(() => [
  speechAccents.find(accent => accent.code === contact.value?.speechAccent)?.name ?? 'Default accent',
  contact.value?.voiceName ?? 'Automatic voice',
].join(' · '));
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
const accentOptions = [{ value: '', label: 'Voice default' }, ...speechAccents.map(accent => ({ value: accent.code as string, label: accent.name }))];
const speechAccent = computed({
  get: () => contact.value?.speechAccent ?? '',
  set: (value: string) => run(async () => {
    apply((await api<{ contact: Contact }>(`contacts/${id.value}/speech-accent`, {
      method: 'PUT', json: { speechAccent: value || null },
    })).contact);
  }),
});
// Long voice catalogs get a search field, matching long selectors.
const voiceQuery = ref('');
const normalizeSearch = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const visibleVoices = computed(() => {
  const term = normalizeSearch(voiceQuery.value.trim());
  const voices = voiceCatalog.voices.value ?? [];
  return term ? voices.filter(voice => normalizeSearch(`${voice.name} ${voiceDetails(voice)}`).includes(term)) : voices;
});
function openVoiceSheet() {
  voiceSheet.value = true;
  void voiceCatalog.load();
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
    ? `This permanently deletes ${contact.value?.name ?? 'this contact'} for everyone, including all participants' chats, schedules, memories, and this contact's group messages and work.`
    : 'This removes your access and deletes your private chat, schedules, and contributed memories. Other participants keep the contact.';
  if (!window.confirm(message)) return;
  await chats.deleteChatContact(id.value);
  forgetContactEnergy(id.value);
  forgetPersonality(id.value);
  forgetMcpConnections(id.value);
  forgetMiniApps(`contacts/${id.value}`);
  forgetRead(`contact:${id.value}`);
  await navigateTo('/', { replace: true });
});

onMounted(() => { void session.refreshProfile().catch(() => {}); });
onMounted(() => run(async () => {
  apply((await api<{ contact: Contact }>(`contacts/${id.value}`)).contact);
}));
const initiativeInfo = "Allow occasional follow-ups and new conversations. Timing adapts to this chat and the contact's personality. Unanswered greetings stop further social openers until you engage again. Ask the contact to pause, or turn this off to stop initiative. Applies only to your private chat.";
const voiceInfo = computed(() => `With voice messages on, ${contact.value?.name ?? 'this contact'} sometimes answers your private chat with a short voice message. In groups, the creator's setting applies.`);
const voiceChoiceInfo = computed(() => `Accent applies to new messages for everyone. Results depend on the voice; samples keep their original accent. ${canManage.value ? 'Everyone who chats with this contact hears the voice you choose.' : "The contact's creator chooses its voice."}`);
</script>

<template>
  <PageBar :title="contact?.name ?? 'Contact'" :back="`/chats/${id}`" always-back />
  <div class="page">
    <div v-if="!contact && busy" class="center"><span class="spinner" /> Loading…</div>
    <div v-else-if="!contact" class="page-inner"><p class="notice">{{ error ?? 'This contact is no longer available.' }}</p></div>
    <div v-else class="page-inner">
      <IdentityEditor :name="contact.name" :path="contactPhotoPath(contact)" :editable="canManage" :renamable="canManage" show-name :busy="busy" @photo="savePhoto" @rename="rename" />
      <p v-if="!canManage" class="identity-subtitle">Shared contact · managed by its creator</p>
      <p v-if="error" class="notice" style="margin: 12px 0">{{ error }}</p>

      <div class="group" style="margin-top: 12px">
        <label class="toggle">
          <span class="toggle-label"><AppIcon name="initiative" />Conversation initiative<InfoButton label="Conversation initiative" :text="initiativeInfo" /></span>
          <input type="checkbox" role="switch" :checked="contact.initiativeEnabled !== 0" :disabled="busy" @change="setInitiative">
        </label>
        <template v-if="voiceFeature">
          <label class="toggle">
            <span class="toggle-label"><AppIcon name="mic" />Voice messages<InfoButton label="Voice messages" :text="voiceInfo" /></span>
            <input type="checkbox" role="switch" :checked="contact.voiceMessagesEnabled === 1" :disabled="busy" @change="setVoiceMessages">
          </label>
          <button type="button" class="button-row opens" @click="openVoiceSheet">
            <AppIcon name="voice" />Voice<span class="row-value">{{ voiceSummary }}</span>
          </button>
        </template>
        <ContactEnergySection v-if="contact.role === 'owner'" :contact-id="id" />
      </div>

      <div class="group" style="margin-top: 20px">
        <NuxtLink :to="`/contacts/${id}/personality`" class="button-row"><AppIcon name="person" />Personality</NuxtLink>
        <NuxtLink :to="`/contacts/${id}/learning`" class="button-row"><AppIcon name="person" />Conversation learning</NuxtLink>
        <NuxtLink :to="`/contacts/${id}/connections`" class="button-row"><AppIcon name="link" />Connections</NuxtLink>
        <NuxtLink :to="`/contacts/${id}/mini-apps`" class="button-row"><AppIcon name="grid" />Mini apps</NuxtLink>
        <NuxtLink :to="`/contacts/${id}/tasks`" class="button-row"><AppIcon name="tasks" />Tasks</NuxtLink>
        <NuxtLink v-if="canManage" :to="`/contacts/${id}/sharing`" class="button-row"><AppIcon name="share" />Share contact</NuxtLink>
      </div>

      <ChatMediaTabs :base="`contacts/${id}/chat`" :attachment-path="mediaPath" :documents-base="`contacts/${id}`" :document-route="`/contacts/${id}/documents`" />

      <div class="group" style="margin-top: 20px">
        <ChatLifecycleActions :archived="archived" :can-clear="true" :busy="busy"
          @archive="run(() => chats.archiveChat('contact', id, !archived))"
          @clear="memory => run(() => chats.clearChat('contact', id, memory))"
        />
        <button type="button" class="button-row danger" :disabled="busy" @click="remove"><AppIcon name="delete" />Delete contact and data</button>
      </div>

      <AppSheet v-if="voiceSheet" title="Voice" @close="voiceSheet = false">
        <template #header><InfoButton label="Voice" :text="voiceChoiceInfo" /></template>
        <div class="group">
          <div class="field">
            <label for="speech-accent">Accent</label>
            <AppSelect id="speech-accent" v-model="speechAccent" variant="plain" :options="accentOptions" :disabled="!canManage || busy" />
          </div>
          <div v-if="!canManage" class="button-row static">Voice<span class="row-value">{{ contact.voiceName ?? 'Automatic' }}</span></div>
        </div>
        <template v-if="canManage">
          <div class="group-title">Voice</div>
          <label v-if="(voiceCatalog.voices.value?.length ?? 0) > 10" class="search-field voice-search">
            <AppIcon name="search" />
            <input v-model="voiceQuery" type="search" placeholder="Search voices" aria-label="Search voices" autocomplete="off">
          </label>
          <div class="group voice-options" role="radiogroup" aria-label="Contact voice">
            <div v-if="!voiceCatalog.voices.value && !voiceCatalog.error.value" class="voice-row"><span class="spinner" /> Loading voices…</div>
            <div v-else-if="!voiceCatalog.voices.value" class="voice-row">
              <span class="muted">{{ voiceCatalog.error.value }}</span>
              <button type="button" class="link-button" @click="voiceCatalog.load(true)">Retry</button>
            </div>
            <p v-if="voiceCatalog.voices.value?.length && !visibleVoices.length" class="voice-row muted">No matches</p>
            <div v-for="voice in visibleVoices" :key="voice.id" class="voice-option">
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
        </template>
        <p v-if="error" class="notice" style="margin: 12px 0 0">{{ error }}</p>
      </AppSheet>
    </div>
  </div>
</template>

<style scoped>
.voice-row { display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 8px 16px; margin: 0; }
.voice-search { margin: 0 0 8px; }
.voice-option { display: flex; align-items: center; gap: 8px; min-height: 56px; padding: 4px 8px 4px 16px; }
.voice-option label { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; cursor: pointer; }
.voice-option label > span { display: flex; flex-direction: column; min-width: 0; }
.voice-option input { accent-color: var(--md-primary); width: 20px; height: 20px; flex: none; }
</style>
