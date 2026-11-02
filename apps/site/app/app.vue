<script setup lang="ts">
// html.js gates the scroll-reveal starting state, so the prerendered page stays
// fully visible when JavaScript doesn't run.
useHead({ script: [{ innerHTML: "document.documentElement.classList.add('js')" }] });
</script>

<template>
  <SiteNav />
  <NuxtPage />
  <SiteFooter />
</template>
