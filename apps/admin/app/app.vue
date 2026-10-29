<script setup lang="ts">
const { status, restore } = useSession();
</script>

<template>
  <div v-if="status === 'unreachable'" class="auth">
    <div class="auth-card empty">
      <h2>Wildcard is unavailable</h2>
      <p>Check your connection and try again.</p>
      <button class="button" @click="restore().then(() => $router.replace($route.fullPath))">Try again</button>
    </div>
  </div>
  <NuxtLayout v-else>
    <NuxtPage />
  </NuxtLayout>
</template>
