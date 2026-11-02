<script setup lang="ts">
const { status, restore } = useSession();
useMessageSoundPlayback();
useWebPushLifecycle();
</script>

<template>
  <div v-if="status === 'unreachable'" class="auth">
    <div class="auth-card empty">
      <h2>{{ $t('common.unavailableTitle') }}</h2>
      <p>{{ $t('common.unavailableText') }}</p>
      <AppButton @click="restore().then(() => $router.replace($route.fullPath))">{{ $t('common.tryAgain') }}</AppButton>
    </div>
  </div>
  <NuxtLayout v-else>
    <NuxtPage />
  </NuxtLayout>
</template>
