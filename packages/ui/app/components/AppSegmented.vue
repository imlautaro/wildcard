<script setup lang="ts" generic="T">
// Material 3 segmented buttons for a single choice among two to five options.
// The selected segment shows a check. `label` names the group for assistive tech.
defineProps<{ options: readonly { value: T; label: string; disabled?: boolean }[]; label: string; disabled?: boolean }>();
const model = defineModel<T>({ required: true });
</script>

<template>
  <div class="segmented" role="group" :aria-label="label">
    <button
      v-for="option in options" :key="String(option.value)" type="button" :aria-pressed="model === option.value"
      :disabled="disabled || option.disabled" @click="model = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>
