<script setup lang="ts">
// Explicit shared-memory and Contributor consent, with the same disclosures as iOS.
defineProps<{ contributorModel: boolean; disclosure: string[]; memoryLabel: string; contributorNote: string }>();
const shareMemory = defineModel<boolean>('shareMemory', { required: true });
const contributorConsent = defineModel<boolean>('contributorConsent', { required: true });
</script>

<template>
  <AppListGroup>
    <div class="text-block"><p v-for="paragraph in disclosure" :key="paragraph">{{ paragraph }}</p></div>
    <AppSwitch v-model="shareMemory" :label="memoryLabel" />
    <template v-if="contributorModel">
      <AppSwitch v-model="contributorConsent">{{ $t('account.chatModel.contributorConsent') }}</AppSwitch>
      <div class="text-block">{{ contributorNote }}</div>
    </template>
  </AppListGroup>
</template>
