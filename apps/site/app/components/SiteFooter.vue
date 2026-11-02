<script setup lang="ts">
const year = new Date().getFullYear();
</script>

<template>
  <footer class="site-footer">
    <div class="container">
      <div class="footer-top">
        <div class="footer-brand">
          <NuxtLink to="/" class="brand"><WildcardMark :size="28" /><span>Wildcard</span></NuxtLink>
          <p>AI contacts with their own names, faces, personalities and memories. Open source, and yours to run.</p>
        </div>
        <nav class="footer-links" aria-label="Footer">
          <div>
            <h3>Product</h3>
            <a v-for="item in navigation" :key="item.id" :href="`/#${item.id}`">{{ item.label }}</a>
          </div>
          <div>
            <h3>Wildcard</h3>
            <a :href="site.appUrl">Open the web app</a>
            <a v-if="site.iosUrl" :href="site.iosUrl">Get the iPhone app</a>
            <a v-if="site.repositoryPublic" :href="site.repositoryUrl">Source code</a>
            <span v-else class="soon">Source code · soon</span>
            <a href="/#faq">FAQ</a>
          </div>
        </nav>
      </div>
      <div class="footer-bottom">
        <span>© {{ year }} Wildcard</span>
        <span class="powered"><SiteIcon name="meta" /> Powered by Meta AI models</span>
        <span class="powered"><SiteIcon name="cloud" /> Built on Cloudflare</span>
        <ThemeSwitch />
      </div>
    </div>
  </footer>
</template>

<style scoped>
.site-footer { margin-top: var(--site-section-space); padding: var(--space-16) 0 var(--space-8); background: var(--md-surface-container-low); }
.footer-top { display: grid; gap: var(--space-10); }
@media (min-width: 760px) { .footer-top { grid-template-columns: 1.2fr 1fr; } }
.brand { display: inline-flex; align-items: center; gap: 10px; color: var(--md-on-surface); font: var(--type-title-large); font-weight: 800; letter-spacing: -0.03em; }
.footer-brand p { max-width: 360px; margin-top: var(--space-4); color: var(--md-on-surface-variant); font: var(--type-body-medium); font-size: 15px; line-height: 22px; }
.footer-links { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-8); }
.footer-links h3 { margin-bottom: var(--space-3); font: var(--type-title-small); letter-spacing: var(--tracking-label); color: var(--md-on-surface); }
.footer-links a, .footer-links .soon { display: block; padding: var(--space-1) 0; color: var(--md-on-surface-variant); font: var(--type-body-medium); font-size: 15px; }
.footer-links a:hover { color: var(--md-on-surface); }
.footer-links .soon { opacity: 0.7; }
.footer-bottom {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3) var(--space-6); margin-top: var(--space-12); padding-top: var(--space-6);
  border-top: 1px solid var(--md-outline-variant); color: var(--md-on-surface-variant); font: var(--type-body-small); font-size: 13px;
}
.footer-bottom > :last-child { margin-left: auto; }
.powered { display: inline-flex; align-items: center; gap: var(--space-1-5); }
.powered svg { width: 16px; height: 16px; }
</style>
