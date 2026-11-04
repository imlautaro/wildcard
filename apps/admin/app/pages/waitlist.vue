<script setup lang="ts">
import type { WaitlistEntry } from '~/utils/types';

// People who asked for early access while registration was closed (docs/admin.md#waitlist).
useHead({ title: 'Waitlist' });
const { waitlist, waitlistTotal, waitlistQuery, waitlistNext, errors, loadWaitlist, loadMoreWaitlist, deleteWaitlistEntry } = useAdmin();
const search = ref(waitlistQuery.value);
const removing = ref<string | null>(null);
const message = ref<string | null>(null);
const failure = ref<string | null>(null);
const platforms: Record<WaitlistEntry['platform'], string> = { ios: 'iPhone', web: 'Web', both: 'iPhone + Web' };
const languages: Record<WaitlistEntry['locale'], string> = { en: 'English', es: 'Spanish' };
let debounce: number | undefined;

onMounted(() => loadWaitlist());
onBeforeUnmount(() => window.clearTimeout(debounce));
watch(search, (value) => {
  window.clearTimeout(debounce);
  debounce = window.setTimeout(() => loadWaitlist(value.trim()), 250);
});

async function remove(entry: WaitlistEntry) {
  if (removing.value || !window.confirm(`Remove ${entry.email} from the waitlist?`)) return;
  removing.value = entry.id;
  message.value = null;
  failure.value = null;
  try {
    await deleteWaitlistEntry(entry);
    message.value = `Removed ${entry.email} from the waitlist.`;
  } catch (error) {
    failure.value = errorMessage(error);
  } finally {
    removing.value = null;
  }
}
</script>

<template>
  <div class="page">
    <AppTopBar title="Waitlist" contained="wide">
      <AppIconButton icon="refresh" label="Refresh" @click="loadWaitlist()" />
    </AppTopBar>
    <div class="page-inner wide">
      <AppSearchField v-model="search" label="Search the waitlist" placeholder="Search by name or email" maxlength="100" />
      <AppNotice v-if="message" tone="success" dismissible @dismiss="message = null">{{ message }}</AppNotice>
      <AppNotice v-if="failure" dismissible @dismiss="failure = null">{{ failure }}</AppNotice>
      <AppNotice v-if="errors.waitlist">{{ errors.waitlist }}</AppNotice>
      <AppLoading v-if="!waitlist && !errors.waitlist" fill />
      <AppEmptyState v-else-if="waitlist && !waitlist.length" :icon="waitlistQuery ? 'search' : 'mail'"
                     :title="waitlistQuery ? 'No matches' : 'Nobody is waiting'"
                     :text="waitlistQuery ? 'No one on the waitlist matches this search.' : 'While registration is closed, iOS and the web offer this list instead of sign-up.'" />
      <template v-else-if="waitlist">
        <p class="small muted">{{ plural(waitlistTotal, 'person', 'people') }} on the waitlist</p>
        <div class="table waitlist-table" role="table" aria-label="Waitlist">
          <div class="table-row head" role="row">
            <span role="columnheader">Person</span>
            <span role="columnheader">Platform</span>
            <span role="columnheader">Note</span>
            <span role="columnheader">Language</span>
            <span role="columnheader">Joined</span>
            <span role="columnheader"><span class="visually-hidden">Actions</span></span>
          </div>
          <div v-for="entry in waitlist" :key="entry.id" class="table-row" role="row">
            <span role="cell" class="account">
              <strong><span>{{ entry.name }}</span></strong>
              <span class="small muted">{{ entry.email }}</span>
            </span>
            <span role="cell" data-label="Platform">{{ platforms[entry.platform] }}</span>
            <span role="cell" class="note" data-label="Note">{{ entry.note || '—' }}</span>
            <span role="cell" data-label="Language">{{ languages[entry.locale] }}</span>
            <span role="cell" data-label="Joined" :title="entry.updatedAt !== entry.createdAt ? `Details updated ${formatDateTime(entry.updatedAt)}` : undefined">
              {{ formatDate(entry.createdAt) }}
            </span>
            <span role="cell" class="actions">
              <AppIconButton icon="delete" :label="`Remove ${entry.email}`" :disabled="removing === entry.id" @click="remove(entry)" />
            </span>
          </div>
        </div>
      </template>
      <div v-if="waitlistNext" class="center"><AppButton variant="outlined" @click="loadMoreWaitlist">Load more</AppButton></div>
      <p class="group-footer">Joining again with the same email updates the details and keeps the original date. Removing someone deletes this entry (the activity log keeps only its ID); it never affects an account. No IP address or device details are stored.</p>
    </div>
  </div>
</template>
