<script setup lang="ts">
// Inline feedback in a tonal container: error (default), warning, success or info,
// each with its own icon. Errors are announced as alerts, other tones as status.
// The `actions` slot holds link buttons (Retry, Undo); `dismissible` adds a close
// button that emits `dismiss`.
const props = withDefaults(defineProps<{
  tone?: 'error' | 'warning' | 'success' | 'info';
  icon?: AppIconName | null;
  dismissible?: boolean;
}>(), { tone: 'error', icon: undefined });
const emit = defineEmits<{ dismiss: [] }>();
const toneIcons = { error: 'error', warning: 'alert', success: 'check', info: 'info' } as const satisfies Record<string, AppIconName>;
const glyph = computed(() => props.icon === undefined ? toneIcons[props.tone] : props.icon);
</script>

<template>
  <div class="notice" :class="tone !== 'error' && tone" :role="tone === 'error' ? 'alert' : 'status'">
    <AppIcon v-if="glyph" :name="glyph" />
    <div class="notice-text"><slot /></div>
    <div v-if="$slots.actions || dismissible" class="notice-actions">
      <slot name="actions" />
      <AppIconButton v-if="dismissible" icon="close" label="Dismiss" size="small" @click="emit('dismiss')" />
    </div>
  </div>
</template>
