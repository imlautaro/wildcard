<script setup lang="ts">
import type { UserSummary } from '~/utils/types';

// Destructive confirmation: the operator retypes the account's email, which the
// API checks again. The copy spells out what the cascade removes for others.
const props = defineProps<{ user: UserSummary }>();
const emit = defineEmits<{ close: []; deleted: [storageComplete: boolean] }>();
const { deleteUser } = useAdmin();
const dialog = ref<HTMLDialogElement | null>(null);
const email = ref('');
const busy = ref(false);
const error = ref<string | null>(null);
const matches = computed(() => email.value.trim().toLowerCase() === props.user.email.toLowerCase());

onMounted(() => dialog.value?.showModal());

async function confirm() {
  if (!matches.value || busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    emit('deleted', await deleteUser(props.user, email.value.trim()));
  } catch (failure) {
    error.value = errorMessage(failure);
  } finally {
    busy.value = false;
  }
}

function cancel(event?: Event) {
  if (busy.value) { event?.preventDefault(); return; }
  emit('close');
}
</script>

<template>
  <dialog ref="dialog" class="dialog" aria-labelledby="delete-title" @cancel="cancel" @close="cancel()">
    <form method="dialog" @submit.prevent="confirm">
      <AppIcon name="delete" class="dialog-icon" />
      <h2 id="delete-title">Delete {{ user.name }}?</h2>
      <p>This permanently deletes <strong>{{ user.email }}</strong> and everything it owns. It can't be undone.</p>
      <ul class="consequences">
        <li>{{ plural(user.contacts, 'contact') }} and their chats, memories, tasks, documents and mini apps.</li>
        <li v-if="user.ownedAgents">{{ plural(user.ownedAgents, 'agent') }} they created, including for anyone they shared one with.</li>
        <li>Groups they own, with every member's messages in them.</li>
        <li>Their photo, attachments and sessions. Messages they sent in other people's groups stay, still showing their name, but are no longer linked to the account.</li>
      </ul>
      <label class="text-field">
        <input v-model="email" type="email" autocomplete="off" placeholder=" " :disabled="busy" required>
        <span>Type the email to confirm</span>
      </label>
      <p v-if="error" class="notice" role="alert" style="margin: 0 0 16px">{{ error }}</p>
      <div class="dialog-actions">
        <button type="button" class="button text" :disabled="busy" @click="cancel()">Cancel</button>
        <button type="submit" class="button danger" :disabled="!matches || busy">
          <span v-if="busy" class="spinner" /> Delete account
        </button>
      </div>
    </form>
  </dialog>
</template>
