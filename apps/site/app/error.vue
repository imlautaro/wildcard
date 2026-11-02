<script setup lang="ts">
import type { NuxtError } from '#app';

// Unknown paths (404.html) and unexpected errors, in the site's own frame. Nuxt
// renders this instead of app.vue, so it sets its own <html lang> and title.
const props = defineProps<{ error: NuxtError }>();
const { t } = useI18n();
const localePath = useLocalePath();
const missing = computed(() => props.error.statusCode === 404);
const localeHead = useLocaleHead({ seo: false });
useHead(() => ({
  htmlAttrs: { lang: localeHead.value.htmlAttrs.lang },
  title: missing.value ? t('error.notFoundTitle') : t('error.errorTitle'),
}));
</script>

<template>
  <SiteNav />
  <main class="container error-page">
    <ContactAvatar who="pixel" :size="96" />
    <h1 class="section-title">{{ missing ? t('error.notFound') : t('error.error') }}</h1>
    <p class="lead">{{ missing ? t('error.notFoundText') : t('error.errorText') }}</p>
    <AppButton size="large" @click="clearError({ redirect: localePath('/') })">{{ t('error.back') }}</AppButton>
  </main>
  <SiteFooter />
</template>

<style scoped>
.error-page { display: flex; flex-direction: column; align-items: center; gap: var(--space-4); padding-block: clamp(64px, 12vw, 140px) 0; text-align: center; }
.error-page .lead { margin: 0 0 var(--space-4); }
</style>
