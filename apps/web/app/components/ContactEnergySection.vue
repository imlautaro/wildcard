<script setup lang="ts">
// Creator-only "Group Energy" section, matching ContactEnergySection on iOS.
// Revalidates on entry and every five seconds while visible; never projects
// recharge or debits locally.
const props = defineProps<{ contactId: string }>();
const { energy, busy, error, refresh, reset } = useContactEnergy(() => props.contactId);
const nextPoint = computed(() => energy.value?.nextPointAt ? messageTime(energy.value.nextPointAt) : null);

usePolling(() => refresh(), () => 5000);
onMounted(() => { void refresh(); });
</script>

<template>
  <div class="group-title">Group Energy</div>
  <div class="group">
    <template v-if="energy">
      <div class="field">
        <span style="flex: 1">Energy</span>
        <span class="muted">{{ energy.points }} / {{ energy.capacity }}</span>
      </div>
      <div class="text-block">
        <div class="meter" :class="{ low: energy.points <= 5 }" role="progressbar" :aria-valuenow="energy.points" aria-valuemin="0" :aria-valuemax="energy.capacity">
          <span :style="{ width: `${Math.min(100, (energy.points / energy.capacity) * 100)}%` }" />
        </div>
        <p style="margin-top: 10px">Each group message uses one point. One point recharges every five minutes, even offline. Private replies do not use energy.</p>
        <p v-if="nextPoint">Next point: {{ nextPoint }}</p>
      </div>
    </template>
    <div v-else-if="busy" class="center"><span class="spinner" /> Loading energy…</div>
    <button type="button" class="button-row" :disabled="busy || !energy" @click="reset">Reset Energy to 50</button>
    <div v-if="error" class="text-block">
      <p style="color: var(--danger)">{{ error }}</p>
      <button type="button" class="link-button" style="padding-left: 0" :disabled="busy" @click="refresh()">Retry</button>
    </div>
  </div>
</template>
