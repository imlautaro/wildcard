<script setup lang="ts">
// A connector library preset's brand logo on a fixed light tile, so dark marks
// (GitHub, Vercel, Notion) stay legible in dark mode. Unknown IDs show the link icon.
const props = defineProps<{ id: string }>();
const logo = computed(() => connectorLogos[props.id]);
</script>

<template>
  <span class="connector-logo" aria-hidden="true">
    <Icon v-if="logo" :name="logo" />
    <AppIcon v-else name="link" />
  </span>
</template>

<style scoped>
.connector-logo {
  display: inline-grid; place-items: center; flex: none;
  width: 32px; height: 32px; border-radius: 8px;
  background: #fff; border: 1px solid var(--md-outline-variant);
  color: #1f1f1f;
}
.connector-logo > svg { width: 20px; height: 20px; }
</style>
