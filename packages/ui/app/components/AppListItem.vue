<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router';
import { NuxtLink } from '#components';

// A row inside AppListGroup. With `to` or `href` it navigates and trails a
// chevron; `opens` marks a button that opens a sheet (neutral, with a chevron);
// otherwise it is an action button in the primary color, or `danger`. `plain`
// renders a non-interactive row. `value` is the current setting before the chevron.
const props = withDefaults(defineProps<{
  icon?: AppIconName;
  to?: RouteLocationRaw;
  href?: string;
  supporting?: string | null;
  value?: string | null;
  opens?: boolean;
  danger?: boolean;
  plain?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit';
}>(), { icon: undefined, to: undefined, href: undefined, supporting: null, value: null, type: 'button' });

const classes = computed(() => ['button-row', { opens: props.opens, danger: props.danger, static: props.plain }]);
</script>

<template>
  <component
    :is="to ? NuxtLink : href ? 'a' : plain ? 'div' : 'button'"
    :class="classes"
    v-bind="to ? { to } : href ? { href } : plain ? {} : { type, disabled }"
  >
    <slot name="leading"><AppIcon v-if="icon" :name="icon" /></slot>
    <span v-if="supporting || $slots.supporting" class="two-line">
      <span><slot /></span>
      <span class="small"><slot name="supporting">{{ supporting }}</slot></span>
    </span>
    <slot v-else />
    <span v-if="value != null" class="row-value">{{ value }}</span>
    <slot name="trailing" />
  </component>
</template>
