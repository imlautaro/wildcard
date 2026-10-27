<script setup lang="ts">
// Explicit shared-memory and Contributor consent, with the same disclosures as iOS.
defineProps<{ contributorModel: boolean; disclosure: string[]; memoryLabel: string; contributorNote: string }>();
const shareMemory = defineModel<boolean>('shareMemory', { required: true });
const contributorConsent = defineModel<boolean>('contributorConsent', { required: true });
</script>

<template>
  <div class="group">
    <div class="text-block"><p v-for="paragraph in disclosure" :key="paragraph">{{ paragraph }}</p></div>
    <label class="toggle"><span>{{ memoryLabel }}</span><input v-model="shareMemory" type="checkbox" role="switch"></label>
    <template v-if="contributorModel">
      <label class="toggle"><span>I agree to Meta's Contributor data use</span><input v-model="contributorConsent" type="checkbox" role="switch"></label>
      <div class="text-block">{{ contributorNote }}</div>
    </template>
  </div>
</template>
