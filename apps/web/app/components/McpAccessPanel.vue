<script setup lang="ts">
import type { McpAccess } from '~/composables/useMcpAccess';
const props = defineProps<{ path: string; group?: boolean }>();
const { entries, busy, error, refresh, save } = useMcpAccess(() => props.path);
async function toggle(item: McpAccess, event: Event) {
  // Keep the displayed switch authoritative while confirmation/save is pending.
  (event.target as HTMLInputElement).checked = !!item.granted;
  if (!item.granted && !window.confirm(props.group
    ? `Allow ${item.agentName} to use ${item.name} in this group? Any human member can request enabled tools, including reads, changes and sends. Responses may expose external data to everyone in the group. This group will always use Standard. Memory stays available within this group and is never shared with other chats, even after revocation.`
    : `Allow this contact to use ${item.name}? It can use all tools enabled in Account without asking again. This private chat will always use Standard. Memory stays available within this chat and is never shared with other chats, even after revocation. Group posting and schedule creation/editing from this private chat will be disabled.`)) return;
  await save(item);
}
onMounted(() => { void refresh(); });
</script>
<template>
  <AppNotice v-if="error">{{ error }}</AppNotice>
  <div class="group-title info-title">
    Access
    <InfoButton label="Connections" :text="group ? 'Grant your bots access to their assigned connectors in this group. Other members can request tools; responses are visible to everyone. Only the bot owner who added it can grant access.' : 'Configure connectors once in Account, then grant this contact access. Tool approvals are managed in Account.'" />
  </div>
  <AppLoading v-if="entries === null" label="Loading connections…" />
  <AppListGroup v-else>
    <div v-if="!entries.length" class="text-block">{{ group ? 'Assign a connector to one of your bots in its contact details first.' : 'No account connections yet.' }}</div>
    <label v-for="item in entries" :key="`${item.agentID ?? ''}:${item.id}`" class="toggle">
      <span class="toggle-label"><AppIcon name="link" /><span class="two-line">{{ item.name }}<span v-if="item.agentName" class="small">{{ item.agentName }}</span></span></span>
      <input type="checkbox" role="switch" :checked="!!item.granted" :disabled="busy" @change="toggle(item, $event)">
    </label>
  </AppListGroup>
  <AppListGroup>
    <AppListItem icon="gear" to="/account/connections">Manage account connections</AppListItem>
    <AppListItem icon="refresh" :disabled="busy" @click="refresh()">Refresh</AppListItem>
  </AppListGroup>
</template>
