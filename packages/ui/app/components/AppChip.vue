<script setup lang="ts">
// A compact status label: neutral (default), primary, success, warning or error.
withDefaults(defineProps<{ tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'error'; icon?: AppIconName }>(), {
  tone: 'neutral', icon: undefined,
});
</script>

<template>
  <span class="chip" :class="tone !== 'neutral' && tone">
    <AppIcon v-if="icon" :name="icon" />
    <slot />
  </span>
</template>
