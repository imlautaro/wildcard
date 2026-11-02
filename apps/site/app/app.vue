<script setup lang="ts">
// Per-locale head: <html lang>, hreflang alternates (en-US, es, x-default),
// canonical and og:locale come from @nuxtjs/i18n; title and description from the
// locale's messages. The favicon is set in nuxt.config.ts.
const { t } = useI18n();
const localeHead = useLocaleHead();
useHead(() => ({
  htmlAttrs: { lang: localeHead.value.htmlAttrs.lang, dir: localeHead.value.htmlAttrs.dir },
  link: [...(localeHead.value.link ?? [])],
  meta: [...(localeHead.value.meta ?? [])],
  // html.js gates the scroll-reveal starting state, so the prerendered page stays
  // fully visible when JavaScript doesn't run.
  script: [{ innerHTML: "document.documentElement.classList.add('js')" }],
}));
const title = computed(() => `${site.name} — ${t('seo.tagline')}`);
useSeoMeta({
  title,
  description: () => t('seo.description'),
  ogType: 'website',
  ogTitle: title,
  ogDescription: () => t('seo.description'),
  twitterCard: 'summary',
});
</script>

<template>
  <SiteNav />
  <NuxtPage />
  <SiteFooter />
</template>
