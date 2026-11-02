<script setup lang="ts">
// Modal sheet for a setting that needs more than one row (selectors, lists, details),
// matching the iOS sheets. A bottom sheet on narrow screens and a centered dialog
// otherwise. Built on <dialog>, so focus stays inside and Escape or a backdrop press
// emits `close`. AppSelect menus opened inside teleport into the dialog's top layer.
// With `icon` it becomes a Material basic dialog: a centered icon and headline and
// no close button, so the actions slot must offer the way out. `wide` fits forms.
defineProps<{ title: string; icon?: AppIconName; danger?: boolean; wide?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const strings = useUiStrings();
const dialog = ref<HTMLDialogElement>();
const titleID = useId();

onMounted(() => { dialog.value?.showModal(); });
onBeforeUnmount(() => { dialog.value?.close(); });
// The panel fills the dialog box, so a press that targets the dialog itself is on the backdrop.
function backdrop(event: MouseEvent) { if (event.target === dialog.value) emit('close'); }
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="sheet" :class="{ dialog: icon, wide }" :aria-labelledby="titleID" @cancel.prevent="emit('close')" @click="backdrop">
      <div class="sheet-panel">
        <AppIcon v-if="icon" :name="icon" class="sheet-icon" :class="{ danger }" />
        <header class="sheet-header">
          <h2 :id="titleID">{{ title }}</h2>
          <slot name="header" />
          <AppIconButton v-if="!icon" icon="close" :label="strings.close" :tooltip="false" @click="emit('close')" />
        </header>
        <div class="sheet-body"><slot /></div>
        <div v-if="$slots.actions" class="sheet-actions"><slot name="actions" /></div>
      </div>
    </dialog>
  </Teleport>
</template>
