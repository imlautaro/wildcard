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
// "Can see earlier messages" for the next invite or added contact; on by default.
const includeHistory = ref(true);
const historyHelp = "Off: they'll only see messages from when they join.";
const busy = ref(false);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);

const isOwner = computed(() => snapshot.value?.group.ownerID === user.value?.id);
const archived = computed(() => (chats.groups.value.find(item => item.id === id.value) ?? snapshot.value?.group)?.archivedAt != null);
const agentIDs = computed(() => new Set(snapshot.value?.members.filter((member) => member.kind === 'agent').map((member) => member.id)));
// Only a contact's creator can add it to a group.
const addable = computed(() => chats.directory.value.filter((contact) => contact.role !== 'member' && contact.agentID && !agentIDs.value.has(contact.agentID)));
const consented = computed(() => shareMemory.value && (!snapshot.value?.contributorModel || contributorConsent.value));
const sheet = ref<'sharing' | 'invite' | 'add' | null>(null);
const managing = ref<GroupMember | null>(null);
const sharingSummary = computed(() => {
  const permissions = snapshot.value?.privateSharing ?? [];
  return permissions.length ? `${permissions.filter(permission => permission.enabled).length} of ${permissions.length} on` : 'No contacts';
});
const sharingInfo = 'Allow each contact to discuss your entire past and future private text conversation with everyone in this group, including future members. This includes personal details and temporary plans. Only your own conversation is authorized. Attachment files and scheduled messages are excluded; chats with connections stay private. Turning this off stops pending replies; messages already sent remain visible. Existing shared memories keep their current rules. Unavailable contacts need an eligible private chat.';
// Missing (older cached snapshot) means full history.
const withoutHistory = (member: GroupMember) => member.includesHistory === 0 || member.includesHistory === false;
// Each sheet starts with history on, so an earlier "off" does not carry over.
function openSheet(next: 'invite' | 'add') {
  includeHistory.value = true;
  sheet.value = next;
}
function memberRole(member: GroupMember) {
  return member.kind === 'agent' ? 'Contact' : member.id === snapshot.value?.group.ownerID ? 'Owner' : member.canInvite ? 'Can invite' : 'Member';
}
function canManage(member: GroupMember) {
  return canRemove(member) || (isOwner.value && member.kind === 'user' && member.id !== user.value?.id);
}

function photoPath(member: GroupMember) {
  return member.photoVersion ? `groups/${id.value}/photos/${member.kind}/${member.id}?version=${encodeURIComponent(member.photoVersion)}` : null;
}
function canRemove(member: GroupMember) {
  if (member.kind === 'agent') return isOwner.value || member.addedBy === user.value?.id;
  return isOwner.value && member.id !== user.value?.id;
}

async function load() {
  forgetConversationLearning(`groups/${id.value}`);
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
  await api(`groups/${id.value}/invitations`, { json: { email: email.value.trim(), includeHistory: includeHistory.value } });
  notice.value = `Invitation sent to ${email.value.trim()}. It appears in their Invitations and expires after 24 hours.`;
  email.value = '';
  sheet.value = null;
});

const addContact = () => run(async () => {
  await api(`groups/${id.value}/agents`, { json: { contactID: contactID.value, shareMemory: true, contributorConsent: contributorConsent.value, includeHistory: includeHistory.value } });
  contactID.value = '';
  sheet.value = null;
  await load();
});

const remove = (member: GroupMember) => run(async () => {
  managing.value = null;
  if (!window.confirm(`Remove ${member.name}? This removes group access. Previous messages stay visible. Removing a user also removes the contacts they added.`)) return;
  await api(member.kind === 'agent' ? `groups/${id.value}/agents/${member.id}` : `groups/${id.value}/members/${member.id}`, { method: 'DELETE' });
  await load();
});

const togglePermission = (member: GroupMember) => run(async () => {
  managing.value = null;
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
  <PageBar :title="snapshot?.group.name ?? 'Group'" :back="`/groups/${id}`" always-back>
    <AppIconButton icon="refresh" label="Refresh details" :disabled="busy" @click="run(load)" />
  </PageBar>
  <div class="page">
    <div class="page-inner">
      <AppNotice v-if="error && !sheet">{{ error }}</AppNotice>
      <AppNotice v-if="notice" tone="success">{{ notice }}</AppNotice>
      <AppLoading v-if="!snapshot && busy" fill />
      <template v-if="snapshot">
        <IdentityEditor :name="snapshot.group.name" :path="groupPhotoPath(snapshot.group)" show-name />
        <p class="identity-subtitle">{{ snapshot.members.length }} {{ snapshot.members.length === 1 ? 'member' : 'members' }}</p>

        <AppListGroup>
          <AppListItem icon="chat" opens :value="sharingSummary" @click="sheet = 'sharing'">Discuss my private chats</AppListItem>
          <AppListItem :to="`/groups/${id}/connections`" icon="link">Connections</AppListItem>
          <AppListItem :to="`/groups/${id}/learning`" icon="person">Conversation learning</AppListItem>
          <AppListItem :to="`/groups/${id}/mini-apps`" icon="grid">Mini apps</AppListItem>
          <AppListItem :to="`/groups/${id}/tasks`" icon="tasks">Tasks</AppListItem>
        </AppListGroup>

        <AppListGroup title="Members">
          <template v-if="snapshot.canInvite">
            <AppListItem icon="mail" :disabled="busy" @click="openSheet('invite')">Invite people</AppListItem>
            <AppListItem icon="group-add" :disabled="busy" @click="openSheet('add')">Add a contact</AppListItem>
          </template>
          <div v-for="member in snapshot.members" :key="`${member.kind}/${member.id}`" class="field member-row">
            <AppAvatar :name="member.name" :path="photoPath(member)" :size="40" />
            <span class="two-line">
              {{ member.kind === 'user' && member.id === user?.id ? `${member.name} (You)` : member.name }}
              <span class="small">{{ memberRole(member) }}</span>
              <span v-if="withoutHistory(member)" class="small">Joined without earlier messages</span>
            </span>
            <AppIconButton v-if="canManage(member)" icon="more" :label="`Manage ${member.name}`" :disabled="busy" @click="managing = member" />
          </div>
        </AppListGroup>

        <ChatMediaTabs :base="`groups/${id}`" :attachment-path="item => albumImagePath(`groups/${id}/messages/${item.messageID}/attachment`, item.image)"
          :documents-base="`groups/${id}`" :document-route="`/groups/${id}/documents`"
        />

        <AppListGroup class="lifecycle-group">
          <ChatLifecycleActions :archived="archived" :can-clear="isOwner" :busy="busy" group
            @archive="run(() => chats.archiveChat('group', id, !archived))"
            @clear="memory => run(() => chats.clearChat('group', id, memory))"
          />
          <AppListItem danger :icon="isOwner ? 'delete' : 'logout'" :disabled="busy" @click="leave">{{ isOwner ? 'Delete group' : 'Leave group' }}</AppListItem>
        </AppListGroup>

        <AppSheet v-if="sheet === 'sharing'" title="Discuss my private chats" @close="sheet = null">
          <template #header><InfoButton label="Discuss my private chats" :text="sharingInfo" /></template>
          <AppListGroup>
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
          </AppListGroup>
          <AppNotice v-if="error">{{ error }}</AppNotice>
        </AppSheet>

        <AppSheet v-if="sheet === 'invite'" title="Invite people" @close="sheet = null">
          <template #header><InfoButton label="Invite people" text="They will receive an invitation in Wildcard and can choose whether to join the group. Invitations expire after 24 hours." /></template>
          <form id="invite-form" class="group" @submit.prevent="invite">
            <div class="field"><input v-model="email" type="email" placeholder="Email of an existing account" aria-label="Email" autocomplete="off" autofocus></div>
          </form>
          <AppListGroup>
            <AppSwitch v-model="includeHistory" label="Can see earlier messages" :supporting="historyHelp" :disabled="busy" />
          </AppListGroup>
          <AppNotice v-if="error">{{ error }}</AppNotice>
          <template #actions>
            <AppButton variant="text" @click="sheet = null">Cancel</AppButton>
            <AppButton type="submit" form="invite-form" :disabled="busy || !email.trim()">Invite</AppButton>
          </template>
        </AppSheet>

        <AppSheet v-if="sheet === 'add'" title="Add a contact" @close="sheet = null">
          <AppListGroup v-if="!addable.length"><div class="text-block">Only contacts you created can be added. All of them are already in this group.</div></AppListGroup>
          <template v-else>
            <AppListGroup>
              <div class="field">
                <label for="add-contact">Contact</label>
                <AppSelect
                  id="add-contact" v-model="contactID" variant="plain" placeholder="Choose a contact"
                  :options="addable.map(contact => ({ value: contact.id, label: contact.name }))"
                />
              </div>
              <AppSwitch v-model="includeHistory" label="Can see earlier messages" :supporting="historyHelp" :disabled="busy" />
            </AppListGroup>
            <!-- Consent covers this text, so it stays visible beside the checkboxes. -->
            <ConsentFields
              v-model:share-memory="shareMemory" v-model:contributor-consent="contributorConsent"
              :contributor-model="snapshot.contributorModel"
              :disclosure="['Adding this contact shares its existing and future memories with everyone in the group. It remains the same contact in your other chats.']"
              memory-label="I accept shared memory"
              contributor-note="Your selected model is Contributor. Messages and memories sent to Meta may be used for model training."
            />
          </template>
          <AppNotice v-if="error">{{ error }}</AppNotice>
          <template #actions>
            <AppButton variant="text" @click="sheet = null">Cancel</AppButton>
            <AppButton v-if="addable.length" :disabled="!contactID || !consented || busy" @click="addContact">Add</AppButton>
          </template>
        </AppSheet>

        <AppSheet v-if="managing" :title="managing.name" @close="managing = null">
          <AppListGroup>
            <AppListItem v-if="isOwner && managing.kind === 'user' && managing.id !== user?.id" icon="mail" :disabled="busy" @click="togglePermission(managing)">
              {{ managing.canInvite ? 'Stop allowing invites' : 'Allow invites' }}
            </AppListItem>
            <AppListItem v-if="canRemove(managing)" danger icon="delete" :disabled="busy" @click="remove(managing)">Remove from group</AppListItem>
          </AppListGroup>
        </AppSheet>
      </template>
    </div>
  </div>
</template>

<style scoped>
.member-row .two-line { flex: 1; min-width: 0; }
/* The groups after the identity header and after the media tabs don't follow another group. */
.identity-subtitle { margin-bottom: var(--space-5); }
:deep(.lifecycle-group) { margin-top: var(--space-5); }
</style>
