<script setup lang="ts">
import { linkSegments } from '~/utils/messageMarkdown';

// Literal message text with detected http(s)/mailto links; never renders markup.
const props = defineProps<{ text: string }>();
const segments = computed(() => linkSegments(props.text));
</script>

<template>
  <template v-for="(segment, index) in segments" :key="index">
    <a v-if="segment.url" class="message-link" :href="segment.url" target="_blank" rel="noreferrer noopener" @click.stop>{{ segment.text }}</a>
    <template v-else>{{ segment.text }}</template>
  </template>
</template>

<style scoped>
.message-link { color: inherit; text-decoration: underline; overflow-wrap: anywhere; }
</style>
