<script setup lang="ts">
const message = ref('Completing authorization…');
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
      !/^[a-f0-9-]{36}$/.test(pending.connectionID) || !/^[a-f0-9-]{36}$/.test(pending.contactID)) throw new Error('Authorization does not match this signed-in session. Return to Connections and try again.');
    destination.value = `/contacts/${pending.contactID}/connections`;
    await api(`contacts/${pending.contactID}/mcp/${pending.connectionID}/oauth/finish`, { json: { flowID, proof } });
    forgetMcpConnections(pending.contactID);
    // Catalog discovery is separate; new permissions always start disabled.
    try { await api(`contacts/${pending.contactID}/mcp/${pending.connectionID}/refresh`, { json: {} }); }
    catch { message.value = 'Account authorized. Open Connections and refresh tools to review permissions.'; return; }
    await navigateTo(destination.value, { replace: true });
  } catch (failure) { message.value = errorMessage(failure); }
});
</script>
<template><PageBar title="Authorization" /><div class="page"><div class="page-inner"><p class="notice" role="status">{{ message }}</p><NuxtLink :to="destination" class="button">Return to Connections</NuxtLink></div></div></template>
