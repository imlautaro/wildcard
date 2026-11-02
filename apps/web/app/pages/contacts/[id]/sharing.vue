<script setup lang="ts">
import type { ContactInvitation, ContactSharing } from '~/utils/types';

const route = useRoute();
const { t } = useI18n();
const id = computed(() => String(route.params.id));
const chats = useChats();
const contact = computed(() => chats.contacts.value.find((item) => item.id === id.value));
const sharing = ref<ContactSharing | null>(null);
const email = ref('');
const shareMemory = ref(false);
const contributorConsent = ref(false);
const created = ref<ContactInvitation | null>(null);
const busy = ref(false);
const error = ref<string | null>(null);
const copied = ref(false);
const inviting = ref(false);
const aboutSharing = computed(() => t('contacts.sharing.aboutText'));
function openInvite() { shareMemory.value = false; contributorConsent.value = false; email.value = ''; inviting.value = true; }
const consented = computed(() => shareMemory.value && (!sharing.value?.contributorModel || contributorConsent.value));

async function load() {
  try { sharing.value = await api<ContactSharing>(`contacts/sharing/${id.value}`); }
  catch (failure) { error.value = errorMessage(failure); }
}

async function run(task: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try { await task(); }
  catch (failure) { error.value = errorMessage(failure); }
  finally { busy.value = false; }
}

const invite = (byEmail: boolean) => run(async () => {
  created.value = await api<ContactInvitation>(`contacts/sharing/${id.value}/invitations`, {
    json: { ...(byEmail ? { email: email.value.trim() } : {}), shareMemory: true, contributorConsent: contributorConsent.value },
  });
  copied.value = false;
  inviting.value = false;
  if (byEmail) email.value = '';
  await load();
});

const revokeInvitation = (inviteID: string) => run(async () => {
  await api(`contacts/sharing/${id.value}/invitations/${inviteID}`, { method: 'DELETE' });
  await load();
});

const removeMember = (memberID: string, name: string) => run(async () => {
  if (!window.confirm(t('contacts.sharing.removeConfirm', { name }))) return;
  await api(`contacts/sharing/${id.value}/members/${memberID}`, { method: 'DELETE' });
  await load();
});

async function copy(code: string) {
  try {
    await navigator.clipboard.writeText(code);
    copied.value = true;
  } catch { copied.value = false; }
}

onMounted(load);
</script>

<template>
  <PageBar :title="$t('contacts.sharing.title')" :back="`/contacts/${id}/edit`" always-back>
    <InfoButton :label="$t('contacts.sharing.about')" :text="aboutSharing" />
  </PageBar>
  <div class="page">
    <div class="page-inner">
      <AppNotice v-if="error && !inviting">{{ error }}</AppNotice>
      <AppLoading v-if="!sharing && !error" fill />
      <template v-if="sharing">
        <AppListGroup v-if="created" :title="$t('contacts.sharing.newInvitation')">
          <div v-if="created.code" class="text-block">
            <p class="code-box">{{ created.code }}</p>
            <p class="info-title">{{ $t('contacts.sharing.expires', { date: fullDate(created.expiresAt) }) }}
              <InfoButton :label="$t('contacts.sharing.invitationCode')" :text="$t('contacts.sharing.codeInfo')" />
            </p>
            <AppButton variant="tonal" :icon="copied ? 'done' : 'copy'" @click="copy(created.code)">{{ copied ? $t('common.copied') : $t('contacts.sharing.copyCode') }}</AppButton>
          </div>
          <AppListItem v-else plain icon="check">{{ $t('contacts.sharing.sentTo', { email: created.recipientEmail }) }}</AppListItem>
        </AppListGroup>

        <AppListGroup :title="contact?.name ? $t('contacts.sharing.participantsNamed', { name: contact.name }) : $t('contacts.sharing.participants')">
          <div v-for="member in sharing.members" :key="member.id" class="field">
            <AppIcon name="person" class="lead-icon" />
            <span class="member-name">{{ member.name }}</span>
            <AppChip v-if="member.role === 'owner'">{{ $t('contacts.sharing.creator') }}</AppChip>
            <AppIconButton v-else icon="minus" :label="$t('contacts.sharing.remove', { name: member.name })" :disabled="busy" @click="removeMember(member.id, member.name)" />
          </div>
          <AppListItem icon="group-add" :disabled="busy" @click="openInvite">{{ $t('contacts.sharing.invite') }}</AppListItem>
        </AppListGroup>

        <AppListGroup v-if="sharing.invitations.length" :title="$t('contacts.sharing.pending')">
          <div v-for="invitation in sharing.invitations" :key="invitation.id" class="field">
            <span class="two-line">
              {{ invitation.recipientEmail ?? $t('contacts.sharing.invitationCode') }}
              <span class="small">{{ $t('contacts.sharing.expires', { date: fullDate(invitation.expiresAt) }) }}</span>
            </span>
            <AppIconButton icon="x-circle" :label="$t('contacts.sharing.revoke')" :disabled="busy" @click="revokeInvitation(invitation.id)" />
          </div>
        </AppListGroup>

        <AppSheet v-if="inviting" :title="$t('contacts.sharing.inviteTitle')" @close="inviting = false">
          <template #header><InfoButton :label="$t('contacts.sharing.about')" :text="aboutSharing" /></template>
          <!-- Consent covers this text, so it stays visible beside the checkboxes. -->
          <ConsentFields
            v-model:share-memory="shareMemory" v-model:contributor-consent="contributorConsent"
            :contributor-model="sharing.contributorModel"
            :disclosure="[$t('contacts.sharing.disclosure')]"
            :memory-label="$t('contacts.sharing.memoryLabel')"
            :contributor-note="$t('contacts.sharing.contributorNote')"
          />
          <AppListGroup :title="$t('contacts.sharing.byEmail')">
            <form class="field" @submit.prevent="invite(true)">
              <input v-model="email" type="email" :placeholder="$t('contacts.sharing.emailPlaceholder')" :aria-label="$t('contacts.sharing.recipientEmail')" autocomplete="off">
              <button type="submit" class="link-button" :disabled="!consented || busy || !email.trim()">{{ $t('common.send') }}</button>
            </form>
          </AppListGroup>
          <AppListGroup :title="$t('contacts.sharing.withCode')">
            <AppListItem icon="key" :disabled="!consented || busy" @click="invite(false)">{{ $t('contacts.sharing.createCode') }}</AppListItem>
          </AppListGroup>
          <AppNotice v-if="error">{{ error }}</AppNotice>
        </AppSheet>
      </template>
    </div>
  </div>
</template>

<style scoped>
.member-name { flex: 1; }
</style>
