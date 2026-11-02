<script setup lang="ts">
// Creator-only Group energy row, matching ContactEnergyRow on iOS: the row shows the
// points, and its sheet has the meter, next recharge and Reset. The row revalidates on
// entry and every five seconds while visible; never projects recharge or debits locally.
const props = defineProps<{ contactId: string }>();
const { energy, busy, error, refresh, reset } = useContactEnergy(() => props.contactId);
const nextPoint = computed(() => energy.value?.nextPointAt ? messageTime(energy.value.nextPointAt) : null);
const open = ref(false);

usePolling(() => refresh(), () => 5000);
onMounted(() => { void refresh(); });
</script>

<template>
  <AppListItem icon="bolt" opens :value="energy ? `${energy.points} / ${energy.capacity}` : busy ? $t('common.loading') : '—'" @click="open = true">{{ $t('contacts.energy.title') }}</AppListItem>
  <AppSheet v-if="open" :title="$t('contacts.energy.title')" @close="open = false">
    <template #header>
      <InfoButton :label="$t('contacts.energy.title')" :text="$t('contacts.energy.info')" />
    </template>
    <AppListGroup>
      <div v-if="energy" class="text-block">
        <p class="energy-points"><strong>{{ energy.points }}</strong> / {{ energy.capacity }}</p>
        <div class="meter" :class="{ low: energy.points <= 5 }" role="progressbar" :aria-valuenow="energy.points" aria-valuemin="0" :aria-valuemax="energy.capacity">
          <span :style="{ width: `${Math.min(100, (energy.points / energy.capacity) * 100)}%` }" />
        </div>
        <p v-if="nextPoint" class="next-point">{{ $t('contacts.energy.nextPoint', { time: nextPoint }) }}</p>
      </div>
      <AppLoading v-else-if="busy" :label="$t('contacts.energy.loading')" />
      <AppListItem icon="refresh" :disabled="busy || !energy" @click="reset">{{ $t('contacts.energy.reset') }}</AppListItem>
    </AppListGroup>
    <AppNotice v-if="error">
      {{ error }}
      <template #actions><button type="button" class="link-button" :disabled="busy" @click="refresh()">{{ $t('common.retry') }}</button></template>
    </AppNotice>
  </AppSheet>
</template>

<style scoped>
.energy-points { font-size: 15px; color: var(--md-on-surface); }
.energy-points strong { font: var(--type-headline-medium); }
.next-point { margin-top: var(--space-3); }
</style>
