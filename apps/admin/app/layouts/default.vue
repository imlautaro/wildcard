<script setup lang="ts">
// Material 3 navigation rail on wide screens, navigation bar on narrow ones.
const route = useRoute();
const { user, signOut } = useSession();
const destinations = [
  { to: '/', label: 'Overview', icon: 'dashboard' },
  { to: '/users', label: 'Users', icon: 'people' },
  { to: '/mini-apps', label: 'Lab', icon: 'grid' },
  { to: '/settings', label: 'Flags', icon: 'flag' },
] as const;
const active = (to: string) => (to === '/' ? route.path === '/' : route.path.startsWith(to));
useHead({ titleTemplate: (title) => (title ? `${title} · Wildcard Admin` : 'Wildcard Admin') });
</script>

<template>
  <div class="shell">
    <nav class="rail" aria-label="Admin">
      <div class="rail-mark" aria-hidden="true"><AppIcon name="shield" filled /></div>
      <NuxtLink v-for="item in destinations" :key="item.to" :to="item.to" class="rail-item"
                :class="{ active: active(item.to) }" :aria-current="active(item.to) ? 'page' : undefined">
        <span class="indicator" data-ripple><AppIcon :name="item.icon" :filled="active(item.to)" /></span>
        <span class="label">{{ item.label }}</span>
      </NuxtLink>
      <button class="rail-item sign-out" type="button" :title="user ? `Signed in as ${user.email}` : undefined" @click="signOut">
        <span class="indicator" data-ripple><AppIcon name="logout" /></span>
        <span class="label">Sign out</span>
      </button>
    </nav>
    <main><slot /></main>
  </div>
</template>
