<script setup lang="ts">
import type { GroupInvitation, ReceivedContactInvitation } from '~/utils/types';

const chats = useChats();
const selected = ref<{ kind: 'contact'; invitation: ReceivedContactInvitation } | { kind: 'group'; invitation: GroupInvitation } | null>(null);
const shareMemory = ref(false);
const contributorConsent = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);
const consented = computed(() => shareMemory.value && (!chats.contributorModel.value || contributorConsent.value));

const { t } = useI18n();
// An invitation without earlier messages has its own disclosure without the full-history sentence.
const withoutHistory = (invitation: GroupInvitation) => invitation.includeHistory === 0 || invitation.includeHistory === false;
const disclosure = computed(() => {
  const current = selected.value;
  if (!current) return [];
  if (current.kind === 'contact') return [t('auth.sharing.contactDisclosure1'), t('auth.sharing.contactDisclosure2')];
  return [withoutHistory(current.invitation) ? t('auth.invitations.groupDisclosureWithoutHistory') : t('auth.invitations.groupDisclosure')];
});

function choose(next: typeof selected.value) {
  selected.value = next;
  shareMemory.value = false;
  contributorConsent.value = false;
  error.value = null;
}

async function run(task: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try { await task(); }
  catch (failure) { error.value = errorMessage(failure); }
  finally { busy.value = false; }
}

const accept = () => run(async () => {
  const current = selected.value;
  if (!current) return;
  const consent = { shareMemory: true, contributorConsent: contributorConsent.value };
  if (current.kind === 'contact') {
    const { contactID } = await api<{ contactID: string }>('contacts/sharing/accept', { json: { invitationID: current.invitation.id, ...consent } });
    await chats.refresh();
    await navigateTo(`/chats/${contactID}`, { replace: true });
  } else {
    const { id } = await api<{ id: string }>(`groups/invitations/${current.invitation.id}/accept`, { json: consent });
    await chats.refresh();
    await navigateTo(`/groups/${id}`, { replace: true });
  }
});

const decline = (kind: 'contact' | 'group', id: string) => run(async () => {
  await api(kind === 'contact' ? `contacts/sharing/inbox/${id}` : `groups/invitations/${id}`, { method: 'DELETE' });
  if (selected.value?.invitation.id === id) selected.value = null;
  await chats.refresh();
});

onMounted(() => chats.refresh());
</script>

<template>
  <PageBar :title="t('auth.invitations.title')" back="/contacts" always-back />
  <div class="page">
    <div class="page-inner">
      <AppNotice v-if="error">{{ error }}</AppNotice>
      <template v-if="selected">
        <div class="group-title">{{ t('auth.sharing.joinName', { name: selected.kind === 'contact' ? selected.invitation.contactName : selected.invitation.groupName }) }}</div>
        <ConsentFields
          v-model:share-memory="shareMemory" v-model:contributor-consent="contributorConsent"
          :contributor-model="chats.contributorModel.value"
          :disclosure="disclosure"
          :memory-label="selected.kind === 'contact' ? t('auth.sharing.contactMemory') : t('auth.invitations.groupMemory')"
          :contributor-note="selected.kind === 'contact' ? t('auth.sharing.contactContributorNote') : t('auth.invitations.groupContributorNote')"
        />
        <div class="actions-row">
          <AppButton variant="text" @click="selected = null">{{ t('common.cancel') }}</AppButton>
          <AppButton :disabled="!consented || busy" @click="accept">{{ t('auth.invitations.accept') }}</AppButton>
        </div>
      </template>

      <AppListGroup :title="t('auth.invitations.contactTitle')">
        <div v-if="!chats.contactInvitations.value.length" class="text-block">{{ t('auth.invitations.contactEmpty') }}</div>
        <div v-for="invitation in chats.contactInvitations.value" :key="invitation.id" class="field">
          <span class="two-line">
            <strong>{{ invitation.contactName }}</strong>
            <span class="small">{{ t('auth.invitations.contactMeta', { sender: invitation.senderName, date: fullDate(invitation.expiresAt) }) }}</span>
          </span>
          <button type="button" class="link-button danger" :disabled="busy" @click="decline('contact', invitation.id)">{{ t('auth.invitations.decline') }}</button>
          <button type="button" class="link-button" :disabled="busy" @click="choose({ kind: 'contact', invitation })">{{ t('auth.invitations.review') }}</button>
        </div>
      </AppListGroup>

      <AppListGroup :title="t('auth.invitations.groupTitle')">
        <div v-if="!chats.groupInvitations.value.length" class="text-block">{{ t('auth.invitations.groupEmpty') }}</div>
        <div v-for="invitation in chats.groupInvitations.value" :key="invitation.id" class="field">
          <span class="two-line">
            <strong>{{ invitation.groupName }}</strong>
            <span class="small">{{ t('auth.invitations.groupMeta', { sender: invitation.senderName, date: fullDate(invitation.expiresAt) }) }}</span>
          </span>
          <button type="button" class="link-button danger" :disabled="busy" @click="decline('group', invitation.id)">{{ t('auth.invitations.decline') }}</button>
          <button type="button" class="link-button" :disabled="busy" @click="choose({ kind: 'group', invitation })">{{ t('auth.invitations.review') }}</button>
        </div>
      </AppListGroup>
    </div>
  </div>
</template>
