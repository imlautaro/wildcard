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
  <button type="button" class="button-row opens" @click="open = true">
    <AppIcon name="bolt" />Group energy
    <span class="row-value">{{ energy ? `${energy.points} / ${energy.capacity}` : busy ? 'Loading…' : '—' }}</span>
  </button>
  <AppSheet v-if="open" title="Group energy" @close="open = false">
    <template #header>
      <InfoButton label="Group energy" text="Each group message uses one point. One point recharges every five minutes, even offline. Private replies do not use energy." />
    </template>
    <div class="group">
      <div v-if="energy" class="text-block">
        <p class="energy-points"><strong>{{ energy.points }}</strong> / {{ energy.capacity }}</p>
        <div class="meter" :class="{ low: energy.points <= 5 }" role="progressbar" :aria-valuenow="energy.points" aria-valuemin="0" :aria-valuemax="energy.capacity">
          <span :style="{ width: `${Math.min(100, (energy.points / energy.capacity) * 100)}%` }" />
        </div>
        <p v-if="nextPoint" style="margin-top: 10px">Next point at {{ nextPoint }}</p>
      </div>
      <div v-else-if="busy" class="center"><span class="spinner" /> Loading energy…</div>
      <button type="button" class="button-row" :disabled="busy || !energy" @click="reset"><AppIcon name="refresh" />Reset to 50</button>
    </div>
    <div v-if="error" class="text-block">
      <p style="color: var(--danger)">{{ error }}</p>
      <button type="button" class="link-button" style="padding-left: 0" :disabled="busy" @click="refresh()">Retry</button>
    </div>
  </AppSheet>
</template>

<style scoped>
.energy-points { font-size: 15px; color: var(--md-on-surface); }
.energy-points strong { font-size: 28px; }
</style>
