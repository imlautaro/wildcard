<script setup lang="ts">
import type { UserSummary } from '~/utils/types';

useHead({ title: 'Users' });
const { users, usersQuery, usersNext, errors, loadUsers, loadMoreUsers } = useAdmin();
const search = ref(usersQuery.value);
const deleting = ref<UserSummary | null>(null);
const message = ref<string | null>(null);
let debounce: number | undefined;

onMounted(() => loadUsers());
onBeforeUnmount(() => window.clearTimeout(debounce));
watch(search, (value) => {
  window.clearTimeout(debounce);
  debounce = window.setTimeout(() => loadUsers(value.trim()), 250);
});

function deleted() {
  const name = deleting.value?.email;
  deleting.value = null;
  message.value = `Deleted ${name}. File and background workflow cleanup is queued and retried automatically.`;
}
</script>

<template>
  <div class="page">
    <AppTopBar title="Users" contained="wide">
      <AppIconButton icon="refresh" label="Refresh" @click="loadUsers()" />
    </AppTopBar>
    <div class="page-inner wide">
      <AppSearchField v-model="search" label="Search users" placeholder="Search by name or email" maxlength="100" />
      <AppNotice v-if="message" tone="success" dismissible @dismiss="message = null">{{ message }}</AppNotice>
      <AppNotice v-if="errors.users">{{ errors.users }}</AppNotice>
      <AppLoading v-if="!users && !errors.users" fill />
      <AppEmptyState v-else-if="users && !users.length" :icon="usersQuery ? 'search' : 'people'"
                     :title="usersQuery ? 'No matches' : 'No accounts yet'"
                     :text="usersQuery ? 'No accounts match this search.' : 'Accounts appear here once people sign up.'" />
      <div v-else-if="users" class="table" role="table" aria-label="Accounts">
        <div class="table-row head" role="row">
          <span role="columnheader">Account</span>
          <span role="columnheader" class="num">Contacts</span>
          <span role="columnheader" class="num">Agents</span>
          <span role="columnheader" class="num">Groups</span>
          <span role="columnheader">Joined</span>
          <span role="columnheader">Last seen</span>
          <span role="columnheader"><span class="visually-hidden">Actions</span></span>
        </div>
        <div v-for="user in users" :key="user.id" class="table-row" role="row">
          <span role="cell" class="account">
            <strong>
              <span>{{ user.name }}</span>
              <AppChip v-if="user.superAdmin" tone="primary">Super admin</AppChip>
              <AppChip v-if="user.onboardingRequired">Setup pending</AppChip>
            </strong>
            <span class="small muted">{{ user.email }}</span>
          </span>
          <span role="cell" class="num" data-label="Contacts">{{ formatNumber(user.contacts) }}</span>
          <span role="cell" class="num" data-label="Agents">{{ formatNumber(user.ownedAgents) }}</span>
          <span role="cell" class="num" data-label="Groups">{{ formatNumber(user.groupCount) }}</span>
          <span role="cell" data-label="Joined">{{ formatDate(user.createdAt) }}</span>
          <span role="cell" data-label="Last seen">{{ user.lastActiveAt ? formatDate(user.lastActiveAt) : '—' }}</span>
          <span role="cell" class="actions">
            <AppIconButton icon="delete" :disabled="user.superAdmin"
                           :label="user.superAdmin ? 'Super admins can\'t be deleted here' : `Delete ${user.email}`"
                           @click="deleting = user; message = null" />
          </span>
        </div>
      </div>
      <div v-if="usersNext" class="center"><AppButton variant="outlined" @click="loadMoreUsers">Load more</AppButton></div>
      <p class="group-footer">Contacts are the conversations an account has; agents are the contacts it created, including shared ones. Last seen is when a session was last refreshed, accurate to about a day.</p>
    </div>
    <DeleteUserDialog v-if="deleting" :user="deleting" @close="deleting = null" @deleted="deleted" />
  </div>
</template>
