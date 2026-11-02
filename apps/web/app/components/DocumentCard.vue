<script setup lang="ts">
import type { ChatDocumentSummary } from '~/utils/types';

// Entry point under the message that created a document; opens it full screen.
defineProps<{ document: ChatDocumentSummary; to: string }>();
</script>

<template>
  <NuxtLink :to="to" class="mini-app-card" data-ripple>
    <span class="mini-app-glyph"><AppIcon name="file" /></span>
    <span class="copy"><strong>{{ document.title }}</strong><span v-if="document.research">{{ $t('miniapps.documents.research', document.research.sources.filter(source => source.cited).length) }}</span><span>{{ document.preview || $t('miniapps.documents.emptyPreview') }}</span></span>
    <AppIcon name="chevron" class="chevron" />
  </NuxtLink>
</template>
