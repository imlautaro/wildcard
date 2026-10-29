<script setup lang="ts" generic="T">
// Material 3 select: a field-styled trigger that opens a menu listbox, following
// the WAI-ARIA select-only combobox pattern. Focus stays on the trigger and the
// highlighted option is announced through aria-activedescendant. The menu is
// teleported with fixed positioning so `.group` clipping never cuts it off.
//
// Variants: `outlined` is the Material outlined field with a floating `label`;
// `plain` fills a settings row whose label lives outside; `tonal` is a compact pill.
// Attributes such as `id` and `aria-label` go to the trigger; `class` to the root.
import type { StyleValue } from 'vue';

const props = withDefaults(defineProps<{
  options: readonly { value: T; label: string; disabled?: boolean }[];
  label?: string;
  placeholder?: string;
  variant?: 'outlined' | 'plain' | 'tonal';
  disabled?: boolean;
}>(), { variant: 'outlined', label: undefined, placeholder: undefined });
const model = defineModel<T>({ required: true });
defineOptions({ inheritAttrs: false });

const attrs = useAttrs();
const triggerAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs;
  return rest;
});
const listID = useId();
const trigger = ref<HTMLButtonElement>();
const list = ref<HTMLUListElement>();
const open = ref(false);
const active = ref(-1);
const position = ref<Record<string, string>>({});

const selectedIndex = computed(() => props.options.findIndex(option => Object.is(option.value, model.value)));
const selected = computed(() => props.options[selectedIndex.value]);
const floated = computed(() => open.value || !!selected.value || !!props.placeholder);
const optionID = (index: number) => `${listID}-${index}`;

/** Places the menu under the trigger, or above it when there is no room below. */
function place() {
  const rect = trigger.value?.getBoundingClientRect();
  if (!rect) return;
  const gap = 4;
  const below = window.innerHeight - rect.bottom - gap - 8;
  const above = rect.top - gap - 8;
  const up = below < 200 && above > below;
  position.value = {
    left: `${Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 200) - 8))}px`,
    minWidth: `${Math.max(rect.width, 200)}px`,
    maxHeight: `${Math.min(320, up ? above : below)}px`,
    ...(up ? { bottom: `${window.innerHeight - rect.top + gap}px` } : { top: `${rect.bottom + gap}px` }),
  };
}

function enabledIndex(from: number, step: 1 | -1) {
  for (let index = from; index >= 0 && index < props.options.length; index += step) {
    if (!props.options[index]!.disabled) return index;
  }
  return -1;
}

function show(index = selectedIndex.value) {
  if (props.disabled || open.value) return;
  place();
  open.value = true;
  active.value = index >= 0 && !props.options[index]?.disabled ? index : enabledIndex(0, 1);
}

function close(refocus = true) {
  if (!open.value) return;
  open.value = false;
  active.value = -1;
  if (refocus) trigger.value?.focus();
}

function choose(index: number) {
  const option = props.options[index];
  if (!option || option.disabled) return;
  model.value = option.value;
  close();
}

function move(index: number) {
  if (index < 0) return;
  active.value = index;
  nextTick(() => document.getElementById(optionID(index))?.scrollIntoView({ block: 'nearest' }));
}

// Typing jumps to the next option whose label starts with the typed text.
let typed = '';
let typedTimer: ReturnType<typeof setTimeout> | undefined;
function typeahead(key: string) {
  clearTimeout(typedTimer);
  typed += key.toLowerCase();
  typedTimer = setTimeout(() => { typed = ''; }, 500);
  const start = open.value ? active.value : selectedIndex.value;
  const count = props.options.length;
  for (let offset = typed.length === 1 ? 1 : 0; offset <= count; offset += 1) {
    const index = (start + offset + count) % count;
    const option = props.options[index]!;
    if (!option.disabled && option.label.toLowerCase().startsWith(typed)) {
      if (open.value) move(index);
      else model.value = option.value;
      return;
    }
  }
}

function onKey(event: KeyboardEvent) {
  if (props.disabled) return;
  const last = enabledIndex(props.options.length - 1, -1);
  if (!open.value) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); show(); }
    else if (event.key === 'Home') { event.preventDefault(); show(enabledIndex(0, 1)); }
    else if (event.key === 'End') { event.preventDefault(); show(last); }
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) typeahead(event.key);
    return;
  }
  switch (event.key) {
    case 'ArrowDown': event.preventDefault(); move(enabledIndex(active.value + 1, 1)); break;
    case 'ArrowUp': event.preventDefault(); move(enabledIndex(active.value - 1, -1)); break;
    case 'Home': case 'PageUp': event.preventDefault(); move(enabledIndex(0, 1)); break;
    case 'End': case 'PageDown': event.preventDefault(); move(last); break;
    case 'Enter': case ' ': event.preventDefault(); choose(active.value); break;
    case 'Escape': event.preventDefault(); close(); break;
    case 'Tab': close(false); break;
    default:
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) typeahead(event.key);
  }
}

// Close on outside presses, and on scrolls or resizes that would detach the menu.
function onPointer(event: PointerEvent) {
  const target = event.target as Node;
  if (!trigger.value?.contains(target) && !list.value?.contains(target)) close(false);
}
function onViewportChange(event: Event) {
  if (event.type === 'scroll' && list.value?.contains(event.target as Node)) return;
  close(false);
}
watch(open, (value) => {
  if (value) {
    document.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('scroll', onViewportChange, true);
    window.addEventListener('resize', onViewportChange);
  } else {
    document.removeEventListener('pointerdown', onPointer, true);
    window.removeEventListener('scroll', onViewportChange, true);
    window.removeEventListener('resize', onViewportChange);
  }
});
onBeforeUnmount(() => { open.value = false; clearTimeout(typedTimer); });
</script>

<template>
  <div class="select" :class="[`select-${variant}`, { open, floated, disabled }, attrs.class]" :style="attrs.style as StyleValue">
    <button
      ref="trigger" v-bind="triggerAttrs" type="button" role="combobox" class="select-trigger" :disabled="disabled"
      aria-haspopup="listbox" :aria-expanded="open" :aria-controls="listID"
      :aria-activedescendant="open && active >= 0 ? optionID(active) : undefined"
      @click="open ? close() : show()" @keydown="onKey"
    >
      <span v-if="label && variant === 'outlined'" class="select-label">{{ label }}</span>
      <span class="select-value" :class="{ placeholder: !selected }">{{ selected?.label ?? placeholder ?? '' }}</span>
      <AppIcon name="dropdown" class="select-arrow" />
    </button>
    <Teleport to="body">
      <ul v-if="open" :id="listID" ref="list" role="listbox" class="select-menu" :aria-label="label ?? (attrs['aria-label'] as string | undefined)" :style="position">
        <li
          v-for="(option, index) in options" :id="optionID(index)" :key="index" role="option" class="select-option"
          :class="{ active: index === active, selected: index === selectedIndex }"
          :aria-selected="index === selectedIndex" :aria-disabled="option.disabled || undefined"
          @pointermove="!option.disabled && (active = index)" @click="choose(index)"
        >
          <span>{{ option.label }}</span>
          <AppIcon v-if="index === selectedIndex" name="done" class="select-check" />
        </li>
      </ul>
    </Teleport>
  </div>
</template>
