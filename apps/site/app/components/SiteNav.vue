<script setup lang="ts">
// Sticky top bar: logo, section links (a menu on narrow screens) and the main
// call to action. It turns solid once the page scrolls.
const { t } = useI18n();
const localePath = useLocalePath();
const scrolled = ref(false);
const open = ref(false);
function onScroll() { scrolled.value = window.scrollY > 8; }
onMounted(() => { onScroll(); window.addEventListener('scroll', onScroll, { passive: true }); });
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll));
</script>

<template>
  <header class="site-nav" :class="{ scrolled: scrolled || open, open }">
    <div class="container nav-inner">
      <NuxtLink :to="localePath('/')" class="brand" :aria-label="t('nav.home')" @click="open = false">
        <WildcardMark :size="32" />
        <span>Wildcard</span>
      </NuxtLink>
      <nav class="links" :aria-label="t('nav.sections')">
        <a v-for="item in navigation" :key="item.id" :href="`${localePath('/')}#${item.id}`" @click="open = false">{{ t(`nav.items.${item.key}`) }}</a>
      </nav>
      <div class="actions">
        <AppButton :to="site.appUrl" size="small" class="nav-cta">{{ t('common.getStarted') }}</AppButton>
        <button type="button" class="icon-button menu-toggle" :aria-expanded="open" :aria-label="t('nav.menu')" @click="open = !open">
          <SiteIcon :name="open ? 'close' : 'menu'" />
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.site-nav {
  position: sticky; top: 0; z-index: 50; height: var(--site-nav-height);
  transition: background-color var(--md-motion-medium) linear, box-shadow var(--md-motion-medium) linear;
}
.site-nav.scrolled {
  background: color-mix(in srgb, var(--md-surface) 82%, transparent);
  backdrop-filter: saturate(1.6) blur(18px); -webkit-backdrop-filter: saturate(1.6) blur(18px);
  box-shadow: 0 1px 0 color-mix(in srgb, var(--md-on-surface) 7%, transparent);
}
.nav-inner { display: flex; align-items: center; gap: var(--space-6); height: 100%; }
.brand { display: inline-flex; align-items: center; gap: var(--space-2-5, 10px); color: var(--md-on-surface); font: var(--type-title-large); font-weight: 800; letter-spacing: -0.03em; }
.links { display: flex; gap: var(--space-1); margin-left: auto; }
.links a {
  padding: var(--space-2) var(--space-3); border-radius: var(--md-shape-full); color: var(--md-on-surface-variant);
  font: var(--type-label-large); letter-spacing: var(--tracking-label);
  transition: background-color var(--md-motion-short) linear, color var(--md-motion-short) linear;
}
.links a:hover { background: var(--hover); color: var(--md-on-surface); }
.actions { display: flex; align-items: center; gap: var(--space-2); }
.menu-toggle { display: none; color: var(--md-on-surface); }

@media (max-width: 899px) {
  .actions { margin-left: auto; }
  .menu-toggle { display: inline-flex; }
  .links {
    position: absolute; top: var(--site-nav-height); left: 0; right: 0; flex-direction: column; gap: 0; margin: 0;
    padding: var(--space-2) var(--site-gutter) var(--space-5); background: var(--md-surface);
    box-shadow: 0 12px 24px -12px hsl(var(--ui-shadow) / 0.2);
    opacity: 0; transform: translateY(-8px); pointer-events: none;
    transition: opacity var(--md-motion-medium) var(--md-ease), transform var(--md-motion-medium) var(--md-ease);
  }
  .open .links { opacity: 1; transform: none; pointer-events: auto; }
  .links a { padding: var(--space-3) var(--space-3); font-size: 16px; }
}
@media (max-width: 420px) { .nav-cta { display: none; } }
</style>
