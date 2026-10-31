<script setup lang="ts">
// A Material 3 Expressive segmented list section: an optional title (with an
// optional InfoButton), the rounded block of rows, and an optional footer.
// Attributes such as `role` and `aria-label` go to the block of rows.
defineOptions({ inheritAttrs: false });
defineProps<{ title?: string; info?: string; footer?: string }>();
</script>

<template>
  <div v-if="title || $slots.title" class="group-title" :class="{ 'info-title': info }">
    <slot name="title">{{ title }}</slot>
    <InfoButton v-if="info && title" :label="title" :text="info" />
  </div>
  <div class="group" v-bind="$attrs"><slot /></div>
  <p v-if="footer || $slots.footer" class="group-footer"><slot name="footer">{{ footer }}</slot></p>
</template>
