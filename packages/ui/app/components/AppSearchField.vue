<script setup lang="ts">
import type { StyleValue } from 'vue';

// Material 3 search bar with a clear button. `label` is the input's accessible
// name; other attributes go to the input, `class` and `style` to the bar.
defineOptions({ inheritAttrs: false });
defineProps<{ label: string; placeholder?: string }>();
const model = defineModel<string>({ default: '' });
const strings = useUiStrings();
const attrs = useAttrs();
const input = ref<HTMLInputElement>();
const inputAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs;
  return rest;
});

function clear() {
  model.value = '';
  input.value?.focus();
}
defineExpose({ focus: () => input.value?.focus() });
</script>

<template>
  <label class="search-field" :class="attrs.class" :style="attrs.style as StyleValue">
    <AppIcon name="search" />
    <input ref="input" v-bind="inputAttrs" v-model="model" type="search" :placeholder="placeholder ?? label" :aria-label="label">
    <AppIconButton v-if="model" icon="close" :label="strings.clearSearch" @click="clear" />
  </label>
</template>
