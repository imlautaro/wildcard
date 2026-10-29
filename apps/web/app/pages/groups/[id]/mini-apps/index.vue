<script setup lang="ts">
const route = useRoute();
const groupID = computed(() => String(route.params.id));
</script>

<template>
  <MiniAppList :base="`groups/${groupID}`" :back="`/groups/${groupID}/members`"
    empty="Ask a contact in this group to build one, for example “Make us a shared shopping list.”"
    footer="Group mini apps are shared: every member sees and edits the same saved values. They cannot use connections." />
</template>
