<script setup lang="ts">
import type { ContactInvitation, ContactSharing } from '~/utils/types';

useHead({ title: 'Share Contact' });
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
  <PageBar title="Share Contact" :back="`/contacts/${id}/edit`" always-back />
  <div class="page">
    <div class="page-inner">
      <p v-if="error" class="notice" style="margin: 0 0 12px">{{ error }}</p>
      <div v-if="!sharing && !error" class="center"><span class="spinner" /> Loading…</div>
      <template v-if="sharing">
        <div class="group-title">{{ contact?.name ?? 'Contact' }}</div>
        <ConsentFields
          v-model:share-memory="shareMemory" v-model:contributor-consent="contributorConsent"
          :contributor-model="sharing.contributorModel"
          :disclosure="[
            'Everyone talks to the same contact, with shared memories and presence. Each person starts an empty, private chat and keeps their own schedules and notifications.',
            'The contact can recall facts learned from anyone here, including saved memories from before sharing. Chat transcripts and attachments stay private.',
          ]"
          memory-label="Share existing and future memories"
          contributor-note="Your selected model is Contributor. Messages and shared memories sent to Meta may be used to train its models."
        />

        <div class="group-title">Invite by email</div>
        <form class="group" @submit.prevent="invite(true)">
          <div class="field">
            <input v-model="email" type="email" placeholder="Email of an existing account" aria-label="Recipient email" autocomplete="off">
            <button type="submit" class="link-button" :disabled="!consented || busy || !email.trim()">Invite</button>
          </div>
        </form>
        <p class="group-footer">Enter the email of an existing Wildcard account. Their invitation appears inside Wildcard; no email is sent. Invitations expire after 24 hours. Up to four participants, including you.</p>

        <div class="group">
          <button type="button" class="button-row" :disabled="!consented || busy" @click="invite(false)">Create invitation code</button>
        </div>
        <p class="group-footer">Anyone with this code can accept it. Share it only with your intended recipient.</p>

        <template v-if="created">
          <div class="group-title">New invitation</div>
          <div class="group">
            <div v-if="created.code" class="text-block">
              <p class="code" style="color: var(--text)">{{ created.code }}</p>
              <p>The recipient signs in, opens Contacts → Join shared contact, and pastes this code. Expires {{ fullDate(created.expiresAt) }}.</p>
              <button type="button" class="link-button" style="padding-left: 0" @click="copy(created.code)">{{ copied ? 'Copied' : 'Copy code' }}</button>
            </div>
            <div v-else class="text-block">Invitation sent to {{ created.recipientEmail }}. They can accept it from Invitations in Wildcard.</div>
          </div>
        </template>

        <div class="group-title">Participants</div>
        <div class="group">
          <div v-for="member in sharing.members" :key="member.id" class="field">
            <span style="flex: 1">{{ member.name }}</span>
            <span v-if="member.role === 'owner'" class="muted small">Creator</span>
            <button v-else type="button" class="link-button danger" :disabled="busy" @click="removeMember(member.id, member.name)">Remove</button>
          </div>
        </div>

        <template v-if="sharing.invitations.length">
          <div class="group-title">Pending invitations</div>
          <div class="group">
            <div v-for="invitation in sharing.invitations" :key="invitation.id" class="field">
              <span style="flex: 1; min-width: 0">
                {{ invitation.recipientEmail ?? 'Invitation code' }}<br>
                <span class="small muted">Expires {{ fullDate(invitation.expiresAt) }}</span>
              </span>
              <button type="button" class="link-button danger" :disabled="busy" @click="revokeInvitation(invitation.id)">Revoke</button>
            </div>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>
