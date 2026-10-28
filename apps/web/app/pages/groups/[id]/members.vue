<script setup lang="ts">
import type { GroupMember, GroupSnapshot } from '~/utils/types';

const route = useRoute();
const id = computed(() => String(route.params.id));
const chats = useChats();
const { user } = useSession();
const snapshot = ref<GroupSnapshot | null>(null);
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
  snapshot.value = await api<GroupSnapshot>(`groups/${id.value}`);
}

async function run(task: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  notice.value = null;
  try { await task(); }
  catch (failure) { error.value = errorMessage(failure); }
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

        <div class="group-title">Members</div>
        <div class="group">
          <div v-for="member in snapshot.members" :key="`${member.kind}/${member.id}`" class="field">
            <AppAvatar :name="member.name" :path="photoPath(member)" :size="32" />
            <span style="flex: 1; min-width: 0">
              {{ member.kind === 'user' && member.id === user?.id ? `${member.name} (You)` : member.name }}<br>
              <span class="small muted">
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
                <select v-model="contactID" aria-label="Contact" style="flex: 1; border: 0; background: transparent">
                  <option value="" disabled>Choose one of your contacts</option>
                  <option v-for="contact in addable" :key="contact.id" :value="contact.id">{{ contact.name }}</option>
                </select>
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

        <div class="group" style="margin-top: 20px">
          <button type="button" class="button-row danger" :disabled="busy" @click="leave">{{ isOwner ? 'Delete group' : 'Leave group' }}</button>
        </div>
      </template>
    </div>
  </div>
</template>
