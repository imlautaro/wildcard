<script setup lang="ts">
const route = useRoute();
const groupID = computed(() => String(route.params.id));
</script>

<template>
  <MiniAppList :base="`groups/${groupID}`" :back="`/groups/${groupID}/members`"
    :empty="$t('miniapps.list.groupEmpty')"
    :footer="$t('miniapps.list.groupFooter')" />
</template>
