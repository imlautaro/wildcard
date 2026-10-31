<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router';
import { NuxtLink } from '#components';

// Material 3 icon button: standard (default), filled, tonal or outlined. `label`
// is the accessible name and the tooltip. Passing `selected` makes it a toggle
// (aria-pressed on buttons) that shows the filled glyph; links use it for the
// current destination. `badge` shows a count in the corner.
const props = withDefaults(defineProps<{
  icon: AppIconName;
  label: string;
  variant?: 'standard' | 'filled' | 'tonal' | 'outlined';
  size?: 'small' | 'medium' | 'large';
  to?: RouteLocationRaw;
  type?: 'button' | 'submit' | 'reset';
  selected?: boolean;
  danger?: boolean;
  disabled?: boolean;
  badge?: number | string | null;
  badgeLabel?: string;
  tooltip?: boolean;
}>(), {
  variant: 'standard', size: 'medium', type: 'button', selected: undefined, to: undefined, badge: null,
  badgeLabel: undefined, tooltip: true,
});

const classes = computed(() => [
  'icon-button',
  props.variant !== 'standard' && props.variant,
  props.size !== 'medium' && props.size,
  { danger: props.danger, selected: props.selected },
]);
const showsBadge = computed(() => props.badge != null && props.badge !== 0 && props.badge !== '');
</script>

<template>
  <NuxtLink v-if="to" :to="to" :class="classes" :aria-label="label" :title="tooltip ? label : undefined">
    <AppIcon :name="icon" :filled="selected" />
    <span v-if="showsBadge" class="badge" :aria-label="badgeLabel">{{ badge }}</span>
  </NuxtLink>
  <button
    v-else :type="type" :class="classes" :disabled="disabled" :aria-label="label" :title="tooltip ? label : undefined"
    :aria-pressed="selected"
  >
    <AppIcon :name="icon" :filled="selected" />
    <span v-if="showsBadge" class="badge" :aria-label="badgeLabel">{{ badge }}</span>
  </button>
</template>
