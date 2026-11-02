<script setup lang="ts">
const { t } = useI18n();
const { user, features, saveName, savePhoto, saveModel, savePrivacy, refreshProfile, signOut } = useSession();
const { exporting, progress, exportError, download, cancel } = useDebugExport();
const exportSheet = ref(false);
onBeforeUnmount(cancel);
const busy = ref(false);
const error = ref<string | null>(null);
const models = computed(() => [
  { value: 'muse-spark-1.3', label: t('account.chatModel.standard'), detail: t('account.chatModel.standardDetail') },
  { value: 'muse-spark-1.3-contributor', label: t('account.chatModel.contributor'), detail: t('account.chatModel.contributorDetail') },
]);
const currentModel = computed(() => user.value?.chatModel ?? 'muse-spark-1.3');
const modelSheet = ref(false);
// Admin flag: every account uses Contributor for now, so the choice is not offered.
const contributorOnly = computed(() => !!features.value?.contributorOnly);
watch(contributorOnly, (locked) => { if (locked) modelSheet.value = false; });
const chatModel = ref(currentModel.value);
const contributorConsent = ref(false);
const modelChanged = computed(() => chatModel.value !== currentModel.value);
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
const themeOptions = computed(() => [
  { value: 'system' as const, label: t('account.appearance.system') },
  { value: 'light' as const, label: t('account.appearance.light') },
  { value: 'dark' as const, label: t('account.appearance.dark') },
]);
const themeSheet = ref(false);
// Language (docs/localization.md): per browser like Appearance; option names stay in their own language.
const { preference: languagePreference, setPreference: setLanguagePreference } = useLanguage();
const languageOptions = computed(() => languagePreferences.map(value => ({ value, label: t(`common.language.${value}`) })));
const languageSheet = ref(false);
const webPush = useWebPush();
const notificationsOn = computed(() => webPush.subscribed.value && webPush.permission.value === 'granted');
const notificationsSupporting = computed(() => !webPush.supported.value ? t('account.notifications.unsupported')
  : webPush.permission.value === 'denied' ? t('account.notifications.blocked')
    : notificationsOn.value ? t('account.notifications.on') : t('account.notifications.off'));
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
const privacyRules = computed(() => (['privateChats', 'groups', 'keepPrivate', 'contactsShare', 'alwaysPrivate', 'forYou'] as const)
  .map(rule => ({ id: rule, title: t(`account.privacy.rules.${rule}.title`), text: t(`account.privacy.rules.${rule}.text`) })));
async function toggleContactsShare(event: Event) {
  const input = event.target as HTMLInputElement;
  await run(async () => {
    try { await savePrivacy(input.checked); }
    finally {
      // Every linked-contacts snapshot may change (allContacts); refetch on next visit.
      invalidateContactLinks();
      input.checked = user.value?.contactsShare === true;
    }
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
  <PageBar :title="t('account.title')" />
  <div class="page">
    <div class="page-inner">
      <IdentityEditor :name="user?.name ?? ''" :path="photoPath" editable renamable :busy="busy" @photo="changePhoto" @rename="rename" />
      <p class="identity-subtitle account-email">
        <span>{{ user?.email }}</span>
        <InfoButton :label="t('account.profile')" :text="t('account.profileInfo')" />
      </p>
      <AppNotice v-if="error && !modelSheet">{{ error }}</AppNotice>

      <AppListGroup>
        <AppListItem v-if="contributorOnly" icon="model" plain :supporting="t('account.chatModel.contributorOnly')" :value="t('account.chatModel.contributor')">{{ t('account.chatModel.title') }}</AppListItem>
        <AppListItem v-else icon="model" opens :value="models.find(model => model.value === currentModel)?.label ?? currentModel" @click="openModelSheet">{{ t('account.chatModel.title') }}</AppListItem>
        <AppListItem icon="appearance" opens :value="themeOptions.find(option => option.value === themePreference)?.label" @click="themeSheet = true">{{ t('account.appearance.title') }}</AppListItem>
        <AppListItem icon="language" opens :value="languageOptions.find(option => option.value === languagePreference)?.label" @click="languageSheet = true">{{ t('common.language.title') }}</AppListItem>
        <AppSwitch icon="notifications" :label="t('account.notifications.title')" :checked="notificationsOn" :supporting="notificationsSupporting"
          :disabled="busy || !webPush.supported.value || webPush.permission.value === 'denied'" @change="toggleNotifications" />
        <AppListItem icon="link" to="/account/connections">{{ t('account.connections.title') }}</AppListItem>
        <AppListItem icon="iphone" to="/native">{{ t('account.native.title') }}</AppListItem>
      </AppListGroup>
      <AppListGroup :title="t('account.privacy.title')">
        <AppSwitch icon="people" :label="t('account.privacy.contactsShare')" :info="t('account.privacy.contactsShareInfo')" :checked="user?.contactsShare === true" :disabled="busy" @change="toggleContactsShare" />
        <AppListItem icon="lock" opens @click="privacySheet = true">{{ t('account.privacy.howItWorks') }}</AppListItem>
      </AppListGroup>
      <AppListGroup>
        <AppListItem icon="file" opens @click="exportSheet = true">{{ t('account.debugExport.title') }}</AppListItem>
      </AppListGroup>
      <AppListGroup :footer="t('account.schedulesFooter')">
        <AppListItem icon="logout" danger :disabled="busy" @click="leave">{{ t('auth.signOut') }}</AppListItem>
      </AppListGroup>

      <AppSheet v-if="privacySheet" :title="t('account.privacy.howItWorks')" @close="privacySheet = false">
        <dl class="privacy-rules">
          <template v-for="rule in privacyRules" :key="rule.id">
            <dt>{{ rule.title }}</dt>
            <dd>{{ rule.text }}</dd>
          </template>
        </dl>
      </AppSheet>

      <AppSheet v-if="exportSheet" :title="t('account.debugExport.title')" @close="cancel(); exportSheet = false">
        <p>{{ t('account.debugExport.intro') }}</p>
        <p class="group-footer">{{ t('account.debugExport.warning') }}</p>
        <p v-if="progress" role="status" aria-live="polite">{{ progress }}</p>
        <AppNotice v-if="exportError">{{ exportError }}</AppNotice>
        <template #actions>
          <AppButton variant="text" @click="cancel(); exportSheet = false">{{ exporting ? t('account.debugExport.cancel') : t('common.close') }}</AppButton>
          <AppButton :disabled="exporting" @click="download">{{ exporting ? t('account.debugExport.exporting') : t('account.debugExport.download') }}</AppButton>
        </template>
      </AppSheet>

      <AppSheet v-if="themeSheet" :title="t('account.appearance.title')" @close="themeSheet = false">
        <AppListGroup role="radiogroup" :aria-label="t('account.appearance.title')">
          <label v-for="option in themeOptions" :key="option.value" class="choice-row">
            <input type="radio" name="appearance" :value="option.value" :checked="themePreference === option.value" @change="setThemePreference(option.value)">
            <span>{{ option.label }}</span>
          </label>
        </AppListGroup>
        <template #actions>
          <AppButton @click="themeSheet = false">{{ t('common.done') }}</AppButton>
        </template>
      </AppSheet>

      <AppSheet v-if="languageSheet" :title="t('common.language.title')" @close="languageSheet = false">
        <AppListGroup role="radiogroup" :aria-label="t('common.language.title')">
          <label v-for="option in languageOptions" :key="option.value" class="choice-row">
            <input type="radio" name="language" :value="option.value" :checked="languagePreference === option.value" @change="setLanguagePreference(option.value)">
            <span>{{ option.label }}</span>
          </label>
        </AppListGroup>
        <template #actions>
          <AppButton @click="languageSheet = false">{{ t('common.done') }}</AppButton>
        </template>
      </AppSheet>

      <AppSheet v-if="modelSheet" :title="t('account.chatModel.title')" @close="modelSheet = false">
        <template #header><InfoButton :label="t('account.chatModel.title')" :text="t('account.chatModel.info')" /></template>
        <AppListGroup role="radiogroup" :aria-label="t('account.chatModel.title')">
          <label v-for="model in models" :key="model.value" class="choice-row">
            <input v-model="chatModel" type="radio" name="chat-model" :value="model.value" :disabled="busy" @change="contributorConsent = false">
            <span><strong>Muse Spark 1.3 · {{ model.label }}</strong><span class="small muted">{{ model.detail }}</span></span>
          </label>
          <AppSwitch v-if="chatModel === 'muse-spark-1.3-contributor' && modelChanged" v-model="contributorConsent" :disabled="busy">{{ t('account.chatModel.contributorConsent') }}</AppSwitch>
        </AppListGroup>
        <AppNotice v-if="error">{{ error }}</AppNotice>
        <template #actions>
          <AppButton variant="text" @click="modelSheet = false">{{ t('common.cancel') }}</AppButton>
          <AppButton :disabled="busy || !modelChanged || (chatModel === 'muse-spark-1.3-contributor' && !contributorConsent)" @click="saveChatModel">{{ t('common.save') }}</AppButton>
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
