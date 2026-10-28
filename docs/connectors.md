# MCP connections

Wildcard can consume tools from remote MCP servers in human-initiated private
contact chats and explicitly authorized groups. This is a first implementation, not universal MCP compatibility.
It uses the official TypeScript MCP SDK 1.32.2 on the existing Worker, D1 and
Workflows; it does not migrate contacts to Agents SDK or add Durable Objects.

## Connect and authorize

On iOS or web, open **Account → Connections**. Supply a
name, public HTTPS Streamable HTTP endpoint and authentication mode (public,
Bearer token, or OAuth). Accept the
privacy disclosure, then connect. Public/Bearer discovery initializes the remote server and
lists tools; it does not call a tool. All tools start disabled. Review each tool's
description and input schema, then choose **Allow without asking again** to grant
ongoing execution permission for this account connector. Tool approvals apply to
every contact and group to which you grant access. This permission includes
writes and sends if the tool implements them; MCP annotations are not trusted as
proof of safety. Only connect trusted servers and enable understood tools.

Choose **Enable all tools** on a connection to approve its entire currently loaded
catalog with one confirmation, including tools hidden by Search tools. The confirmation
shows the server and tool count and discloses ongoing read/write/send access. It is
disabled for empty or fully enabled catalogs and OAuth connections awaiting authorization.
This grants permissions only; it does not execute tools. New or changed tools still
require approval after discovery or reauthorization.

Both clients send one `PATCH /me/mcp/:connectionID` with
`{ fingerprints: string[], allowed: true }`. The API requires the exact complete set
of current catalog fingerprints (1–256 unique SHA-256 values), checks account
ownership and OAuth authorization, and saves all permissions in one conditional update.
A stale catalog or concurrent mutation returns 409 without partial approval; refresh
connections and review again. Single-tool PATCH remains supported. Management request
bodies are bounded to 20,000 bytes to accommodate 256 fingerprints.

Then open a contact's **Connections** and switch on the account connector. Each
contact supports four assigned connectors; there is no repeated login or copied
credential. The contact receives access to tools enabled on that account connector.
Another participant's private contact cannot list or use your connector. Configuring
an account connector alone does not isolate a chat or grant any contact access.
Removing a contact preserves its account connectors; disconnecting an account
connector revokes every contact/group assignment and deletes encrypted credentials.

In **Group details → Connections**, the bot owner who added it can explicitly grant
its assigned connectors to that bot in that one group. The confirmation explains
that every human member may request reads, changes or sends and that responses may
expose external data to everyone in the group, including later joiners. Group
owners cannot grant another person's connectors. No group access is enabled by
migration or by assigning a connector to a private contact. Private contact access
is required throughout group use; revoking it also removes the associated group
grants. Removing the bot/member or disconnecting the connector blocks future calls.
Already admitted actions may finish. Previous messages and receipts remain.

Only a direct human message in that group can initiate external execution. Bot
continuations, private-to-group delegations, scheduled turns and draft reviews do
not get external tools. The bot uses the connector owner's account, even if another
member requests the action. Membership, bot ownership/adder, private assignment,
explicit group grant, authorization generation and unchanged tool schema are checked
again before execution. A later human message blocks new external admissions for
the older trigger. Group owners should grant only connectors they intend to
share with all current and future human members.

Refresh connections reloads saved configuration without contacting the server.
Refresh tools performs discovery again. A tool retains authorization only if its
name, complete description, input/output schemas and annotations match its approved
fingerprint. Changed tools require approval again; execution rediscovers the
catalog and rejects changed definitions even before a manual refresh. Disabling
or disconnecting blocks future admissions; an already admitted remote action may
finish. Disconnect deletes the encrypted token and configuration. Reconnect to
replace a token. Revoking the token at its provider also prevents future access.

## Privacy and model behavior

Granting a contact access permanently marks its private conversation as isolated, including
its existing history. Private replies use `muse-spark-1.3` Standard regardless of
the deployment's Contributor setting. External results and replies stay in the
user's private chat. Human facts and assistant persona/preferences continue to
be extracted with Standard into conversation-local memory. These sources are excluded from shared retrieval,
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
Only textual result blocks and a tool's `structuredContent` JSON object (only when it
fits in the 24 KB result limit together with the text, so it never displaces a text
result that fits) enter model context, so a
contact can design [mini apps](mini-apps.md) from the real result shape. Resources, binary content,
embedded resource links, sampling, elicitation, roots and prompts are not exposed.
Data intentionally passed to an authorized tool leaves Wildcard for that server.

Once group access is granted, `mcp_private_group` permanently marks the whole group.
New jobs and HTTP group processing use Standard, even after grants are revoked.
The entire group's history and memories are excluded from cross-group/private group
search and shared human/self-memory retrieval. Standard extraction retains human
facts and agent persona/preferences in stores scoped to that group; its own members
and agents can retrieve them there. Its members can still read that history in the group. Existing private-source
isolation remains independent. Private result turns from group delegations do not
become agent self memories. These conservative boundaries avoid carrying connector
output to another audience through later conversation. Existing in-flight Contributor
jobs do not gain MCP tools; their existing consent filters still apply.

## Execution, retries and limits

Private and authorized direct-human group model loops expose `list_mcp_tools` and
`call_mcp_tool`, with at most six internal/external executions. Private connector
chats (like every direct private chat) also expose `create_mini_app`/`list_mini_apps`. Every
non-scheduled private reply allows three tool-enabled rounds (for example list tools,
inspect a result, build a mini app) and a final answer; scheduled turns keep two. Group replies allow up to six
research rounds within a three-minute admission window, followed by a separate
tool-free strict-JSON decision. An internal `finish_group_research` control ends
research without consuming an execution or publishing anything. Group model/tool
steps checkpoint independently, and invalid/truncated decisions get one final-only
recovery attempt. No tool is re-executed to repair decision formatting; exhausted
research must disclose missing evidence. See [group generation limits](groups.md#reply-rounds-and-exclusive-attention). Arguments are checked against the approved JSON Schema. A D1
reservation is committed before each remote call. A turn's execution slot cannot
be reused for another action; canonical identical arguments for the same tool and
connection also cannot be submitted twice within that turn. Completed receipts
are reused on Workflow replay. The ledger survives changes of attempt number. Group execution uses a separate
reply-owned ledger, binds receipts to the explicit group grant generation and OAuth
generation, and rejects reused slots/uncertain actions across Workflow replay.
Draft reviews have no external tools, so they cannot repeat side effects.

If the process stops after reservation or an external action times out, the
outcome is unknown and is not automatically replayed. An uncertain reservation
blocks any further remote execution in that same turn, even with different
arguments; an explicit remote error is also treated conservatively as uncertain. This trades availability
for protection from duplicate writes. It is not an exactly-once guarantee from
the remote provider. A separate human turn can authorize another action. Distinct
arguments can also represent semantically equivalent operations; the ledger
cannot infer provider semantics. Check the external service before retrying an
uncertain write. Connection permission is checked before receipt replay too.

Up to sixteen account connectors, four assigned connectors per contact, 256 tools
per server, eight catalog pages,
16 KB per schema, 1,000 schema nodes, depth 16, 16 KB call arguments, 24 KB catalog
context or textual result, 256 KB per saved catalog, 1 MiB aggregate transport bytes per session and a
20-second session deadline. The deadline includes DNS, initialization and the
operation. Management requests are limited to 30 per account per minute. Calls
also inherit existing chat admission and Workflow time budgets. No automatic
remote action retries or transport reconnections are enabled.

Schemas use @cfworker/json-schema (2020-12), an interpreting validator that
works without eval/new Function in Workers. References, patternProperties,
unsupported schema dialects and excessive catalogs fail closed. Anchored finite
patterns up to 256 characters are admitted only after static preflight limits their
maximum match width to 256 and alternative combinations to 64. Literal characters,
character classes, simple character escapes, groups/alternation and exact repeats
on individual characters are supported. Variable/unbounded repetition, quantified
groups, lookarounds, backreferences and Unicode property escapes remain rejected.
Date/month and UUID patterns can therefore be enforced without admitting arbitrary
backtracking complexity. Preflight visits actual subschemas, so properties named
pattern or literal enum/const data are not mistaken for schema keywords. Even a
single incompatible tool still prevents catalog replacement; precise schema errors
explain the rejected feature without exposing tokens or remote exception bodies. HTTPS
must use a public DNS hostname, default port, no credentials, query or fragment.
Redirects and off-endpoint transport requests are rejected. Public DNS addresses
are checked through Cloudflare DoH; local, reserved and IP-literal endpoints are
rejected. DNS preflight is not a pinned resolution: production must retain the
Workers public egress boundary and no VPC/private-network bindings. Do not expose
local Wrangler development to untrusted users or endpoints. A deployment adding
private egress needs an enforcing outbound proxy before enabling arbitrary URLs.

## Infrastructure and retention

Required: existing Worker, D1, Better Auth secret and Meta API access to Standard.
Apply migration `0026_mcp_connections.sql` after prior migrations. Apply `0027_mcp_oauth.sql` afterward for OAuth state and credentials, then all
subsequent migrations including `0029_account_connectors.sql` for account ownership
and explicit contact/group grants. No new
Cloudflare resource or runtime secret is required. OAuth can require a provider
project, enabled APIs, developer preview access and a registered OAuth client.
Configure `MCP_WEB_ORIGIN` as the exact public web origin; OAuth callbacks use the
public HTTPS `BETTER_AUTH_URL`. The
catalog and account tool approvals are in `mcp_connector`; the sticky isolation marker is
in `mcp_private_contact`. Bearer tokens are AES-256-GCM encrypted with random IVs,
a HKDF-derived key from `BETTER_AUTH_SECRET`, and authenticated connection/user/
immutable credential-scope identifiers. Migration preserves the former contact ID
as an opaque credential scope without a contact foreign key, keeping ciphertext
and active OAuth flows valid after contact deletion. New connectors use a random
credential scope. Tokens are never returned by the API, placed in URLs,
passed to the model or logged. Protect D1 backups and the auth secret separately.
Rotating the auth secret requires reconnecting Bearer/OAuth connections unless an
explicit credential re-encryption migration is performed. Do not rotate it casually.

Execution arguments and bounded text results are private D1 records in
`mcp_execution` (private) and `mcp_group_execution` (group), retained with the source
chat turn/reply to support durable replay.
They may contain sensitive external data. Disconnect does not delete historical
receipts or chat messages. Deleting their source contact/group/account cascades through these records. Account
connectors survive contact deletion; account deletion removes them. The ledger connection ID deliberately has no connection foreign key so
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

New account configuration is limited to sixteen connectors. Migration preserves
legacy accounts with more connectors rather than dropping permissions or credentials;
those accounts cannot add more until below sixteen, and their complete metadata
snapshot can exceed the normal 4 MB budget. Review legacy counts in staging and
remove redundant connectors explicitly; no automatic merge or deletion is safe.

Both clients keep one session-only account catalog snapshot, including an empty
list, with up to sixteen 256 KB catalogs (approximately 4 MB JSON before framework
overhead). User-entered Bearer tokens and OAuth client secrets are form-only and
cleared on leaving the screen and after submitting authorization. iOS uses
`ContactsStore.mcpSnapshots` / `NavigationSnapshotCache`; web uses
`useMcpConnections` keyed by `account`. Contact/group access lists use the existing
iOS snapshot mechanism (`mcpAccessSnapshots`) and web `useMcpAccess`, each bounded
to eight lists. A contact list has at most sixteen connector names/IDs; a group
list has at most 32 bot/connector pairs (eight bots, four assignments each), without
tool schemas, tokens or private history.
No disk cache of provider tokens, client secrets or catalog output is introduced.
Web sessionStorage temporarily retains only initiating flow/contact/connection/user
IDs across the browser round trip (`account` replaces the contact ID for new flows), never the code, verifier, token or client secret.
Completion removes that entry and strips the one-use proof from browser history.
Account/session reset removes pending web flow identifiers too.

Loaded entries render immediately while entry/explicit refresh revalidates saved
metadata. iOS also refreshes when the screen becomes active. Requests deduplicate;
mutation invalidates earlier reads and refreshes the authoritative snapshot. Account
mutations invalidate access lists too; contact revocation invalidates group lists.
Reentry displays cached metadata immediately while revalidating in the background. Bulk
approval uses the same mutation path, retains content while saving, and reloads
server permissions once; it adds no cache or automatic retry.
Transient failures retain usable content. Access loss, account changes, contact
removal and eviction invalidate entries; late responses cannot restore them.
Cache state never grants backend permission. Remote discovery follows opaque
nextCursor values for up to eight pages under the same session deadline/byte budget,
rejecting repeated cursors, duplicate names, oversized cursors and incomplete catalogs.
Only a complete validated snapshot is saved; failed refresh retains the previous
snapshot and permissions. Clients receive that complete snapshot, not UI network pages.
Both clients show loaded/enabled counts and filter names/descriptions locally using
Search tools. Search is transient view state and makes no request; it does not alter
permissions. The model's list_mcp_tools supports optional query/offset and returns
nextOffset when its 24 KB page is full, so later authorized tools remain reachable. No mutation is automatically retried after leaving the page; after
a network failure, refresh metadata before repeating a management action.

For device/browser verification, check empty, partially enabled and fully enabled
catalogs, cancellation/confirmation with search active, a 256-tool catalog, stale
catalog rejection, offline recovery, reopen/back navigation, authorization loss and
account switching. Confirm all counts update together after success and no external
tool is executed by granting permission. Bulk approval UI/runtime verification remains
pending; static checks do not establish these behaviors on device.

## Compatibility and pending verification

OAuth authorization-code with S256 PKCE, public/confidential pre-registered clients,
automatic issuer/scope discovery, Client ID Metadata Documents, Dynamic Client
Registration where supported, and refresh tokens are implemented.
Implicit grants, device-code grants, client-credentials grants, provider endpoints containing query parameters, legacy SSE-only
servers, stdio commands, custom headers, catalogs exceeding the bounded limits and non-text
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
  group creator-contact retrieval, schedules or private group-post tools, including after
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

The HTTPS API callback finishes the provider's form navigation with HTTP 200 and
a small return page. A fresh CSP nonce allows only its fixed script and styles;
all other sources, forms, framing and base changes are blocked. The page removes
the provider code/state query from browser history before replacing itself with
the fixed app/web destination. An escaped **Continue to Wildcard** link is available
when automatic navigation is unavailable, including custom-scheme user-gesture
restrictions on iOS. No code, verifier, access token or refresh token enters the
page; only the existing short-lived completion proof is passed to the client.
Responses retain no-store/no-referrer and add nosniff. The page is not cached.

This document boundary avoids inheriting a provider's `form-action` restriction
across a callback-to-web/custom-scheme HTTP redirect. Centralita permits the
registered API callback origin, but its form policy does not include the separate
Wildcard web origin or native scheme. The API must not return a 302 from this
callback to either destination. Do not fix this by weakening provider CSP or
registering the web completion route as the provider callback. Browser-cookie,
state, issuer, proof, session and generation checks remain unchanged.

On web, the return page navigates to the fixed configured web completion route with
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
permissions never override permanent private-contact/group Standard and memory isolation markers.
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

### DNS safety and runtime compatibility

Workers rejects `redirect: 'error'` while constructing the request, before network
I/O. MCP uses `redirect: 'manual'` and rejects every 3xx response before returning
it to the SDK, so the SDK cannot follow even a same-origin redirect. DNS requests
also use manual mode and reject non-success HTTP responses. This applies to the
endpoint probe, discovery, registration, token exchange/refresh and ordinary MCP
requests; credentials are never forwarded to a redirect destination.

The October 27 production reattempt failed on both resolvers before I/O because
both used the unsupported redirect mode. The temporary Google fallback was removed
once that runtime defect was identified; no Google DNS dependency remains. The
required public routing flag remains enabled as a separate deployment requirement.

DNS checks query A and AAAA concurrently at the fixed Cloudflare HTTPS endpoint,
within the caller's existing ten-second OAuth or twenty-second MCP deadline.
Each response is limited to 16 KB and must identify the requested question and
record type. IP literals are validated before classification. Both families must
complete successfully; an absent family is allowed when the other returns public
addresses. Both results settle so an unavailable AAAA query cannot hide a private A
answer, or vice versa. NXDOMAIN, a complete empty address set, invalid/private IPs,
malformed/truncated responses and resolver/transport failures block the connection.
There is no alternate resolver retry or fail-open path.

Cloudflare receives only the public hostname and record type, without the MCP path,
user identifiers, credentials, authorization codes or token contents. Diagnostics
contain only fixed resolver/family/reason labels and optional HTTP status. Checks
are request-scoped and uncached in the API and both clients; stored permissions
and snapshots never bypass a new check. No new account, binding, secret or migration
is required. Keep Cloudflare DoH reachable and `global_fetch_strictly_public` enabled.

References: [Cloudflare DNS JSON API](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/)
and [Workers redirect-mode implementation](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/http.c%2B%2B).

## Account model override

Account now selects Standard/Contributor for ordinary chat jobs. MCP-isolated
private chats and groups continue to force Standard and retain conversation-local
memory without exporting it to shared memory, regardless of that preference. See [model settings](model-settings.md); no new MCP permission
is granted by changing the model.

## Account connector migration and verification

Migration 0029 copies each existing connection to an account connector with the
same ID, ciphertext, catalog, approvals and authentication mode, and grants only
its original contact access. It does not merge same-named/endpoints automatically,
create new group grants or call the provider. OAuth config, tokens, generation,
refresh locks and active flows are preserved when their foreign keys are rebound.
Legacy web OAuth return IDs are accepted only as return-state compatibility;
completion now uses the authenticated account endpoint and returns to Account.
Old native clients must be updated: contact endpoints now manage grants, not OAuth
or schemas. Coordinate the API/web/iOS rollout; migration-before-Worker publication
can briefly make old connector endpoints unavailable. No table rollback to 0028:
use a forward fix retaining isolation/grants/ledgers, or restore an authorized backup
and its matching code as a coordinated recovery. Do not deploy old privacy filters.

Static API/web/complete iOS Simulator typechecks and SQL compilation are validation
only. Verify migration with protected staging backups before production, including
active OAuth/refresh state and ciphertext preservation; no production migration or
real connector action was performed for this change. Runtime/browser/device checks
remain pending: configure once, assign to two contacts, authorize group sharing,
request from another member, reject non-owner grants and bot-triggered calls,
revoke contact/group/tool/OAuth access during calls, retry uncertain writes, change
accounts offline, delete contacts without losing account connectors, and confirm
Standard/isolation survives revocation. Use fictional tools and data for these checks.


## Local memory retention

MCP access isolates where memory can be recalled; it does not disable memory.
Private human facts stay in their contact profile; local bot preferences and group
human facts use migration `0030` stores. Disconnect/revocation retains the marker,
Standard selection, local memory and history, with no export to another audience.
The confirmation in both clients explains this boundary. Retrieval/extraction is
bounded and best effort; external tool results are not automatically turned into
human facts. See [conversation-local memory](memory.md#conversation-local-memory-with-mcp).

Before an authorized release, use fictional data to check local recall beyond the
recent-history window, matching-key separation between two groups, another user's
private chat, Standard selection when Account chooses Contributor, grant revocation,
isolation during extraction, and member/bot/source removal. These runtime checks
remain pending; the opt-in conversation-memory regression has not been executed.


## Reply recovery after MCP work

A failed final response does not establish that an MCP action failed. Group reply
recovery can use authorized checkpointed evidence without calling tools again;
private recovery explicitly lacks the original step's receipts and must disclose
uncertainty instead of inventing outcomes. Recovery cannot bypass revoked access,
OAuth/grant generations, ledger reservations, or memory/model isolation. It never
creates another external action. A fully unavailable model can still leave a
contextual failure with manual retry. See [group recovery](groups.md#failed-replies-and-response-recovery)
and [private recovery](chats.md#failed-replies-and-response-recovery).
