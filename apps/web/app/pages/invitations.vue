<script setup lang="ts">
import type { GroupInvitation, ReceivedContactInvitation } from '~/utils/types';

const chats = useChats();
const selected = ref<{ kind: 'contact'; invitation: ReceivedContactInvitation } | { kind: 'group'; invitation: GroupInvitation } | null>(null);
const shareMemory = ref(false);
const contributorConsent = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);
const consented = computed(() => shareMemory.value && (!chats.contributorModel.value || contributorConsent.value));

const contactDisclosure = [
  'Start your own empty chat with this contact. Its memories and presence are shared with other participants. Your schedules and notifications belong to you.',
  'The contact can share remembered facts about you with other participants. Your original messages and attachments are private. The creator can remove your access.',
];
const groupDisclosure = [
  'Group members can see your name and profile photo. Everyone in this group can read its full history, including messages sent before they joined. Contacts use shared memories from their other conversations. What you say here can become a shared memory and be recalled in other chats with these contacts. Leaving stops access to your contributed group memories; messages remain visible in the group until it is deleted.',
];

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
  <PageBar title="Invitations" back="/contacts" always-back />
  <div class="page">
    <div class="page-inner">
      <AppNotice v-if="error">{{ error }}</AppNotice>
      <template v-if="selected">
        <div class="group-title">Join {{ selected.kind === 'contact' ? selected.invitation.contactName : selected.invitation.groupName }}</div>
        <ConsentFields
          v-model:share-memory="shareMemory" v-model:contributor-consent="contributorConsent"
          :contributor-model="chats.contributorModel.value"
          :disclosure="selected.kind === 'contact' ? contactDisclosure : groupDisclosure"
          :memory-label="selected.kind === 'contact' ? 'I agree to shared memories' : 'I accept shared memory'"
          :contributor-note="selected.kind === 'contact'
            ? 'Messages and shared memories sent to Meta may be used to train its models.'
            : 'This installation uses Meta\'s Contributor model. Group messages and shared memories sent to Meta may be used for model training.'"
        />
        <div class="actions-row">
          <AppButton variant="text" @click="selected = null">Cancel</AppButton>
          <AppButton :disabled="!consented || busy" @click="accept">Accept</AppButton>
        </div>
      </template>

      <AppListGroup title="Contact invitations">
        <div v-if="!chats.contactInvitations.value.length" class="text-block">No contact invitations</div>
        <div v-for="invitation in chats.contactInvitations.value" :key="invitation.id" class="field">
          <span class="two-line">
            <strong>{{ invitation.contactName }}</strong>
            <span class="small">From {{ invitation.senderName }} · Expires {{ fullDate(invitation.expiresAt) }}</span>
          </span>
          <button type="button" class="link-button danger" :disabled="busy" @click="decline('contact', invitation.id)">Decline</button>
          <button type="button" class="link-button" :disabled="busy" @click="choose({ kind: 'contact', invitation })">Review</button>
        </div>
      </AppListGroup>

      <AppListGroup title="Group invitations">
        <div v-if="!chats.groupInvitations.value.length" class="text-block">No group invitations</div>
        <div v-for="invitation in chats.groupInvitations.value" :key="invitation.id" class="field">
          <span class="two-line">
            <strong>{{ invitation.groupName }}</strong>
            <span class="small">Invited by {{ invitation.senderName }} · Expires {{ fullDate(invitation.expiresAt) }}</span>
          </span>
          <button type="button" class="link-button danger" :disabled="busy" @click="decline('group', invitation.id)">Decline</button>
          <button type="button" class="link-button" :disabled="busy" @click="choose({ kind: 'group', invitation })">Review</button>
        </div>
      </AppListGroup>
    </div>
  </div>
</template>
