<script setup lang="ts">
// The chat list stays beside every signed-in page on wide screens. On narrow
// screens the list is the home page and other pages replace it.
const route = useRoute();
const chats = useChats();
const hasPage = computed(() => route.path !== '/');

useHead({ titleTemplate: computed(() => `${chats.totalUnread.value ? `(${chats.totalUnread.value}) ` : ''}%s`) });
</script>

<template>
  <div class="shell" :class="{ 'has-page': hasPage }">
    <aside aria-label="Chats"><ChatList /></aside>
    <main><slot /></main>
  </div>
</template>
