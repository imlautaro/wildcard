<script setup lang="ts">
const { user, saveName, savePhoto, saveModel, savePrivacy, refreshProfile, signOut } = useSession();
const { exporting, progress, exportError, download, cancel } = useDebugExport();
const exportSheet = ref(false);
onBeforeUnmount(cancel);
const busy = ref(false);
const error = ref<string | null>(null);
const models = [
  { value: 'muse-spark-1.3', label: 'Standard', detail: 'Meta does not train on your data.' },
  { value: 'muse-spark-1.3-contributor', label: 'Contributor', detail: 'Meta may train models on what you send.' },
];
const currentModel = computed(() => user.value?.chatModel ?? 'muse-spark-1.3');
const modelSheet = ref(false);
const chatModel = ref(currentModel.value);
const contributorConsent = ref(false);
const modelChanged = computed(() => chatModel.value !== currentModel.value);
const modelInfo = 'Contributor allows Meta to use submitted messages, files, context and responses to train models. Standard does not. Applies to new chat jobs, schedules and group exchanges you start; jobs already started keep their model. Shared data may still use Contributor when you separately consent. MCP chats always use Standard.';
function openModelSheet() {
  chatModel.value = currentModel.value;
  contributorConsent.value = false;
  modelSheet.value = true;
}
const saveChatModel = () => run(async () => {
  await saveModel(chatModel.value, contributorConsent.value);
  modelSheet.value = false;
});
const { preference: themePreference, setPreference: setThemePreference } = useTheme();
const themeOptions = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;
const themeSheet = ref(false);
const webPush = useWebPush();
const notificationsOn = computed(() => webPush.subscribed.value && webPush.permission.value === 'granted');
const notificationsSupporting = computed(() => !webPush.supported.value ? 'This browser does not support notifications.'
  : webPush.permission.value === 'denied' ? 'Blocked in your browser settings for this site.'
    : notificationsOn.value ? 'Alerts for new messages, even when this tab is in the background.' : 'Get alerts for new messages when this tab is in the background.');
async function toggleNotifications(event: Event) {
  const input = event.target as HTMLInputElement;
  const want = input.checked;
  await run(async () => {
    try {
      if (want) await webPush.enable(user.value!.id);
      else await webPush.disable(user.value!.id);
    } finally { input.checked = notificationsOn.value; }
  });
}
// Privacy (docs/privacy.md): one account switch plus a plain explanation shared with iOS.
const privacySheet = ref(false);
const contactsShareInfo = 'Your contacts can recall what you told any of the others and ask each other, in your private chats, without linking them one by one. Groups and other people are not affected. Chats you keep private and chats with connections stay out.';
const privacyRules = [
  { title: 'Your private chats', text: 'A contact remembers facts from your chat, never the whole conversation. Those facts can be used in your chats with it, in groups where you are both members, and by people you share that contact with.' },
  { title: 'Groups', text: 'What is said in a group is used only in that group and in private chats with people who are in it. Contacts never carry one group\'s conversation into another group.' },
  { title: 'Keep this chat private', text: 'Set in each contact\'s details. What you tell that contact stays in that chat: not in groups, not with people you share it with, not with your other contacts and not in For you.' },
  { title: 'Contacts share with each other', text: 'Set here. Your own contacts pool what they know about you in your private chats and can ask each other. Off by default.' },
  { title: 'Always private', text: 'Whole chat transcripts, files and schedules are never shared, unless you turn on Discuss my private chats for one contact in one group. Chats with connections never leave their chat.' },
  { title: 'For you', text: 'Built only from your own chats and seen only by you. Chats you keep private are left out.' },
];
async function toggleContactsShare(event: Event) {
  const input = event.target as HTMLInputElement;
  await run(async () => {
    try { await savePrivacy(input.checked); }
    finally { input.checked = user.value?.contactsShare === true; }
  });
}
const photoPath = computed(() => user.value?.photoVersion ? `me/photo?version=${encodeURIComponent(user.value.photoVersion)}` : null);

async function run(task: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try { await task(); }
  catch (failure) { error.value = errorMessage(failure); }
  finally { busy.value = false; }
}

const rename = (name: string) => run(() => saveName(name));
const changePhoto = (photo: Blob | null) => run(() => savePhoto(photo));
const leave = () => run(signOut);
onMounted(async () => {
  try { await refreshProfile(); }
  catch { /* Retain the session-owned profile through a transient failure. */ }
});
</script>

<template>
  <PageBar title="Account" />
  <div class="page">
    <div class="page-inner">
      <IdentityEditor :name="user?.name ?? ''" :path="photoPath" editable renamable :busy="busy" @photo="changePhoto" @rename="rename" />
      <p class="identity-subtitle account-email">
        <span>{{ user?.email }}</span>
        <InfoButton label="Your profile" text="Group members and people you share contacts with can see your name and photo." />
      </p>
      <AppNotice v-if="error && !modelSheet">{{ error }}</AppNotice>

      <AppListGroup>
        <AppListItem icon="model" opens :value="models.find(model => model.value === currentModel)?.label ?? currentModel" @click="openModelSheet">Chat model</AppListItem>
        <AppListItem icon="appearance" opens :value="themeOptions.find(option => option.value === themePreference)?.label" @click="themeSheet = true">Appearance</AppListItem>
        <AppSwitch icon="notifications" label="Browser notifications" :checked="notificationsOn" :supporting="notificationsSupporting"
          :disabled="busy || !webPush.supported.value || webPush.permission.value === 'denied'" @change="toggleNotifications" />
        <AppListItem icon="link" to="/account/connections">Connections</AppListItem>
        <AppListItem icon="iphone" to="/native">Native experiments</AppListItem>
      </AppListGroup>
      <AppListGroup title="Privacy">
        <AppSwitch icon="people" label="Contacts share with each other" :info="contactsShareInfo" :checked="user?.contactsShare === true" :disabled="busy" @change="toggleContactsShare" />
        <AppListItem icon="lock" opens @click="privacySheet = true">How privacy works</AppListItem>
      </AppListGroup>
      <AppListGroup>
        <AppListItem icon="file" opens @click="exportSheet = true">Export debug JSON</AppListItem>
      </AppListGroup>
      <AppListGroup footer="Scheduled messages are available in the iOS app.">
        <AppListItem icon="logout" danger :disabled="busy" @click="leave">Sign out</AppListItem>
      </AppListGroup>

      <AppSheet v-if="privacySheet" title="How privacy works" @close="privacySheet = false">
        <dl class="privacy-rules">
          <template v-for="rule in privacyRules" :key="rule.title">
            <dt>{{ rule.title }}</dt>
            <dd>{{ rule.text }}</dd>
          </template>
        </dl>
      </AppSheet>

      <AppSheet v-if="exportSheet" title="Export debug JSON" @close="cancel(); exportSheet = false">
        <p>Download your private and group chat history, including archived chats, contacts, local memories, reply status, schedules, tasks, documents and mini apps.</p>
        <p class="group-footer">This file contains private text and group participants. Review it before sharing with an AI or anyone else. Credentials, other people's private chats and media files are excluded. Nothing is sent to an AI by this download. Downloads are limited to 100 MB; exports over this limit fail without saving a partial file.</p>
        <p v-if="progress" role="status" aria-live="polite">{{ progress }}</p>
        <AppNotice v-if="exportError">{{ exportError }}</AppNotice>
        <template #actions>
          <AppButton variant="text" @click="cancel(); exportSheet = false">{{ exporting ? 'Cancel export' : 'Close' }}</AppButton>
          <AppButton :disabled="exporting" @click="download">{{ exporting ? 'Exporting…' : 'Download JSON' }}</AppButton>
        </template>
      </AppSheet>

      <AppSheet v-if="themeSheet" title="Appearance" @close="themeSheet = false">
        <AppListGroup role="radiogroup" aria-label="Appearance">
          <label v-for="option in themeOptions" :key="option.value" class="choice-row">
            <input type="radio" name="appearance" :value="option.value" :checked="themePreference === option.value" @change="setThemePreference(option.value)">
            <span>{{ option.label }}</span>
          </label>
        </AppListGroup>
        <template #actions>
          <AppButton @click="themeSheet = false">Done</AppButton>
        </template>
      </AppSheet>

      <AppSheet v-if="modelSheet" title="Chat model" @close="modelSheet = false">
        <template #header><InfoButton label="Chat model" :text="modelInfo" /></template>
        <AppListGroup role="radiogroup" aria-label="Chat model">
          <label v-for="model in models" :key="model.value" class="choice-row">
            <input v-model="chatModel" type="radio" name="chat-model" :value="model.value" :disabled="busy" @change="contributorConsent = false">
            <span><strong>Muse Spark 1.3 · {{ model.label }}</strong><span class="small muted">{{ model.detail }}</span></span>
          </label>
          <AppSwitch v-if="chatModel === 'muse-spark-1.3-contributor' && modelChanged" v-model="contributorConsent" :disabled="busy">I agree to Meta's Contributor data use</AppSwitch>
        </AppListGroup>
        <AppNotice v-if="error">{{ error }}</AppNotice>
        <template #actions>
          <AppButton variant="text" @click="modelSheet = false">Cancel</AppButton>
          <AppButton :disabled="busy || !modelChanged || (chatModel === 'muse-spark-1.3-contributor' && !contributorConsent)" @click="saveChatModel">Save</AppButton>
        </template>
      </AppSheet>
    </div>
  </div>
</template>

<style scoped>
.account-email { display: flex; align-items: center; justify-content: center; gap: var(--space-1); margin-bottom: var(--space-5); overflow-wrap: anywhere; }
.privacy-rules { margin: 0; padding: 0 var(--space-1); }
.privacy-rules dt { margin-top: var(--space-4); font-weight: 600; }
.privacy-rules dt:first-child { margin-top: 0; }
.privacy-rules dd { margin: var(--space-1) 0 0; font-size: 14px; line-height: 1.45; color: var(--md-on-surface-variant); }
</style>
