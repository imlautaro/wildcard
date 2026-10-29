<template>
  <button type="button" class="icon-button chat-scroll-down" aria-label="Scroll to latest messages" title="Scroll to latest messages">
    <AppIcon name="arrow-up" class="down-arrow" />
  </button>
</template>

<style scoped>
.chat-scroll-down {
  position: absolute; right: 20px; bottom: 16px; z-index: 2;
  width: 44px; height: 44px; border-radius: 50%;
  color: var(--md-on-surface); background: var(--md-surface-container-high);
  box-shadow: 0 2px 8px rgb(0 0 0 / 18%);
}
.down-arrow { transform: rotate(180deg); }
</style>
