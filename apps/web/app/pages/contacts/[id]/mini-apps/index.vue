<script setup lang="ts">
const route = useRoute();
const contactID = computed(() => String(route.params.id));
</script>

<template>
  <MiniAppList :base="`contacts/${contactID}`" :back="`/contacts/${contactID}/edit`"
    :empty="$t('miniapps.list.contactEmpty')"
    :footer="$t('miniapps.list.contactFooter')" />
</template>
