<script setup lang="ts">
import type { GroupMember, GroupPrivateSharing } from '~/utils/types';

const route = useRoute();
const id = computed(() => String(route.params.id));
const chats = useChats();
const { user } = useSession();
const { state } = useGroupConversation(id);
const snapshot = computed(() => state.value.snapshot);
const email = ref('');
const contactID = ref('');
const shareMemory = ref(false);
const contributorConsent = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
useHead({ title: computed(() => snapshot.value?.group.name ?? 'Group') });

const isOwner = computed(() => snapshot.value?.group.ownerID === user.value?.id);
const agentIDs = computed(() => new Set(snapshot.value?.members.filter((member) => member.kind === 'agent').map((member) => member.id)));
// Only a contact's creator can add it to a group.
const addable = computed(() => chats.directory.value.filter((contact) => contact.role !== 'member' && contact.agentID && !agentIDs.value.has(contact.agentID)));
const consented = computed(() => shareMemory.value && (!snapshot.value?.contributorModel || contributorConsent.value));

function photoPath(member: GroupMember) {
  return member.photoVersion ? `groups/${id.value}/photos/${member.kind}/${member.id}?version=${encodeURIComponent(member.photoVersion)}` : null;
}
function canRemove(member: GroupMember) {
  if (member.kind === 'agent') return isOwner.value || member.addedBy === user.value?.id;
  return isOwner.value && member.id !== user.value?.id;
}

async function load() {
  await loadGroupDetails(id.value);
}

async function run(task: () => Promise<void>) {
  if (busy.value) return;
  const accountID = user.value?.id;
  const groupID = id.value;
  busy.value = true;
  error.value = null;
  notice.value = null;
  try { await task(); }
  catch (failure) { if (accountID === user.value?.id && groupID === id.value) error.value = errorMessage(failure); }
  finally { busy.value = false; }
}

const invite = () => run(async () => {
  await api(`groups/${id.value}/invitations`, { json: { email: email.value.trim() } });
  notice.value = `Invitation sent to ${email.value.trim()}. It appears in their Invitations and expires after 24 hours.`;
  email.value = '';
});

const addContact = () => run(async () => {
  await api(`groups/${id.value}/agents`, { json: { contactID: contactID.value, shareMemory: true, contributorConsent: contributorConsent.value } });
  contactID.value = '';
  await load();
});

const remove = (member: GroupMember) => run(async () => {
  if (!window.confirm(`Remove ${member.name}? This removes group access. Previous messages stay visible. Removing a user also removes the contacts they added.`)) return;
  await api(member.kind === 'agent' ? `groups/${id.value}/agents/${member.id}` : `groups/${id.value}/members/${member.id}`, { method: 'DELETE' });
  await load();
});

const togglePermission = (member: GroupMember) => run(async () => {
  await api(`groups/${id.value}/members/${member.id}`, { method: 'PATCH', json: { canInvite: !member.canInvite } });
  await load();
});

const togglePrivateSharing = (permission: GroupPrivateSharing) => run(async () => {
  const groupID = id.value;
  const accountID = user.value?.id;
  const enabled = !permission.enabled;
  if (enabled && !window.confirm('This contact may discuss your entire past and future private text conversation with everyone in this group, including future members. This includes personal details and temporary plans. You can turn this off later, but messages already sent remain visible.')) return;
  await api(`groups/${groupID}/private-sharing/${permission.agentID}`, { method: 'PUT', json: { enabled } });
  if (accountID !== user.value?.id || groupID !== id.value) return;
  updateGroupPrivateSharing(groupID, permission.agentID, enabled);
  await loadGroupDetails(groupID);
});

const leave = () => run(async () => {
  const message = isOwner.value
    ? 'Delete group? This deletes the group, its messages and memories sourced from those messages for everyone.'
    : 'Leave group? Your contacts leave with you. Your messages remain in the group. Your contributed group memories stop being available to contacts, but replies already sent remain visible.';
  if (!window.confirm(message)) return;
  await api(isOwner.value ? `groups/${id.value}` : `groups/${id.value}/members/${user.value!.id}`, { method: 'DELETE' });
  chats.removeGroup(id.value);
  forgetGroup(id.value);
  await navigateTo('/', { replace: true });
});

onMounted(() => run(async () => {
  await Promise.all([load(), chats.loadAllContacts()]);
}));
</script>

<template>
  <PageBar :title="snapshot?.group.name ?? 'Group'" :back="`/groups/${id}`" always-back />
  <div class="page">
    <div class="page-inner">
      <p v-if="error" class="notice" style="margin: 0 0 12px">{{ error }}</p>
      <p v-if="notice" class="group-footer" role="status" style="padding-top: 8px">{{ notice }}</p>
      <div v-if="!snapshot && busy" class="center"><span class="spinner" /> Loading…</div>
      <template v-if="snapshot">
        <IdentityEditor :name="snapshot.group.name" :path="groupPhotoPath(snapshot.group)" />
        <h2 class="identity-title">{{ snapshot.group.name }}</h2>
        <p class="identity-subtitle">{{ snapshot.members.length }} {{ snapshot.members.length === 1 ? 'member' : 'members' }}</p>

        <div class="group" style="margin-top: 24px">
          <NuxtLink :to="`/groups/${id}/connections`" class="button-row"><AppIcon name="link" />Connections</NuxtLink>
          <NuxtLink :to="`/groups/${id}/mini-apps`" class="button-row"><AppIcon name="grid" />Mini apps</NuxtLink>
          <NuxtLink :to="`/groups/${id}/tasks`" class="button-row"><AppIcon name="tasks" />Tasks</NuxtLink>
        </div>

        <ChatMediaTabs :base="`groups/${id}`" :attachment-path="item => `groups/${id}/messages/${item.messageID}/attachment`"
          :documents-base="`groups/${id}`" :document-route="`/groups/${id}/documents`"
        />

        <div class="group-title">Discuss my private chats</div>
        <div class="group">
          <!-- The switch shows the saved state until the confirmed change is stored. -->
          <label v-for="permission in snapshot.privateSharing ?? []" :key="permission.agentID" class="toggle">
            <span class="two-line">
              {{ snapshot.members.find(member => member.kind === 'agent' && member.id === permission.agentID)?.name ?? 'Contact' }}
              <span v-if="!permission.available && !permission.enabled" class="small">Needs an eligible private chat</span>
            </span>
            <input
              type="checkbox" role="switch" :checked="!!permission.enabled" :disabled="busy || (!permission.available && !permission.enabled)"
              @change="($event.target as HTMLInputElement).checked = !!permission.enabled; togglePrivateSharing(permission)"
            >
          </label>
          <div v-if="!snapshot.privateSharing?.length" class="text-block">Add a contact to manage private chat sharing.</div>
        </div>
        <p class="group-footer">Allow each contact to discuss your entire past and future private text conversation with everyone in this group, including future members. This includes personal details and temporary plans. Only your own conversation is authorized. Attachment files and scheduled messages are excluded; chats with connections stay private. Turning this off stops pending replies; messages already sent remain visible. Existing shared memories keep their current rules. Unavailable contacts need an eligible private chat.</p>

        <div class="group-title">Members</div>
        <div class="group">
          <div v-for="member in snapshot.members" :key="`${member.kind}/${member.id}`" class="field">
            <AppAvatar :name="member.name" :path="photoPath(member)" :size="40" />
            <span class="two-line">
              {{ member.kind === 'user' && member.id === user?.id ? `${member.name} (You)` : member.name }}
              <span class="small">
                {{ member.kind === 'agent' ? 'Contact' : member.id === snapshot.group.ownerID ? 'Owner' : member.canInvite ? 'Can invite' : 'Member' }}
              </span>
            </span>
            <button v-if="isOwner && member.kind === 'user' && member.id !== user?.id" type="button" class="link-button" :disabled="busy" @click="togglePermission(member)">
              {{ member.canInvite ? 'Revoke invite' : 'Allow invite' }}
            </button>
            <button v-if="canRemove(member)" type="button" class="link-button danger" :disabled="busy" @click="remove(member)">Remove</button>
          </div>
        </div>

        <template v-if="snapshot.canInvite">
          <div class="group-title">Invite people</div>
          <form class="group" @submit.prevent="invite">
            <div class="field">
              <input v-model="email" type="email" placeholder="Email of an existing account" aria-label="Email" autocomplete="off">
              <button type="submit" class="link-button" :disabled="busy || !email.trim()">Invite</button>
            </div>
          </form>
          <p class="group-footer">They will receive an invitation in Wildcard and can choose whether to join the group.</p>

          <div class="group-title">Add a contact</div>
          <div v-if="!addable.length" class="group"><div class="text-block">Only contacts you created can be added. All of them are already in this group.</div></div>
          <template v-else>
            <div class="group">
              <div class="field">
                <label for="add-contact">Contact</label>
                <AppSelect
                  id="add-contact" v-model="contactID" variant="plain" placeholder="Choose a contact"
                  :options="addable.map(contact => ({ value: contact.id, label: contact.name }))"
                />
              </div>
            </div>
            <ConsentFields
              v-model:share-memory="shareMemory" v-model:contributor-consent="contributorConsent"
              :contributor-model="snapshot.contributorModel"
              :disclosure="['Adding this contact shares its existing and future memories with everyone in the group. It remains the same contact in your other chats.']"
              memory-label="I accept shared memory"
              contributor-note="Your selected model is Contributor. Messages and memories sent to Meta may be used for model training."
            />
            <button type="button" class="button block" style="margin: 8px 0 12px" :disabled="!contactID || !consented || busy" @click="addContact">Add Contact</button>
          </template>
        </template>

        <div class="group" style="margin-top: 24px">
          <button type="button" class="button-row" :disabled="busy" @click="run(load)"><AppIcon name="refresh" />Refresh details</button>
          <button type="button" class="button-row danger" :disabled="busy" @click="leave">{{ isOwner ? 'Delete group' : 'Leave group' }}</button>
        </div>
      </template>
    </div>
  </div>
</template>
