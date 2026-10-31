<script setup lang="ts">
const route = useRoute();
const id = computed(() => String(route.params.id));
const links = useContactLinks(id);
const choice = ref('');
const photoPath = (item: LinkedContact) => item.photoVersion ? `contacts/${item.id}/photo?version=${encodeURIComponent(item.photoVersion)}` : null;
async function add() {
  if (!choice.value) return;
  await links.link(choice.value);
  choice.value = '';
}
onMounted(() => { void links.refresh(); });
watch(id, () => { void links.refresh(); });
</script>

<template>
  <PageBar title="Linked contacts" :back="`/contacts/${id}/edit`" always-back />
  <div class="page"><div class="page-inner">
    <p class="hint">Linked contacts can ask each other things and pass messages along in your chats, for example "ask Tomi what we decided" or "tell Vale about the trip". Links work both ways and only between your own contacts.</p>
    <AppLoading v-if="!links.state.value && !links.error.value" label="Loading linked contacts…" />
    <template v-else-if="links.state.value">
      <AppNotice v-if="links.state.value.unavailable">{{ links.state.value.unavailable }}</AppNotice>
      <template v-else>
        <AppListGroup v-if="links.state.value.links.length">
          <div v-for="item in links.state.value.links" :key="item.id" class="button-row static link-row">
            <AppAvatar :name="item.name" :path="photoPath(item)" :size="36" />
            <span class="link-name">{{ item.name }}</span>
            <AppButton variant="text" :disabled="links.busy.value" @click="links.unlink(item.id)">Unlink</AppButton>
          </div>
        </AppListGroup>
        <p v-else class="hint">No linked contacts yet.</p>
        <form v-if="links.state.value.available.length" class="add-link" @submit.prevent="add">
          <AppSelect v-model="choice" label="Link a contact" :disabled="links.busy.value"
                     :options="links.state.value.available.map(item => ({ value: item.id, label: item.name }))" />
          <AppButton type="submit" :disabled="!choice || links.busy.value">Link</AppButton>
        </form>
      </template>
    </template>
    <AppNotice v-if="links.error.value">
      {{ links.error.value }}
      <template #actions><button type="button" class="link-button" @click="links.refresh()">Retry</button></template>
    </AppNotice>
  </div></div>
</template>

<style scoped>
.hint { margin: 0 var(--space-1) var(--space-4); font-size: 13px; color: var(--md-on-surface-variant); }
.link-row { display: flex; align-items: center; gap: var(--space-3); }
.link-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.add-link { display: flex; align-items: flex-start; gap: var(--space-3); margin-top: var(--space-4); }
.add-link > :first-child { flex: 1; min-width: 0; }
</style>
