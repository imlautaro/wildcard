<script setup lang="ts">
// Modal sheet for a setting that needs more than one row (selectors, lists, details),
// matching the iOS sheets. A bottom sheet on narrow screens and a centered dialog
// otherwise. Built on <dialog>, so focus stays inside and Escape or a backdrop press
// emits `close`. AppSelect menus opened inside teleport into the dialog's top layer.
defineProps<{ title: string }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
const titleID = useId();

onMounted(() => { dialog.value?.showModal(); });
onBeforeUnmount(() => { dialog.value?.close(); });
// The panel fills the dialog box, so a press that targets the dialog itself is on the backdrop.
function backdrop(event: MouseEvent) { if (event.target === dialog.value) emit('close'); }
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="sheet" :aria-labelledby="titleID" @cancel.prevent="emit('close')" @click="backdrop">
      <div class="sheet-panel">
        <header class="sheet-header">
          <h2 :id="titleID">{{ title }}</h2>
          <slot name="header" />
          <button type="button" class="icon-button" aria-label="Close" @click="emit('close')"><AppIcon name="close" /></button>
        </header>
        <div class="sheet-body"><slot /></div>
        <div v-if="$slots.actions" class="sheet-actions"><slot name="actions" /></div>
      </div>
    </dialog>
  </Teleport>
</template>
