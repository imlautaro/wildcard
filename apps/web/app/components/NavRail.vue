<script setup lang="ts">
// Material 3 navigation rail: the app's top-level pages, always beside the content on wide
// screens (docs/web.md#design). Chats owns every conversation and new-chat flow, Account its
// settings pages. Hidden below 860px, where the chat list header menu navigates instead.
const route = useRoute();
const chats = useChats();
const updatesUnseen = updatesBadge();
const chatSection = ['/chats', '/groups', '/contacts', '/invitations', '/join'];
const accountSection = ['/account', '/native'];
const within = (prefixes: string[]) => prefixes.some(prefix => route.path === prefix || route.path.startsWith(`${prefix}/`));
const items = computed(() => [
  { to: '/updates', icon: 'home' as const, label: 'For you', active: route.path === '/updates',
    badge: route.path === '/updates' ? 0 : updatesUnseen.value, badgeLabel: `${updatesUnseen.value} new in For you` },
  { to: '/chats', icon: 'chat' as const, label: 'Chats', active: within(chatSection),
    badge: chats.totalUnread.value, badgeLabel: `${chats.totalUnread.value} unread messages` },
  { to: '/account', icon: 'person' as const, label: 'Account', active: within(accountSection), badge: 0, badgeLabel: '' },
]);
</script>

<template>
  <nav class="nav-rail" aria-label="Main navigation">
    <NuxtLink to="/updates" class="nav-rail-logo" aria-label="Wildcard"><img src="/icon.svg" alt="" width="32" height="32"></NuxtLink>
    <NuxtLink v-for="item in items" :key="item.to" :to="item.to" class="nav-rail-item" :class="{ active: item.active }"
              :aria-current="item.active ? 'page' : undefined">
      <span class="nav-rail-indicator" data-ripple>
        <AppIcon :name="item.icon" :filled="item.active" />
        <span v-if="item.badge" class="badge" :aria-label="item.badgeLabel">{{ item.badge > 99 ? '99+' : item.badge }}</span>
      </span>
      <span class="nav-rail-label">{{ item.label }}</span>
    </NuxtLink>
  </nav>
</template>

<style scoped>
.nav-rail { display: flex; flex-direction: column; align-items: center; gap: var(--space-3); padding: var(--space-3) 0; }
.nav-rail-logo { display: grid; place-items: center; width: 56px; height: 56px; margin-bottom: var(--space-4); border-radius: var(--md-shape-l); }
.nav-rail-logo img { display: block; }
.nav-rail-item { display: flex; flex-direction: column; align-items: center; gap: var(--space-1); width: 100%; color: var(--md-on-surface-variant); text-decoration: none; }
.nav-rail-indicator {
  position: relative; display: grid; place-items: center; width: 56px; height: 32px; border-radius: var(--md-shape-full);
  transition: background-color var(--md-motion-short) linear;
}
.nav-rail-indicator :deep(svg) { width: 24px; height: 24px; }
.nav-rail-item:hover .nav-rail-indicator { background: var(--hover); }
.nav-rail-item.active { color: var(--md-on-surface); }
.nav-rail-item.active .nav-rail-indicator { background: var(--md-secondary-container); color: var(--md-on-secondary-container); }
.nav-rail-label { font: var(--type-label-medium); font-weight: 600; }
.nav-rail-item:focus-visible { outline: none; }
.nav-rail-item:focus-visible .nav-rail-indicator { outline: 2px solid var(--md-primary); outline-offset: 2px; }
@media (max-width: 860px) { .nav-rail { display: none; } }
.badge {
  position: absolute; top: -2px; left: 32px; min-width: 16px; height: 16px; padding: 0 4px; font-size: 10.5px;
  background: var(--md-error); color: var(--md-on-error); box-shadow: 0 0 0 2px var(--md-surface-container);
}
</style>
