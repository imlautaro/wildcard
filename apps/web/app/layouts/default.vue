<script setup lang="ts">
// Wide screens: navigation sidebar, then the chat list for the Chats section, then the page.
// For you and Account take the whole content pane. The chat list stays mounted (v-show) so
// its Archived selection, scroll and polling survive switching pages (docs/web.md#design).
const route = useRoute();
const chatSection = ['/chats', '/groups', '/contacts', '/invitations', '/join'];
const showChatList = computed(() => chatSection.some(prefix => route.path === prefix || route.path.startsWith(`${prefix}/`)));
// Below 860px a page replaces the chat list; only the Chats root shows the list itself.
const hasPage = computed(() => route.path !== '/chats' && route.path !== '/');
</script>

<template>
  <div class="shell" :class="{ 'has-page': hasPage, 'without-chat-list': !showChatList }">
    <NavSidebar class="shell-navigation" />
    <aside v-show="showChatList" aria-label="Chats"><ChatList /></aside>
    <main><slot /></main>
  </div>
</template>
