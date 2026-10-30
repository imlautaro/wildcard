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
      <p v-if="error && !inviting" class="notice" style="margin: 0 0 12px">{{ error }}</p>
      <div v-if="!sharing && !error" class="center"><span class="spinner" /> Loading…</div>
      <template v-if="sharing">
        <template v-if="created">
          <div class="group-title">New invitation</div>
          <div class="group">
            <div v-if="created.code" class="text-block">
              <p class="code-box">{{ created.code }}</p>
              <p class="info-title">Expires {{ fullDate(created.expiresAt) }}
                <InfoButton label="Invitation code" text="The recipient signs in, opens Contacts → Join shared contact, and pastes this code. Anyone with this code can accept it, so share it only with your intended recipient." />
              </p>
              <button type="button" class="button secondary" style="margin-top: 4px" @click="copy(created.code)"><AppIcon :name="copied ? 'done' : 'copy'" />{{ copied ? 'Copied' : 'Copy code' }}</button>
            </div>
            <div v-else class="button-row static"><AppIcon name="check" />Invitation sent to {{ created.recipientEmail }}</div>
          </div>
        </template>

        <div class="group-title">{{ contact?.name ? `${contact.name} · Participants` : 'Participants' }}</div>
        <div class="group">
          <div v-for="member in sharing.members" :key="member.id" class="field">
            <AppIcon name="person" class="lead-icon" />
            <span style="flex: 1">{{ member.name }}</span>
            <span v-if="member.role === 'owner'" class="chip">Creator</span>
            <button v-else type="button" class="icon-button" :aria-label="`Remove ${member.name}`" :disabled="busy" @click="removeMember(member.id, member.name)"><AppIcon name="minus" /></button>
          </div>
          <button type="button" class="button-row" :disabled="busy" @click="openInvite"><AppIcon name="group-add" />Invite someone</button>
        </div>

        <template v-if="sharing.invitations.length">
          <div class="group-title">Pending invitations</div>
          <div class="group">
            <div v-for="invitation in sharing.invitations" :key="invitation.id" class="field">
              <span class="two-line">
                {{ invitation.recipientEmail ?? 'Invitation code' }}
                <span class="small">Expires {{ fullDate(invitation.expiresAt) }}</span>
              </span>
              <button type="button" class="icon-button" aria-label="Revoke invitation" :disabled="busy" @click="revokeInvitation(invitation.id)"><AppIcon name="x-circle" /></button>
            </div>
          </div>
        </template>

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
          <div class="group-title">By email</div>
          <form class="group" @submit.prevent="invite(true)">
            <div class="field">
              <input v-model="email" type="email" placeholder="Email of an existing account" aria-label="Recipient email" autocomplete="off">
              <button type="submit" class="link-button" :disabled="!consented || busy || !email.trim()">Send</button>
            </div>
          </form>
          <div class="group-title">Or with a code</div>
          <div class="group">
            <button type="button" class="button-row" :disabled="!consented || busy" @click="invite(false)"><AppIcon name="key" />Create invitation code</button>
          </div>
          <p v-if="error" class="notice" style="margin: 12px 0 0">{{ error }}</p>
        </AppSheet>
      </template>
    </div>
  </div>
</template>
