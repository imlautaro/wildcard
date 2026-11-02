<script setup lang="ts">
const { t } = useI18n();
const capabilities = computed(() => [
  // Focus sessions, guided recipes, spoken responses and NFC were deprecated on 2026-10-30.
  { id: 'systemTools', kind: 'timer', icon: 'alarm' as const },
  { id: 'shortcuts', kind: 'default', icon: 'iphone' as const },
  { id: 'sharing', kind: 'default', icon: 'share' as const },
].map(item => ({ ...item, title: t(`account.native.capabilities.${item.id}.title`), text: t(`account.native.capabilities.${item.id}.text`) })));
// Longer explanations open in a sheet from a row instead of stacked paragraphs.
const topics = computed(() => [
  { id: 'automatic', icon: 'bolt' as const, paragraphs: [t('account.native.topics.automatic.text')] },
  { id: 'receipts', icon: 'check' as const, paragraphs: [t('account.native.topics.receipts.text')] },
  { id: 'remote', icon: 'timer' as const, paragraphs: [t('account.native.topics.remote.text1'), t('account.native.topics.remote.text2'), t('account.native.topics.remote.text3')] },
  { id: 'onDevice', icon: 'iphone' as const, paragraphs: [t('account.native.topics.onDevice.text')] },
].map(item => ({ ...item, title: t(`account.native.topics.${item.id}.title`) })));
// The open topic by ID, so its sheet follows a language change.
const topicID = ref<string | null>(null);
const topic = computed(() => topics.value.find(item => item.id === topicID.value) ?? null);
</script>
<template>
  <PageBar :title="t('account.native.title')" back="/account" always-back />
  <div class="page"><div class="page-inner">
    <div class="identity">
      <span class="native-glyph hero-glyph"><AppIcon name="iphone" /></span>
      <h2 class="identity-title">{{ t('account.native.heroTitle') }}</h2>
      <p class="muted intro">{{ t('account.native.heroText') }}</p>
    </div>

    <AppListGroup :title="t('account.native.capabilitiesTitle')">
      <div v-for="item in capabilities" :key="item.id" class="native-row">
        <span class="native-glyph" :data-kind="item.kind"><AppIcon :name="item.icon" /></span>
        <div><strong>{{ item.title }}</strong><p>{{ item.text }}</p></div>
      </div>
    </AppListGroup>

    <AppListGroup :title="t('account.native.learnMore')">
      <AppListItem v-for="item in topics" :key="item.id" :icon="item.icon" opens @click="topicID = item.id">{{ item.title }}</AppListItem>
    </AppListGroup>
    <AppSheet v-if="topic" :title="topic.title" @close="topicID = null">
      <p v-for="paragraph in topic.paragraphs" :key="paragraph" class="sheet-text">{{ paragraph }}</p>
    </AppSheet>
  </div></div>
</template>

<style scoped>
.hero-glyph { width: 64px; height: 64px; border-radius: var(--md-shape-l); }
.hero-glyph :deep(svg) { width: 34px; height: 34px; }
.intro { max-width: 460px; margin: 0; text-align: center; }
</style>
