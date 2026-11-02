<script setup lang="ts">
// The mini apps of one private chat (`contacts/<id>`) or of a group (`groups/<id>`).
const props = defineProps<{ base: string; back: string; empty: string; footer: string }>();
const apps = useMiniApps(() => props.base);
onMounted(() => apps.refresh(true));
</script>

<template>
  <PageBar :title="$t('miniapps.list.title')" :back="back" always-back />
  <div class="page">
    <AppLoading v-if="!apps.state.value.loaded && !apps.state.value.error" fill />
    <AppEmptyState v-else-if="!apps.state.value.apps.length" icon="grid" :title="$t('miniapps.list.emptyTitle')" :text="apps.state.value.error ?? empty" />
    <div v-else class="page-inner">
      <AppNotice v-if="apps.state.value.error" tone="warning">{{ apps.state.value.error }}</AppNotice>
      <AppListGroup :footer="footer">
        <AppListItem v-for="app in apps.state.value.apps" :key="app.id" :to="`/${base}/mini-apps/${app.id}`"
          :supporting="app.status === 'enabled' ? (app.subtitle ?? $t('miniapps.list.enabled')) : $t('miniapps.list.needsReview')">
          <template #leading><span class="mini-app-glyph"><AppIcon :name="miniAppIcon(app.icon)" /></span></template>
          {{ app.title }}
        </AppListItem>
      </AppListGroup>
    </div>
  </div>
</template>
