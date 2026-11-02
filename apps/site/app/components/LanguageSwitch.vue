<script setup lang="ts">
// Links to this page in each locale, each name in its own language. Plain
// prerendered links, so they work without JavaScript; with it, NuxtLink switches
// in place and @nuxtjs/i18n remembers the choice (docs/site.md#localization).
// The footer switcher marks the current language.
const { t, locale, locales } = useI18n();
const switchLocalePath = useSwitchLocalePath();
const localePath = useLocalePath();
const options = computed(() => locales.value
  .map((entry) => ({
    code: entry.code,
    name: entry.name ?? entry.code,
    language: entry.language ?? entry.code,
    // An error page has no route to switch, so it falls back to the home page.
    to: switchLocalePath(entry.code) || localePath('/', entry.code),
    current: entry.code === locale.value,
  })));
</script>

<template>
  <span class="lang-switch" role="group" :aria-label="t('language.label')">
    <SiteIcon name="globe" class="lang-icon" />
    <NuxtLink
      v-for="option in options" :key="option.code" :to="option.to" class="lang-option" :class="{ on: option.current }"
      :lang="option.language" :hreflang="option.language" :aria-current="option.current ? 'page' : undefined"
    >{{ option.name }}</NuxtLink>
  </span>
</template>

<style scoped>
.lang-switch { display: inline-flex; align-items: center; gap: 2px; padding: 3px; border-radius: var(--md-shape-full); background: var(--md-surface-container-high); }
.lang-icon { width: 18px; height: 18px; margin: 0 var(--space-1) 0 var(--space-2); color: var(--md-on-surface-variant); }
.lang-option {
  display: inline-flex; align-items: center; height: 30px; padding: 0 var(--space-3); border-radius: var(--md-shape-full);
  color: var(--md-on-surface-variant); font: var(--type-label-large); letter-spacing: var(--tracking-label); text-decoration: none;
  transition: background-color var(--md-motion-short) linear, color var(--md-motion-short) linear;
}
.lang-option:hover { background: var(--hover); color: var(--md-on-surface); }
.lang-option.on { background: var(--md-secondary-container); color: var(--md-on-secondary-container); }
</style>
