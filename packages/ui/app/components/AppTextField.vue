<script setup lang="ts">
import type { StyleValue } from 'vue';

// Material 3 outlined text field with a floating label. Attributes such as `type`,
// `autocomplete`, `maxlength` or `required` go to the input; `class` and `style`
// to the field. `multiline` renders a textarea. `error` replaces the supporting
// text and marks the field invalid.
defineOptions({ inheritAttrs: false });
defineProps<{ label: string; multiline?: boolean; supporting?: string | null; error?: string | null }>();
const model = defineModel<string>({ default: '' });
const attrs = useAttrs();
const inputAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs;
  return rest;
});
</script>

<template>
  <label class="text-field" :class="[attrs.class, { invalid: !!error }]" :style="attrs.style as StyleValue">
    <textarea v-if="multiline" v-bind="inputAttrs" v-model="model" placeholder=" " :aria-invalid="!!error || undefined" />
    <input v-else v-bind="inputAttrs" v-model="model" placeholder=" " :aria-invalid="!!error || undefined">
    <span>{{ label }}</span>
    <small v-if="error || supporting" class="supporting">{{ error || supporting }}</small>
  </label>
</template>
