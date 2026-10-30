<script setup lang="ts">
// Account and new-chat flows use the full content pane.
const route = useRoute();
const chats = useChats();
const hasPage = computed(() => route.path !== '/');
const accountActive = computed(() => route.path === '/account' || route.path.startsWith('/account/'));
const showChatList = computed(() => !accountActive.value
  && !['/contacts', '/contacts/new', '/groups/new', '/invitations', '/join'].includes(route.path));

useHead({ titleTemplate: computed(() => `${chats.totalUnread.value ? `(${chats.totalUnread.value}) ` : ''}%s`) });
</script>

<template>
  <div class="shell" :class="{ 'has-page': hasPage, 'without-chat-list': !showChatList }">
    <aside v-show="showChatList" aria-label="Chats"><ChatList /></aside>
    <main><slot /></main>
  </div>
</template>
