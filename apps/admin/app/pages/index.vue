<script setup lang="ts">
useHead({ title: 'Overview' });
const { overview, errors, loadOverview } = useAdmin();
onMounted(loadOverview);

const actions: Record<string, string> = { 'user.delete': 'Deleted an account', 'user.self_delete': 'Deleted their own account', 'setting.update': 'Changed a setting' };
function describe(event: { action: string; target: string | null; details: Record<string, unknown> | null }) {
  if (event.action === 'setting.update') return `${event.target} → ${event.details?.value ? 'on' : 'off'}`;
  if (event.action === 'user.delete' || event.action === 'user.self_delete') {
    const contacts = Number(event.details?.contacts ?? 0);
    return `${event.target} · ${plural(contacts, 'contact')}, ${plural(Number(event.details?.ownedGroups ?? 0), 'owned group')}`;
  }
  return event.target ?? '';
}
const stats = computed(() => overview.value ? [
  { icon: 'people', value: overview.value.totals.users, caption: 'Accounts' },
  { icon: 'sparkle', value: overview.value.totals.newUsers, caption: 'New in the last 7 days' },
  { icon: 'person', value: overview.value.totals.contacts, caption: 'Contacts' },
  { icon: 'initiative', value: overview.value.totals.groupCount, caption: 'Groups' },
] as const : []);
</script>

<template>
  <div class="page">
    <AppTopBar title="Overview" contained="wide">
      <AppIconButton icon="refresh" label="Refresh" @click="loadOverview" />
    </AppTopBar>
    <div class="page-inner wide">
      <AppNotice v-if="errors.overview">{{ errors.overview }}</AppNotice>
      <AppLoading v-if="!overview && !errors.overview" fill />
      <template v-if="overview">
        <section class="stats" aria-label="Totals">
          <div v-for="stat in stats" :key="stat.caption" class="stat">
            <span class="stat-icon" aria-hidden="true"><AppIcon :name="stat.icon" /></span>
            <span class="value">{{ formatNumber(stat.value) }}</span>
            <span class="caption">{{ stat.caption }}</span>
          </div>
        </section>
        <AppListGroup title="Registration">
          <AppListItem to="/settings" :supporting="overview.registrationEnabled ? 'Anyone can create an account.' : 'Only existing accounts can sign in.'">
            <template #leading><span class="status-dot" :class="{ on: overview.registrationEnabled }" aria-hidden="true" /></template>
            {{ overview.registrationEnabled ? 'Open' : 'Closed' }}
          </AppListItem>
        </AppListGroup>
        <AppListGroup v-if="overview.events.length" title="Recent admin activity">
          <div v-for="event in overview.events" :key="event.id" class="field">
            <AppIcon :name="event.action.startsWith('user.') ? 'delete' : 'flag'" class="leading" />
            <span class="two-line">
              <span>{{ actions[event.action] ?? event.action }} <span class="muted">· {{ event.actorName ?? event.actorID }}</span></span>
              <span class="small">{{ describe(event) }}</span>
            </span>
            <time class="small muted">{{ formatDateTime(event.createdAt) }}</time>
          </div>
        </AppListGroup>
        <template v-else>
          <div class="group-title">Recent admin activity</div>
          <AppEmptyState icon="history" text="No admin actions yet." />
        </template>
      </template>
    </div>
  </div>
</template>
