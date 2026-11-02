<script setup lang="ts">
const props = defineProps<{ base: string }>();
const { value, busy, error, refresh, setEnabled, reset } = useConversationLearning(() => props.base);
watch(() => props.base, () => { void refresh(false); }, { immediate: true });
const { t } = useI18n();
// Question statuses are API codes; unknown future codes show as sent.
const statuses = ['pending', 'asked', 'answered', 'dismissed'];
const statusLabel = (status: string) => statuses.includes(status) ? t(`contacts.learning.status.${status}`) : status;
const back = computed(() => `/${props.base}/${props.base.startsWith('contacts/') ? 'edit' : 'members'}`);
function clear() {
  if (window.confirm(t('contacts.learning.resetConfirm'))) void reset();
}
</script>

<template>
  <PageBar :title="$t('contacts.learning.title')" :back="back" always-back>
    <AppIconButton icon="refresh" :label="$t('contacts.learning.refresh')" :disabled="busy" @click="refresh()" />
  </PageBar>
  <div class="page">
    <section class="page-inner">
      <p class="intro">{{ $t('contacts.learning.intro') }}</p>
      <p class="intro">{{ $t('contacts.learning.introCorrect') }}</p>
      <AppNotice v-if="error">{{ error }}</AppNotice>
      <AppLoading v-if="!value && busy" fill />
      <template v-if="value">
        <AppListGroup :footer="$t('contacts.learning.footer')">
          <AppSwitch :label="$t('contacts.learning.enabled')" :checked="value.enabled" :disabled="busy" @change="setEnabled(($event.target as HTMLInputElement).checked)" />
        </AppListGroup>
        <p v-if="!value.profiles.some(profile => profile.items.length)" class="intro">{{ $t('contacts.learning.nothing') }}</p>
        <AppListGroup v-for="profile in value.profiles" :key="profile.agentID"
                      :footer="profile.reviewedAt ? $t('contacts.learning.lastReviewed', { date: new Date(profile.reviewedAt).toLocaleString(appLocale()) }) : undefined">
          <template #title><h2>{{ profile.agentName }}</h2></template>
          <div v-for="item in profile.items" :key="item.key" class="learning-item">
            <small>{{ $t(`contacts.learning.kinds.${item.kind}`) }} · {{ item.confidence === 'supported' ? $t('contacts.learning.supported') : $t('contacts.learning.tentative') }}<template v-if="item.kind === 'question'"> · {{ statusLabel(item.status) }}</template></small>
            <p>{{ item.text }}</p>
            <p v-if="item.answer">{{ item.answer }}</p>
            <details><summary>{{ $t('contacts.learning.contextEvidence') }}</summary>
              <p v-if="item.opportunity">{{ $t('contacts.learning.mayFit', { text: item.opportunity }) }}</p><p v-if="item.avoid">{{ $t('contacts.learning.avoid', { text: item.avoid }) }}</p>
              <blockquote v-for="(source, index) in item.evidence" :key="index">{{ source.side === 'human' ? $t('common.you') : profile.agentName }}: {{ source.quote }}</blockquote>
            </details>
          </div>
        </AppListGroup>
        <AppListGroup>
          <AppListItem icon="x-circle" danger :disabled="busy" @click="clear">{{ $t('contacts.learning.reset') }}</AppListItem>
        </AppListGroup>
      </template>
    </section>
  </div>
</template>

<style scoped>
.intro { margin: 0 0 var(--space-3); padding: 0 var(--space-4); color: var(--md-on-surface-variant); font: var(--type-body-medium); line-height: 1.5; }
.group-title h2 { font: inherit; letter-spacing: inherit; }
.learning-item { padding: var(--space-3) var(--space-4); font: var(--type-body-medium); line-height: 1.5; }
.learning-item small { font: var(--type-label-medium); color: var(--md-on-surface-variant); }
.learning-item p { margin: var(--space-1) 0 0; }
.learning-item details { margin-top: var(--space-1); color: var(--md-on-surface-variant); }
.learning-item blockquote { margin: var(--space-3) 0; padding-left: var(--space-3); border-left: 2px solid var(--md-outline-variant); }
</style>
