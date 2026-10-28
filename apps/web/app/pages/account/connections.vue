<script setup lang="ts">
import type { McpConnection } from '~/composables/useMcpConnections';
const id = computed(() => 'account');
const { connections, callbackURL, busy, error, refresh, mutate } = useMcpConnections(id);
const name = ref('');
const url = ref('');
const token = ref('');
const consent = ref(false);
const authType = ref<'none' | 'bearer' | 'oauth'>('none');
const issuer = ref('');
const scope = ref('');
const clientID = ref('');
const clientSecret = ref('');
const advancedOAuth = ref(false);
const configureID = ref<string | null>(null);
const toolQuery = ref('');
function visibleTools(connection: McpConnection) {
  const query = toolQuery.value.trim().toLowerCase();
  return connection.tools.filter(tool => !query || `${tool.name} ${tool.description}`.toLowerCase().includes(query));
}
type OAuthLaunch = { flowID: string; launchURL: string };
function gmail() { advancedOAuth.value = true; clientID.value = ''; clientSecret.value = ''; name.value = 'Gmail'; url.value = 'https://gmailmcp.googleapis.com/mcp/v1'; authType.value = 'oauth'; issuer.value = 'https://accounts.google.com'; scope.value = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose'; }
function configure(connection: { id: string; name: string; url: string }) { advancedOAuth.value = false; clientID.value = ''; clientSecret.value = ''; issuer.value = ''; scope.value = ''; configureID.value = connection.id; name.value = connection.name; url.value = connection.url; authType.value = 'oauth'; if (connection.url === 'https://gmailmcp.googleapis.com/mcp/v1') { advancedOAuth.value = true; issuer.value = 'https://accounts.google.com'; scope.value = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose'; } }
async function authorize(connectionID: string, config?: Record<string, string>) {
  const result = await mutate<OAuthLaunch>(`/${connectionID}/oauth/start`, 'POST', { platform: 'web', ...(config ? { rediscover: true, ...config } : {}) });
  clientSecret.value = '';
  if (result && typeof result === 'object') {
    const userID = useSession().user.value?.id;
    sessionStorage.setItem('wildcard.mcp.oauth', JSON.stringify({ flowID: result.flowID, connectionID, contactID: id.value, userID }));
    window.location.assign(result.launchURL);
  }
}
const notice = 'Configure a connector once, then grant contacts access from their Connections screen. Tool approvals apply to every contact and group you authorize. Only connect servers you trust. Enabled tools can read or change external data without asking again. Data is sent to the server and processed with Standard.';
async function connect() {
  let connectionID = configureID.value;
  if (!connectionID) {
    const created = await mutate<{ id: string }>('', 'POST', { name: name.value, url: url.value, authType: authType.value, ...(authType.value === 'bearer' && token.value ? { token: token.value } : {}), consent: consent.value });
    if (!created || typeof created !== 'object') return;
    connectionID = created.id;
    if (authType.value === 'oauth') configureID.value = connectionID;
  }
  token.value = '';
  if (authType.value === 'oauth') await authorize(connectionID, { ...(issuer.value.trim() ? { issuer: issuer.value.trim() } : {}), ...(scope.value.trim() ? { scope: scope.value.trim() } : {}), ...(clientID.value ? { clientID: clientID.value } : {}), ...(clientSecret.value ? { clientSecret: clientSecret.value } : {}) });
  else { name.value = ''; url.value = ''; consent.value = false; }
}
async function permission(connection: string, tool: { name: string; fingerprint: string; allowed: boolean }) {
  if (!tool.allowed && !window.confirm(`Allow ${tool.name} without asking again? It may read, change, or send external data. Only enable tools you understand and trust.`)) return;
  await mutate(`/${connection}`, 'PATCH', { fingerprint: tool.fingerprint, allowed: !tool.allowed });
}
async function enableAll(connection: McpConnection) {
  if (!window.confirm(`Enable all ${connection.tools.length} tools for ${connection.name} without asking again? This includes tools hidden by search. These tools may read, change, or send external data. Only enable tools you understand and trust.`)) return;
  await mutate(`/${connection.id}`, 'PATCH', { fingerprints: connection.tools.map(tool => tool.fingerprint), allowed: true });
}
async function disconnect(connection: string) {
  if (window.confirm('Disconnect this server? Future calls will be blocked. Actions already started may finish. Historical messages remain private.')) await mutate(`/${connection}`, 'DELETE');
}
onMounted(() => { void refresh(); });
onBeforeUnmount(() => { token.value = ''; clientSecret.value = ''; });
useHead({ title: 'Connections' });
</script>
<template>
  <PageBar title="Connections" back="/account" always-back />
  <div class="page"><div class="page-inner">
    <p class="group-footer">{{ notice }}</p>
    <p class="group-footer">Remote Streamable HTTP servers with public access, a Bearer token, or OAuth. Legacy SSE and local command servers are not supported yet.</p>
    <p v-if="error" class="notice" role="alert">{{ error }}</p>
    <button type="button" class="button" :disabled="busy" @click="refresh()">Refresh connections</button>
    <p v-if="connections === null" class="group-footer">Loading connections…</p>
    <p v-else-if="!connections.length" class="group-footer">No connections yet.</p>
    <div v-if="connections?.some(connection => connection.tools.length)" class="field"><input v-model="toolQuery" type="search" maxlength="200" placeholder="Search tools" aria-label="Search tools"></div>
    <section v-for="connection in connections ?? []" :key="connection.id" class="group" style="margin-top: 20px">
      <div class="text-block"><strong>{{ connection.name }}</strong><p style="overflow-wrap: anywhere">{{ connection.url }}</p><p>{{ connection.authType === 'oauth' ? (connection.authenticated ? 'OAuth connected' : 'Authorization required') : connection.authenticated ? 'Bearer token' : 'Public access' }}</p></div>
      <p v-if="connection.oauthIssuer" class="text-block" style="overflow-wrap: anywhere">Issuer: {{ connection.oauthIssuer }}<br>Requested scopes: {{ connection.oauthScope }}</p>
      <p class="text-block">{{ connection.tools.length }} tools loaded · {{ connection.tools.filter(tool => tool.allowed).length }} enabled<span v-if="toolQuery.trim()"> · {{ visibleTools(connection).length }} matching</span></p>
      <p v-if="connection.authType === 'oauth'" class="text-block">Reauthorizing clears existing tool permissions. Review and enable them again afterward.</p>
      <button v-if="connection.authType === 'oauth' && connection.oauthConfigured" type="button" class="button-row" :disabled="busy" @click="authorize(connection.id)">Authorize / Reauthorize</button>
      <button v-if="connection.authType === 'oauth'" type="button" class="button-row" :disabled="busy" @click="configure(connection)">Configure OAuth</button>
      <button v-if="connection.tools.length" type="button" class="button-row" :disabled="busy || connection.tools.every(tool => tool.allowed) || (connection.authType === 'oauth' && !connection.authenticated)" @click="enableAll(connection)">Enable all tools</button>
      <div v-for="tool in visibleTools(connection)" :key="tool.fingerprint" class="text-block">
        <strong>{{ tool.name }}</strong><p>{{ tool.description }}</p>
        <details><summary>Input schema</summary><pre style="white-space: pre-wrap; overflow-wrap: anywhere">{{ JSON.stringify(tool.inputSchema, null, 2) }}</pre></details>
        <button type="button" class="button" :disabled="busy" @click="permission(connection.id, tool)">{{ tool.allowed ? 'Disable tool' : 'Allow without asking again' }}</button>
      </div>
      <button type="button" class="button-row" :disabled="busy" @click="mutate(`/${connection.id}/refresh`, 'POST', {})">Refresh tools</button>
      <button type="button" class="button-row danger" :disabled="busy" @click="disconnect(connection.id)">Disconnect</button>
    </section>
    <form style="margin-top: 24px" @submit.prevent="connect">
      <div class="group-title">{{ configureID ? 'Configure OAuth' : 'Add MCP server' }}</div>
      <button v-if="!configureID" type="button" class="button" @click="gmail">Use Gmail settings</button>

      <div class="group">
        <div class="field"><input :readonly="!!configureID" v-model="name" placeholder="Name" aria-label="Server name" maxlength="80" required></div>
        <div class="field"><input :readonly="!!configureID" v-model="url" type="url" placeholder="https://example.com/mcp" aria-label="HTTPS endpoint" maxlength="2048" required></div>
        <div class="field"><label>Authentication <select v-model="authType" :disabled="!!configureID"><option value="none">Public access</option><option value="bearer">Bearer token</option><option value="oauth">OAuth</option></select></label></div>
        <div v-if="authType === 'bearer'" class="field"><input v-model="token" type="password" placeholder="Bearer token (optional)" aria-label="Bearer token (optional)" autocomplete="off" maxlength="4096"></div>
        <template v-if="authType === 'oauth'">
          <p v-if="!callbackURL" class="text-block">OAuth requires a public HTTPS API configuration.</p>
          <p class="text-block">Wildcard discovers the OAuth settings and opens the provider's sign-in page. Authorizing an account does not enable tools.</p>
          <details class="text-block" :open="advancedOAuth" @toggle="advancedOAuth = ($event.target as HTMLDetailsElement).open">
            <summary>Advanced OAuth settings (optional)</summary>
            <div class="field"><input v-model="issuer" type="url" placeholder="Authorization server (automatic when empty)" aria-label="Authorization server override"></div>
            <div class="field"><input v-model="scope" placeholder="Scopes (automatic when empty)" aria-label="Requested scopes override" maxlength="2000"></div>
            <div class="field"><input v-model="clientID" placeholder="Client ID (only if required by the provider)" aria-label="OAuth client ID" autocomplete="off" maxlength="2048"></div>
            <div class="field"><input v-model="clientSecret" type="password" placeholder="Client secret (if required)" aria-label="OAuth client secret" autocomplete="off" maxlength="4096"></div>
            <p v-if="callbackURL" style="overflow-wrap: anywhere">OAuth redirect URI: {{ callbackURL }}</p>
            <p>Most servers need no manual settings. If you use your own client credentials, enter their trusted authorization server too. Google requires your own registered Web OAuth client marked for an AI-powered agent and Workspace preview access.</p>
          </details>
        </template>
        <label class="text-block" style="display: flex; gap: 12px"><input v-model="consent" type="checkbox" required><span>I understand and accept the data access and privacy changes described above.</span></label>
      </div>
      <button class="button block" :disabled="busy || !consent || !name.trim() || !url.trim()">{{ authType === 'oauth' ? 'Continue to authorization' : 'Connect' }}</button>
      <button v-if="configureID" type="button" class="button" @click="configureID = null; clientSecret = ''; name = ''; url = ''">Cancel configuration</button>
    </form>
  </div></div>
</template>
