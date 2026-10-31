<script setup lang="ts">
import type { InvitationPreview } from '~/utils/types';

const chats = useChats();
const code = ref('');
const preview = ref<InvitationPreview | null>(null);
const shareMemory = ref(false);
const contributorConsent = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);
const validCode = computed(() => /^[a-f0-9-]{36}$/i.test(code.value.trim()));
const consented = computed(() => shareMemory.value && (!preview.value?.contributorModel || contributorConsent.value));

async function run(task: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try { await task(); }
  catch (failure) { error.value = errorMessage(failure); }
  finally { busy.value = false; }
}

const check = () => run(async () => {
  preview.value = await api<InvitationPreview>('contacts/sharing/preview', { json: { code: code.value.trim() } });
});

const join = () => run(async () => {
  const { contactID } = await api<{ contactID: string }>('contacts/sharing/accept', {
    json: { code: code.value.trim(), shareMemory: true, contributorConsent: contributorConsent.value },
  });
  await chats.refresh();
  await navigateTo(`/chats/${contactID}`, { replace: true });
});

watch(code, () => { preview.value = null; });
</script>

<template>
  <PageBar title="Join Shared Contact" back="/contacts" always-back />
  <div class="page">
    <div class="page-inner">
      <form class="group" @submit.prevent="check">
        <div class="field">
          <input v-model="code" type="text" placeholder="Invitation code" aria-label="Invitation code" autocomplete="off" spellcheck="false">
          <button type="submit" class="link-button" :disabled="!validCode || busy">Check</button>
        </div>
      </form>
      <p class="group-footer">Paste the code you received from the contact's creator.</p>
      <AppNotice v-if="error">{{ error }}</AppNotice>
      <template v-if="preview">
        <div class="group-title">Join {{ preview.name }}</div>
        <ConsentFields
          v-model:share-memory="shareMemory" v-model:contributor-consent="contributorConsent"
          :contributor-model="preview.contributorModel"
          :disclosure="[
            'Start your own empty chat with this contact. Its memories and presence are shared with other participants. Your schedules and notifications belong to you.',
            'The contact can share remembered facts about you with other participants. Your original messages and attachments are private. The creator can remove your access.',
          ]"
          memory-label="I agree to shared memories"
          contributor-note="Messages and shared memories sent to Meta may be used to train its models."
        />
        <p class="group-footer">Expires {{ fullDate(preview.expiresAt) }}.</p>
        <AppButton block :disabled="!consented || busy" @click="join">Join Contact</AppButton>
      </template>
    </div>
  </div>
</template>
