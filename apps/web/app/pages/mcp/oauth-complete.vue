<script setup lang="ts">
// null while the authorization completes, so the default status follows the language.
const message = ref<string | null>(null);
const destination = ref('/');
onMounted(async () => {
  const params = new URLSearchParams(window.location.hash.slice(1));
  // Strip the one-use proof before any subsequent navigation or API call.
  history.replaceState(history.state, '', window.location.pathname);
  const flowID = params.get('flow'), proof = params.get('proof');
  const saved = sessionStorage.getItem('wildcard.mcp.oauth');
  sessionStorage.removeItem('wildcard.mcp.oauth');
  try {
    const pending = saved ? JSON.parse(saved) as { flowID: string; connectionID: string; contactID: string; userID: string } : null;
    if (!pending || pending.flowID !== flowID || !proof || pending.userID !== useSession().user.value?.id ||
      !/^[a-f0-9-]{36}$/.test(pending.connectionID) || (pending.contactID !== 'account' && !/^[a-f0-9-]{36}$/.test(pending.contactID))) throw new Error(translate('errors.oauthMismatch'));
    destination.value = '/account/connections';
    await api(`me/mcp/${pending.connectionID}/oauth/finish`, { json: { flowID, proof } });
    forgetMcpConnections('account');
    // Catalog discovery is separate; new permissions always start disabled.
    try { await api(`me/mcp/${pending.connectionID}/refresh`, { json: {} }); }
    catch { message.value = translate('account.connections.oauth.authorized'); return; }
    await navigateTo(destination.value, { replace: true });
  } catch (failure) { message.value = errorMessage(failure); }
});
</script>
<template>
  <PageBar :title="$t('account.connections.oauth.title')" />
  <div class="page"><div class="page-inner">
    <AppListGroup><p class="text-block message" role="status">{{ message ?? $t('account.connections.oauth.completing') }}</p></AppListGroup>
    <div class="actions-row"><AppButton :to="destination">{{ $t('account.connections.oauth.return') }}</AppButton></div>
  </div></div>
</template>

<style scoped>
.message { color: var(--md-on-surface); }
</style>
