<script setup lang="ts">
// Links to this page in each locale, each name in its own language. Plain
// prerendered links, so they work without JavaScript; with it, NuxtLink switches
// in place and @nuxtjs/i18n remembers the choice (docs/site.md#localization).
// `compact` (the nav) shows only the other languages behind a globe icon, with the
// name visible on wide screens; the full switcher marks the current language.
const props = withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });
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
  }))
  .filter((option) => !props.compact || !option.current));
</script>

<template>
  <span v-if="compact" class="lang-compact">
    <NuxtLink
      v-for="option in options" :key="option.code" :to="option.to" class="icon-button lang-link"
      :lang="option.language" :hreflang="option.language" :title="option.name"
    >
      <SiteIcon name="globe" />
      <span class="lang-name">{{ option.name }}</span>
    </NuxtLink>
  </span>
  <span v-else class="lang-switch" role="group" :aria-label="t('language.label')">
    <SiteIcon name="globe" class="lang-icon" />
    <NuxtLink
      v-for="option in options" :key="option.code" :to="option.to" class="lang-option" :class="{ on: option.current }"
      :lang="option.language" :hreflang="option.language" :aria-current="option.current ? 'page' : undefined"
    >{{ option.name }}</NuxtLink>
  </span>
</template>

<style scoped>
.lang-compact { display: inline-flex; }
.lang-link { color: var(--md-on-surface-variant); }
.lang-link:hover { color: var(--md-on-surface); }
/* Below 1180px the nav has no room for the name: icon only, name kept for screen readers. */
.lang-name { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (min-width: 1180px) {
  .lang-link { width: auto; gap: var(--space-1-5); padding: 0 var(--space-3) 0 var(--space-2); font: var(--type-label-large); letter-spacing: var(--tracking-label); }
  .lang-link > svg { width: 20px; height: 20px; }
  .lang-name { position: static; width: auto; height: auto; overflow: visible; clip: auto; }
}

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
