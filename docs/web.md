# Web app

`apps/web` is a Nuxt 4 single-page app that runs as its own Cloudflare Worker,
`wildcard-web`. It uses the same API as the iOS app and adds no API routes,
migrations, or data. The API Worker stays the only owner of D1, R2, Workflows,
and every credential.

## Architecture

```text
Browser ──same origin──▶ wildcard-web (Nuxt/Nitro, cloudflare_module preset)
                          ├─ static SPA assets (Workers static assets, ASSETS binding)
                          └─ /api/v1/** proxy ──service binding API──▶ wildcard-api
```

- **Session token.** Sign-in and sign-up go through the proxy. It takes the signed
  Better Auth token from `set-auth-token`, stores it in an `httpOnly`, `Secure`,
  `SameSite=Strict` cookie (`__Host-wildcard_session` in production builds), and returns only
  `{ user }`. It drops the unsigned `token` field from the body and the upstream
  `Set-Cookie`. Page JavaScript never sees the token.
- **Rebuilt requests.** Each proxied request is rebuilt from an allowlist:
  `Accept`, `Content-Type`, `Authorization` (from the cookie), and the inbound
  `CF-Connecting-IP`. Browser cookies, `Origin`, and Fetch Metadata never reach Better
  Auth, so its cookie-based origin checks don't apply. The client IP is forwarded so
  the API's per-IP auth rate limits stay per user. With the public `workers.dev` URL
  instead of the service binding, every web user would share one rate-limit bucket.
  Whether the service binding preserves that header is not verified yet; see
  [verification](#verification-status).
- **Allowed responses.** Only `Content-Type`, `Content-Length`, `Content-Disposition`,
  `Retry-After`, and `X-Content-Type-Options` are forwarded. Every proxied response is
  `Cache-Control: no-store`.
- **Cross-site protection.** Non-GET requests with a foreign `Origin`, or with
  `Sec-Fetch-Site` other than `same-origin`, get a 403. Paths with dot segments or
  encoded separators get a 404.
- **Expiry.** A 401 on an authenticated request clears the cookie. A successful
  `GET /api/v1/me` refreshes the cookie lifetime (7 days, matching the API session).
  Sign-out always clears the cookie, even when the API is unreachable.
- `ssr: false`: the app is private and behind sign-in, so server rendering would add
  cookie forwarding without any benefit.

## Features

Matching iOS:

- Email/password sign-up and sign-in, account name and photo, sign-out.
- Unified chat list of contacts and groups, ordered by latest message, with unread
  counts, sender prefixes, and an unread count in the tab title. It appears once both
  sources load; if one fails, available rows stay visible with Retry. Your own last
  message shows its receipt (and **You:** in groups), projected from the open
  conversation when that is newer than the server summary.
- Contacts directory with search, create, rename, photo (centered square JPEG,
  512 px, under 512 KB), delete, and leaving a shared contact.
- Private chats with persisted history, earlier pages, optimistic sends with
  idempotent UUIDs, reply retry, receipts (clock while sending, two checks once
  accepted, colored when the agent read it), Online/Typing/Last seen presence,
  activity leases (`open`/`typing`/`leave`, with no draft text), and image/PDF
  attachments up to 5 MB.
- [Quoted replies](replies.md) in private chats and groups, from a hover/touch reply
  button or **Reply** in the hold/right-click selector. Quotes scroll to and highlight
  the original, and the reply target is kept with the draft in the session cache.
  iOS also offers swipe-to-reply; the web app has no swipe gesture.
- Contact sharing: invite by account email or by code, revoke invitations, remove
  participants, join by code, and accept or decline received invitations. Shared-memory
  and Contributor consent are explicit, with the iOS disclosure text.
- Groups: create with consent, chat with sender names/avatars and attachments,
  reply progress and retry, invite by email, add your own contacts, member invite
  permissions, remove members/contacts, leave or delete. Sender labels use the same
  stable color as iOS (FNV-1a of group ID and sender identity over the iOS palette,
  dark inks in light mode and light tints in dark mode). [Delivery and read
  receipts](groups.md#delivery-and-read-receipts) match iOS: an own message shows a
  clock until accepted, then Sent, Received, and Read from the aggregate
  `receiptState`. The web app acknowledges downloaded history as received only while
  the group is visible, marks others' messages read once at least half of the row
  is on screen in a visible tab, confirms Home previews with `PUT
  /groups/receipts`, and refreshes older own messages with `GET
  /groups/:id/receipts`. Acknowledgements are deduplicated so one-second polling
  stays within the API's 120 writes per minute.
- Creator-only **Group Energy** in the contact editor: points out of capacity, a bar
  that turns orange at five or fewer points, the next recharge time, and **Reset Energy
  to 50**. See [energy](energy.md).

Not in the web app yet:

- **Voice dictation.** The API accepts only mono 16-bit 16 kHz WAV. `MediaRecorder`
  produces WebM/Ogg, so this needs client-side resampling and WAV encoding.
- **Push notifications.** Delivery is APNs-only. Web Push would need new API storage
  and VAPID keys.
- **Scheduled messages** (list/cancel), private-to-group requests, group photo
  editing, and the group "Confirm consent for future messages" action.
- **Interactive photo cropping.** Photos are center-cropped.

Polling replaces push while the tab is visible, with the same cadence as the iOS
session synchronizer: chat lists and the open conversation every second, energy every
five seconds while the editor is open, and invitations every 15 seconds. Returning to
the tab refreshes immediately. Requests never overlap: the next tick waits for the
previous one. Unread watermarks go through a session queue (a port of
`ReadAcknowledgementQueue`) that survives navigation, coalesces to the highest
sequence, and retries on the list tick.

## Caching

The web cache follows the [caching guide](caching.md#web-app). In short:
session-owned memory caches only, reset on sign-out, expiry, or account change, and
nothing private written to browser storage.

## Local development

```sh
npm ci
npm run auth:setup:local
npm run dev          # API on http://localhost:8787
npm run dev:web      # Web on http://localhost:3000
```

In `nuxt dev` the proxy calls the API over HTTP at `runtimeConfig.apiOrigin`
(default `http://localhost:8787`, override with `NUXT_API_ORIGIN`). Production
builds never use that URL; without the `API` service binding they return 503.
In `nuxt dev` the cookie is named `wildcard_session` and is not `Secure`.

```sh
npm run typecheck:web  # nuxt prepare + vue-tsc (static only)
npm run build:web      # local production build into apps/web/.output; does not publish
```

`vue-tsc` can't load the TypeScript 7 compiler the API uses, so
`apps/web/scripts/typecheck.mjs` runs it with an aliased TypeScript 6
(`typescript6`). Generated `.nuxt/` and `.output/` are ignored by Git.

## Release

The web Worker has its own Workers Builds project. See
[infrastructure](infrastructure.md#web-worker). Commit and push to release; never
deploy manually.

## Verification status

Checked locally on October 27, 2026, with fictional accounts and no Meta key (sends
return 503, so no model replies were generated). These checks were rerun for the
update matching iOS commits `7f3ed3a`–`d68dc5f`:

- `npm run typecheck:web`, `npm run typecheck`, and `npm run build:web` pass.
- The built Worker ran under `wrangler dev` with the generated
  `.output/server/wrangler.json`, using the `API` service binding to a local
  `wildcard-api`. Through it: the SPA shell and security headers; 401 without a
  session; sign-up and sign-in set `__Host-wildcard_session` with `HttpOnly`,
  `Secure`, `SameSite=Strict`, and a 7-day max age; the body omits `token`; sign-out
  expires the cookie; cross-site `Origin`/`Sec-Fetch-Site` writes get 403; contact
  create/list/rename; photo upload and download (identical bytes, `no-store`); chat
  history, activity `open`, and the send error path; sharing invitation codes; group
  create, messages, image attachment round trip, and read state.
- A headless Chrome run of the built Worker passed 29 UI checks: sign-in redirect,
  sign-up, the session cookie is hidden from `document.cookie`, contact creation, a
  failed send keeps Retry and Edit, Edit restores the draft, rename, sharing consent
  gating and code creation, group creation, adding your own contact, a group send,
  the unified list, dark mode, the mobile single-column layout with no horizontal
  overflow, sign-out, and sign-in again. With a second fictional account in a
  group: the sender label color equals the iOS palette value for that identity; a
  visible message from the other account becomes Read and its unread count clears;
  an own message goes Sent → Received → Read (colored) as the other account
  confirms; Home shows **You:** with the Read receipt; Group Energy shows 50 / 50
  and Reset works; the second account sees none of the first account's contacts.
  No JavaScript exceptions occurred, and there were no 429 responses (4 group receipt
  writes, 10 preview confirmations, and 4 read watermarks in the whole run).
- `npm run dev:web` proxies to the local API over HTTP with a plain `wildcard_session`
  cookie. Node's `fetch` adds `Sec-Fetch-Mode`, so the dev path sends the local API
  origin to satisfy Better Auth; production builds never take that branch.

Not yet verified: model replies and private read receipts (they need a model run),
group catch-up across more than 50 missed messages, PDF attachments in a browser,
photo selection through the file picker, session expiry over time, and rate-limit
behavior and `CF-Connecting-IP` forwarding on the real Cloudflare network.

## Message reactions

See [message reactions](reactions.md) for the shared iOS/web selector, actor and
message identity, agent tools, permissions, mutation retries, session cache freshness
and verification steps. Reactions use existing conversation synchronization and
add no unread messages or push alerts.

## Message replies

See [message replies](replies.md) for the shared iOS/web Reply actions, quote
payloads, target validation, agent context, cache behavior and verification steps.
Replies are ordinary messages that carry a quoted earlier message; they add no new
request type, store or notification.

## MCP Connections

**Account → Connections** configures public/Bearer/OAuth Streamable HTTP connectors
once and manages schemas and tool approvals. Contact details → Connections is a
simple assignment list for that account's connectors. Group details → Connections
lets each bot owner/adder explicitly grant its assigned connectors to that bot in
that group. Any human member can then request enabled tools; resulting responses
are visible to everyone. No group access is inferred from a private assignment.
Granting access permanently isolates the private chat or whole group from shared
memory and forces Standard. Persistent human facts and bot preferences continue
locally within that chat or group, matching iOS. Both grant confirmations explain
local memory retention and exclusion from other chats. Existing reply/history
payloads and session caches are unchanged. Private posting/schedule creation restrictions remain.
See [connections](connectors.md) for consent, permissions and pending verification.

OAuth connections use the same permissions and isolation as iOS, with a full-page
provider round trip and `/mcp/oauth-complete` return route. The tab stores only flow/
contact/connection/user IDs in sessionStorage, strips the completion proof fragment
before finalizing, and uses the existing session-cookie proxy. Provider credentials
stay encrypted in the API. Reauthorizing clears previous tool approvals. Configure
`MCP_WEB_ORIGIN` in the API and register its displayed HTTPS callback URI with the
provider; the web completion route is not the provider redirect URI. See the
[OAuth lifecycle](connectors.md#oauth-setup-and-lifecycle) and pending verification.

OAuth setup now discovers issuer/scopes and automatic client registration from the
MCP URL. Technical overrides and static credentials are inside **Advanced OAuth
settings (optional)** in web and iOS. Providers supporting client metadata documents
use the public API metadata document; others may use DCR. Google remains a manual
registered-client exception. See [automatic setup](connectors.md#automatic-setup-and-centralita)
for the public Centralita metadata inspection and remaining live-flow verification.

Web and iOS display the same API setup-stage error and diagnostic reference. DNS
availability, public-address rejection and provider setup failures have distinct
messages; errors stay in transient UI state, outside the connection cache. Operators
can find the matching sanitized record in Workers Logs. The API's explicit
`global_fetch_strictly_public` flag enables public calls to same-zone Workers such
as Centralita. This shared backend correction needs no client cache migration.
After automatic publication, verify opening provider authorization and returning
on both platforms; a static check does not establish a complete OAuth run. See
[connection troubleshooting](connectors.md#troubleshooting-connection-setup).

Both clients share the API's Cloudflare DNS safety check and redirect rejection.
The API uses Workers-compatible manual redirect mode and rejects 3xx responses
before the SDK can follow them. The temporary alternate resolver was removed after
identifying the unsupported redirect mode as the runtime defect. Checks remain
request-scoped and uncached; connection snapshots and pending OAuth navigation keep
their existing behavior. See [DNS safety](connectors.md#dns-safety-and-runtime-compatibility)
for provider disclosure, safe diagnostics and production/device verification.

The provider callback now returns a no-store HTTP 200 document before opening
the web completion route or native custom scheme. A nonce-bound script removes
the callback code/state query from history and replaces the document with the
fixed return destination; an escaped **Continue to Wildcard** link covers blocked
automatic navigation. This ends the provider's form redirect chain, preventing
its `form-action` policy from blocking the separate web origin or iOS scheme.
The page carries only the one-use proof and flow ID. Session-owned pending flow
state, fragment stripping, account/generation validation, tool permissions and
isolation remain unchanged. Start a new authorization after a previously blocked
return; the old callback already consumed its browser binding. Both clients use
this shared API fix. See [OAuth lifecycle](connectors.md#oauth-setup-and-lifecycle).

## Account model and closed registration

Both clients now sign in existing accounts only. Account offers Muse Spark 1.3 Standard/Contributor, with the same explicit Contributor acceptance and disclosure on iOS/web. The existing session profile caches the preference and web revalidates it in the background on Account mount. Model saves update cached profile/list/group flags and fence older reads without clearing drafts or pending sends.

See [model settings](model-settings.md) for the API, shared consent, cache behavior,
AI Gateway spending and pending runtime/device verification.
The shared API configuration temporarily bypasses AI Gateway after production
HTTP 502 failures. Both web and iOS keep their selected model, consent checks,
cached messages and retry behavior; direct Meta calls do not appear in gateway
spending metrics. Release through the automatic pipeline and retry a failed turn
to verify generation; no client update is required for this server configuration.

## Large MCP tool catalogs

Web and iOS share discovery of up to 256 tools across eight remote pages, with a
256 KB saved-catalog budget and 1 MiB transport budget per twenty-second session.
Common bounded date/month/UUID patterns are validated by a restricted finite regex
preflight; unsafe regexes and references remain blocked. Complete validated refreshes
replace the session snapshot and retain only unchanged fingerprint approvals.
Failed refreshes keep the prior snapshot. No permissions are enabled by discovery.
Both clients show loaded/enabled counts and a local Search tools field; query state
is transient and does not enter the catalog cache. The model can search/page its
24 KB authorized-tool listing. See [limits and safety](connectors.md#execution-retries-and-limits).

Both clients provide **Enable all tools** per connection with a single confirmation
covering the full loaded catalog, including search-hidden tools. One atomic PATCH
approves the exact reviewed fingerprint set; stale catalogs/concurrent changes fail
without partial approval. OAuth authorization is required before enabling. Empty or
fully enabled catalogs disable the action. Existing mutation invalidation and one
metadata reload update the session snapshot; no tools execute during approval and
future/changed tools stay disabled. See [bulk approval and verification](connectors.md#connect-and-authorize).

Account connection operations use `/me/mcp`; contacts and groups expose explicit
assignment endpoints. Account catalog cache is at most sixteen 256 KB catalogs;
access lists cache at most eight contact/group lists without schemas. All mutations
invalidate earlier reads; account changes and contact revocation invalidate affected
access metadata. Cached content stays visible during revalidation/failures. New
OAuth launches store `account` as return scope; legacy contact return state is
accepted but finishes only through the authenticated account route. Both platforms
require updates for migration 0029; runtime/device and staging migration verification
remain pending. See [migration and verification](connectors.md#account-connector-migration-and-verification).

Account uses `pages/account/index.vue` beside `account/connections.vue`, so the
Connections route renders as its own page without requiring a nested page outlet.

## Group analysis completion

Both web and iOS use the API's two-phase group reply pipeline: bounded tool
research followed by a separately validated, tool-free JSON decision. Formatting
recovery reuses saved research instead of repeating external actions. No new UI,
route, payload, polling or cache behavior is required; both clients keep existing
pending-turn IDs and display the final server reply or existing failure state.
See [generation limits and validation status](groups.md#reply-rounds-and-exclusive-attention)
and [cache behavior](caching.md#group-generation-checkpoints).
After an authorized automatic release, verify a fictional multi-step MCP analysis,
reopening/back navigation during generation, offline recovery, grant revocation
and account switching in both clients. Live/browser/device validation is pending.


## Failed reply presentation

Group failures sit directly below the source message and name the bot, matching
iOS; no detached footer remains. Group snapshots carry optional `sourceID`,
`sourceSequence` and `attempt`; the API omits failures resolved by a later response
from that same bot, with a second local check against loaded messages. Private
failure notices also disappear after a later assistant response. Existing cached
messages stay usable while reply snapshots refresh. The same **Retry reply** copy
and current-work disabling apply to group notices in both clients. Update API and
clients together; old API snapshots without source IDs are not assigned guessed
anchors. See [group recovery](groups.md#failed-replies-and-response-recovery) and
[private recovery](chats.md#failed-replies-and-response-recovery). No new client
endpoint, persistent store or permission is introduced.

## Markdown in bot replies

Private assistant replies and group messages with an agent sender use the shared
`MessageMarkdown` component. Its markdown-it renderer disables raw HTML, does not
load Markdown images, and permits only HTTP/HTTPS/mailto links. It memoizes HTML
for the current mounted message text; it does not store rendered output in the
conversation cache. Human text remains literal; bot list/quoted previews use plain text from parsed
Markdown, matching iOS. API and web import the same renderer/token walker from
`shared/messageMarkdown.ts`; computed output stays local to the mounted view.
The essential formatting contract, native iOS behavior, cache rules and pending
visual verification are documented in [bot message Markdown](chats.md#bot-message-markdown).
The API adds optional plain preview fields and cleans bot push bodies before
truncation; original message text and cache freshness remain unchanged. No new
service or infrastructure is required.
Install dependencies with the existing root `npm ci` workflow.

## Native iOS experiments

The web guide explains iOS automatic execution: timers/alarms default to running
without app confirmation while the requesting iPhone app is open. Other supported
tools are opt-in per contact; Calendar/location reminders and older requests keep
review. iOS permission prompts still apply. Browser turns cannot request or execute
Apple system actions, so there is no browser execution toggle or extra cache.
The guide also explains iOS in-app active cards, system countdown controls and
per-message operation receipts. Live AlarmKit/ActivityKit/speech state is confined
to the iPhone; browser chats do not import device IDs or display a fabricated live
timer. The shared backend now briefly waits for automatic device receipts and
supplies recent terminal outcomes only to native-enabled turns. Deploy that API
change before expecting revised bot confirmations; new UI alone cannot change the
old server's instructions. No new browser cache or network polling is added.
The iOS client can retry an explicit old-API capabilities rejection once without
the optional automatic-kind hint, preserving its message ID and content. Browser
messages omit native context and need no compatibility retry.

[Native experiments](native-experiments.md) are explicitly scoped to Apple system
frameworks and device execution. **Account → Native experiments** explains the
available iPhone capabilities and their permission/retention behavior. The web app
omits native context from messages, does not expose native tools to browser turns,
and does not execute or cache another device's requests. ActivityKit, AlarmKit,
EventKit, Core NFC, App Intents and the iOS Share extension have no matching browser
implementation in this change. Native UI and tool settings remain device-specific.

The iOS Account entry and native contact directory share the root navigation path,
including contact-tool pushes and Back navigation. This fixes an iOS-only issue
where a contact's tools could open behind a directly presented directory. The web
guide has no native contact-tools stack and needs no corresponding route change;
its existing session caches and browser navigation are unchanged.

On iOS, the per-contact entry is in **Contact details → Native experiments**, opened
by tapping the contact name/avatar in chat. It is available for existing owned and
shared contacts; there is no separate native-tools button in the chat toolbar.
This device-specific entry does not add executable native tools to the web client.

`/native/contact?agentID=<uuid>` is the browser fallback for contact Universal Links.
It uses the existing session-owned contact directory and accepted memberships to
resolve the agent, never the sender's contact ID. Existing cache refresh, request
deduplication and account reset apply; no parallel native link cache is added.
A link does not grant access or accept an invitation. Signed-out visitors sign in
and reopen the link. The public, server-side Apple association route bypasses SPA
auth and contains only public Team/App ID metadata. See [infrastructure](infrastructure.md#native-ios-experiments).

## Conversation initiative

Private contacts use the same server-side [initiative planner](initiative.md) as iOS, including while the browser is closed. Contact details provides the same Conversation initiative switch and copy for owners and shared-contact participants. The existing session-owned contact cache supplies the initial setting; background refresh and mutation responses update it, and generation guards reject late reads and session changes. Messages appear through ordinary conversation/list polling and unread updates; browser push is still unavailable. Migrations 0032–0033 and the API release are required. Verify reopen, refresh, offline/failure recovery, shared access revocation and account switching with fictional accounts; visual/runtime checks remain pending.

The faster cadence is shared by the API with iOS: a first review is due after 30 seconds, followed by minimum gaps of two and ten minutes. One-minute Cron scheduling adds jitter; no browser timer or extra requests are introduced. The planner encourages one short greeting continuation and increases space after unanswered messages, preserving all existing limits. No web bundle change is needed for these server timings; histories, polling and cache invalidation are unchanged. New prompt quality remains pending live verification; see [initiative](initiative.md#faster-cadence-validation).
