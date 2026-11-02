<script setup lang="ts">
import type { NuxtError } from '#app';

// Unknown paths (404.html) and unexpected errors, in the site's own frame.
const props = defineProps<{ error: NuxtError }>();
const missing = computed(() => props.error.statusCode === 404);
useHead({ title: missing.value ? 'Page not found · Wildcard' : 'Something went wrong · Wildcard' });
</script>

<template>
  <SiteNav />
  <main class="container error-page">
    <ContactAvatar who="pixel" :size="96" />
    <h1 class="section-title">{{ missing ? 'This page wandered off.' : 'Something went wrong.' }}</h1>
    <p class="lead">{{ missing ? "Pixel looked everywhere and couldn't find it." : 'Please try again in a moment.' }}</p>
    <AppButton size="large" @click="clearError({ redirect: '/' })">Back to Wildcard</AppButton>
  </main>
  <SiteFooter />
</template>

<style scoped>
.error-page { display: flex; flex-direction: column; align-items: center; gap: var(--space-4); padding-block: clamp(64px, 12vw, 140px) 0; text-align: center; }
.error-page .lead { margin: 0 0 var(--space-4); }
</style>
