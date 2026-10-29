<script setup lang="ts">
// The mini apps of one private chat (`contacts/<id>`) or of a group (`groups/<id>`).
const props = defineProps<{ base: string; back: string; empty: string; footer: string }>();
const apps = useMiniApps(() => props.base);
useHead({ title: 'Mini apps' });
onMounted(() => apps.refresh(true));
</script>

<template>
  <PageBar title="Mini apps" :back="back" always-back />
  <div class="page">
    <div v-if="!apps.state.value.loaded && !apps.state.value.error" class="center"><span class="spinner" /> Loading…</div>
    <div v-else-if="!apps.state.value.apps.length" class="empty">
      <h2>No mini apps yet</h2>
      <p>{{ apps.state.value.error ?? empty }}</p>
    </div>
    <div v-else class="page-inner">
      <p v-if="apps.state.value.error" class="notice" style="margin: 0 0 12px">{{ apps.state.value.error }}</p>
      <div class="group">
        <NuxtLink v-for="app in apps.state.value.apps" :key="app.id" :to="`/${base}/mini-apps/${app.id}`" class="mini-row" style="color: inherit">
          <span class="mini-app-glyph"><AppIcon :name="miniAppIcon(app.icon)" /></span>
          <span class="copy"><strong>{{ app.title }}</strong><span>{{ app.status === 'enabled' ? (app.subtitle ?? 'Enabled') : 'Needs review' }}</span></span>
          <AppIcon name="chevron" class="chevron" style="width: 20px; height: 20px; color: var(--secondary)" />
        </NuxtLink>
      </div>
      <p class="group-footer">{{ footer }}</p>
    </div>
  </div>
</template>
