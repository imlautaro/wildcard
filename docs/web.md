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

Contact details links to Connections for public/Bearer remote Streamable HTTP servers,
matching iOS. Review schemas and explicitly authorize each tool. Connecting isolates
the private chat from shared memory permanently and selects Standard for private replies;
group posting and schedule creation/editing from that chat are disabled. See
[connections](connectors.md) for security, session caching, OAuth setup and
pending functional/device verification.

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

Both clients share the API's DNS availability fallback: Cloudflare first, Google
Public DNS once on availability failure, with bounded deadlines and complete
IPv4/IPv6 validation. Private or negative answers still block connection without
fallback. DNS checks stay request-scoped and uncached; connection snapshots and
pending OAuth navigation keep their existing behavior. See
[DNS availability](connectors.md#dns-availability-and-fallback) for provider disclosure,
safe diagnostics and remaining production/device verification.
