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
const detailID = ref<string | null>(null);
const formOpen = ref(false);
const detail = computed(() => connections.value?.find(connection => connection.id === detailID.value) ?? null);
function authLabel(connection: McpConnection) {
  return connection.authType === 'oauth' ? (connection.authenticated ? 'OAuth connected' : 'Authorization required') : connection.authenticated ? 'Bearer token' : 'Public access';
}
function summary(connection: McpConnection) {
  return connection.authType === 'oauth' && !connection.authenticated ? 'Needs authorization' : `${connection.tools.filter(tool => tool.allowed).length}/${connection.tools.length} tools`;
}
function openForm() {
  if (configureID.value) { configureID.value = null; clientSecret.value = ''; name.value = ''; url.value = ''; }
  formOpen.value = true;
}
function cancelForm() {
  if (configureID.value) { configureID.value = null; clientSecret.value = ''; name.value = ''; url.value = ''; }
  formOpen.value = false;
}
function configureFromDetail(connection: McpConnection) { configure(connection); detailID.value = null; formOpen.value = true; }
const supported = 'Remote Streamable HTTP servers with public access, a Bearer token, or OAuth. Legacy SSE and local command servers are not supported yet.';
const oauthInfo = "Wildcard discovers the OAuth settings and opens the provider's sign-in page. Authorizing an account does not enable tools. Most servers need no manual settings. If you use your own client credentials, enter their trusted authorization server too. Google requires your own registered Web OAuth client marked for an AI-powered agent and Workspace preview access.";
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
  else { name.value = ''; url.value = ''; consent.value = false; if (!error.value) formOpen.value = false; }
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
  if (!window.confirm('Disconnect this server? Future calls will be blocked. Actions already started may finish. Historical messages remain private.')) return;
  await mutate(`/${connection}`, 'DELETE');
  if (!error.value) detailID.value = null;
}
onMounted(() => { void refresh(); });
onBeforeUnmount(() => { token.value = ''; clientSecret.value = ''; });
useHead({ title: 'Connections' });
</script>
<template>
  <PageBar title="Connections" back="/account" always-back>
    <InfoButton label="Connections" :text="`${notice}\n\n${supported}`" />
    <button type="button" class="icon-button" aria-label="Refresh connections" :disabled="busy" @click="refresh()"><AppIcon name="refresh" /></button>
  </PageBar>
  <div class="page"><div class="page-inner">
    <p v-if="error && !detailID && !formOpen" class="notice" role="alert" style="margin: 0 0 12px">{{ error }}</p>
    <div class="group-title">Servers</div>
    <div v-if="connections === null" class="center"><span class="spinner" /> Loading connections…</div>
    <div v-else class="group">
      <div v-if="!connections.length" class="text-block">No connections yet.</div>
      <button v-for="connection in connections" :key="connection.id" type="button" class="button-row opens" @click="detailID = connection.id">
        <AppIcon name="link" />{{ connection.name }}<span class="row-value">{{ summary(connection) }}</span>
      </button>
      <button type="button" class="button-row" :disabled="busy" @click="openForm"><AppIcon name="plus" />Add server</button>
    </div>

    <AppSheet v-if="detail" :title="detail.name" @close="detailID = null">
      <div class="group">
        <div class="button-row static">Access<span class="row-value">{{ authLabel(detail) }}</span></div>
        <div class="text-block">
          <p style="overflow-wrap: anywhere">{{ detail.url }}</p>
          <p v-if="detail.oauthIssuer" style="overflow-wrap: anywhere">Issuer: {{ detail.oauthIssuer }}<br>Requested scopes: {{ detail.oauthScope }}</p>
        </div>
      </div>
      <div class="group" style="margin-top: 12px">
        <div v-if="detail.authType === 'oauth' && detail.oauthConfigured" class="button-row-with-info">
          <button type="button" class="button-row" :disabled="busy" @click="authorize(detail.id)"><AppIcon name="key" />{{ detail.authenticated ? 'Reauthorize' : 'Authorize' }}</button>
          <InfoButton label="Reauthorize" text="Reauthorizing clears existing tool permissions. Review and enable them again afterward." />
        </div>
        <button v-if="detail.authType === 'oauth'" type="button" class="button-row" :disabled="busy" @click="configureFromDetail(detail)"><AppIcon name="gear" />Configure OAuth</button>
        <button v-if="detail.tools.length" type="button" class="button-row" :disabled="busy || detail.tools.every(tool => tool.allowed) || (detail.authType === 'oauth' && !detail.authenticated)" @click="enableAll(detail)"><AppIcon name="check" />Enable all tools</button>
        <button type="button" class="button-row" :disabled="busy" @click="mutate(`/${detail.id}/refresh`, 'POST', {})"><AppIcon name="refresh" />Refresh tools</button>
      </div>
      <template v-if="detail.tools.length">
        <div class="group-title">Tools</div>
        <label v-if="detail.tools.length > 10" class="search-field" style="margin: 0 0 8px">
          <AppIcon name="search" />
          <input v-model="toolQuery" type="search" maxlength="200" placeholder="Search tools" aria-label="Search tools">
        </label>
        <div class="group">
          <div v-if="!visibleTools(detail).length" class="text-block">No matches</div>
          <!-- The switch shows the saved permission until the confirmed change is stored. -->
          <label v-for="tool in visibleTools(detail)" :key="tool.fingerprint" class="toggle">
            <span class="toggle-label">
              <span class="two-line"><strong>{{ tool.name }}</strong><span class="small">{{ tool.allowed ? 'Runs without asking' : 'Asks before running' }}</span></span>
              <InfoButton :label="tool.name" :text="`${tool.description}\n\nInput schema\n${JSON.stringify(tool.inputSchema, null, 2)}`" />
            </span>
            <input type="checkbox" role="switch" :checked="tool.allowed" :disabled="busy" :aria-label="`Allow ${tool.name} without asking again`"
              @change="($event.target as HTMLInputElement).checked = tool.allowed; permission(detail.id, tool)">
          </label>
        </div>
      </template>
      <div class="group" style="margin-top: 12px">
        <button type="button" class="button-row danger" :disabled="busy" @click="disconnect(detail.id)"><AppIcon name="close" />Disconnect</button>
      </div>
      <p v-if="error" class="notice" role="alert" style="margin: 12px 0 0">{{ error }}</p>
    </AppSheet>

    <AppSheet v-if="formOpen" :title="configureID ? 'Configure OAuth' : 'Add server'" @close="cancelForm">
      <template #header><InfoButton label="Supported servers" :text="supported" /></template>
      <form id="mcp-form" @submit.prevent="connect">
        <div v-if="!configureID" class="group">
          <button type="button" class="button-row" @click="gmail"><AppIcon name="mail" />Use Gmail settings</button>
        </div>
        <div class="group" style="margin-top: 12px">
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
        </div>
        <template v-if="authType === 'oauth'">
          <div class="group-title info-title">OAuth <InfoButton label="OAuth" :text="oauthInfo" /></div>
          <div class="group">
            <p v-if="!callbackURL" class="text-block" style="color: var(--danger)">OAuth requires a public HTTPS API configuration.</p>
            <details class="text-block" :open="advancedOAuth" @toggle="advancedOAuth = ($event.target as HTMLDetailsElement).open">
              <summary>Advanced (optional)</summary>
              <div class="oauth-fields">
                <label class="text-field"><input v-model="issuer" type="url" placeholder=" " aria-label="Authorization server override"><span>Authorization server (automatic when empty)</span></label>
                <label class="text-field"><input v-model="scope" placeholder=" " aria-label="Requested scopes override" maxlength="2000"><span>Scopes (automatic when empty)</span></label>
                <label class="text-field"><input v-model="clientID" placeholder=" " aria-label="OAuth client ID" autocomplete="off" maxlength="2048"><span>Client ID (only if required)</span></label>
                <label class="text-field"><input v-model="clientSecret" type="password" placeholder=" " aria-label="OAuth client secret" autocomplete="off" maxlength="4096"><span>Client secret (if required)</span></label>
              </div>
              <p v-if="callbackURL" style="overflow-wrap: anywhere">OAuth redirect URI: <span class="code">{{ callbackURL }}</span></p>
            </details>
          </div>
        </template>
        <!-- Consent covers this text, so it stays visible beside the checkbox. -->
        <div class="group" style="margin-top: 12px">
          <p class="text-block">{{ notice }}</p>
          <label class="check-row"><input v-model="consent" type="checkbox" required><span>I accept these data access and privacy terms.</span></label>
        </div>
        <p v-if="error" class="notice" role="alert" style="margin: 12px 0 0">{{ error }}</p>
      </form>
      <template #actions>
        <button type="button" class="button text" @click="cancelForm">Cancel</button>
        <button type="submit" form="mcp-form" class="button" :disabled="busy || !consent || !name.trim() || !url.trim()">{{ authType === 'oauth' ? 'Continue' : 'Connect' }}</button>
      </template>
    </AppSheet>
  </div></div>
</template>

<style scoped>
.button-row-with-info { display: flex; align-items: center; padding-right: 12px; }
.info-title { display: flex; align-items: center; gap: 4px; }
.oauth-fields { --field-bg: var(--md-surface-container); padding-top: 12px; }
</style>
