<script setup lang="ts">
import type { McpConnection, McpPreset } from '~/composables/useMcpConnections';
const id = computed(() => 'account');
const { connections, callbackURL, presets, busy, error, refresh, mutate } = useMcpConnections(id);
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
// Connector library: a preset prefills the form and locks its endpoint and access mode.
const preset = ref<McpPreset | null>(null);
const libraryOpen = ref(false);
const libraryQuery = ref('');
const presetFor = (connectionURL: string) => presets.value.find(entry => entry.url === connectionURL) ?? null;
const connectedURLs = computed(() => new Set((connections.value ?? []).map(connection => connection.url)));
const library = computed(() => {
  const query = libraryQuery.value.trim().toLowerCase();
  const groups = new Map<string, McpPreset[]>();
  for (const entry of presets.value) {
    if (query && !`${entry.name} ${entry.description} ${entry.category}`.toLowerCase().includes(query)) continue;
    groups.set(entry.category, [...groups.get(entry.category) ?? [], entry]);
  }
  return [...groups].map(([category, entries]) => ({ category, entries }));
});
function resetForm() { configureID.value = null; preset.value = null; clientID.value = ''; clientSecret.value = ''; token.value = ''; name.value = ''; url.value = ''; authType.value = 'none'; issuer.value = ''; scope.value = ''; advancedOAuth.value = false; }
function choosePreset(entry: McpPreset) {
  resetForm();
  preset.value = entry; name.value = entry.name; url.value = entry.url; authType.value = entry.authType;
  issuer.value = entry.issuer ?? ''; scope.value = entry.scope ?? ''; advancedOAuth.value = !!entry.ownClient;
  libraryOpen.value = false; libraryQuery.value = ''; formOpen.value = true;
}
function configure(connection: { id: string; name: string; url: string }) {
  resetForm();
  configureID.value = connection.id; name.value = connection.name; url.value = connection.url; authType.value = 'oauth';
  // Presets without automatic client registration need their pinned issuer and scopes again.
  const match = presetFor(connection.url);
  preset.value = match;
  if (match?.ownClient) { advancedOAuth.value = true; issuer.value = match.issuer ?? ''; scope.value = match.scope ?? ''; }
}
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
  if (configureID.value || preset.value) resetForm();
  formOpen.value = true;
}
function cancelForm() {
  if (configureID.value || preset.value) resetForm();
  formOpen.value = false;
}
function configureFromDetail(connection: McpConnection) { configure(connection); detailID.value = null; formOpen.value = true; }
const libraryInfo = 'Official remote MCP servers from each provider, prefilled with their endpoint and access mode. You still review the privacy terms, sign in with the provider and approve each tool. Wildcard does not operate these servers, and providers can change them.';
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
  else if (!error.value) { resetForm(); consent.value = false; formOpen.value = false; }
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
</script>
<template>
  <PageBar title="Connections" back="/account" always-back>
    <InfoButton label="Connections" :text="`${notice}\n\n${supported}`" />
    <AppIconButton icon="refresh" label="Refresh connections" :disabled="busy" @click="refresh()" />
  </PageBar>
  <div class="page"><div class="page-inner">
    <AppNotice v-if="error && !detailID && !formOpen">{{ error }}</AppNotice>
    <div class="group-title">Servers</div>
    <AppLoading v-if="connections === null" label="Loading connections…" />
    <AppListGroup v-else>
      <div v-if="!connections.length" class="text-block">No connections yet.</div>
      <AppListItem v-for="connection in connections" :key="connection.id" icon="link" opens :value="summary(connection)" @click="detailID = connection.id">
        <template v-if="presetFor(connection.url)" #leading><ConnectorLogo :id="presetFor(connection.url)!.id" /></template>
        {{ connection.name }}
      </AppListItem>
      <AppListItem icon="grid" :disabled="busy || !presets.length" @click="libraryOpen = true">Browse connector library</AppListItem>
      <AppListItem icon="plus" :disabled="busy" @click="openForm">Add custom server</AppListItem>
    </AppListGroup>

    <AppSheet v-if="libraryOpen" title="Connector library" @close="libraryOpen = false; libraryQuery = ''">
      <template #header><InfoButton label="Connector library" :text="libraryInfo" /></template>
      <AppSearchField v-model="libraryQuery" label="Search connectors" maxlength="200" class="tool-search" />
      <p v-if="!library.length" class="text-block">No matches</p>
      <template v-for="group in library" :key="group.category">
        <div class="group-title">{{ group.category }}</div>
        <AppListGroup>
          <AppListItem v-for="entry in group.entries" :key="entry.id" opens :supporting="entry.description" @click="choosePreset(entry)">
            <template #leading><ConnectorLogo :id="entry.id" /></template>
            {{ entry.name }}
            <template #trailing><AppChip v-if="connectedURLs.has(entry.url)" tone="success">Connected</AppChip></template>
          </AppListItem>
        </AppListGroup>
      </template>
    </AppSheet>

    <AppSheet v-if="detail" :title="detail.name" @close="detailID = null">
      <AppListGroup>
        <AppListItem plain :value="authLabel(detail)">Access</AppListItem>
        <div class="text-block">
          <p class="wrap">{{ detail.url }}</p>
          <p v-if="detail.oauthIssuer" class="wrap">Issuer: {{ detail.oauthIssuer }}<br>Requested scopes: {{ detail.oauthScope }}</p>
        </div>
      </AppListGroup>
      <AppListGroup>
        <div v-if="detail.authType === 'oauth' && detail.oauthConfigured" class="button-row-with-info">
          <AppListItem icon="key" :disabled="busy" @click="authorize(detail.id)">{{ detail.authenticated ? 'Reauthorize' : 'Authorize' }}</AppListItem>
          <InfoButton label="Reauthorize" text="Reauthorizing clears existing tool permissions. Review and enable them again afterward." />
        </div>
        <AppListItem v-if="detail.authType === 'oauth'" icon="gear" :disabled="busy" @click="configureFromDetail(detail)">Configure OAuth</AppListItem>
        <AppListItem v-if="detail.tools.length" icon="check" :disabled="busy || detail.tools.every(tool => tool.allowed) || (detail.authType === 'oauth' && !detail.authenticated)" @click="enableAll(detail)">Enable all tools</AppListItem>
        <AppListItem icon="refresh" :disabled="busy" @click="mutate(`/${detail.id}/refresh`, 'POST', {})">Refresh tools</AppListItem>
      </AppListGroup>
      <template v-if="detail.tools.length">
        <div class="group-title">Tools</div>
        <AppSearchField v-if="detail.tools.length > 10" v-model="toolQuery" label="Search tools" maxlength="200" class="tool-search" />
        <AppListGroup>
          <div v-if="!visibleTools(detail).length" class="text-block">No matches</div>
          <label v-for="tool in visibleTools(detail)" :key="tool.fingerprint" class="toggle">
            <span class="toggle-label">
              <span class="two-line"><strong>{{ tool.name }}</strong><span class="small">{{ tool.allowed ? 'Runs without asking' : 'Asks before running' }}</span></span>
              <InfoButton :label="tool.name" :text="`${tool.description}\n\nInput schema\n${JSON.stringify(tool.inputSchema, null, 2)}`" />
            </span>
            <input type="checkbox" role="switch" :checked="tool.allowed" :disabled="busy" :aria-label="`Allow ${tool.name} without asking again`"
              @change="($event.target as HTMLInputElement).checked = tool.allowed; permission(detail.id, tool)">
          </label>
        </AppListGroup>
      </template>
      <AppListGroup>
        <AppListItem icon="close" danger :disabled="busy" @click="disconnect(detail.id)">Disconnect</AppListItem>
      </AppListGroup>
      <AppNotice v-if="error">{{ error }}</AppNotice>
    </AppSheet>

    <AppSheet v-if="formOpen" :title="configureID ? 'Configure OAuth' : preset ? `Connect ${preset.name}` : 'Add server'" @close="cancelForm">
      <template #header><InfoButton label="Supported servers" :text="supported" /></template>
      <form id="mcp-form" @submit.prevent="connect">
        <AppListGroup v-if="preset">
          <div class="preset-summary">
            <ConnectorLogo :id="preset.id" />
            <span class="two-line"><span>{{ preset.name }}</span><span class="small">{{ preset.description }}</span></span>
          </div>
          <p v-if="preset.note" class="text-block">{{ preset.note }}</p>
        </AppListGroup>
        <AppListGroup>
          <div class="field"><label for="mcp-name">Name</label><input id="mcp-name" v-model="name" :readonly="!!configureID" placeholder="My server" maxlength="80" required></div>
          <div class="field"><label for="mcp-url">URL</label><input id="mcp-url" v-model="url" :readonly="!!configureID || !!preset" type="url" placeholder="https://example.com/mcp" aria-label="HTTPS endpoint" maxlength="2048" required></div>
          <div class="field">
            <label for="mcp-auth">Access</label>
            <AppSelect
              id="mcp-auth" v-model="authType" variant="plain" :disabled="!!configureID || !!preset"
              :options="[{ value: 'none', label: 'Public access' }, { value: 'bearer', label: 'Bearer token' }, { value: 'oauth', label: 'OAuth' }]"
            />
          </div>
          <div v-if="authType === 'bearer'" class="field"><label for="mcp-token">Token</label><input id="mcp-token" v-model="token" type="password" :placeholder="preset ? 'Required' : 'Optional'" :aria-label="preset ? 'Bearer token' : 'Bearer token (optional)'" autocomplete="off" maxlength="4096"></div>
        </AppListGroup>
        <AppListGroup v-if="authType === 'oauth'" title="OAuth" :info="oauthInfo">
          <p v-if="!callbackURL" class="text-block callback-missing">OAuth requires a public HTTPS API configuration.</p>
          <details class="text-block" :open="advancedOAuth" @toggle="advancedOAuth = ($event.target as HTMLDetailsElement).open">
            <summary>Advanced (optional)</summary>
            <div class="oauth-fields">
              <AppTextField v-model="issuer" label="Authorization server (automatic when empty)" type="url" aria-label="Authorization server override" />
              <AppTextField v-model="scope" label="Scopes (automatic when empty)" aria-label="Requested scopes override" maxlength="2000" />
              <AppTextField v-model="clientID" label="Client ID (only if required)" aria-label="OAuth client ID" autocomplete="off" maxlength="2048" />
              <AppTextField v-model="clientSecret" label="Client secret (if required)" type="password" aria-label="OAuth client secret" autocomplete="off" maxlength="4096" />
            </div>
            <p v-if="callbackURL" class="wrap">OAuth redirect URI: <span class="code">{{ callbackURL }}</span></p>
          </details>
        </AppListGroup>
        <!-- Consent covers this text, so it stays visible beside the checkbox. -->
        <AppListGroup>
          <p class="text-block">{{ notice }}</p>
          <label class="check-row"><input v-model="consent" type="checkbox" required><span>I accept these data access and privacy terms.</span></label>
        </AppListGroup>
        <AppNotice v-if="error">{{ error }}</AppNotice>
      </form>
      <template #actions>
        <AppButton variant="text" @click="cancelForm">Cancel</AppButton>
        <AppButton type="submit" form="mcp-form" :disabled="busy || !consent || !name.trim() || !url.trim() || (preset?.authType === 'bearer' && !token.trim())">{{ authType === 'oauth' ? 'Continue' : 'Connect' }}</AppButton>
      </template>
    </AppSheet>
  </div></div>
</template>

<style scoped>
.oauth-fields { --field-bg: var(--md-surface-container); padding-top: var(--space-3); }
.wrap { overflow-wrap: anywhere; }
.callback-missing { color: var(--md-error); }
.tool-search { margin-bottom: var(--space-2); }
.preset-summary { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-4); }
</style>
