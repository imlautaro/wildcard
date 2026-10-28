<script setup lang="ts">
// Minimal inline icon set; stroke icons inherit currentColor.
defineProps<{ name: 'compose' | 'back' | 'chevron' | 'send' | 'attach' | 'person' | 'people' | 'plus' | 'mail' | 'key' | 'file' | 'close' | 'gear' | 'share' | 'group-add' | 'reply' | 'image' | 'timer' | 'alarm' | 'iphone' | 'calendar' | 'speaker' | 'target' | 'nfc' | 'check' | 'clock' | 'alert' | 'x-circle' | 'minus' | 'refresh' | 'chart' | 'list' | 'money' | 'cart' | 'star' | 'bolt' | 'folder' | 'grid' }>();
</script>

<template>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="name === 'compose'"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></template>
    <path v-else-if="name === 'back'" d="m15 18-6-6 6-6" />
    <path v-else-if="name === 'chevron'" d="m9 18 6-6-6-6" />
    <template v-else-if="name === 'send'"><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></template>
    <path v-else-if="name === 'attach'" d="m21.4 11-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />
    <template v-else-if="name === 'person'"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></template>
    <template v-else-if="name === 'people'"><circle cx="9" cy="8" r="3.5" /><path d="M2 20a7 7 0 0 1 14 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7" /><path d="M18 13.5a7 7 0 0 1 4 6.5" /></template>
    <template v-else-if="name === 'plus'"><path d="M12 5v14" /><path d="M5 12h14" /></template>
    <template v-else-if="name === 'mail'"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></template>
    <template v-else-if="name === 'key'"><circle cx="7.5" cy="15.5" r="4.5" /><path d="m10.7 12.3 9.3-9.3" /><path d="m17 6 3 3" /><path d="m14 9 2 2" /></template>
    <template v-else-if="name === 'file'"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5" /></template>
    <template v-else-if="name === 'close'"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></template>
    <template v-else-if="name === 'gear'"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></template>
    <template v-else-if="name === 'share'"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" /><path d="m16 6-4-4-4 4" /><path d="M12 2v13" /></template>
    <template v-else-if="name === 'reply'"><path d="m9 17-5-5 5-5" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></template>
    <template v-else-if="name === 'image'"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></template>
    <template v-else-if="name === 'group-add'"><circle cx="9" cy="8" r="3.5" /><path d="M2 20a7 7 0 0 1 12-4.9" /><path d="M19 14v6" /><path d="M16 17h6" /></template>
    <template v-else-if="name === 'timer'"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2" /><path d="M10 2h4" /></template>
    <template v-else-if="name === 'alarm'"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2" /><path d="M5 3 2 6" /><path d="m22 6-3-3" /></template>
    <template v-else-if="name === 'iphone'"><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M11 18h2" /></template>
    <template v-else-if="name === 'calendar'"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /></template>
    <template v-else-if="name === 'speaker'"><path d="M11 5 6 9H2v6h4l5 4Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M19 5a10 10 0 0 1 0 14" /></template>
    <template v-else-if="name === 'target'"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></template>
    <template v-else-if="name === 'nfc'"><path d="M6 8.3a6 6 0 0 1 0 7.4" /><path d="M10 5.5a10 10 0 0 1 0 13" /><path d="M14 3a14 14 0 0 1 0 18" /></template>
    <template v-else-if="name === 'check'"><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></template>
    <template v-else-if="name === 'clock'"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></template>
    <template v-else-if="name === 'alert'"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></template>
    <template v-else-if="name === 'x-circle'"><circle cx="12" cy="12" r="9" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></template>
    <template v-else-if="name === 'minus'"><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></template>
    <template v-else-if="name === 'chart'"><path d="M3 3v18h18" /><path d="M8 17v-5" /><path d="M13 17V8" /><path d="M18 17v-8" /></template>
    <template v-else-if="name === 'list'"><path d="M9 6h12" /><path d="M9 12h12" /><path d="M9 18h12" /><path d="M4 6h.01" /><path d="M4 12h.01" /><path d="M4 18h.01" /></template>
    <template v-else-if="name === 'money'"><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01" /><path d="M18 12h.01" /></template>
    <template v-else-if="name === 'cart'"><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 7H6" /></template>
    <path v-else-if="name === 'star'" d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9Z" />
    <path v-else-if="name === 'bolt'" d="M13 2 4 14h7l-1 8 9-12h-7Z" />
    <path v-else-if="name === 'folder'" d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    <template v-else-if="name === 'grid'"><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></template>
    <template v-else-if="name === 'refresh'"><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" /><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" /><path d="M21 3v5h-5" /><path d="M3 21v-5h5" /></template>
  </svg>
</template>
