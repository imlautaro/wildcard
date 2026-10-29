<script setup lang="ts">
import type { ChatDocumentSummary } from '~/utils/types';

// Entry point under the message that created a document; opens it full screen.
defineProps<{ document: ChatDocumentSummary; to: string }>();
</script>

<template>
  <NuxtLink :to="to" class="mini-app-card">
    <span class="mini-app-glyph"><AppIcon name="file" /></span>
    <span class="copy"><strong>{{ document.title }}</strong><span>{{ document.preview || 'Empty document' }}</span></span>
    <AppIcon name="chevron" class="chevron" />
  </NuxtLink>
</template>
