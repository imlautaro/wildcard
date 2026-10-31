<script setup lang="ts">
// Material 3 small top app bar. `leading` holds the navigation icon button, the
// default slot the trailing actions (4 px apart). Replace the heading with the
// `title` slot for richer titles, such as an avatar with a name. `contained` lines
// the bar up with the `.page-inner` column below it (`'wide'` for `.page-inner.wide`).
defineProps<{ title?: string; subtitle?: string; contained?: boolean | 'wide' }>();
</script>

<template>
  <header class="bar" :class="{ contained, wide: contained === 'wide' }">
    <slot name="leading" />
    <slot name="title">
      <h1 class="title">
        {{ title }}
        <span v-if="subtitle" class="subtitle">{{ subtitle }}</span>
      </h1>
    </slot>
    <slot />
  </header>
</template>
