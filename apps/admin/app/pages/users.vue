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
    <header class="bar"><h1 class="title">Users</h1>
      <button class="icon-button" type="button" aria-label="Refresh" @click="loadUsers()"><AppIcon name="refresh" /></button>
    </header>
    <div class="page-inner wide">
      <label class="search">
        <AppIcon name="search" />
        <input v-model="search" type="search" placeholder="Search by name or email" aria-label="Search users" maxlength="100">
        <button v-if="search" class="icon-button" type="button" aria-label="Clear search" @click="search = ''"><AppIcon name="close" /></button>
      </label>
      <p v-if="message" class="notice success" role="status">{{ message }}
        <button class="icon-button" type="button" aria-label="Dismiss" @click="message = null"><AppIcon name="close" /></button>
      </p>
      <p v-if="errors.users" class="notice" role="alert">{{ errors.users }}</p>
      <div v-if="!users && !errors.users" class="center"><span class="spinner" /> Loading…</div>
      <p v-else-if="users && !users.length" class="empty">{{ usersQuery ? 'No accounts match this search.' : 'No accounts yet.' }}</p>
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
            <strong>{{ user.name }}<span v-if="user.superAdmin" class="chip">Super admin</span><span v-if="user.onboardingRequired" class="chip muted-chip">Setup pending</span></strong>
            <span class="small muted">{{ user.email }}</span>
          </span>
          <span role="cell" class="num" data-label="Contacts">{{ formatNumber(user.contacts) }}</span>
          <span role="cell" class="num" data-label="Agents">{{ formatNumber(user.ownedAgents) }}</span>
          <span role="cell" class="num" data-label="Groups">{{ formatNumber(user.groupCount) }}</span>
          <span role="cell" data-label="Joined">{{ formatDate(user.createdAt) }}</span>
          <span role="cell" data-label="Last seen">{{ user.lastActiveAt ? formatDate(user.lastActiveAt) : '—' }}</span>
          <span role="cell" class="actions">
            <button class="icon-button danger" type="button" :disabled="user.superAdmin"
                    :aria-label="user.superAdmin ? 'Super admins can\'t be deleted here' : `Delete ${user.email}`"
                    :title="user.superAdmin ? 'Remove from SUPER_ADMIN_USER_IDS first' : 'Delete account'"
                    @click="deleting = user; message = null"><AppIcon name="delete" /></button>
          </span>
        </div>
      </div>
      <div v-if="usersNext" class="center"><button class="button outlined" type="button" @click="loadMoreUsers">Load more</button></div>
      <p class="group-footer">Contacts are the conversations an account has; agents are the contacts it created, including shared ones. Last seen is when a session was last refreshed, accurate to about a day.</p>
    </div>
    <DeleteUserDialog v-if="deleting" :user="deleting" @close="deleting = null" @deleted="deleted" />
  </div>
</template>
