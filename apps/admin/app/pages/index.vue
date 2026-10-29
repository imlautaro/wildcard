<script setup lang="ts">
useHead({ title: 'Overview' });
const { overview, errors, loadOverview } = useAdmin();
onMounted(loadOverview);

const actions: Record<string, string> = { 'user.delete': 'Deleted an account', 'setting.update': 'Changed a setting' };
function describe(event: { action: string; target: string | null; details: Record<string, unknown> | null }) {
  if (event.action === 'setting.update') return `${event.target} → ${event.details?.value ? 'on' : 'off'}`;
  if (event.action === 'user.delete') {
    const contacts = Number(event.details?.contacts ?? 0);
    return `${event.target} · ${plural(contacts, 'contact')}, ${plural(Number(event.details?.ownedGroups ?? 0), 'owned group')}`;
  }
  return event.target ?? '';
}
</script>

<template>
  <div class="page">
    <header class="bar"><h1 class="title">Overview</h1>
      <button class="icon-button" type="button" aria-label="Refresh" @click="loadOverview"><AppIcon name="refresh" /></button>
    </header>
    <div class="page-inner wide">
      <p v-if="errors.overview" class="notice" role="alert">{{ errors.overview }}</p>
      <div v-if="!overview && !errors.overview" class="center"><span class="spinner" /> Loading…</div>
      <template v-if="overview">
        <section class="stats" aria-label="Totals">
          <div class="stat"><span class="value">{{ formatNumber(overview.totals.users) }}</span><span class="caption">Accounts</span></div>
          <div class="stat"><span class="value">{{ formatNumber(overview.totals.newUsers) }}</span><span class="caption">New in the last 7 days</span></div>
          <div class="stat"><span class="value">{{ formatNumber(overview.totals.contacts) }}</span><span class="caption">Contacts</span></div>
          <div class="stat"><span class="value">{{ formatNumber(overview.totals.groupCount) }}</span><span class="caption">Groups</span></div>
        </section>
        <div class="group-title">Registration</div>
        <div class="group">
          <NuxtLink to="/settings" class="button-row">
            <span class="status-dot" :class="{ on: overview.registrationEnabled }" aria-hidden="true" />
            <span class="two-line">
              <span>{{ overview.registrationEnabled ? 'Open' : 'Closed' }}</span>
              <span class="small">{{ overview.registrationEnabled ? 'Anyone can create an account.' : 'Only existing accounts can sign in.' }}</span>
            </span>
          </NuxtLink>
        </div>
        <div class="group-title">Recent admin activity</div>
        <div v-if="overview.events.length" class="group">
          <div v-for="event in overview.events" :key="event.id" class="field">
            <AppIcon :name="event.action === 'user.delete' ? 'delete' : 'flag'" class="leading" />
            <span class="two-line">
              <span>{{ actions[event.action] ?? event.action }} <span class="muted">· {{ event.actorName ?? event.actorID }}</span></span>
              <span class="small">{{ describe(event) }}</span>
            </span>
            <time class="small muted">{{ formatDateTime(event.createdAt) }}</time>
          </div>
        </div>
        <p v-else class="group-footer">No admin actions yet.</p>
      </template>
    </div>
  </div>
</template>
