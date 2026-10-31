<script setup lang="ts">
import type { ContactInvitation, ContactSharing } from '~/utils/types';

const route = useRoute();
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
const aboutSharing = 'Everyone talks to the same contact, with shared memories and presence. Each person starts an empty, private chat and keeps their own schedules and notifications. Invitations appear inside Wildcard; no email is sent. They expire after 24 hours. Up to four participants, including you.';
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
  if (!window.confirm(`Remove ${name}? Their access, private chat, schedules, and contributed memories will be deleted. Facts already repeated in other chats cannot be recalled.`)) return;
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
  <PageBar title="Share Contact" :back="`/contacts/${id}/edit`" always-back>
    <InfoButton label="Shared contacts" :text="aboutSharing" />
  </PageBar>
  <div class="page">
    <div class="page-inner">
      <AppNotice v-if="error && !inviting">{{ error }}</AppNotice>
      <AppLoading v-if="!sharing && !error" fill />
      <template v-if="sharing">
        <AppListGroup v-if="created" title="New invitation">
          <div v-if="created.code" class="text-block">
            <p class="code-box">{{ created.code }}</p>
            <p class="info-title">Expires {{ fullDate(created.expiresAt) }}
              <InfoButton label="Invitation code" text="The recipient signs in, opens Contacts → Join shared contact, and pastes this code. Anyone with this code can accept it, so share it only with your intended recipient." />
            </p>
            <AppButton variant="tonal" :icon="copied ? 'done' : 'copy'" @click="copy(created.code)">{{ copied ? 'Copied' : 'Copy code' }}</AppButton>
          </div>
          <AppListItem v-else plain icon="check">Invitation sent to {{ created.recipientEmail }}</AppListItem>
        </AppListGroup>

        <AppListGroup :title="contact?.name ? `${contact.name} · Participants` : 'Participants'">
          <div v-for="member in sharing.members" :key="member.id" class="field">
            <AppIcon name="person" class="lead-icon" />
            <span class="member-name">{{ member.name }}</span>
            <AppChip v-if="member.role === 'owner'">Creator</AppChip>
            <AppIconButton v-else icon="minus" :label="`Remove ${member.name}`" :disabled="busy" @click="removeMember(member.id, member.name)" />
          </div>
          <AppListItem icon="group-add" :disabled="busy" @click="openInvite">Invite someone</AppListItem>
        </AppListGroup>

        <AppListGroup v-if="sharing.invitations.length" title="Pending invitations">
          <div v-for="invitation in sharing.invitations" :key="invitation.id" class="field">
            <span class="two-line">
              {{ invitation.recipientEmail ?? 'Invitation code' }}
              <span class="small">Expires {{ fullDate(invitation.expiresAt) }}</span>
            </span>
            <AppIconButton icon="x-circle" label="Revoke invitation" :disabled="busy" @click="revokeInvitation(invitation.id)" />
          </div>
        </AppListGroup>

        <AppSheet v-if="inviting" title="Invite" @close="inviting = false">
          <template #header><InfoButton label="Shared contacts" :text="aboutSharing" /></template>
          <!-- Consent covers this text, so it stays visible beside the checkboxes. -->
          <ConsentFields
            v-model:share-memory="shareMemory" v-model:contributor-consent="contributorConsent"
            :contributor-model="sharing.contributorModel"
            :disclosure="['The contact can recall facts learned from anyone here, including saved memories from before sharing. Chat transcripts and attachments stay private.']"
            memory-label="Share existing and future memories"
            contributor-note="Your selected model is Contributor. Messages and shared memories sent to Meta may be used to train its models."
          />
          <AppListGroup title="By email">
            <form class="field" @submit.prevent="invite(true)">
              <input v-model="email" type="email" placeholder="Email of an existing account" aria-label="Recipient email" autocomplete="off">
              <button type="submit" class="link-button" :disabled="!consented || busy || !email.trim()">Send</button>
            </form>
          </AppListGroup>
          <AppListGroup title="Or with a code">
            <AppListItem icon="key" :disabled="!consented || busy" @click="invite(false)">Create invitation code</AppListItem>
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
