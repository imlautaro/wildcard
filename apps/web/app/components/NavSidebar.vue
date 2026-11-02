<script setup lang="ts">
// Expanded navigation sidebar: the app's top-level pages, always beside the content on wide
// screens (docs/web.md#design). Chats owns every conversation and new-chat flow, Account its
// settings pages. Hidden below 860px, where the chat list header menu navigates instead.
const route = useRoute();
const { t } = useI18n();
const chats = useChats();
const updatesUnseen = updatesBadge();
const chatSection = ['/chats', '/groups', '/contacts', '/invitations', '/join'];
const accountSection = ['/account', '/native'];
const within = (prefixes: string[]) => prefixes.some(prefix => route.path === prefix || route.path.startsWith(`${prefix}/`));
const items = computed(() => [
  { to: '/chats', icon: 'chat' as const, label: t('account.nav.chats'), active: within(chatSection),
    badge: chats.totalUnread.value, badgeLabel: t('account.nav.chatsBadge', chats.totalUnread.value) },
  { to: '/updates', icon: 'feed' as const, label: t('account.nav.forYou'), active: route.path === '/updates',
    badge: route.path === '/updates' ? 0 : updatesUnseen.value, badgeLabel: t('account.nav.forYouBadge', updatesUnseen.value) },
  { to: '/account', icon: 'person' as const, label: t('account.nav.account'), active: within(accountSection), badge: 0, badgeLabel: '' },
]);
</script>

<template>
  <nav class="nav-sidebar" :aria-label="$t('account.nav.main')">
    <NuxtLink to="/chats" class="nav-sidebar-logo" aria-label="Wildcard"><img src="/icon.svg" alt="" width="44" height="44"><span>Wildcard</span></NuxtLink>
    <NuxtLink v-for="item in items" :key="item.to" :to="item.to" class="nav-sidebar-item" :class="{ active: item.active }"
              :aria-current="item.active ? 'page' : undefined" data-ripple>
      <span class="nav-sidebar-icon">
        <AppIcon :name="item.icon" :filled="item.active" />
      </span>
      <span class="nav-sidebar-label">{{ item.label }}</span>
      <span v-if="item.badge" class="badge" :aria-label="item.badgeLabel">{{ item.badge > 99 ? '99+' : item.badge }}</span>
    </NuxtLink>
  </nav>
</template>

<style scoped>
.nav-sidebar { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); }
.nav-sidebar-logo {
  display: flex; align-items: center; gap: var(--space-3); min-height: 64px; padding: 0 var(--space-2);
  margin-bottom: var(--space-4); border-radius: var(--md-shape-l); color: var(--md-on-surface);
  text-decoration: none; font: var(--type-headline-small); font-weight: 750; letter-spacing: var(--tracking-headline);
}
.nav-sidebar-logo img { display: block; flex: none; }
.nav-sidebar-item {
  position: relative; display: flex; align-items: center; gap: var(--space-3); min-height: 52px;
  padding: var(--space-3) var(--space-4); border-radius: var(--md-shape-full);
  color: var(--md-on-surface-variant); text-decoration: none;
  transition: background-color var(--md-motion-short) linear;
}
.nav-sidebar-icon { display: grid; place-items: center; flex: none; width: 24px; height: 24px; }
.nav-sidebar-icon :deep(svg) { width: 24px; height: 24px; }
.nav-sidebar-item:hover { background: var(--hover); }
.nav-sidebar-item.active { background: var(--md-secondary-container); color: var(--md-on-secondary-container); }
.nav-sidebar-label { flex: 1; font: var(--type-label-large); font-weight: 600; }
.nav-sidebar-item:focus-visible, .nav-sidebar-logo:focus-visible { outline: 2px solid var(--md-primary); outline-offset: 2px; }
@media (max-width: 860px) { .nav-sidebar { display: none; } }
/* Collapsed rail (861–1100px): icons only, centered in the 80px track. Hovering (or
   keyboard focus) widens the sidebar over the content pane, revealing the title and
   labels; the grid track keeps its width, so the pane never moves. */
@media (min-width: 861px) and (max-width: 1100px) {
  .nav-sidebar {
    position: relative; z-index: 20; width: 80px; height: 100%; overflow-x: hidden;
    background: var(--md-surface-container); border-radius: 0 var(--md-shape-l) var(--md-shape-l) 0;
    transition: width var(--md-motion-medium) cubic-bezier(0.2, 0, 0, 1), box-shadow var(--md-motion-medium) linear;
  }
  .nav-sidebar-logo { padding-left: 6px; }
  .nav-sidebar-item, .nav-sidebar-logo { white-space: nowrap; }
  .nav-sidebar-label, .nav-sidebar-logo span { opacity: 0; transition: opacity var(--md-motion-short) linear; }
  .nav-sidebar:not(:hover):not(:has(:focus-visible)) .badge { position: absolute; top: 6px; left: 30px; }
  .nav-sidebar:has(:focus-visible) { width: 224px; box-shadow: var(--md-elevation-3); }
  :root[data-theme="dark"] .nav-sidebar { --rail-hairline: inset -1px 0 0 0 color-mix(in srgb, var(--md-outline-variant) 50%, transparent); }
  :root[data-theme="dark"] .nav-sidebar:has(:focus-visible) { box-shadow: var(--rail-hairline), var(--md-elevation-3); }
  .nav-sidebar:has(:focus-visible) :is(.nav-sidebar-label, .nav-sidebar-logo span) { opacity: 1; }
}
@media (min-width: 861px) and (max-width: 1100px) and (hover: hover) {
  .nav-sidebar:hover { width: 224px; box-shadow: var(--md-elevation-3); transition-delay: 80ms; }
  :root[data-theme="dark"] .nav-sidebar:hover { box-shadow: var(--rail-hairline), var(--md-elevation-3); }
  .nav-sidebar:hover :is(.nav-sidebar-label, .nav-sidebar-logo span) { opacity: 1; transition-delay: 120ms; }
}
@media (prefers-reduced-motion: reduce) {
  .nav-sidebar, .nav-sidebar-label, .nav-sidebar-logo span { transition: none !important; }
}
.badge {
  flex: none; min-width: 20px; height: 20px; padding: 0 var(--space-1-5); font: var(--type-label-small);
  background: var(--md-error); color: var(--md-on-error);
}
</style>
