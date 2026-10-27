<script setup lang="ts">
// Shared avatar and photo controls for contacts and the account, like ProfileIdentityView.
defineProps<{ name: string; path: string | null; editable?: boolean; busy?: boolean }>();
const emit = defineEmits<{ photo: [photo: Blob | null] }>();
const picker = ref<HTMLInputElement>();
const problem = ref<string | null>(null);

async function choose(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  (event.target as HTMLInputElement).value = '';
  if (!file) return;
  problem.value = null;
  try { emit('photo', await squareJPEG(file)); }
  catch (error) { problem.value = errorMessage(error); }
}
</script>

<template>
  <div class="identity">
    <AppAvatar :name="name" :path="path" :size="104" />
    <div v-if="editable" class="actions">
      <button type="button" class="link-button" :disabled="busy" @click="picker?.click()">{{ path ? 'Replace photo' : 'Add photo' }}</button>
      <button v-if="path" type="button" class="link-button danger" :disabled="busy" @click="emit('photo', null)">Remove photo</button>
      <input ref="picker" type="file" accept="image/jpeg,image/png,image/webp,image/gif" class="visually-hidden" tabindex="-1" @change="choose">
    </div>
    <p v-if="editable" class="small muted" style="margin: 0">Photos are cropped to a centered square.</p>
    <p v-if="problem" class="small" style="color: var(--danger); margin: 0">{{ problem }}</p>
  </div>
</template>
