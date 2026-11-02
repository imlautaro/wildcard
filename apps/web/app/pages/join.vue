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
  <PageBar :title="$t('auth.join.title')" back="/contacts" always-back />
  <div class="page">
    <div class="page-inner">
      <form class="group" @submit.prevent="check">
        <div class="field">
          <input v-model="code" type="text" :placeholder="$t('auth.join.code')" :aria-label="$t('auth.join.code')" autocomplete="off" spellcheck="false">
          <button type="submit" class="link-button" :disabled="!validCode || busy">{{ $t('auth.join.check') }}</button>
        </div>
      </form>
      <p class="group-footer">{{ $t('auth.join.help') }}</p>
      <AppNotice v-if="error">{{ error }}</AppNotice>
      <template v-if="preview">
        <div class="group-title">{{ $t('auth.sharing.joinName', { name: preview.name }) }}</div>
        <ConsentFields
          v-model:share-memory="shareMemory" v-model:contributor-consent="contributorConsent"
          :contributor-model="preview.contributorModel"
          :disclosure="[$t('auth.sharing.contactDisclosure1'), $t('auth.sharing.contactDisclosure2')]"
          :memory-label="$t('auth.sharing.contactMemory')"
          :contributor-note="$t('auth.sharing.contactContributorNote')"
        />
        <p class="group-footer">{{ $t('auth.join.expires', { date: fullDate(preview.expiresAt) }) }}</p>
        <AppButton block :disabled="!consented || busy" @click="join">{{ $t('auth.join.join') }}</AppButton>
      </template>
    </div>
  </div>
</template>
