<script setup lang="ts">
// A site-only glyph (utils/siteIcons.ts). Shared app glyphs use the layer's AppIcon.
const props = defineProps<{ name: SiteGlyph }>();
const icon = computed(() => siteGlyphs[props.name]);
</script>

<template>
  <Icon :name="icon" class="app-icon" />
</template>
