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
    <p v-if="notice" class="group-footer" style="padding-top: 8px">{{ notice }}</p>
    <p class="group-footer" style="padding-top: 8px">Remote Streamable HTTP servers with public access, a Bearer token, or OAuth. Legacy SSE and local command servers are not supported yet.</p>
    <p v-if="error" class="notice" role="alert" style="margin: 0 0 12px">{{ error }}</p>
    <div class="actions-row" style="margin-top: 0">
      <button type="button" class="button outlined" :disabled="busy" @click="refresh()"><AppIcon name="refresh" />Refresh connections</button>
    </div>
    <div v-if="connections === null" class="center"><span class="spinner" /> Loading connections…</div>
    <div v-else-if="!connections.length" class="group"><div class="text-block">No connections yet.</div></div>
    <label v-if="connections?.some(connection => connection.tools.length)" class="search-field">
      <AppIcon name="search" />
      <input v-model="toolQuery" type="search" maxlength="200" placeholder="Search tools" aria-label="Search tools">
    </label>

    <section v-for="connection in connections ?? []" :key="connection.id">
      <div class="group-title">{{ connection.name }}</div>
      <div class="group">
        <div class="text-block">
          <p style="overflow-wrap: anywhere; color: var(--text)">{{ connection.url }}</p>
          <p style="display: flex; flex-wrap: wrap; gap: 6px">
            <span class="chip" :class="connection.authType === 'oauth' && !connection.authenticated ? 'warning' : 'success'">
              {{ connection.authType === 'oauth' ? (connection.authenticated ? 'OAuth connected' : 'Authorization required') : connection.authenticated ? 'Bearer token' : 'Public access' }}
            </span>
            <span class="chip">{{ connection.tools.length }} tools loaded · {{ connection.tools.filter(tool => tool.allowed).length }} enabled<template v-if="toolQuery.trim()"> · {{ visibleTools(connection).length }} matching</template></span>
          </p>
          <p v-if="connection.oauthIssuer" style="overflow-wrap: anywhere">Issuer: {{ connection.oauthIssuer }}<br>Requested scopes: {{ connection.oauthScope }}</p>
          <p v-if="connection.authType === 'oauth'">Reauthorizing clears existing tool permissions. Review and enable them again afterward.</p>
        </div>
        <button v-if="connection.authType === 'oauth' && connection.oauthConfigured" type="button" class="button-row" :disabled="busy" @click="authorize(connection.id)"><AppIcon name="key" />Authorize / Reauthorize</button>
        <button v-if="connection.authType === 'oauth'" type="button" class="button-row" :disabled="busy" @click="configure(connection)"><AppIcon name="gear" />Configure OAuth</button>
        <button v-if="connection.tools.length" type="button" class="button-row" :disabled="busy || connection.tools.every(tool => tool.allowed) || (connection.authType === 'oauth' && !connection.authenticated)" @click="enableAll(connection)"><AppIcon name="check" />Enable all tools</button>
        <button type="button" class="button-row" :disabled="busy" @click="mutate(`/${connection.id}/refresh`, 'POST', {})"><AppIcon name="refresh" />Refresh tools</button>
        <button type="button" class="button-row danger" :disabled="busy" @click="disconnect(connection.id)"><AppIcon name="close" />Disconnect</button>
      </div>
      <template v-if="visibleTools(connection).length">
        <div class="group-title">Tools</div>
        <div class="group">
          <div v-for="tool in visibleTools(connection)" :key="tool.fingerprint" class="tool-row">
            <!-- The switch shows the saved permission until the confirmed change is stored. -->
            <label class="toggle">
              <span class="two-line"><strong>{{ tool.name }}</strong><span class="small">{{ tool.allowed ? 'Allowed without asking again' : 'Asks before running' }}</span></span>
              <input type="checkbox" role="switch" :checked="tool.allowed" :disabled="busy" :aria-label="`Allow ${tool.name} without asking again`"
                @change="($event.target as HTMLInputElement).checked = tool.allowed; permission(connection.id, tool)">
            </label>
            <div class="text-block" style="padding-top: 0">
              <p>{{ tool.description }}</p>
              <details><summary>Input schema</summary><pre>{{ JSON.stringify(tool.inputSchema, null, 2) }}</pre></details>
            </div>
          </div>
        </div>
      </template>
    </section>

    <form style="margin-top: 16px" @submit.prevent="connect">
      <div class="group-title" style="display: flex; align-items: center; justify-content: space-between; gap: 8px">
        {{ configureID ? 'Configure OAuth' : 'Add MCP server' }}
        <button v-if="!configureID" type="button" class="button secondary" style="min-height: 32px; padding: 0 16px" @click="gmail">Use Gmail settings</button>
      </div>
      <div class="group">
        <div class="field"><label for="mcp-name">Name</label><input id="mcp-name" v-model="name" :readonly="!!configureID" placeholder="My server" maxlength="80" required></div>
        <div class="field"><label for="mcp-url">URL</label><input id="mcp-url" v-model="url" :readonly="!!configureID" type="url" placeholder="https://example.com/mcp" aria-label="HTTPS endpoint" maxlength="2048" required></div>
        <div class="field">
          <label for="mcp-auth">Access</label>
          <AppSelect
            id="mcp-auth" v-model="authType" variant="plain" :disabled="!!configureID"
            :options="[{ value: 'none', label: 'Public access' }, { value: 'bearer', label: 'Bearer token' }, { value: 'oauth', label: 'OAuth' }]"
          />
        </div>
        <div v-if="authType === 'bearer'" class="field"><label for="mcp-token">Token</label><input id="mcp-token" v-model="token" type="password" placeholder="Optional" aria-label="Bearer token (optional)" autocomplete="off" maxlength="4096"></div>
        <template v-if="authType === 'oauth'">
          <p v-if="!callbackURL" class="text-block">OAuth requires a public HTTPS API configuration.</p>
          <p class="text-block">Wildcard discovers the OAuth settings and opens the provider's sign-in page. Authorizing an account does not enable tools.</p>
          <details class="text-block" :open="advancedOAuth" @toggle="advancedOAuth = ($event.target as HTMLDetailsElement).open">
            <summary>Advanced OAuth settings (optional)</summary>
            <div class="oauth-fields">
              <label class="text-field"><input v-model="issuer" type="url" placeholder=" " aria-label="Authorization server override"><span>Authorization server (automatic when empty)</span></label>
              <label class="text-field"><input v-model="scope" placeholder=" " aria-label="Requested scopes override" maxlength="2000"><span>Scopes (automatic when empty)</span></label>
              <label class="text-field"><input v-model="clientID" placeholder=" " aria-label="OAuth client ID" autocomplete="off" maxlength="2048"><span>Client ID (only if required)</span></label>
              <label class="text-field"><input v-model="clientSecret" type="password" placeholder=" " aria-label="OAuth client secret" autocomplete="off" maxlength="4096"><span>Client secret (if required)</span></label>
            </div>
            <p v-if="callbackURL" style="overflow-wrap: anywhere">OAuth redirect URI: <span class="code">{{ callbackURL }}</span></p>
            <p>Most servers need no manual settings. If you use your own client credentials, enter their trusted authorization server too. Google requires your own registered Web OAuth client marked for an AI-powered agent and Workspace preview access.</p>
          </details>
        </template>
        <label class="check-row"><input v-model="consent" type="checkbox" required><span>I understand and accept the data access and privacy changes described above.</span></label>
      </div>
      <div class="actions-row">
        <button v-if="configureID" type="button" class="button text" @click="configureID = null; clientSecret = ''; name = ''; url = ''">Cancel configuration</button>
        <button class="button" :disabled="busy || !consent || !name.trim() || !url.trim()">{{ authType === 'oauth' ? 'Continue to authorization' : 'Connect' }}</button>
      </div>
    </form>
  </div></div>
</template>

<style scoped>
.tool-row { display: flex; flex-direction: column; }
.oauth-fields { --field-bg: var(--md-surface-container); padding-top: 12px; }
</style>
