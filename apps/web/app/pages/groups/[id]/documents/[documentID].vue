<script setup lang="ts">
const route = useRoute();
const id = computed(() => String(route.params.id));
const documentID = computed(() => String(route.params.documentID));
</script>

<template>
  <DocumentScreen :key="documentID" :base="`groups/${id}`" :document-id="documentID" :back="`/groups/${id}`" />
</template>
