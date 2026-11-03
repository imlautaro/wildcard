<script setup lang="ts">
import type { GroupMember, GroupPrivateSharing } from '~/utils/types';

const route = useRoute();
const { t } = useI18n();
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
const historyHelp = computed(() => t('groups.members.historyHelp'));
const busy = ref(false);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);

const isOwner = computed(() => snapshot.value?.group.ownerID === user.value?.id);
const archived = computed(() => (chats.groups.value.find(item => item.id === id.value) ?? snapshot.value?.group)?.archivedAt != null);
const agentIDs = computed(() => new Set(snapshot.value?.members.filter((member) => member.kind === 'agent').map((member) => member.id)));
// Only a contact's creator can add it to a group.
const addable = computed(() => chats.directory.value.filter((contact) => contact.role !== 'member' && contact.agentID && !agentIDs.value.has(contact.agentID)));
const consented = computed(() => shareMemory.value && (!snapshot.value?.contributorModel || contributorConsent.value));
const sheet = ref<'sharing' | 'invite' | 'add' | 'consent' | null>(null);
const self = computed(() => snapshot.value?.members.find(member => member.kind === 'user' && member.id === user.value?.id));
// Missing (older payload) counts as given, so the warning only shows when the API says so.
const contributorPending = (member: GroupMember) => !!snapshot.value?.contributorModel && member.kind === 'user'
  && (member.contributorConsent === 0 || member.contributorConsent === false);
const selfConsentMissing = computed(() => !!self.value && contributorPending(self.value));
const consentDisclosure = computed(() => self.value && withoutHistory(self.value)
  ? t('groups.members.consentDisclosureWithoutHistory') : t('groups.new.disclosure'));
const managing = ref<GroupMember | null>(null);
const sharingSummary = computed(() => {
  const permissions = snapshot.value?.privateSharing ?? [];
  return permissions.length
    ? t('groups.members.sharingSummary', { on: permissions.filter(permission => permission.enabled).length, total: permissions.length })
    : t('groups.members.noContacts');
});
const sharingInfo = computed(() => t('groups.members.sharingInfo'));
// Missing (older cached snapshot) means full history.
const withoutHistory = (member: GroupMember) => member.includesHistory === 0 || member.includesHistory === false;
// Each sheet starts with history on, so an earlier "off" does not carry over.
function openSheet(next: 'invite' | 'add') {
  includeHistory.value = true;
  sheet.value = next;
}
// Consent is always re-confirmed explicitly, so both switches start off.
function openConsent() {
  shareMemory.value = false;
  contributorConsent.value = false;
  sheet.value = 'consent';
}
function memberRole(member: GroupMember) {
  return member.kind === 'agent' ? t('groups.members.roles.contact')
    : member.id === snapshot.value?.group.ownerID ? t('groups.members.roles.owner')
      : member.canInvite ? t('groups.members.roles.canInvite') : t('groups.members.roles.member');
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
  notice.value = translate('groups.members.inviteSent', { email: email.value.trim() });
  email.value = '';
  sheet.value = null;
});

const addContact = () => run(async () => {
  await api(`groups/${id.value}/agents`, { json: { contactID: contactID.value, shareMemory: true, contributorConsent: contributorConsent.value, includeHistory: includeHistory.value } });
  contactID.value = '';
  sheet.value = null;
  await load();
});

// Renews this account's own consent; nobody can consent for another member.
const giveConsent = () => run(async () => {
  await api(`groups/${id.value}/consent`, { json: { shareMemory: true, contributorConsent: contributorConsent.value, authorizeHistory: contributorConsent.value } });
  sheet.value = null;
  await load();
  notice.value = t('groups.members.consentSaved');
});

const remove = (member: GroupMember) => run(async () => {
  managing.value = null;
  if (!window.confirm(t('groups.members.removeConfirm', { name: member.name }))) return;
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
  if (enabled && !window.confirm(t('groups.members.privateSharingConfirm'))) return;
  await api(`groups/${groupID}/private-sharing/${permission.agentID}`, { method: 'PUT', json: { enabled } });
  if (accountID !== user.value?.id || groupID !== id.value) return;
  updateGroupPrivateSharing(groupID, permission.agentID, enabled);
  await loadGroupDetails(groupID);
});

// Owner only (the API returns 403 otherwise); the chat list keeps its own copy of the name.
const rename = (name: string) => run(async () => {
  const groupID = id.value;
  await api(`groups/${groupID}`, { method: 'PATCH', json: { name } });
  chats.updateGroup(groupID, { name });
  await loadGroupDetails(groupID);
});

const leave = () => run(async () => {
  const message = isOwner.value
    ? t('groups.members.deleteConfirm')
    : t('groups.members.leaveConfirm');
  if (!window.confirm(message)) return;
  await api(isOwner.value ? `groups/${id.value}` : `groups/${id.value}/members/${user.value!.id}`, { method: 'DELETE' });
  chats.removeGroup(id.value);
  forgetGroup(id.value);
  await navigateTo('/chats', { replace: true });
});

onMounted(() => run(async () => {
  await Promise.all([load(), chats.loadAllContacts()]);
  // The chat's consent notice links here with ?consent=1.
  if (route.query.consent === '1' && selfConsentMissing.value) openConsent();
}));
</script>

<template>
  <PageBar :title="snapshot?.group.name ?? $t('groups.members.fallbackTitle')" :back="`/groups/${id}`" always-back>
    <AppIconButton icon="refresh" :label="$t('groups.members.refresh')" :disabled="busy" @click="run(load)" />
  </PageBar>
  <div class="page">
    <div class="page-inner">
      <AppNotice v-if="error && !sheet">{{ error }}</AppNotice>
      <AppNotice v-if="notice" tone="success">{{ notice }}</AppNotice>
      <AppLoading v-if="!snapshot && busy" fill />
      <template v-if="snapshot">
        <IdentityEditor :name="snapshot.group.name" :path="groupPhotoPath(snapshot.group)" :renamable="isOwner" show-name :busy="busy" @rename="rename" />
        <p class="identity-subtitle">{{ $t('groups.members.memberCount', snapshot.members.length) }}</p>

        <AppNotice v-if="selfConsentMissing" tone="warning">
          {{ $t('groups.members.consentNeeded') }}
          <template #actions><button type="button" class="link-button" :disabled="busy" @click="openConsent">{{ $t('groups.members.giveConsent') }}</button></template>
        </AppNotice>

        <AppListGroup>
          <AppListItem icon="chat" opens :value="sharingSummary" @click="sheet = 'sharing'">{{ $t('groups.members.discussPrivate') }}</AppListItem>
          <AppListItem :to="`/groups/${id}/connections`" icon="link">{{ $t('groups.members.connections') }}</AppListItem>
          <AppListItem :to="`/groups/${id}/learning`" icon="person">{{ $t('groups.members.learning') }}</AppListItem>
          <AppListItem :to="`/groups/${id}/mini-apps`" icon="grid">{{ $t('groups.members.miniApps') }}</AppListItem>
          <AppListItem :to="`/groups/${id}/tasks`" icon="tasks">{{ $t('groups.members.tasks') }}</AppListItem>
          <AppListItem icon="lock" opens :value="selfConsentMissing ? $t('groups.members.consentPending') : $t('groups.members.consentReview')" :disabled="busy" @click="openConsent">
            {{ $t('groups.members.consent') }}
          </AppListItem>
        </AppListGroup>

        <AppListGroup :title="$t('groups.members.members')">
          <template v-if="snapshot.canInvite">
            <AppListItem icon="mail" :disabled="busy" @click="openSheet('invite')">{{ $t('groups.members.invitePeople') }}</AppListItem>
            <AppListItem icon="group-add" :disabled="busy" @click="openSheet('add')">{{ $t('groups.members.addContact') }}</AppListItem>
          </template>
          <div v-for="member in snapshot.members" :key="`${member.kind}/${member.id}`" class="field member-row">
            <AppAvatar :name="member.name" :path="photoPath(member)" :size="40" />
            <span class="two-line">
              {{ member.kind === 'user' && member.id === user?.id ? $t('groups.members.you', { name: member.name }) : member.name }}
              <span class="small">{{ memberRole(member) }}</span>
              <span v-if="withoutHistory(member)" class="small">{{ $t('groups.members.withoutHistory') }}</span>
              <span v-if="contributorPending(member)" class="small">{{ $t('groups.members.contributorPending') }}</span>
            </span>
            <AppIconButton v-if="canManage(member)" icon="more" :label="$t('groups.members.manage', { name: member.name })" :disabled="busy" @click="managing = member" />
          </div>
        </AppListGroup>

        <ChatMediaTabs :base="`groups/${id}`" :attachment-path="item => albumImagePath(`groups/${id}/messages/${item.messageID}/attachment`, item.image)"
          :documents-base="`groups/${id}`" :document-route="`/groups/${id}/documents`"
        />

        <AppListGroup class="lifecycle-group">
          <ChatLifecycleActions :chat-id="id" :archived="archived" :can-clear="isOwner" :busy="busy" group
            @archive="run(() => chats.archiveChat('group', id, !archived))"
            @clear="memory => run(() => chats.clearChat('group', id, memory))"
          />
          <AppListItem danger :icon="isOwner ? 'delete' : 'logout'" :disabled="busy" @click="leave">{{ isOwner ? $t('groups.members.deleteGroup') : $t('groups.members.leaveGroup') }}</AppListItem>
        </AppListGroup>

        <AppSheet v-if="sheet === 'sharing'" :title="$t('groups.members.discussPrivate')" @close="sheet = null">
          <template #header><InfoButton :label="$t('groups.members.discussPrivate')" :text="sharingInfo" /></template>
          <AppListGroup>
            <label v-for="permission in snapshot.privateSharing ?? []" :key="permission.agentID" class="toggle">
              <span class="two-line">
                {{ snapshot.members.find(member => member.kind === 'agent' && member.id === permission.agentID)?.name ?? $t('groups.members.contactFallback') }}
                <span v-if="!permission.available && !permission.enabled" class="small">{{ $t('groups.members.needsPrivateChat') }}</span>
              </span>
              <input
                type="checkbox" role="switch" :checked="!!permission.enabled" :disabled="busy || (!permission.available && !permission.enabled)"
                @change="($event.target as HTMLInputElement).checked = !!permission.enabled; togglePrivateSharing(permission)"
              >
            </label>
            <div v-if="!snapshot.privateSharing?.length" class="text-block">{{ $t('groups.members.addToManage') }}</div>
          </AppListGroup>
          <p class="sharing-note">{{ $t('groups.members.sharingNote') }}</p>
          <AppNotice v-if="error">{{ error }}</AppNotice>
        </AppSheet>

        <AppSheet v-if="sheet === 'invite'" :title="$t('groups.members.invitePeople')" @close="sheet = null">
          <template #header><InfoButton :label="$t('groups.members.invitePeople')" :text="$t('groups.members.inviteInfo')" /></template>
          <form id="invite-form" class="group" @submit.prevent="invite">
            <div class="field"><input v-model="email" type="email" :placeholder="$t('groups.members.emailPlaceholder')" :aria-label="$t('groups.members.email')" autocomplete="off" autofocus></div>
          </form>
          <AppListGroup>
            <AppSwitch v-model="includeHistory" :label="$t('groups.members.canSeeEarlier')" :supporting="historyHelp" :disabled="busy" />
          </AppListGroup>
          <AppNotice v-if="error">{{ error }}</AppNotice>
          <template #actions>
            <AppButton variant="text" @click="sheet = null">{{ $t('common.cancel') }}</AppButton>
            <AppButton type="submit" form="invite-form" :disabled="busy || !email.trim()">{{ $t('groups.members.invite') }}</AppButton>
          </template>
        </AppSheet>

        <AppSheet v-if="sheet === 'add'" :title="$t('groups.members.addContact')" @close="sheet = null">
          <AppListGroup v-if="!addable.length"><div class="text-block">{{ $t('groups.members.onlyCreated') }}</div></AppListGroup>
          <template v-else>
            <AppListGroup>
              <div class="field">
                <label for="add-contact">{{ $t('groups.members.contact') }}</label>
                <AppSelect
                  id="add-contact" v-model="contactID" variant="plain" :placeholder="$t('groups.members.chooseContact')"
                  :options="addable.map(contact => ({ value: contact.id, label: contact.name }))"
                />
              </div>
              <AppSwitch v-model="includeHistory" :label="$t('groups.members.canSeeEarlier')" :supporting="historyHelp" :disabled="busy" />
            </AppListGroup>
            <!-- Consent covers this text, so it stays visible beside the checkboxes. -->
            <ConsentFields
              v-model:share-memory="shareMemory" v-model:contributor-consent="contributorConsent"
              :contributor-model="snapshot.contributorModel"
              :disclosure="[$t('groups.members.addDisclosure')]"
              :memory-label="$t('groups.members.memoryLabel')"
              :contributor-note="$t('groups.members.contributorNote')"
            />
          </template>
          <AppNotice v-if="error">{{ error }}</AppNotice>
          <template #actions>
            <AppButton variant="text" @click="sheet = null">{{ $t('common.cancel') }}</AppButton>
            <AppButton v-if="addable.length" :disabled="!contactID || !consented || busy" @click="addContact">{{ $t('common.add') }}</AppButton>
          </template>
        </AppSheet>

        <AppSheet v-if="sheet === 'consent'" :title="$t('groups.members.consent')" @close="sheet = null">
          <!-- Consent covers this text, so it stays visible beside the switches. -->
          <ConsentFields
            v-model:share-memory="shareMemory" v-model:contributor-consent="contributorConsent"
            :contributor-model="snapshot.contributorModel"
            :disclosure="[consentDisclosure]"
            :memory-label="$t('groups.new.memoryLabel')"
            :contributor-note="$t('groups.members.contributorHistoryNote')"
          />
          <AppNotice v-if="error">{{ error }}</AppNotice>
          <template #actions>
            <AppButton variant="text" @click="sheet = null">{{ $t('common.cancel') }}</AppButton>
            <AppButton :disabled="!consented || busy" @click="giveConsent">{{ $t('common.confirm') }}</AppButton>
          </template>
        </AppSheet>

        <AppSheet v-if="managing" :title="managing.name" @close="managing = null">
          <AppListGroup>
            <AppListItem v-if="isOwner && managing.kind === 'user' && managing.id !== user?.id" icon="mail" :disabled="busy" @click="togglePermission(managing)">
              {{ managing.canInvite ? $t('groups.members.stopInvites') : $t('groups.members.allowInvites') }}
            </AppListItem>
            <AppListItem v-if="canRemove(managing)" danger icon="delete" :disabled="busy" @click="remove(managing)">{{ $t('groups.members.removeFromGroup') }}</AppListItem>
          </AppListGroup>
        </AppSheet>
      </template>
    </div>
  </div>
</template>

<style scoped>
.member-row .two-line { flex: 1; min-width: 0; }
.sharing-note { margin: var(--space-3) var(--space-4) 0; font-size: 13px; line-height: 1.4; color: var(--md-on-surface-variant); }
/* The groups after the identity header and after the media tabs don't follow another group. */
.identity-subtitle { margin-bottom: var(--space-5); }
:deep(.lifecycle-group) { margin-top: var(--space-5); }
</style>
