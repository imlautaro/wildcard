<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router';
import { NuxtLink } from '#components';

// Material 3 button: filled (default), tonal, outlined, text, danger, danger
// tonal or danger text. Renders a NuxtLink when `to` is set and a <button>
// otherwise; other attributes and listeners fall through. `loading` replaces the leading icon with
// a spinner and disables the button. One filled action per task area.
const props = withDefaults(defineProps<{
  variant?: 'filled' | 'tonal' | 'outlined' | 'text' | 'danger' | 'danger-tonal' | 'danger-text';
  size?: 'small' | 'medium' | 'large';
  icon?: AppIconName;
  trailingIcon?: AppIconName;
  to?: RouteLocationRaw;
  type?: 'button' | 'submit' | 'reset';
  block?: boolean;
  loading?: boolean;
  disabled?: boolean;
}>(), { variant: 'filled', size: 'medium', type: 'button', icon: undefined, trailingIcon: undefined, to: undefined });

const classes = computed(() => [
  'button',
  props.variant === 'danger-text' ? 'text danger' : props.variant !== 'filled' && props.variant,
  props.size !== 'medium' && props.size,
  { block: props.block },
]);
const inactive = computed(() => props.disabled || props.loading);
</script>

<template>
  <NuxtLink v-if="to" :to="to" :class="classes" :aria-disabled="inactive || undefined" :tabindex="inactive ? -1 : undefined">
    <AppIcon v-if="icon" :name="icon" />
    <slot />
    <AppIcon v-if="trailingIcon" :name="trailingIcon" />
  </NuxtLink>
  <button v-else :type="type" :class="classes" :disabled="inactive" :aria-busy="loading || undefined">
    <span v-if="loading" class="spinner" aria-hidden="true" />
    <AppIcon v-else-if="icon" :name="icon" />
    <slot />
    <AppIcon v-if="trailingIcon" :name="trailingIcon" />
  </button>
</template>
