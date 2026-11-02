<script setup lang="ts">
// Shared avatar and photo controls for contacts and the account, like ProfileIdentityView:
// a camera button on the avatar changes the photo, and with `renamable` the name below it
// opens a sheet to rename. `showName` shows the name without editing it. `src` previews an
// unsent upload, `generating` marks a photo AI will create, and `generatable` adds
// "Generate with AI" to the photo sheet (emitting `generate`).
const props = defineProps<{ name: string; path: string | null; src?: string | null; editable?: boolean; busy?: boolean; renamable?: boolean; showName?: boolean; generating?: boolean; generatable?: boolean }>();
const emit = defineEmits<{ photo: [photo: Blob | null]; rename: [name: string]; generate: [] }>();
const hasPhoto = computed(() => !!(props.path || props.src));
const choosingPhoto = ref(false);
const renaming = ref(false);
const draftName = ref('');
const validName = computed(() => { const value = draftName.value.trim(); return value.length > 0 && [...value].length <= 100; });
function changePhoto() {
  if (hasPhoto.value || props.generatable) choosingPhoto.value = true;
  else picker.value?.click();
}
defineExpose({ choose: () => { if (props.editable && !props.busy) picker.value?.click(); } });
function startRename() { draftName.value = props.name; renaming.value = true; }
function rename() {
  if (!validName.value) return;
  renaming.value = false;
  if (draftName.value.trim() !== props.name) emit('rename', draftName.value.trim());
}
const picker = ref<HTMLInputElement>();
const problem = ref<string | null>(null);
const source = shallowRef<ImageBitmap | null>(null);
const loading = ref(false);
const { user } = useSession();
const route = useRoute();
let selection = 0;

function cancel() {
  selection += 1;
  source.value?.close();
  source.value = null;
  loading.value = false;
}

function confirm(photo: Blob) {
  if (!props.editable || props.busy || !source.value) return;
  cancel();
  emit('photo', photo);
}

watch(() => [user.value?.id, route.fullPath, props.editable, props.busy], cancel, { flush: 'sync' });
onBeforeUnmount(cancel);

async function choose(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  (event.target as HTMLInputElement).value = '';
  if (!file) return;
  if (!props.editable || props.busy) return;
  cancel();
  const current = selection;
  loading.value = true;
  problem.value = null;
  try {
    const bitmap = await photoCropSource(file);
    if (current !== selection) { bitmap.close(); return; }
    source.value = bitmap;
  }
  catch (error) { if (current === selection) problem.value = errorMessage(error); }
  finally { if (current === selection) loading.value = false; }
}
</script>

<template>
  <div class="identity">
    <div class="identity-avatar">
      <AppAvatar :name="name" :path="path" :src="src" :icon="generating && !src ? 'star' : undefined" :size="104" />
      <template v-if="editable">
        <button type="button" class="identity-camera" :aria-label="hasPhoto ? $t('contacts.identity.changePhoto') : $t('contacts.identity.addPhoto')" :disabled="busy || loading" @click="changePhoto">
          <span v-if="loading" class="spinner" /><AppIcon v-else name="camera" />
        </button>
        <input ref="picker" type="file" accept="image/jpeg,image/png,image/webp,image/gif" class="visually-hidden" tabindex="-1" @change="choose">
      </template>
    </div>
    <button v-if="renamable" type="button" class="identity-name" :disabled="busy" :aria-label="$t('contacts.identity.editName', { name })" @click="startRename">
      <span>{{ name || $t('contacts.identity.addName') }}</span><AppIcon name="compose" />
    </button>
    <h2 v-else-if="showName" class="identity-title">{{ name }}</h2>
    <p v-if="problem" class="small problem">{{ problem }}</p>
  </div>
  <PhotoCropDialog v-if="source" :source="source" @cancel="cancel" @save="confirm" />
  <AppSheet v-if="choosingPhoto" :title="$t('contacts.identity.photo')" @close="choosingPhoto = false">
    <AppListGroup>
      <AppListItem icon="image" @click="choosingPhoto = false; picker?.click()">{{ $t('contacts.identity.choosePhoto') }}</AppListItem>
      <AppListItem v-if="generatable" icon="star" @click="choosingPhoto = false; emit('generate')">{{ $t('contacts.identity.generatePhoto') }}</AppListItem>
      <AppListItem v-if="hasPhoto" icon="delete" danger @click="choosingPhoto = false; emit('photo', null)">{{ $t('contacts.identity.removePhoto') }}</AppListItem>
    </AppListGroup>
  </AppSheet>
  <AppSheet v-if="renaming" :title="$t('contacts.identity.name')" @close="renaming = false">
    <form @submit.prevent="rename">
      <AppListGroup><div class="field"><input v-model="draftName" type="text" maxlength="100" :aria-label="$t('contacts.identity.name')" autofocus></div></AppListGroup>
      <div class="actions-row">
        <AppButton variant="text" @click="renaming = false">{{ $t('common.cancel') }}</AppButton>
        <AppButton type="submit" :disabled="!validName">{{ $t('common.save') }}</AppButton>
      </div>
    </form>
  </AppSheet>
</template>

<style scoped>
.problem { margin: 0; color: var(--md-error); }
</style>
