<script setup lang="ts">
import type { McpAccess } from '~/composables/useMcpAccess';
const props = defineProps<{ path: string; group?: boolean }>();
const { t } = useI18n();
const { entries, busy, error, refresh, save } = useMcpAccess(() => props.path);
async function toggle(item: McpAccess, event: Event) {
  // Keep the displayed switch authoritative while confirmation/save is pending.
  (event.target as HTMLInputElement).checked = !!item.granted;
  if (!item.granted && !window.confirm(props.group
    ? t('account.mcpAccess.confirmGroup', { agent: item.agentName ?? '', connection: item.name })
    : t('account.mcpAccess.confirmContact', { connection: item.name }))) return;
  await save(item);
}
onMounted(() => { void refresh(); });
</script>
<template>
  <AppNotice v-if="error">{{ error }}</AppNotice>
  <div class="group-title info-title">
    {{ $t('account.mcpAccess.title') }}
    <InfoButton :label="$t('account.connections.title')" :text="group ? $t('account.mcpAccess.infoGroup') : $t('account.mcpAccess.infoContact')" />
  </div>
  <AppLoading v-if="entries === null" :label="$t('account.connections.loading')" />
  <AppListGroup v-else>
    <div v-if="!entries.length" class="text-block">{{ group ? $t('account.mcpAccess.emptyGroup') : $t('account.mcpAccess.emptyContact') }}</div>
    <label v-for="item in entries" :key="`${item.agentID ?? ''}:${item.id}`" class="toggle">
      <span class="toggle-label"><AppIcon name="link" /><span class="two-line">{{ item.name }}<span v-if="item.agentName" class="small">{{ item.agentName }}</span></span></span>
      <input type="checkbox" role="switch" :checked="!!item.granted" :disabled="busy" @change="toggle(item, $event)">
    </label>
  </AppListGroup>
  <AppListGroup>
    <AppListItem icon="gear" to="/account/connections">{{ $t('account.mcpAccess.manage') }}</AppListItem>
    <AppListItem icon="refresh" :disabled="busy" @click="refresh()">{{ $t('account.refresh') }}</AppListItem>
  </AppListGroup>
</template>
