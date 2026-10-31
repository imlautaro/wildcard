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

// The shared name only its creator can change; the alias is this account's private display name.
const realName = computed(() => contact.value?.realName ?? contact.value?.name ?? '');
const aliasSheet = ref(false);
const aliasDraft = ref('');
const aliasValid = computed(() => { const value = aliasDraft.value.trim(); return [...value].length <= 100 && !/[\u0000-\u001f\u007f-\u009f]/u.test(value); });
function openAlias() { aliasDraft.value = contact.value?.alias ?? ''; aliasSheet.value = true; }
const saveAlias = (alias: string | null) => run(async () => {
  const value = alias?.trim() || null;
  if (value !== (contact.value?.alias ?? null)) {
    const updated = await chats.setAlias(id.value, value);
    if (session.user.value?.id === ownerID) contact.value = { ...contact.value!, ...updated };
  }
  aliasSheet.value = false;
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
  return albumImagePath(`contacts/${id.value}/chat/turns/${item.messageID}/attachment${item.side === 'assistant' ? '?side=assistant' : ''}`, item.image);
}

const savePhoto = (photo: Blob | null) => run(async () => {
  const path = `contacts/${id.value}/photo`;
  const result = photo
    ? await api<{ contact: Contact }>(path, { method: 'PUT', body: photo })
    : await api<{ contact: Contact }>(path, { method: 'DELETE' });
  apply(result.contact);
});

const remove = () => run(async () => {
  if (!window.confirm(contactDeletionWarning(contact.value?.name, canManage.value))) return;
  await chats.deleteChatContact(id.value);
  await navigateTo('/', { replace: true });
});

onMounted(() => { void session.refreshProfile().catch(() => {}); });
onMounted(() => run(async () => {
  apply((await api<{ contact: Contact }>(`contacts/${id.value}`)).contact);
}));
const initiativeInfo = "The contact can add a thought without another prompt and start a conversation later. Timing adapts to this chat and its personality. Leaving the chat open does not prevent follow-ups; active typing gives you space. Unanswered greetings stop further social openers until you engage again. Ask the contact to pause, or turn this off. Applies only to your private chat.";
const voiceInfo = computed(() => `With voice messages on, ${contact.value?.name ?? 'this contact'} sometimes answers your private chat with a short voice message. In groups, the creator's setting applies.`);
const voiceChoiceInfo = computed(() => `Accent guides regional wording in text and voice, without forcing slang or changing the language. Audio results depend on the voice; samples keep their original accent. ${canManage.value ? 'Everyone who chats with this contact hears the voice you choose.' : "The contact's creator chooses its voice."}`);
</script>

<template>
  <PageBar :title="contact?.name ?? 'Contact'" :back="`/chats/${id}`" always-back />
  <div class="page">
    <AppLoading v-if="!contact && busy" fill />
    <div v-else-if="!contact" class="page-inner"><AppNotice>{{ error ?? 'This contact is no longer available.' }}</AppNotice></div>
    <div v-else class="page-inner">
      <IdentityEditor :name="canManage ? realName : contact.name" :path="contactPhotoPath(contact)" :editable="canManage" :renamable="canManage" show-name :busy="busy" @photo="savePhoto" @rename="rename" />
      <p v-if="!canManage" class="identity-subtitle">Shared contact · managed by its creator</p>
      <p v-if="contact.alias && !canManage" class="identity-subtitle">Others see {{ realName }}</p>
      <AppNotice v-if="error">{{ error }}</AppNotice>

      <AppListGroup>
        <AppListItem icon="person" opens :value="contact.alias ?? 'None'" :disabled="busy" @click="openAlias">Alias</AppListItem>
        <AppSwitch icon="initiative" label="Conversation initiative" :info="initiativeInfo" :checked="contact.initiativeEnabled !== 0" :disabled="busy" @change="setInitiative" />
        <template v-if="voiceFeature">
          <AppSwitch icon="mic" label="Voice messages" :info="voiceInfo" :checked="contact.voiceMessagesEnabled === 1" :disabled="busy" @change="setVoiceMessages" />
          <AppListItem icon="voice" opens :value="voiceSummary" @click="openVoiceSheet">Voice</AppListItem>
        </template>
        <ContactEnergySection v-if="contact.role === 'owner'" :contact-id="id" />
      </AppListGroup>

      <AppListGroup>
        <AppListItem :to="`/contacts/${id}/personality`" icon="person">Personality</AppListItem>
        <AppListItem :to="`/contacts/${id}/learning`" icon="person">Conversation learning</AppListItem>
        <AppListItem :to="`/contacts/${id}/connections`" icon="link">Connections</AppListItem>
        <AppListItem :to="`/contacts/${id}/links`" icon="people">Linked contacts</AppListItem>
        <AppListItem :to="`/contacts/${id}/mini-apps`" icon="grid">Mini apps</AppListItem>
        <AppListItem :to="`/contacts/${id}/tasks`" icon="tasks">Tasks</AppListItem>
        <AppListItem v-if="canManage" :to="`/contacts/${id}/sharing`" icon="share">Share contact</AppListItem>
      </AppListGroup>

      <ChatMediaTabs :base="`contacts/${id}/chat`" :attachment-path="mediaPath" :documents-base="`contacts/${id}`" :document-route="`/contacts/${id}/documents`" />

      <!-- The media tabs end with a grid, a list or a button, so this section sets its own gap. -->
      <div class="lifecycle">
        <AppListGroup>
          <ChatLifecycleActions :archived="archived" :can-clear="true" :busy="busy"
            @archive="run(() => chats.archiveChat('contact', id, !archived))"
            @clear="memory => run(() => chats.clearChat('contact', id, memory))"
          />
          <AppListItem icon="delete" danger :disabled="busy" @click="remove">Delete contact and data</AppListItem>
        </AppListGroup>
      </div>

      <AppSheet v-if="aliasSheet" title="Alias" @close="aliasSheet = false">
        <form @submit.prevent="aliasValid && saveAlias(aliasDraft)">
          <AppListGroup><div class="field"><input v-model="aliasDraft" type="text" maxlength="100" :placeholder="realName" aria-label="Alias" autofocus></div></AppListGroup>
          <p class="small muted">Only you see this name. Others still see {{ realName }}.</p>
          <div class="actions-row">
            <AppButton v-if="contact.alias" variant="text" :disabled="busy" @click="saveAlias(null)">Remove alias</AppButton>
            <AppButton variant="text" @click="aliasSheet = false">Cancel</AppButton>
            <AppButton type="submit" :disabled="busy || !aliasValid">Save</AppButton>
          </div>
        </form>
      </AppSheet>

      <AppSheet v-if="voiceSheet" title="Voice" @close="voiceSheet = false">
        <template #header><InfoButton label="Voice" :text="voiceChoiceInfo" /></template>
        <AppListGroup>
          <div class="field">
            <label for="speech-accent">Accent</label>
            <AppSelect id="speech-accent" v-model="speechAccent" variant="plain" :options="accentOptions" :disabled="!canManage || busy" />
          </div>
          <AppListItem v-if="!canManage" plain :value="contact.voiceName ?? 'Automatic'">Voice</AppListItem>
        </AppListGroup>
        <template v-if="canManage">
          <!-- The search field sits between the title and the rows, so the title stays markup. -->
          <div class="group-title">Voice</div>
          <AppSearchField v-if="(voiceCatalog.voices.value?.length ?? 0) > 10" v-model="voiceQuery" label="Search voices" class="voice-search" autocomplete="off" />
          <AppListGroup class="voice-options" role="radiogroup" aria-label="Contact voice">
            <AppLoading v-if="!voiceCatalog.voices.value && !voiceCatalog.error.value" label="Loading voices…" />
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
              <!-- Raw markup: AppIconButton can't show a spinner while the sample loads. -->
              <button
                type="button" class="icon-button" :disabled="voicePlayer.key === voicePreviewPath(voice.id) && voicePlayer.loading"
                :aria-label="voicePlayer.key === voicePreviewPath(voice.id) && voicePlayer.playing ? `Pause ${voice.name} sample` : `Play ${voice.name} sample`"
                @click="previewVoice(voice)"
              >
                <span v-if="voicePlayer.key === voicePreviewPath(voice.id) && voicePlayer.loading" class="spinner" />
                <AppIcon v-else :name="voicePlayer.failed === voicePreviewPath(voice.id) ? 'refresh' : voicePlayer.key === voicePreviewPath(voice.id) && voicePlayer.playing ? 'pause' : 'play'" />
              </button>
            </div>
          </AppListGroup>
        </template>
        <AppNotice v-if="error">{{ error }}</AppNotice>
      </AppSheet>
    </div>
  </div>
</template>

<style scoped>
.identity-subtitle { margin-bottom: var(--space-3); }
.lifecycle { margin-top: var(--space-5); }
.voice-row { display: flex; align-items: center; gap: var(--space-3); min-height: 56px; padding: var(--space-2) var(--space-4); margin: 0; }
.voice-search { margin: 0 0 var(--space-2); }
.voice-option { display: flex; align-items: center; gap: var(--space-2); min-height: 56px; padding: var(--space-1) var(--space-2) var(--space-1) var(--space-4); }
.voice-option label { flex: 1; min-width: 0; display: flex; align-items: center; gap: var(--space-3); cursor: pointer; }
.voice-option label > span { display: flex; flex-direction: column; min-width: 0; }
.voice-option input { accent-color: var(--md-primary); width: 20px; height: 20px; flex: none; }
</style>
