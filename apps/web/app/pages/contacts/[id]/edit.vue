<script setup lang="ts">
import { speechAccents } from '../../../../../../shared/voice';
import { customStyleLimit } from '../../../../../../shared/onboarding';
import type { ChatMediaItem, Contact, VoiceOption } from '~/utils/types';

const route = useRoute();
const { t } = useI18n();
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

// "Keep this chat private" (docs/privacy.md#keep-a-chat-private): this person's choice for their own chat.
const privateInfo = computed(() => t('contacts.edit.privateInfo', { name: contact.value?.name ?? '' }));
const setKeepPrivate = (event: Event) => run(async () => {
  const input = event.target as HTMLInputElement;
  try {
    const updated = await chats.setKeepPrivate(id.value, input.checked);
    if (updated) apply(updated);
  } finally {
    input.checked = contact.value?.keepPrivate === 1;
  }
});

// Voice section (docs/voice.md#contact-voices): shown while the server feature is on.
// The opt-in belongs to this participant; only the creator picks the shared voice.
const voiceFeature = computed(() => !!session.features.value?.voiceMessages);
const voiceCatalog = useVoices();
const voiceSheet = ref(false);
// Accent names come from shared/voice.ts codes, translated here (shared/ stays API-only).
const accentName = (code: string) => t(`contacts.edit.accents.${code}`);
const voiceSummary = computed(() => [
  speechAccents.some(accent => accent.code === contact.value?.speechAccent) ? accentName(contact.value!.speechAccent!) : t('contacts.edit.defaultAccent'),
  contact.value?.voiceName ?? t('contacts.edit.automaticVoice'),
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
const accentOptions = computed(() => [{ value: '', label: t('contacts.edit.voiceDefault') }, ...speechAccents.map(accent => ({ value: accent.code as string, label: accentName(accent.code) }))]);
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

// "Generate with AI" in the photo sheet (docs/contact-generation.md#ai-photo-for-an-existing-contact):
// the server derives an appearance from the saved identity in the chosen style.
const onboarding = useOnboarding();
const photoSheet = ref(false);
const photoStyle = reactive({ style: 'cartoon', customStyle: '' });
const generatingPhoto = ref(false);
const photoStyleOptions = computed(() => onboarding.options.value?.styles.map(o => ({ value: o.code, label: o.name })) ?? []);
const photoStyleReady = computed(() => photoStyle.style !== 'custom' || !!photoStyle.customStyle.trim());
function openPhotoGeneration() {
  photoSheet.value = true;
  const saved = onboarding.snapshot.value?.input;
  if (saved) Object.assign(photoStyle, { style: saved.style, customStyle: saved.customStyle ?? '' });
  void onboarding.refresh().then(() => {
    const input = onboarding.snapshot.value?.input;
    if (input && !saved) Object.assign(photoStyle, { style: input.style, customStyle: input.customStyle ?? '' });
  }).catch(() => {});
}
// Generation can take minutes, so only the photo controls wait; it finishes even if the page closes.
async function generatePhoto() {
  if (!photoStyleReady.value || generatingPhoto.value) return;
  photoSheet.value = false;
  generatingPhoto.value = true;
  error.value = null;
  try {
    apply((await api<{ contact: Contact }>(`contacts/${id.value}/photo/generate`, {
      json: photoStyle.style === 'custom' ? { style: 'custom', customStyle: photoStyle.customStyle.trim() } : { style: photoStyle.style },
    })).contact);
  } catch (failure) { error.value = errorMessage(failure); }
  finally { generatingPhoto.value = false; }
}

const remove = () => run(async () => {
  if (!window.confirm(contactDeletionWarning(contact.value?.name, canManage.value))) return;
  await chats.deleteChatContact(id.value);
  await navigateTo('/chats', { replace: true });
});

onMounted(() => { void session.refreshProfile().catch(() => {}); });
onMounted(() => run(async () => {
  apply((await api<{ contact: Contact }>(`contacts/${id.value}`)).contact);
}));
const initiativeInfo = computed(() => t('contacts.edit.initiativeInfo'));
const voiceInfo = computed(() => t('contacts.edit.voiceInfo', { name: contact.value?.name ?? '' }));
const voiceChoiceInfo = computed(() => canManage.value ? t('contacts.edit.voiceChoiceInfoOwner') : t('contacts.edit.voiceChoiceInfoMember'));
</script>

<template>
  <PageBar :title="contact?.name ?? $t('contacts.edit.fallbackTitle')" :back="`/chats/${id}`" always-back />
  <div class="page">
    <AppLoading v-if="!contact && busy" fill />
    <div v-else-if="!contact" class="page-inner"><AppNotice>{{ error ?? $t('contacts.edit.unavailable') }}</AppNotice></div>
    <div v-else class="page-inner">
      <IdentityEditor :name="canManage ? realName : contact.name" :path="contactPhotoPath(contact)" :editable="canManage" :renamable="canManage" :generatable="canManage" show-name :busy="busy || generatingPhoto" @photo="savePhoto" @rename="rename" @generate="openPhotoGeneration" />
      <p v-if="generatingPhoto" class="identity-subtitle photo-progress" role="status"><span class="spinner" aria-hidden="true" /> {{ $t('contacts.edit.generatingPhoto') }}</p>
      <p v-if="!canManage" class="identity-subtitle">{{ $t('contacts.edit.sharedSubtitle') }}</p>
      <p v-if="contact.alias && !canManage" class="identity-subtitle">{{ $t('contacts.edit.othersSee', { name: realName }) }}</p>
      <AppNotice v-if="error">{{ error }}</AppNotice>

      <AppListGroup>
        <AppListItem icon="person" opens :value="contact.alias ?? $t('contacts.edit.none')" :disabled="busy" @click="openAlias">{{ $t('contacts.edit.alias') }}</AppListItem>
        <AppSwitch icon="initiative" :label="$t('contacts.edit.initiative')" :info="initiativeInfo" :checked="contact.initiativeEnabled !== 0" :disabled="busy" @change="setInitiative" />
        <AppSwitch icon="lock" :label="$t('contacts.edit.keepPrivate')" :info="privateInfo" :checked="contact.keepPrivate === 1" :disabled="busy" @change="setKeepPrivate" />
        <template v-if="voiceFeature">
          <AppSwitch icon="mic" :label="$t('contacts.edit.voiceMessages')" :info="voiceInfo" :checked="contact.voiceMessagesEnabled === 1" :disabled="busy" @change="setVoiceMessages" />
          <AppListItem icon="voice" opens :value="voiceSummary" @click="openVoiceSheet">{{ $t('contacts.edit.voice') }}</AppListItem>
        </template>
        <ContactEnergySection v-if="contact.role === 'owner'" :contact-id="id" />
        <ContactPhonesSection :contact-id="id" :contact-name="contact.name" />
      </AppListGroup>

      <AppListGroup>
        <AppListItem :to="`/contacts/${id}/personality`" icon="person">{{ $t('contacts.edit.personality') }}</AppListItem>
        <AppListItem :to="`/contacts/${id}/learning`" icon="person">{{ $t('contacts.edit.learning') }}</AppListItem>
        <AppListItem :to="`/contacts/${id}/connections`" icon="link">{{ $t('contacts.edit.connections') }}</AppListItem>
        <AppListItem :to="`/contacts/${id}/links`" icon="people">{{ $t('contacts.edit.links') }}</AppListItem>
        <AppListItem :to="`/contacts/${id}/mini-apps`" icon="grid">{{ $t('contacts.edit.miniApps') }}</AppListItem>
        <AppListItem :to="`/contacts/${id}/tasks`" icon="tasks">{{ $t('contacts.edit.tasks') }}</AppListItem>
        <AppListItem v-if="canManage" :to="`/contacts/${id}/sharing`" icon="share">{{ $t('contacts.edit.share') }}</AppListItem>
      </AppListGroup>

      <ChatMediaTabs :base="`contacts/${id}/chat`" :attachment-path="mediaPath" :documents-base="`contacts/${id}`" :document-route="`/contacts/${id}/documents`" />

      <!-- The media tabs end with a grid, a list or a button, so this section sets its own gap. -->
      <div class="lifecycle">
        <AppListGroup>
          <ChatLifecycleActions :chat-id="id" :archived="archived" :can-clear="true" :busy="busy"
            @archive="run(() => chats.archiveChat('contact', id, !archived))"
            @clear="memory => run(() => chats.clearChat('contact', id, memory))"
          />
          <AppListItem icon="delete" danger :disabled="busy" @click="remove">{{ $t('contacts.edit.deleteContact') }}</AppListItem>
        </AppListGroup>
      </div>

      <AppSheet v-if="aliasSheet" :title="$t('contacts.edit.alias')" @close="aliasSheet = false">
        <form @submit.prevent="aliasValid && saveAlias(aliasDraft)">
          <AppListGroup><div class="field"><input v-model="aliasDraft" type="text" maxlength="100" :placeholder="realName" :aria-label="$t('contacts.edit.alias')" autofocus></div></AppListGroup>
          <p class="small muted">{{ $t('contacts.edit.aliasHint', { name: realName }) }}</p>
          <div class="actions-row">
            <AppButton v-if="contact.alias" variant="text" :disabled="busy" @click="saveAlias(null)">{{ $t('contacts.edit.removeAlias') }}</AppButton>
            <AppButton variant="text" @click="aliasSheet = false">{{ $t('common.cancel') }}</AppButton>
            <AppButton type="submit" :disabled="busy || !aliasValid">{{ $t('common.save') }}</AppButton>
          </div>
        </form>
      </AppSheet>

      <AppSheet v-if="photoSheet" :title="$t('contacts.identity.generatePhoto')" @close="photoSheet = false">
        <form @submit.prevent="generatePhoto">
          <AppSelect v-if="photoStyleOptions.length" v-model="photoStyle.style" :label="$t('contacts.new.visualStyle')" :options="photoStyleOptions" />
          <AppLoading v-else :label="$t('contacts.new.loadingOptions')" />
          <AppTextField v-if="photoStyle.style === 'custom'" v-model="photoStyle.customStyle" :label="$t('contacts.new.describeCharacter')" :placeholder="$t('contacts.new.describePlaceholder')"
                        :maxlength="customStyleLimit" required />
          <p class="small muted">{{ $t('contacts.edit.generatePhotoHint') }}</p>
          <div class="actions-row">
            <AppButton variant="text" @click="photoSheet = false">{{ $t('common.cancel') }}</AppButton>
            <AppButton type="submit" :disabled="generatingPhoto || !photoStyleOptions.length || !photoStyleReady">{{ $t('contacts.edit.generate') }}</AppButton>
          </div>
        </form>
      </AppSheet>

      <AppSheet v-if="voiceSheet" :title="$t('contacts.edit.voice')" @close="voiceSheet = false">
        <template #header><InfoButton :label="$t('contacts.edit.voice')" :text="voiceChoiceInfo" /></template>
        <AppListGroup>
          <div class="field">
            <label for="speech-accent">{{ $t('contacts.edit.accent') }}</label>
            <AppSelect id="speech-accent" v-model="speechAccent" variant="plain" :options="accentOptions" :disabled="!canManage || busy" />
          </div>
          <AppListItem v-if="!canManage" plain :value="contact.voiceName ?? $t('contacts.edit.automatic')">{{ $t('contacts.edit.voice') }}</AppListItem>
        </AppListGroup>
        <template v-if="canManage">
          <!-- The search field sits between the title and the rows, so the title stays markup. -->
          <div class="group-title">{{ $t('contacts.edit.voice') }}</div>
          <AppSearchField v-if="(voiceCatalog.voices.value?.length ?? 0) > 10" v-model="voiceQuery" :label="$t('contacts.edit.searchVoices')" class="voice-search" autocomplete="off" />
          <AppListGroup class="voice-options" role="radiogroup" :aria-label="$t('contacts.edit.contactVoice')">
            <AppLoading v-if="!voiceCatalog.voices.value && !voiceCatalog.error.value" :label="$t('contacts.edit.loadingVoices')" />
            <div v-else-if="!voiceCatalog.voices.value" class="voice-row">
              <span class="muted">{{ voiceCatalog.error.value }}</span>
              <button type="button" class="link-button" @click="voiceCatalog.load(true)">{{ $t('common.retry') }}</button>
            </div>
            <p v-if="voiceCatalog.voices.value?.length && !visibleVoices.length" class="voice-row muted">{{ $t('common.noMatches') }}</p>
            <div v-for="voice in visibleVoices" :key="voice.id" class="voice-option">
              <label>
                <input type="radio" name="contact-voice" :checked="contact.voiceID === voice.id" :disabled="busy" @change="chooseVoice(voice.id)">
                <span><strong>{{ voice.name }}</strong><span v-if="voiceDetails(voice)" class="small muted">{{ voiceDetails(voice) }}</span></span>
              </label>
              <!-- Raw markup: AppIconButton can't show a spinner while the sample loads. -->
              <button
                type="button" class="icon-button" :disabled="voicePlayer.key === voicePreviewPath(voice.id) && voicePlayer.loading"
                :aria-label="voicePlayer.key === voicePreviewPath(voice.id) && voicePlayer.playing ? $t('contacts.edit.pauseSample', { name: voice.name }) : $t('contacts.edit.playSample', { name: voice.name })"
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
.photo-progress { display: flex; align-items: center; justify-content: center; gap: var(--space-2); }
.lifecycle { margin-top: var(--space-5); }
.voice-row { display: flex; align-items: center; gap: var(--space-3); min-height: 56px; padding: var(--space-2) var(--space-4); margin: 0; }
.voice-search { margin: 0 0 var(--space-2); }
.voice-option { display: flex; align-items: center; gap: var(--space-2); min-height: 56px; padding: var(--space-1) var(--space-2) var(--space-1) var(--space-4); }
.voice-option label { flex: 1; min-width: 0; display: flex; align-items: center; gap: var(--space-3); cursor: pointer; }
.voice-option label > span { display: flex; flex-direction: column; min-width: 0; }
.voice-option input { accent-color: var(--md-primary); width: 20px; height: 20px; flex: none; }
</style>
