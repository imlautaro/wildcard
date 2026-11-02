<script setup lang="ts">
const route = useRoute();
const id = computed(() => String(route.params.id));
</script>

<template>
  <PageBar :title="$t('miniapps.tasks.title')" :back="`/chats/${id}`" always-back />
  <div class="page">
    <TaskBoard :base="`contacts/${id}`" />
  </div>
</template>
