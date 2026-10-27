<script setup lang="ts">
// Port of MessageReceiptView: a clock while sending; one check for Sent; two checks
// for Received (or private turns without a group state); colored when Read.
const props = defineProps<{ sending?: boolean; readAt?: number | null; receiptState?: string | null }>();
const read = computed(() => props.receiptState === 'read' || props.readAt != null);
const doubled = computed(() => props.receiptState == null || props.receiptState === 'received' || props.receiptState === 'read');
const label = computed(() => (props.sending ? 'Sending' : read.value ? 'Read' : props.receiptState === 'sent' ? 'Sent' : 'Received'));
</script>

<template>
  <svg v-if="sending" class="receipt" viewBox="0 0 12 12" width="11" height="11" role="img" :aria-label="label">
    <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" stroke-width="1.2" />
    <path d="M6 3.2V6l1.9 1.3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
  </svg>
  <svg v-else class="receipt" :class="{ read }" viewBox="0 0 20 12" width="16" height="9.6" role="img" :aria-label="label">
    <g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path v-if="doubled" d="M1 6 5 10 13 2M9 8l2 2 8-8" />
      <path v-else d="M4 6 8 10 16 2" />
    </g>
  </svg>
</template>
