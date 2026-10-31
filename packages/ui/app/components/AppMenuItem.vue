<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router';
import { NuxtLink } from '#components';

// An item of a `.menu` surface (popover, context menu): a link with `to`, a
// button otherwise. `danger` marks destructive actions.
const props = withDefaults(defineProps<{ icon?: AppIconName; to?: RouteLocationRaw; danger?: boolean; disabled?: boolean }>(), {
  icon: undefined, to: undefined,
});
</script>

<template>
  <NuxtLink v-if="props.to" :to="props.to" class="menu-item" :class="{ danger }">
    <AppIcon v-if="icon" :name="icon" />
    <span><slot /></span>
  </NuxtLink>
  <button v-else type="button" class="menu-item" :class="{ danger }" :disabled="disabled">
    <AppIcon v-if="icon" :name="icon" />
    <span><slot /></span>
  </button>
</template>
