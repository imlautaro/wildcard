<script setup lang="ts">
import type { StyleValue } from 'vue';

// Material 3 outlined text field with a floating label. Attributes such as `type`,
// `autocomplete`, `maxlength` or `required` go to the input; `class` and `style`
// to the field. `multiline` renders a textarea. `error` replaces the supporting
// text and marks the field invalid. A `type="password"` field gets a trailing
// button that shows or hides the value.
defineOptions({ inheritAttrs: false });
defineProps<{ label: string; multiline?: boolean; supporting?: string | null; error?: string | null }>();
const model = defineModel<string>({ default: '' });
const strings = useUiStrings();
const attrs = useAttrs();
const input = ref<HTMLInputElement>();
const revealed = ref(false);
const inputAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs;
  return rest;
});
const revealable = computed(() => attrs.type === 'password');
const inputType = computed(() => (revealable.value && revealed.value ? 'text' : attrs.type as string | undefined));

function toggleReveal() {
  revealed.value = !revealed.value;
  input.value?.focus();
}
</script>

<template>
  <label class="text-field" :class="[attrs.class, { invalid: !!error, revealable }]" :style="attrs.style as StyleValue">
    <textarea v-if="multiline" v-bind="inputAttrs" v-model="model" placeholder=" " :aria-invalid="!!error || undefined" />
    <input v-else ref="input" v-bind="inputAttrs" v-model="model" :type="inputType" placeholder=" " :aria-invalid="!!error || undefined">
    <span>{{ label }}</span>
    <AppIconButton
      v-if="revealable && !multiline" class="reveal" :icon="revealed ? 'hide' : 'show'"
      :label="revealed ? strings.hidePassword : strings.showPassword" :disabled="attrs.disabled === true || attrs.disabled === ''" @click="toggleReveal"
    />
    <small v-if="error || supporting" class="supporting">{{ error || supporting }}</small>
  </label>
</template>
