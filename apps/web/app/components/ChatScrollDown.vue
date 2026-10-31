<template>
  <AppIconButton icon="expand" label="Scroll to latest messages" class="chat-scroll-down" />
</template>

<style scoped>
.chat-scroll-down {
  --icon-button-size: 44px;
  position: absolute; right: var(--space-5); bottom: var(--space-4); z-index: 2;
  color: var(--md-on-surface); background: var(--md-surface-container-high); box-shadow: var(--md-elevation-2);
}
</style>
