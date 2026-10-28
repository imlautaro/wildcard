# MCP connections

Wildcard can consume tools from remote MCP servers in private, human-initiated
contact chats. This is a first implementation, not universal MCP compatibility.
It uses the official TypeScript MCP SDK 1.32.2 on the existing Worker, D1 and
Workflows; it does not migrate contacts to Agents SDK or add Durable Objects.

## Connect and authorize

On iOS or web, open an existing contact's details, then **Connections**. Supply a
name, public HTTPS Streamable HTTP endpoint and authentication mode (public,
Bearer token, or OAuth). Accept the
privacy disclosure, then connect. Public/Bearer discovery initializes the remote server and
lists tools; it does not call a tool. All tools start disabled. Review each tool's
description and input schema, then choose **Allow without asking again** to grant
ongoing execution permission to this user/contact pair. This permission includes
writes and sends if the tool implements them; MCP annotations are not trusted as
proof of safety. Only connect trusted servers and enable understood tools.

A participant of a shared contact can connect their own server. Another
participant cannot list or use that connection. Connections are attached to the
user's private contact record, not to the shared agent. Existing sharing consent
does not authorize external account access. External calls require a direct human
turn: group conversations, group deliveries and scheduled turns cannot use MCP.

Refresh connections reloads saved configuration without contacting the server.
Refresh tools performs discovery again. A tool retains authorization only if its
name, complete description, input/output schemas and annotations match its approved
fingerprint. Changed tools require approval again; execution rediscovers the
catalog and rejects changed definitions even before a manual refresh. Disabling
or disconnecting blocks future admissions; an already admitted remote action may
finish. Disconnect deletes the encrypted token and configuration. Reconnect to
replace a token. Revoking the token at its provider also prevents future access.

## Privacy and model behavior

Connecting permanently marks this private conversation as isolated, including
its existing history. Private replies use `muse-spark-1.3` Standard regardless of
the deployment's Contributor setting. External results and replies stay in the
user's private chat. Human memory extraction stops for this contact; its human
memories and assistant self-memory sources are excluded from shared retrieval,
including the creator-contact path used by groups. Existing private source data
is retained, not deleted. The isolation marker survives disconnect, preventing
historical output from later reentering shared memory or Contributor inference.
Other participants' chats with the same agent retain their existing behavior.

Group posting/delegation and schedule creation/editing tools are unavailable in
this isolated private chat. This prevents exporting private connector-derived
history through those tools. Existing schedules can still be listed/canceled and
execute their previous instructions with Standard, without MCP access. These are
intentional restrictions of this first release; they must be disclosed before
connecting. Existing in-flight replies prevent connection creation. No guarantees
are made about a user manually copying data into another conversation.

Tool catalogs and results are untrusted evidence. The backend filters available
functions and rechecks permissions; the model cannot enable a tool. This does not
make arbitrary remote tools safe: trusted-server selection and explicit ongoing
permission are essential. Servers can change behavior without changing schemas.
Only textual result blocks enter model context. Resources, binary content,
embedded resource links, sampling, elicitation, roots and prompts are not exposed.
Data intentionally passed to an authorized tool leaves Wildcard for that server.

## Execution, retries and limits

The private model loop exposes `list_mcp_tools` and `call_mcp_tool`, with at most
six internal/external tool executions across two tool-enabled model rounds, then
a final answer. Arguments are checked against the approved JSON Schema. A D1
reservation is committed before each remote call. A turn's execution slot cannot
be reused for another action; canonical identical arguments for the same tool and
connection also cannot be submitted twice within that turn. Completed receipts
are reused on Workflow replay. The ledger survives changes of attempt number.

If the process stops after reservation or an external action times out, the
outcome is unknown and is not automatically replayed. An uncertain reservation
blocks any further remote execution in that same turn, even with different
arguments; an explicit remote error is also treated conservatively as uncertain. This trades availability
for protection from duplicate writes. It is not an exactly-once guarantee from
the remote provider. A separate human turn can authorize another action. Distinct
arguments can also represent semantically equivalent operations; the ledger
cannot infer provider semantics. Check the external service before retrying an
uncertain write. Connection permission is checked before receipt replay too.

Up to four connections per contact, 64 tools per server, one catalog page,
16 KB per schema, 1,000 schema nodes, depth 16, 16 KB call arguments, 24 KB catalog
context or textual result, 256 KB aggregate transport bytes per session and a
20-second session deadline. The deadline includes DNS, initialization and the
operation. Management requests are limited to 30 per account per minute. Calls
also inherit existing chat admission and Workflow time budgets. No automatic
remote action retries or transport reconnections are enabled.

Schemas use @cfworker/json-schema (2020-12), an interpreting validator that
works without eval/new Function in Workers. References, regex keywords,
unsupported schema dialects and excessive catalogs fail closed. Even a single incompatible tool can prevent catalog discovery. HTTPS
must use a public DNS hostname, default port, no credentials, query or fragment.
Redirects and off-endpoint transport requests are rejected. Public DNS addresses
are checked through Cloudflare DoH with Google Public DNS as an availability fallback; local, reserved and IP-literal endpoints are
rejected. DNS preflight is not a pinned resolution: production must retain the
Workers public egress boundary and no VPC/private-network bindings. Do not expose
local Wrangler development to untrusted users or endpoints. A deployment adding
private egress needs an enforcing outbound proxy before enabling arbitrary URLs.

## Infrastructure and retention

Required: existing Worker, D1, Better Auth secret and Meta API access to Standard.
Apply migration `0026_mcp_connections.sql` after prior migrations. Apply `0027_mcp_oauth.sql` afterward for OAuth state and credentials. No new
Cloudflare resource or runtime secret is required. OAuth can require a provider
project, enabled APIs, developer preview access and a registered OAuth client.
Configure `MCP_WEB_ORIGIN` as the exact public web origin; OAuth callbacks use the
public HTTPS `BETTER_AUTH_URL`. The
catalog and permissions are in `mcp_connection`; the sticky isolation marker is
in `mcp_private_contact`. Bearer tokens are AES-256-GCM encrypted with random IVs,
a HKDF-derived key from `BETTER_AUTH_SECRET`, and authenticated connection/user/
contact identifiers. Tokens are never returned by the API, placed in URLs,
passed to the model or logged. Protect D1 backups and the auth secret separately.
Rotating the auth secret requires reconnecting Bearer/OAuth connections unless an
explicit credential re-encryption migration is performed. Do not rotate it casually.

Execution arguments and bounded text results are private D1 records in
`mcp_execution`, retained with the source chat turn to support durable replay.
They may contain sensitive external data. Disconnect does not delete historical
receipts or chat messages. Contact/account deletion cascades through these
records. The ledger connection ID deliberately has no connection foreign key so
disconnect cannot erase duplicate-prevention receipts. Logs use fixed failure
messages; no remote exception bodies, token values or tool arguments are logged.

Independent setup uses the existing `npm ci`, auth setup and D1 provisioning.
There are no account-specific MCP identifiers in source. Local development uses
public synthetic MCP endpoints only; never copy production tokens into source or
demo fixtures. Production and staging must each use separate D1/auth secrets and
external tokens. The existing automatic release script applies migrations before
publishing committed/pushed source. Never deploy manually.

Rollback to code predating this feature is unsafe after private connector data
exists: old code does not understand isolation. Disable MCP admissions while
retaining Standard selection, memory filters and the ledger, or deploy a forward
fix. Do not drop tables/markers or roll back privacy filters. Network boundaries
and these restrictions are part of the feature's deployment contract.

## Client caching

Both clients keep session-only snapshots of connection metadata, including empty
lists, for up to eight contacts. User-entered Bearer tokens and OAuth client secrets are form-only and cleared on
leaving the screen and after submitting authorization; they never enter snapshot caches. iOS uses
`ContactsStore.mcpSnapshots` / `NavigationSnapshotCache`; web uses the bounded
session-reset-aware `useMcpConnections` map. The snapshot budget is approximately
8 MB of catalog JSON before framework overhead (four bounded catalogs/contact).
No disk cache of provider tokens, client secrets or catalog output is introduced.
Web sessionStorage temporarily retains only initiating flow/contact/connection/user
IDs across the browser round trip, never the code, verifier, token or client secret.
Completion removes that entry and strips the one-use proof from browser history.
Account/session reset removes pending web flow identifiers too.

Loaded entries render immediately while entry/explicit refresh revalidates saved
metadata. iOS also refreshes when the screen becomes active. Requests deduplicate;
mutation invalidates earlier reads and refreshes the authoritative snapshot.
Transient failures retain usable content. Access loss, account changes, contact
removal and eviction invalidate entries; late responses cannot restore them.
Cache state never grants backend permission. There is no catalog pagination in
this version. No mutation is automatically retried after leaving the page; after
a network failure, refresh metadata before repeating a management action.

## Compatibility and pending verification

OAuth authorization-code with S256 PKCE, public/confidential pre-registered clients,
automatic issuer/scope discovery, Client ID Metadata Documents, Dynamic Client
Registration where supported, and refresh tokens are implemented.
Implicit grants, device-code grants, client-credentials grants, provider endpoints containing query parameters, legacy SSE-only
servers, stdio commands, custom headers, large paginated catalogs and non-text
results remain unsupported. Full interoperability with a particular live server
is not established by static checks or by this feature's Gmail preset.

Static API TypeScript, web typechecking and complete iOS Simulator Swift
typechecking passed. Sixteen SQL statements compiled with EXPLAIN against an
empty schema containing all migrations at SQLite expression depth 100. This was
a local schema/statement compilation check, not a live D1 migration.
No functional tests, app builds, deployment, migration of a real database, external
account connection, tool execution or paid inference were performed for this
implementation. Before release, validate with synthetic services and data:

- Both clients: connect public and Bearer servers, empty catalogs, catalog review,
  approval/disable/change detection, refresh, disconnect, invalid token and errors.
- Transport: initialization, session headers, JSON/SSE responses over Streamable
  HTTP, redirects, private DNS, oversized/slow streams and cancellation.
- Authorization: two users with the same agent, deleted membership, permission
  changes during discovery, revocation before admission and during a call.
- Recovery: provider write followed by failure before result persistence, concurrent
  Workflow replay, changed call IDs/order, identical arguments with reordered keys,
  unknown outcomes and source deletion. No duplicate external write should occur.
- Privacy: connector text never reaches Contributor, shared memory/self-memory,
  group creator-contact retrieval, schedules or group-post tools, including after
  disconnect and account switching. Old data must remain isolated after rollback.
- UI: navigation reuse, empty/offline states, mutations, old responses arriving
  after refresh/removal, device gestures, accessibility and physical iOS navigation.

Reference: [MCP SDK client](https://ts.sdk.modelcontextprotocol.io/client),
[Cloudflare MCP](https://developers.cloudflare.com/agents/model-context-protocol/).

## OAuth setup and lifecycle

Select **OAuth** and continue with the MCP URL. Wildcard discovers the authorization
server from RFC 9728 metadata (including a WWW-Authenticate metadata URL), selects
challenge scopes first and resource-supported scopes second, and chooses Client ID
Metadata Documents or Dynamic Client Registration as advertised. It does not request
all scopes listed by a general-purpose authorization server. If no scopes are
advertised, scope is omitted and provider defaults/consent apply. With multiple
advertised issuers, the first is selected deterministically; the authorization
server's metadata issuer must match. The configured MCP server remains a trust
boundary and must be chosen carefully.

**Advanced OAuth settings (optional)** contains issuer/scope overrides and static
Client ID/secret inputs. Leave these empty for automatic configuration. An issuer
is mandatory only when supplying pre-registered credentials or when the server
cannot advertise one. Static credentials are never sent to an automatically chosen
issuer. A provider supporting neither metadata-document clients nor dynamic
registration gets a specific manual-client-required error. Google still needs its
own registered client; the Gmail preset expands advanced settings for this reason.
Review the saved issuer and requested scopes before reauthorizing. Configuration
stays encrypted; only public issuer/scope and status are displayed. Existing
reauthorization reuses saved configuration, whereas submitting the setup form
explicitly rediscovers/replaces it and clears previous tool approvals. A rotated
encryption key leaves disconnect/reconfiguration available.

For an independent installation, set public HTTPS `BETTER_AUTH_URL` and exact
`MCP_WEB_ORIGIN` in that environment's versioned Worker configuration. Register:

```text
https://YOUR_API_HOST/api/v1/mcp/oauth/callback
```

The UI displays the actual URI from the API. Register it as a **Web application**
redirect at the provider: the backend is the confidential client for both native
and web flows. Do not register the web completion route or the native custom
scheme at Google. Use distinct projects/clients and secrets for staging and
production. Public/Bearer connections still work with local HTTP auth setup;
OAuth requires a public HTTPS API, valid secure cookies and an HTTPS web origin.
No tunnel, Google project, OAuth application or account connection is provisioned
automatically. Existing Worker Builds applies both migrations when an authorized
commit/push eventually releases this work. No manual deployment is permitted.

**Gmail preset:** choose **Use Gmail settings** to fill the official endpoint,
`https://accounts.google.com` issuer and `gmail.readonly gmail.compose` scope URLs.
Provide your own Google Web OAuth Client ID and client secret; Google does not
support the dynamic registration path here. Enable Gmail API and Gmail MCP API in
your Google project, enroll in the Workspace Developer Preview where required,
configure consent/audience/test users and scopes, and mark the OAuth client
**Use this client for an AI-powered agent**. Review the current Google requirements
before public release, including restricted-scope verification and data policies.
You may reduce requested scopes; a tool permission cannot grant scopes Google did
not authorize. Enabling fewer tools also does not narrow the OAuth grant itself.
Google authorization requests include `access_type=offline` and `prompt=consent`
to obtain refresh tokens; these parameters are not sent to other issuers. Provider
consent is separate from Wildcard's individual tool approvals.

The encrypted `mcp_oauth` row holds pinned issuer metadata, client information,
access/refresh tokens and expiry; `mcp_oauth_flow` holds encrypted PKCE verifier,
authorization URL, and eventually the short-lived authorization code. State,
launch ticket, browser secret and completion proof are random 256-bit values;
lookup values are hashed. A pending flow lasts ten minutes, is bound to the exact
Wildcard session and connection, and is removed after completion/replacement or
by the existing Cron's bounded expired-flow cleanup. Session deletion also
cascades pending flows. No model sees provider tokens, secrets, codes or verifiers.

A single-use browser launch sets a host-only Secure/HttpOnly/SameSite=Lax cookie
before redirecting to the provider. Callback requires the matching cookie and
unexpired state, verifies an issuer parameter when present, consumes that browser
binding atomically, and returns a fresh one-use completion proof. It never
exchanges a code or installs tokens on its own. Finalization requires the same
signed-in Wildcard session, proof, flow ID, connection ownership and current
authorization generation. Thus a callback cannot link an external account to a
different signed-in user or finish a flow in another app/session. Provider denial
returns through the same completion path without storing tokens. Missing/wrong
cookie, invalid state, replay and expiry fail closed.

On web, the HTTPS API redirects to the fixed configured web completion route with
a fragment containing only flow ID and proof. The initiating tab must have matching
sessionStorage identifiers and a matching signed-in user; it strips the fragment,
finishes through the existing same-origin authenticated proxy, then discovers tools
and returns to Connections. If discovery fails, authorization can remain connected;
the user can refresh tools later. Full-page navigation avoids popup blocking.

On iOS, ASWebAuthenticationSession opens the API launch URL in a system browser
session and receives `wildcard://mcp/oauth-complete`. The native app validates the
scheme, host, path and exact flow, rejects account changes/navigation cancellation,
and finishes with its existing bearer session. The custom callback contains only
a proof, never a provider token/code. `Config/Info.plist` registers the `wildcard`
scheme; this is not a provider redirect URI. Losing app state or switching devices
requires starting authorization again. Browser cancellation leaves no installed
new token and pending state expires. Reauthorization replaces the pending generation.

Reauthorization deliberately clears old tool approvals and local tokens before
launching the browser. After completion, refresh tools and explicitly approve each
one again, including after changing the connected external account. OAuth and tool
permissions never override the permanent Standard/private-memory isolation marker.
The execution ledger records the OAuth generation: a turn cannot replay results or
start more actions for that connection under a different authorization generation.
Already admitted calls may finish; provider code does not participate in D1's
transactions. These are admission boundaries, not cancellation guarantees.

Before a session uses an expiring token, a D1 compare-and-set acquires a per-connection
refresh lease. Only that holder may store a rotated token. A concurrent holder gets
a retry-later error before external action execution. Failed/ambiguous refresh or
a stale lease requires reauthorization rather than replaying a possibly consumed
refresh grant. Missing refresh token is supported until expiry. A server 401 clears
the matching saved credential without automatically replaying the MCP request;
a changed newer token is not cleared by an older response. 403 is a permission
failure, not a reason to silently broaden scopes. Provider revocation is enforced
when requests fail; offline revocation is not detected without contacting the provider.

Disconnect deletes local OAuth configuration/tokens and cascades pending flows.
It does not revoke the provider's complete application grant or erase private chat
history/receipts. Users can revoke that grant in their provider account settings.
Provider revocation could affect other connections, so it is not silently requested.
Changing `BETTER_AUTH_SECRET`, callback host, web origin or app callback scheme
requires operators to update registration/configuration and restart pending flows.
Do not roll back to code unaware of OAuth generation or isolation tables.

## OAuth transport and verification limits

Discovery is credential-free. A WWW-Authenticate resource metadata URL may be
on another public HTTPS host, as permitted by RFC 9728, but its declared resource
must match the MCP origin and a compatible path before its issuer is trusted.
Explicit issuer overrides must match any advertised authorization-server list. Older servers lacking resource metadata may use the
explicit issuer fallback. Issuer discovery is limited to the SDK's well-known
URLs at that issuer, and the metadata issuer must match. Token exchange and refresh
send secrets only to the exact pinned token endpoint; registration uses only the
pinned registration endpoint. All these requests require public HTTPS/DNS, reject
redirects, are bounded to 64 KB and ten seconds including DNS, and never forward
a Wildcard bearer session. The normal MCP transport sends its access token only
to the configured MCP endpoint. Existing public-egress/DNS-rebinding caveats still
apply; an arbitrary-URL feature must never gain private network bindings.

Authorization URLs, callback codes and completion proofs are transient sensitive
URLs. Application code logs none of them. Infrastructure/proxy access logs must
avoid full query strings on OAuth routes; the provider's standard code callback
uses query parameters even though access/refresh tokens never appear in URLs.
Public callback responses set no-store, no-referrer, a restrictive CSP and frame
protection. Public launch/callback admission is limited to 60 requests per IP/minute;
authenticated management retains its 30/account/minute limit.

Current validation: API/web TypeScript and iOS Swift static checking; Info.plist
syntax checking; 38 MCP SQL statements compiled with EXPLAIN on an empty schema
containing migrations through 0027 and depth 100. This is not a functional OAuth
validation. No tests/builds, browser/device OAuth run, real provider registration,
Google account connection, paid inference, real database migration or deployment
was performed. Before release, validate synthetic provider flows for PKCE, DCR,
static confidential clients, absent resource metadata, missing/mismatched issuer,
private DNS/redirects, wrong cookie, expired/replayed state/proof, wrong session,
account switching, provider denial, cancellation, encrypted storage, lease races,
refresh rotation/crash recovery, disconnect and stale callbacks. Then validate a
consented Gmail test account in both clients, restricted scopes, Google offline
refresh, catalog compatibility and tool permissions. Keep all demo data fictional.

Sources: [Google Gmail MCP setup](https://developers.google.com/workspace/gmail/api/guides/configure-mcp-server),
[Apple browser authentication](https://developer.apple.com/documentation/authenticationservices/authenticating-a-user-through-a-web-service),
and the pinned SDK's `client/auth` declarations and implementation.

API and web Worker configuration set `observability.redact_query_string = true`
(supported by the pinned Wrangler schema), preserving logs/traces while removing
query strings from captured request URLs. Verify that redaction in the automatic
release and apply equivalent controls to any additional proxy/log exports.

## Automatic setup and Centralita

The public `/api/v1/mcp/oauth/client-metadata` document identifies Wildcard with
that exact HTTPS URL as client_id and advertises only the configured API callback.
It contains no user/session information or credentials. It is used only when the
authorization server advertises `client_id_metadata_document_supported`; otherwise
Wildcard uses the advertised registration endpoint. A static advanced client takes
precedence over either automatic mechanism. Providers can fetch this public
JSON without a Wildcard session. It uses the existing Worker/configuration and
introduces no secret, binding, migration or new callback scheme.

On October 27, 2026, a credential-free inspection of the user-supplied Centralita
endpoint `https://centralita-api.imlautaro.workers.dev/mcp` returned a 401 challenge
advertising the resource metadata URL and `centralita:read centralita:write`.
Its public metadata declares the exact MCP resource, issuer at the same origin,
`/oauth/register`, S256 PKCE and public clients (`none`). This supports the automatic
setup path without asking a user to supply issuer, scopes or Client ID. Only
public discovery was inspected: no client was registered, no account was connected
and no Centralita application data was accessed. A complete browser flow and tool
execution remain unverified.

The automatic-setup change passes API/web TypeScript, complete iOS Simulator Swift
static checking, diff checks and the existing 38-statement SQL compilation check.
No tests/builds or deployments were run for this change. Validate CIMD and DCR
end-to-end, scope precedence, absent/mismatched metadata, advanced overrides,
manual-client errors, reauthorization, cancellation and both client return paths
before claiming live-provider interoperability.

Protocol reference: [MCP authorization discovery, scope selection and client registration](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization).

## Troubleshooting connection setup

Both iOS and web display API-supplied setup errors with a random reference. Errors
distinguish the endpoint probe, resource/authorization metadata, client registration,
authorization request, saved configuration, flow storage and token exchange. A failed
DNS resolver request is separate from a hostname that does not resolve to public
addresses. These failures never skip the DNS safety check or broaden permissions.
Errors remain transient UI state and do not enter connection snapshot caches.

Operators can search Workers Logs for `mcp_connection_failure` and the displayed
reference. Records contain only a fixed stage, an allowlisted code, that random
reference and bounded DNS diagnostics (resolver name, record family, fixed reason,
and optional HTTP status); they never include remote exception text, URLs, account/contact IDs,
codes, proofs, credentials or request/response bodies. Existing query redaction
must remain enabled. Do not infer a need for manual client settings from a network
failure. Use Advanced OAuth settings only when the provider actually requires them.

The API explicitly enables `global_fetch_strictly_public`, which is required for
public calls to another Worker in the same zone, including this Centralita endpoint.
Without it Cloudflare can reject a call before Centralita's request handler runs.
This also preserves the documented public egress boundary. See
[Cloudflare Worker-to-Worker fetch](https://developers.cloudflare.com/workers/runtime-apis/fetch/).
The October 27 investigation confirmed valid public metadata and a missing routing
flag, but did not capture the hidden production exception or run a complete OAuth
flow. Validate the corrected route after automatic publication before declaring the
reported failure resolved. No client was registered or external account accessed
during this investigation.

### DNS availability and fallback

DNS safety checks query A and AAAA concurrently through Cloudflare's fixed HTTPS
JSON endpoint. If that resolver cannot complete the check because of a transport,
HTTP, malformed/truncated response or resolver failure, a single fallback queries
Google Public DNS at `https://dns.google/resolve`. Each provider has a three-second
deadline, bounded by the caller's existing deadline; each response is limited to
16 KB. The six-second worst-case resolver budget stays inside the existing ten-second
OAuth request and twenty-second MCP session deadlines. Only DNS queries are retried;
MCP actions, registration and token requests retain their existing retry rules.

Fallback never overrides NXDOMAIN, a complete empty address set or any private,
reserved or invalid IP address. Both families must complete successfully at one
provider before proceeding. One absent family is allowed if the other has public
addresses. A failed AAAA request cannot hide a private A answer, or vice versa:
both results settle before the fallback decision. Responses must identify the
requested question and record type. IP literals are validated before classification.
Both resolvers failing still blocks the connection; there is no fail-open path.

Resolvers receive only the public server hostname and record type. Google is used
only on availability failure and receives `edns_client_subnet=0.0.0.0/0` to avoid
sending a client subnet to authoritative servers. Neither resolver receives the
MCP path, user identifiers, credentials, authorization codes or token contents.
Checks remain request-scoped and uncached in both clients and the backend; stored
permissions and connection snapshots never bypass a new check. No new account,
binding, secret or migration is required. Keep both fixed resolver destinations
reachable from production and independent deployments. Do not replace them with
user-supplied URLs or remove `global_fetch_strictly_public`.

The reported reference `eaf11068-e933-4b48-97ae-1d0afa0031b6` identified a DNS
availability failure during the endpoint probe. Its older log did not preserve the
underlying transport/HTTP reason. The fallback and diagnostic changes pass API
TypeScript checking; production resolver recovery and a complete OAuth flow remain
unverified until this change is published and authorization is retried.

References: [Cloudflare DNS JSON API](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/)
and [Google Public DNS JSON API](https://developers.google.com/speed/public-dns/docs/doh/json).
