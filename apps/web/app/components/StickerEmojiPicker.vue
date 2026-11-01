<script setup lang="ts">
// Emoji choice for a sticker: a grid of common emoji plus a field that accepts any single
// emoji (one grapheme, validated like the API). The model is empty until the choice is valid.
const model = defineModel<string>({ required: true });
const typed = ref(model.value);
const problem = computed(() => typed.value.trim() && !isSingleEmoji(typed.value.trim()) ? 'Enter exactly one emoji.' : null);
watch(typed, (value) => { model.value = isSingleEmoji(value.trim()) ? value.trim() : ''; });
watch(model, (value) => { if (value && value !== typed.value.trim()) typed.value = value; });
function choose(emoji: string) { typed.value = emoji; }
</script>

<template>
  <div class="emoji-picker">
    <div class="emoji-grid" role="group" aria-label="Common emoji">
      <button v-for="emoji in stickerEmojis" :key="emoji" type="button" class="emoji-option" :aria-pressed="model === emoji" :aria-label="`Use ${emoji}`" @click="choose(emoji)">{{ emoji }}</button>
    </div>
    <AppTextField v-model="typed" label="Or type any emoji" autocomplete="off" maxlength="32" :error="problem" supporting="One emoji tells contacts when to use the sticker." />
  </div>
</template>

<style scoped>
.emoji-picker { display: flex; flex-direction: column; gap: var(--space-3); }
.emoji-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(44px, 1fr)); gap: var(--space-0-5); }
.emoji-option { min-height: 44px; border: 0; border-radius: var(--md-shape-m); background: transparent; font-size: 24px; line-height: 1; cursor: pointer; }
.emoji-option:hover { background: var(--hover); }
.emoji-option[aria-pressed='true'] { background: var(--md-secondary-container); }
</style>
