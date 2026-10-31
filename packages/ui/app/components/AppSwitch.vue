<script setup lang="ts">
// A list row with a Material 3 switch, for settings that apply immediately. Use
// `v-model`, or `checked` with a `change` listener that receives the native event
// (handlers that revert `event.target.checked` after a failed save keep working).
// `info` adds an InfoButton after the label; `busy` shows a spinner by the switch.
const props = withDefaults(defineProps<{
  label?: string;
  icon?: AppIconName;
  supporting?: string | null;
  info?: string;
  checked?: boolean;
  disabled?: boolean;
  busy?: boolean;
}>(), { label: undefined, icon: undefined, supporting: null, info: undefined, checked: undefined });
const model = defineModel<boolean | undefined>({ default: undefined });
const emit = defineEmits<{ change: [event: Event] }>();

// A bound `checked` stays authoritative: writing the model then would keep a local
// copy that masks later prop changes and handlers that revert a failed save.
const isChecked = computed(() => props.checked ?? model.value);

function onChange(event: Event) {
  if (props.checked === undefined) model.value = (event.target as HTMLInputElement).checked;
  emit('change', event);
}
</script>

<template>
  <label class="toggle">
    <span class="toggle-label">
      <AppIcon v-if="icon" :name="icon" />
      <span v-if="supporting || $slots.supporting" class="two-line">
        <span><slot>{{ label }}</slot></span>
        <span class="small"><slot name="supporting">{{ supporting }}</slot></span>
      </span>
      <span v-else><slot>{{ label }}</slot></span>
      <InfoButton v-if="info" :label="label ?? ''" :text="info" />
    </span>
    <span v-if="busy" class="spinner" aria-hidden="true" />
    <input type="checkbox" role="switch" :checked="isChecked" :disabled="disabled" @change="onChange">
  </label>
</template>
