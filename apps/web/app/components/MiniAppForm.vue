<script setup lang="ts">
import type { MiniAppAction, MiniAppItem } from '~/utils/types';

// An action's form in a sheet: opened by a button, a toolbar button or a row (prefilled
// with that row's values). Select fields list their current options; a list-sourced
// select with no items yet is disabled, and a required one blocks the submission.
const props = defineProps<{ action: MiniAppAction; values?: MiniAppItem; busy?: boolean; error?: string | null }>();
const emit = defineEmits<{ submit: [fields: Record<string, unknown>]; close: [] }>();
const formID = useId();
const form = reactive<Record<string, unknown>>(Object.fromEntries(props.action.fields.map(field => {
  const value = props.values?.[field.id];
  if (field.kind === 'toggle') return [field.id, value === true];
  if (field.kind === 'number') return [field.id, typeof value === 'number' ? value : typeof value === 'string' && value.trim() && Number.isFinite(Number(value)) ? Number(value) : ''];
  // A select starts on the row's value when it is still an option, otherwise empty.
  if (field.kind === 'select') return [field.id, value !== undefined && field.options?.some(o => o.value === String(value)) ? String(value) : ''];
  return [field.id, value === undefined ? '' : String(value)];
})));
const blocked = computed(() => props.action.fields.some(field => field.required && (field.kind === 'select' ? !field.options?.length || form[field.id] === '' : field.kind !== 'toggle' && (form[field.id] === '' || form[field.id] === undefined))));
// Empty optional fields are left out, as the server expects.
function submit() {
  if (blocked.value || props.busy) return;
  emit('submit', Object.fromEntries(Object.entries(form).filter(([, value]) => value !== '' && value !== undefined)));
}
</script>

<template>
  <AppSheet :title="action.label" wide @close="emit('close')">
    <AppNotice v-if="error">{{ error }}</AppNotice>
    <form :id="formID" class="group mini-form" @submit.prevent="submit">
      <label v-for="field in action.fields" :key="field.id" :class="field.kind === 'toggle' ? 'toggle' : 'field mini-field'">
        <span>{{ field.label }}</span>
        <input v-if="field.kind === 'toggle'" v-model="form[field.id]" type="checkbox" role="switch">
        <input v-else-if="field.kind === 'number'" v-model.number="form[field.id]" type="number" step="any" :required="field.required" inputmode="decimal">
        <select v-else-if="field.kind === 'select'" v-model="form[field.id]" :required="field.required" :disabled="!field.options?.length">
          <option value="" :disabled="field.required">{{ field.options?.length ? $t('miniapps.form.choose') : $t('miniapps.form.noItems') }}</option>
          <option v-for="option in field.options ?? []" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
        <input v-else v-model="form[field.id]" :type="field.kind === 'date' ? 'date' : 'text'" :required="field.required" maxlength="500">
      </label>
    </form>
    <template #actions>
      <AppButton variant="text" @click="emit('close')">{{ $t('common.cancel') }}</AppButton>
      <AppButton type="submit" :form="formID" :variant="action.style === 'destructive' ? 'danger' : 'filled'" :disabled="blocked || busy" :loading="busy">{{ action.label }}</AppButton>
    </template>
  </AppSheet>
</template>

<style scoped>
.mini-form { margin: 0; }
.mini-form select { flex: 1; min-width: 0; border: 0; background: transparent; text-align: right; text-align-last: right; color: inherit; font: inherit; outline: none; }
</style>
