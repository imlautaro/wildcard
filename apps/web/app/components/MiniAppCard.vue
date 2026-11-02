<script setup lang="ts">
import type { MiniApp } from '~/utils/types';

// Compact native-style entry point under the reply that built it; opens the full app.
// `base` is `contacts/<id>` or `groups/<id>`.
const props = defineProps<{ app: MiniApp; base: string }>();
const { t } = useI18n();
const status = computed(() => ({ needs_review: t('miniapps.card.needsReview'), needs_reapproval: t('miniapps.card.needsReapproval'), enabled: t('miniapps.card.enabled') })[props.app.status]);
</script>

<template>
  <NuxtLink :to="`/${base}/mini-apps/${app.id}`" class="mini-app-card" :class="{ review: app.status !== 'enabled' }" data-ripple>
    <span class="mini-app-glyph"><AppIcon :name="miniAppIcon(app.icon)" /></span>
    <span class="copy">
      <strong>{{ app.title }}</strong>
      <span>{{ app.status === 'enabled' ? (app.subtitle ?? status) : status }}</span>
    </span>
    <AppIcon name="chevron" class="chevron" />
  </NuxtLink>
</template>
