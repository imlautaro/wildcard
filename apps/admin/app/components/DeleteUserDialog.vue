<script setup lang="ts">
import type { UserSummary } from '~/utils/types';

// Destructive confirmation: the operator retypes the account's email, which the
// API checks again. The copy spells out what the cascade removes for others.
const props = defineProps<{ user: UserSummary }>();
const emit = defineEmits<{ close: []; deleted: [] }>();
const { deleteUser } = useAdmin();
const email = ref('');
const busy = ref(false);
const error = ref<string | null>(null);
const matches = computed(() => email.value.trim().toLowerCase() === props.user.email.toLowerCase());

async function confirm() {
  if (!matches.value || busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    await deleteUser(props.user, email.value.trim());
    emit('deleted');
  } catch (failure) {
    error.value = errorMessage(failure);
  } finally {
    busy.value = false;
  }
}

// Escape, a backdrop press and Cancel are ignored while the deletion runs.
function cancel() {
  if (!busy.value) emit('close');
}
</script>

<template>
  <AppSheet :title="`Delete ${user.name}?`" icon="delete" danger @close="cancel">
    <form :id="`delete-${user.id}`" @submit.prevent="confirm">
      <p>This permanently deletes <strong>{{ user.email }}</strong> and everything it owns. It can't be undone.</p>
      <ul class="consequences">
        <li>{{ plural(user.contacts, 'contact') }} and their chats, memories, tasks, documents and mini apps.</li>
        <li v-if="user.ownedAgents">{{ plural(user.ownedAgents, 'agent') }} they created, including for anyone they shared one with.</li>
        <li>Groups they own, with every member's messages in them.</li>
        <li>Their photo, attachments, sessions and messages they sent or requested in other people's groups.</li>
        <li>Shared task lists they created, tasks they created, were assigned or authorized for research/monitoring, documents they created or last edited, and their document revisions.</li>
      </ul>
      <p>Files and background workflows are removed asynchronously, with automatic retries if a service is unavailable.</p>
      <AppTextField v-model="email" label="Type the email to confirm" type="email" autocomplete="off" :disabled="busy" required />
      <AppNotice v-if="error">{{ error }}</AppNotice>
    </form>
    <template #actions>
      <AppButton variant="text" :disabled="busy" @click="cancel">Cancel</AppButton>
      <AppButton type="submit" :form="`delete-${user.id}`" variant="danger" :disabled="!matches" :loading="busy">Delete account</AppButton>
    </template>
  </AppSheet>
</template>

<style scoped>
form > p { margin: 0 0 var(--space-3); color: var(--md-on-surface-variant); font: var(--type-body-medium); }
.consequences { display: grid; gap: var(--space-1-5); margin: 0 0 var(--space-5); padding-left: var(--space-5); color: var(--md-on-surface-variant); font: var(--type-body-medium); }
</style>
