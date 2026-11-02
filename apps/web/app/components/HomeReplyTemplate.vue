<script setup lang="ts">
// A note card's suggested reply. Plain text is one wrapping button. A template with blanks
// (runs of underscores, e.g. "My I-130 was filed on ____") becomes the sentence itself with an
// inline field per blank; the completed text goes to the chat's composer, never sent from here.
const props = defineProps<{ prompt: string }>();
const emit = defineEmits<{ use: [text: string] }>();

const segments = computed(() => {
  let blank = 0;
  return props.prompt.split(/(_{2,})/).filter(Boolean).map(text => /^_{2,}$/.test(text) ? { text, blank: blank++ } : { text, blank: null });
});
const count = computed(() => segments.value.filter(segment => segment.blank !== null).length);
const values = ref<string[]>([]);
const fields = ref<HTMLInputElement[]>([]);
watch(() => props.prompt, () => { values.value = Array.from({ length: count.value }, () => ''); }, { immediate: true });

const complete = computed(() => count.value > 0 && values.value.every(value => value.trim()));
const text = computed(() => segments.value.map(segment => segment.blank === null ? segment.text : values.value[segment.blank]!.trim()).join(''));

// Enter moves to the next blank, and from the last one continues to the chat.
function next(index: number) {
  const target = fields.value[index + 1];
  if (target) target.focus();
  else if (complete.value) emit('use', text.value);
}
</script>

<template>
  <button v-if="!count" type="button" class="reply-chip" :title="prompt" data-ripple @click="emit('use', prompt)">
    <AppIcon name="reply" /><span class="reply-chip-text">{{ prompt }}</span>
  </button>
  <form v-else class="reply-form" @submit.prevent="complete && emit('use', text)">
    <p class="reply-sentence">
      <template v-for="(segment, index) in segments" :key="index">
        <template v-if="segment.blank === null">{{ segment.text }}</template>
        <span v-else class="blank" :data-value="values[segment.blank]">
          <input :ref="element => { if (element) fields[segment.blank!] = element as HTMLInputElement; }" v-model="values[segment.blank]"
            type="text" maxlength="120" enterkeyhint="next" autocomplete="off" placeholder="…" :aria-label="$t('updates.replyTemplate.blank', { index: segment.blank + 1, count })"
            @keydown.enter.prevent="next(segment.blank)">
        </span>
      </template>
    </p>
    <AppButton type="submit" size="small" icon="reply" :disabled="!complete">{{ $t('updates.replyTemplate.continue') }}</AppButton>
  </form>
</template>

<style scoped>
.reply-chip { display: flex; align-items: flex-start; gap: var(--space-2); min-width: 0; padding: 10px var(--space-4) 10px 14px; border: 0; border-radius: var(--md-shape-l);
  background: var(--md-secondary-container); color: var(--md-on-secondary-container); font: var(--type-label-large); text-align: left; cursor: pointer; }
.reply-chip :deep(svg) { width: 18px; height: 18px; flex: none; margin-top: 1px; }
.reply-chip-text { min-width: 0; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }

.reply-form { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-3); min-width: 0; padding: var(--space-3) var(--space-4); border-radius: var(--md-shape-l);
  background: color-mix(in srgb, var(--card-accent) 9%, transparent); }
.reply-sentence { margin: 0; max-width: 100%; font-size: 15px; line-height: 2; overflow-wrap: anywhere; }
/* Sizes to what is typed: the hidden ::after copy is as wide as the value, the input fills it. */
.blank { display: inline-grid; vertical-align: baseline; min-width: 7ch; max-width: 100%; }
.blank::after { content: attr(data-value) ' '; visibility: hidden; grid-area: 1 / 1; white-space: pre; padding: 0 var(--space-2); font: inherit; overflow: hidden; }
.blank input { grid-area: 1 / 1; width: 0; min-width: 100%; padding: 0 var(--space-2); border: 0; border-bottom: 2px solid var(--card-accent); border-radius: 6px 6px 0 0; outline: none;
  background: color-mix(in srgb, var(--card-accent) 12%, transparent); color: inherit; font: inherit; }
.blank input::placeholder { color: var(--md-on-surface-variant); }
.blank input:focus { background: color-mix(in srgb, var(--card-accent) 20%, transparent); }
</style>
