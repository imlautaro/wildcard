<script setup lang="ts">
// "<name> is typing / researching / recording" with an animation that matches the activity.
// Without a name the label is the bare activity, for the contact header.
const props = defineProps<{ activity: 'typing' | 'researching' | 'recording'; name?: string }>();
const label = computed(() => `${props.name ? `${props.name} is ` : ''}${props.activity}`);
</script>

<template>
  <span class="activity" role="status">
    <span v-if="activity === 'recording'" class="activity-record" aria-hidden="true" />
    <AppIcon v-else-if="activity === 'researching'" name="search" class="activity-search" aria-hidden="true" />
    <span v-else class="activity-dots" aria-hidden="true"><span /><span /><span /></span>
    <span>{{ label }}</span>
  </span>
</template>

<style scoped>
.activity { display: inline-flex; align-items: center; gap: var(--space-2); }
.activity-dots { display: inline-flex; gap: 3px; flex: none; }
.activity-dots span { width: 6px; height: 6px; border-radius: 50%; background: currentColor; animation: typing 1.2s infinite ease-in-out; }
.activity-dots span:nth-child(2) { animation-delay: 0.15s; }
.activity-dots span:nth-child(3) { animation-delay: 0.3s; }
.activity-record { width: 10px; height: 10px; flex: none; border-radius: 50%; background: var(--md-error); animation: activity-pulse 1.2s ease-in-out infinite; }
.activity-search { width: 18px; height: 18px; flex: none; animation: activity-search 1.6s ease-in-out infinite; }
@keyframes activity-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.75); } }
@keyframes activity-search { 0%, 100% { transform: translate(0, 0) rotate(0); } 25% { transform: translate(2px, -2px) rotate(8deg); } 75% { transform: translate(-2px, 2px) rotate(-8deg); } }
@media (prefers-reduced-motion: reduce) { .activity-dots span, .activity-record, .activity-search { animation: none; } }
</style>
