<script setup lang="ts">
const route = useRoute();
const contactID = computed(() => String(route.params.id));
const apps = useMiniApps(contactID);
useHead({ title: 'Mini apps' });
onMounted(() => apps.refresh(true));
</script>

<template>
  <PageBar title="Mini apps" :back="`/contacts/${contactID}/edit`" always-back />
  <div class="page">
    <div v-if="!apps.state.value.loaded && !apps.state.value.error" class="center"><span class="spinner" /> Loading…</div>
    <div v-else-if="!apps.state.value.apps.length" class="empty">
      <h2>No mini apps yet</h2>
      <p>{{ apps.state.value.error ?? 'Ask this contact in chat to build one from your connections, for example “Make me a mini app for last week’s expenses.”' }}</p>
    </div>
    <div v-else class="page-inner">
      <p v-if="apps.state.value.error" class="notice" style="margin: 0 0 12px">{{ apps.state.value.error }}</p>
      <div class="group">
        <NuxtLink v-for="app in apps.state.value.apps" :key="app.id" :to="`/contacts/${contactID}/mini-apps/${app.id}`" class="mini-row" style="color: inherit">
          <span class="mini-app-glyph"><AppIcon :name="miniAppIcon(app.icon)" /></span>
          <span class="copy"><strong>{{ app.title }}</strong><span>{{ app.status === 'enabled' ? (app.subtitle ?? 'Enabled') : 'Needs review' }}</span></span>
          <AppIcon name="chevron" class="chevron" style="width: 16px; height: 16px; color: var(--tertiary)" />
        </NuxtLink>
      </div>
      <p class="group-footer">Mini apps use this contact’s connections and are visible only to you.</p>
    </div>
  </div>
</template>
