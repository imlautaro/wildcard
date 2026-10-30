# Web app

Task work uses the shared server attention dispatcher, including
[Workflow ID recovery](tasks.md#workflow-id-recovery-october-29-2026). The correction
also applies to iOS. Existing foreground polling refreshes work indicators after
recovery; no API contract, cache lifetime or invalidation rule changes. Live backlog
recovery and browser/device presentation require verification after release.

[App branding](branding.md) uses the supplied background-inclusive logo on sign-in
and registration, plus the supplied favicon in both web and admin. Favicons use
a content version query to refresh older browser caches. These public assets are
bundled independently of account data; no session cache changes are needed.
iOS uses direct-bundle PNG resources for native launch and the matching vector in SwiftUI; see the
[native launch refresh and device verification](branding.md#native-launch-resource-refresh).
This system launch concern has no browser equivalent.

[Web research](web-research.md) is available through ordinary human chat requests,
with the same limits and permissions as iOS. Failed grounding checks are reported
separately from pending or uncertain operations. Document cards show **Web research**
and cited-source counts; the full-screen viewer expands the original query, check
date and cited/retrieved source links. Both clients accept source metadata from
provider annotations or report Markdown/bare links matched to completed search
hits. Only a default-port HTTP-to-HTTPS upgrade is allowed beyond exact URL
matching; original hit URLs remain in provenance. Unlinked hits remain retrieved-only.
When citations are missing, an optional tool-free synthesis uses validated
source IDs and server-built links. Preliminary reports disclose insufficient
evidence; both clients display them through the same document views and caches.
Provenance belongs to revision 1 even after
edits. It shares the existing document caches and five-second refresh, with no
search-on-open or separate download. Source links open on a human click. Ordinary bot,
scheduled and connector-isolated turns cannot research. Assigned tasks may use one
human-authorized exact public query; see [persistent work](persistent-work.md#public-research-permission-0055). Browser
presentation and functional research remain unverified.

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
  sources load; if one fails, available rows stay visible with Retry. Transient
  failures during background polling keep loaded rows silent (see
  [caching](caching.md#transient-failures-during-background-revalidation)). Your own last
  message shows its receipt (and **You:** in groups), projected from the open
  conversation when that is newer than the server summary.
- Contacts directory with search, create, rename, photo (manually cropped square JPEG,
  512 px, under 512 KB), delete, and leaving a shared contact.
- Private chats with persisted history, earlier pages, optimistic sends with
  idempotent UUIDs, reply retry, receipts (clock while sending, two checks once
  accepted, colored when the agent read it), Online/Typing/Last seen presence in
  the server's delivered → online → read → typing order, activity leases
  (`open`/`typing`/`leave`, with no draft text, which never connect the contact), and image/PDF
  attachments up to 5 MB.
- **Documents** (`/contacts/:id/documents/:documentID`, `/groups/:id/documents/:documentID`,
  `DocumentScreen`): viewer, Write/Preview editor, revisions, conflicts and delete;
  cards inside the sender's reply bubble and the Docs tab in details, matching iOS. See [documents](documents.md).
- **Tasks** (`/contacts/:id/tasks`, `/groups/:id/tasks`, `TaskBoard`), opened from the
  chat bar or details, matching iOS. A contact on a task work turn shows a "Working on
  “…”" row in the chat and in the header; the board marks contact tasks in progress with
  **Working** while execution is active. Both clients also show next step, evidence,
  blocked reason and work-turn consumption, with **Pause work**, **Resume work** and
  **Cancel task** in the editor. Pausing/reassignment/reopening retains the budget.
  Updates replace the existing session board cache; no separate downloads or polling
  are added. See [persistent work](persistent-work.md) and [tasks](tasks.md#seeing-the-work).
- **Shared in this chat** on contact details (`/contacts/:id/edit`) and group details
  (`/groups/:id/members`): Media and Docs tabs (`ChatMediaTabs`). See
  [attachments](attachments.md#shared-in-this-chat).
- In private chats and groups, tapping outside the message field blurs it and lets
  the mobile keyboard close. Drafts, attachments, reply targets, and cached history
  are retained without a network request. iOS dismisses the keyboard on a history
  tap and keeps interactive scroll dismissal. Mobile/device verification is pending.
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

Account and existing owned contact photos open **Crop Photo** before upload.
Drag to reposition, pinch or use the 1–4× zoom slider, and confirm with **Use Photo**.
The circular guide matches the avatar; arrow keys also reposition the image.
**Cancel** or Escape preserves the existing photo without a request. Sources stay
in memory only and are discarded on close, navigation or account change. See
[web photo editing](profile-photos.md#web-editing) for encoding and pending browser
checks. iOS retains its existing native cropper; this change is scoped to the web.

Not in the web app yet:

- **Push notifications.** Delivery is APNs-only. Web Push would need new API storage
  and VAPID keys.
- **Scheduled messages** (list/cancel), private-to-group requests, group photo
  editing, and the group "Confirm consent for future messages" action.

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

## Design

The web app follows Material 3 rather than the iOS look. The user scoped this
change to the web client: iOS keeps its native SwiftUI design, and behavior, copy,
and caching still match across clients. Manrope stays the typeface on both.

- **Tokens.** `app/assets/css/main.css` defines Material 3 color roles (`--md-*`)
  from a tonal-spot scheme seeded with the brand blue `#045de3`, which stays the
  light-mode primary. Dark mode uses the scheme's dark roles. Shape, elevation,
  and motion scales live beside them. Older names (`--accent`, `--surface`,
  `--separator`, …) remain as aliases so page and scoped styles keep working; use the
  `--md-*` roles in new code.
- **Components.** The shared classes keep their names and markup. `.button` is
  filled; `.button.secondary` (tonal), `.button.outlined`, and `.button.text` are the
  alternatives, with one filled action per task area. `.link-button` is a text
  button and `.icon-button` a standard 40 px icon button. `.group` renders a
  Material 3 expressive list: items separated by 2 px gaps inside one rounded block.
  `a.button-row` (navigation) trails a chevron; `button.button-row` (action) keeps
  the primary color. `.toggle` inputs are Material switches, `.text-field` is an
  outlined field with a floating label (used on sign-in), `.fab` is the
  extended floating action button for **New chat** in the chat list, and
  `.mini-tabs` is a navigation bar with an active indicator pill.
- **Forms.** `AppSelect` replaces every native `<select>`: a Material menu listbox
  following the WAI-ARIA select-only combobox pattern (arrow keys, Home/End,
  type-ahead, Escape, outside press). Its `outlined` variant has a floating `label`,
  `plain` fills a settings row whose `<label for>` sits outside, and `tonal` is the
  compact pill used for the remote device. The menu is teleported with fixed
  positioning, opens upward near the bottom of the viewport, and closes on page
  scroll or resize. Lists with more than ten options (countries, languages, speech
  accents) add a search field at the top of the menu: focus moves to it, typing on the
  closed trigger starts the search, matching is case- and accent-insensitive, arrows
  and Enter still choose, and scroll/resize (such as the on-screen keyboard) reposition
  the menu instead of closing it. The contact voice list adds the same search above
  more than ten voices. iOS matches this with `SearchablePicker` (a native `Picker` up
  to ten options, otherwise a searchable sheet) and a searchable voice list. Browser
  and device checks of the search fields (keyboard, screen readers, mobile keyboards)
  are pending.
- **Sheets and info.** `AppSheet` is the modal for settings with choices or details: a
  `<dialog>` that is a centered card on wide screens and a bottom sheet up to 600 px,
  closed by Escape, its close button or a backdrop press; `AppSelect` menus opened in it
  teleport into the dialog so they render above it. `InfoButton` replaces footer
  paragraphs with an info icon that opens the explanation in an `AppSheet`. Rows that
  open a sheet use `.button-row.opens` (chevron) with a trailing `.row-value`; switches
  use `.toggle-label` for a leading icon and info button. iOS equivalents are `.sheet`
  with `presentationDetents`, `InfoButton` (popover) and `SheetRow`. Screens using the
  pattern on both clients: [contact details](contacts.md#contact-details-layout),
  [Account](model-settings.md#account-layout), Connections (see MCP Connections below),
  [group details](groups.md#membership-and-consent) and [Personality](personality.md). Checkboxes that are not switches render as Material checkboxes;
  use `.check-row` for a consent beside its text, and switches (`.toggle`) for
  settings that take effect immediately. Two-line rows use `.two-line` with a
  `.small` supporting line. `.search-field`, `.chip`, `.code-box`, `details`, and
  `.actions-row` (end-aligned buttons) cover the remaining page patterns.
- **Layout.** On wide screens the chat list sits on the container color and the
  page renders in a rounded surface pane; below 860 px both are full-bleed.
- **State layers and ripple.** Interactive classes get a `currentColor` overlay
  (8% hover, 10% focus and press). `app/plugins/ripple.client.ts` adds the press
  ripple with one delegated `pointerdown` listener; the host list there and in
  `main.css` must stay in sync. Add `data-ripple` to opt an element in, or
  `data-no-ripple` to opt one out. Touch presses wait 90 ms and cancel when the
  pointer moves more than 10 px, so starting a scroll doesn't flash a row. Disabled
  controls and `prefers-reduced-motion` get no ripple. The wave renders in its own
  clipping layer, so hosts keep `overflow: visible` (icon-button badges).
- **Icons.** `AppIcon` renders Material Symbols (Rounded) through `@nuxt/icon` in SVG
  mode, so CSS that sizes `svg` still applies. `app/utils/icons.ts` maps each
  semantic name to an outline and a filled symbol (`<AppIcon name="heart" filled />`);
  `nuxt.config.ts` bundles exactly those icons into the client (about 80 icons,
  ~40 KB uncompressed). The provider is `none` with no API fallback and no server
  bundle, so the app never requests icons from Iconify and the Worker doesn't carry
  the multi-megabyte collection. Add new icons to the map only after confirming the
  name exists in `@iconify-json/material-symbols`.

Verification (October 29, 2026): `npm run typecheck:web` passes. A headless Chrome
harness using the real `main.css`, real Material Symbols, and representative
markup was checked in light, dark, and a 390 px viewport; the ripple plugin was
exercised there with synthetic mouse and touch events (press, disabled, scroll
cancel, quick tap, cleanup). The app itself was not run: pages against the live
API, real touch devices, and the production build are not yet visually verified.
`AppSelect` was compiled from its SFC and mounted with Vue in headless Chrome;
22 interaction checks pass (ARIA state, keyboard selection, disabled options,
type-ahead, Escape, outside press, external label, `null` values, upward
placement, and closing on container scroll). The group details, connections, and
onboarding layouts were checked as static markup in light and dark.

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

## Voice messages

Loaded messages now continue through chat navigation and hidden tabs. Supported
browsers expose a generic Voice message title, the sender profile photo (or a
neutral person avatar), and Media Session play/pause, stop,
seek and position/rate controls. Your sent clips use your account photo; group
clips use the specific sender, not the group photo. Artwork reuses the existing
private image cache with the active object URL pinned until playback stops.
Artwork loading does not delay audio. Recording stops playback; known access loss,
clear/delete and account reset clear audio and system metadata. Closing the tab or
browser ends playback, and browser/OS suspension can interrupt background audio.
iOS also enables native locked-screen playback and a 300 ms built-in-phone startup
margin with proximity-based receiver routing. Browsers cannot reliably access that
sensor or select the top receiver, so web keeps system routing and immediate play.
See [background playback](voice.md#background-playback-and-ear-routing) for
lifecycle, cache ownership and pending device/browser verification.


During playback, the sender avatar becomes a speed button cycling **1x → 1.5x →
2x → 1x**. It updates the current audio immediately and restores the avatar when
paused or finished. The shared player starts subsequent private/group messages,
pending clips and catalog samples at the selected rate. A validated, account-scoped
numeric preference persists in localStorage across reloads and sign-ins in this
browser; blocked storage falls back to session memory. Other devices/browsers and
live tabs do not synchronize this setting. Account resets stop playback and clear
the in-memory selection. See [playback speed](voice.md#playback-speed) for lifecycle,
caching and pending device/browser checks.

New replies use conversational delivery and moderate stability. Contact details →
**Voice → Speech accent** lets the creator select a shared regional preference,
including Argentine, or Voice default; members see it read-only. It applies to
new private and group audio on both clients. The API requires migration 0061.
This is an accent preference, independent of nationality; provider fidelity is
best effort. The existing voice remains selected, and sample buttons keep playing
their original recording. See [casual delivery](voice.md#casual-delivery-and-speech-accent-0061).
The selector renders from the session contact store, saves through the existing
mutation flow and upserts the server response, keeping the previous selection on
failure. Existing session reset, access-loss invalidation and revalidation rules
apply; no extra cache, persisted draft or provider request is added.
Browser playback and accent quality remain unverified for this change.

The contact voice picker uses the same backend catalog as iOS: ElevenLabs default
voices plus voices saved in the installation account's collection, with pagination
and duplicate IDs removed. The existing session cache and selection API apply.
After adding a marketplace voice, allow the one-hour server cache to expire and
start a new signed-in web session to reload the list. See [contact voices](voice.md#contact-voices)
for setup, account-wide visibility and pending device/browser verification.

Contact replies use server-side ElevenLabs `eleven_v4` synthesis, shared with iOS.
Only new replies use the selected model; existing audio and catalog previews keep
their original bytes and cache identity. Live v4 generation and listening quality
remain unverified for this model change. See [voice messages](voice.md).

The iOS-only composer corner adjustment uses a fixed 22-point radius as its text
field grows across lines in private chats and groups (see [chats](chats.md)). This
request was scoped to iOS; web composer styling and cache behavior are unchanged.

Private and group composers show a microphone instead of the send button while the
draft is empty and has no attachment, as on iOS ([voice messages](voice.md#web)):
hold to record and release to send, slide left to cancel, slide up to lock (Delete or
Stop), or press Space/Enter on the microphone for a locked recording.
`useVoiceRecorder.ts` records with `MediaRecorder` and renders the clip through an
`OfflineAudioContext` as mono 16-bit PCM WAV at 16 kHz, which is sent with the
message; nothing is transcribed before sending. `VoiceMessage.vue` plays voice
bubbles with plain play buttons, real-amplitude waveform bars tracking playback, and
sender avatars inside the bubble (yours on the left, incoming senders on the right)
in private chats and groups, including pending clips. Bars are smaller (3–22px high,
up to 2.2px wide), centered with play/pause and the avatar. A circular thumb over the
bars and a 44px-high range input support touch, pointer and keyboard seeking, even
before first play; paused audio stays paused. Visible bubbles analyze audio through
the existing cache, sharing downloads with playback and retaining reduced samples
in the same entries. See [waveform caching and verification](voice.md#voice-bubble-presentation-and-verification).
It loads audio from the memory-only audio cache in `useVoiceAudio.ts` (32 MiB per session),
the message menu offers **View transcript**, and the contact page shows the **Voice**
section when `features.voiceMessages` is on. The dictation flow (transcribe into an
editable draft) is removed from the web app. Browser verification is pending; see
[voice messages](voice.md#web-limitations-and-verification).

## Message sounds

The web plays the same foreground sounds as iOS ([notifications](notifications.md#message-sounds-october-27-2026)),
from copies of the same attenuated Mixkit files in `public/sounds`:

- An outgoing message the server accepted, in the visible chat or group, and a newly
  completed reply in the visible conversation play the pop. The reply sound waits
  250 ms so its bubble has rendered, as on iOS.
- A new incoming message in another conversation, seen by the chats list polling
  (unread count up, latest message from someone else), plays the chime.
- Only messages completed while the tab has been visible play. Hidden tabs, the first
  load of a conversation, failed or retried sends and messages already announced
  stay silent; state clears on sign-out. There is no background or push sound, because
  the web has no push.

`useMessageSounds.ts` keeps the visible conversation (`useVisibleConversation` in the
chat and group pages), the visibility interval and a bounded set of announced IDs, in
memory only. Browsers block audio until the person interacts with the page; a blocked
sound is skipped. Playback has not been verified in a browser.

## Message reactions

See [message reactions](reactions.md) for the shared iOS/web selector, actor and
message identity, agent tools, permissions, mutation retries, session cache freshness
and verification steps. Reactions use existing conversation synchronization and
add no unread messages or push alerts. The hover reply/reaction buttons and the
selector float over the conversation instead of taking space under the message
(`MessageReactions.vue`; the selector is teleported to `body` with fixed
positioning). Checked on a static headless Chrome mock with the real CSS; the live
app is not visually verified.

## Message replies

See [message replies](replies.md) for the shared iOS/web Reply actions, quote
payloads, target validation, agent context, cache behavior and verification steps.
Replies are ordinary messages that carry a quoted earlier message; they add no new
request type, store or notification.

## MCP Connections

**Account → Connections** configures public/Bearer/OAuth Streamable HTTP connectors
once and manages schemas and tool approvals. On iOS and web it lists servers as rows
with their state ("3/5 tools" or "Needs authorization"); a row opens a sheet with the
URL, access, Authorize/Configure OAuth, Enable all, Refresh tools, the searchable tool
switches (each tool's description and input schema behind an info button) and
Disconnect. **Add server** opens the form in a sheet; the data-use text that consent
covers stays visible beside the consent switch, while other explanations are behind
info buttons. Refresh is pull-to-refresh on iOS and an icon button on web. Contact details → Connections is a
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

Registration reopened on October 28, 2026. Super admins can close it again at
runtime from the [admin panel](admin.md). While it is closed, the web sign-up
form shows the same message as iOS, mapped from HTTP 403 on
`auth/sign-up/email` in `utils/api.ts`.

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

The [remote timer/alarm prototype](native-remote.md) adds a device selector to private
web chats. After enabling **Allow remote timers and alarms** on iPhone, select that
phone and request an action in chat. The browser submits `remoteDeviceID`; server-
validated grants determine tool capabilities. Delivery uses a visible APNs alert
and the notification extension, with no tap or unlocked phone required by the
implementation. Runtime support, signing, system countdown and main-app visibility
remain to be verified on a physical device. This does not enable autonomous actions.

A Cancelled remote receipt means the iPhone rejected a claimed request before
scheduling, not that the browser cancelled it. The updated iOS extension supplies
a specific rejection reason in the visible iPhone notification and reports actual
AlarmKit scheduling errors separately. Existing web receipts and their cache remain
unchanged; updating web alone cannot change extension execution. Fresh requests
are required after installing the corrected binary; old cancellations never replay.

The last 20 remote operation receipts appear beside their source messages. They
confirm scheduling, not current live timer state. Web can revoke access; reconnecting
iOS refreshes existing grants without restoring revoked ones. Target selection,
device lists, empty results and receipts use bounded session caches; five-second
freshness reuses chat polling. Pending sends snapshot target, time zone and UUID.
Explicit refresh bypasses freshness, requests deduplicate, transient failures keep
content, and session/access/contact changes clear state and reject late results.
No private persistence or fabricated browser countdown is added.

The device bar appears only once this account has a linked iPhone for the contact,
a target is selected, or loading devices failed; setup instructions live on
`/native`. It shows a compact device picker, a refresh icon and **Revoke access**.
Receipts render as centered chips with a kind glyph and a status icon colored by
outcome (confirmed, waiting, unconfirmed/unknown, failed, inactive), matching iOS.
The contact page's **Conversation initiative** uses the standard switch, and
**Native experiments** is listed with **Connections** on the account page.


The iPhone's foreground tools still default timers/alarms to automatic execution;
other tools are opt-in and Calendar/location reminders keep review. The browser
cannot execute Apple frameworks itself or read a live iPhone countdown. Its linked-
device receipts confirm operations only. Local native context remains iOS-only;
web sends a selected `remoteDeviceID` and the server resolves its granted kinds.
The existing old-API fallback for the iPhone's optional `automaticKinds` hint is
unchanged. Remote settings, migration and extension require an updated API/app.

ActivityKit, AlarmKit, EventKit, Core NFC, App Intents and the iOS Share extension
have no local browser execution equivalent. The web guide describes their platform
requirements; its remote timer/alarm selector and receipt cache are described above.
Native per-kind permissions and explicit device linking remain controlled on iOS.

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

Private reply reading, typing and idle pauses share the server's
[elapsed-deadline handling](chats.md#failed-replies-and-response-recovery) with iOS.
Slow memory refresh or generation cannot make those pauses request a past time.
Conversation caches, polling and manual retry rules remain unchanged; verify a
short message after slow memory refresh in both clients after the API release.

Private contacts use the same server-side [initiative planner](initiative.md) as iOS, including while the browser is closed. Contact details provides the same Conversation initiative switch and copy for owners and shared-contact participants. The existing session-owned contact cache supplies the initial setting; background refresh and mutation responses update it, and generation guards reject late reads and session changes. Messages appear through ordinary conversation/list polling and unread updates; browser push is still unavailable. Migrations 0032–0033 and the API release are required. Verify reopen, refresh, offline/failure recovery, shared access revocation and account switching with fictional accounts; visual/runtime checks remain pending.

The faster cadence is shared by the API with iOS: a first review is due after 30 seconds, followed by minimum gaps of two and ten minutes. One-minute Cron scheduling adds jitter; no browser timer or extra requests are introduced. The planner encourages one short greeting continuation and increases space after unanswered messages, preserving all existing limits. No web bundle change is needed for these server timings; histories, polling and cache invalidation are unchanged. New prompt quality remains pending live verification; see [initiative](initiative.md#faster-cadence-validation).


### Private messages from groups

A contact can write to a group member in their private chat ([groups](groups.md#private-messages-from-a-group)).
The message is an ordinary assistant-only turn, so the chat page, list previews and
unread counts already show it through the existing polling and caches; no web change
was needed, as on iOS. Browser push remains unavailable.

### Consecutive private messages

The private composer permits typing during the HTTP submission and another send
as soon as it is accepted, while agent replies remain pending. A pending UUID still
owns its uncertain submission; the next draft stays in the session conversation
cache. Actual input events report typing at most every two seconds, with no draft
payload; leaving/visibility changes close the visit, and fresh input can renew an
expired visit. Contact changes retain the original visit's contact for its leave
request and late activity responses cannot reopen that visit.

Both clients use the same bounded server pauses, burst grouping and response-only
wait/send decision described in [chats](chats.md#consecutive-messages-and-composer-pacing).
Migrations 0035–0036 and an automatic API release are prerequisites. A newer eligible
message arriving during generation folds into the next turn at the atomic publication
check; an obsolete conversational draft is discarded. Matching native contexts can
group; a persisted tool-start marker prevents hiding/replaying an action receipt.

Private history renders human and assistant sides as independent timestamped items,
with stable IDs and deterministic tie breaks. Pending local sends share this timeline;
status rows remain at the end, and native receipts stay with their human request.
An older turn's late assistant reply can no longer be inserted above a newer human
message. Day separators follow each message's own timestamp. Cached server turns
remain sequence-ordered for pagination and reconciliation.
Type checking passed; browser/device verification of rapid sends, idle drafts,
resumed typing, failures, navigation, revocation and account switching is pending.

## Mini apps

The chat page shows a mini app card under the reply that created it and polls the
contact's app list alongside the conversation. `/contacts/:id/mini-apps` lists apps,
and `/contacts/:id/mini-apps/:appID` shows the review screen (reads vs confirmed
writes, then **Enable mini app**) or the enabled app as its own screen: a top bar
with a ⋯ menu (the app's menu actions, then Refresh, Disable and Delete), the
current tab, a composer pinned to the bottom and a bottom tab bar for tabbed apps.
`MiniAppView.vue` renders the server-resolved tree: stat grids, card grids, tiles,
grouped lists, SVG bar/line/area/donut charts, progress bars and rings, text,
notices and action forms that confirm with the action's text. `MiniAppLesson.vue`
shows a lesson card and opens the lesson flow in a full-window overlay with the same
rules as iOS. Values are formatted with
`Intl` in the viewer's locale. Group chats show [group mini app](mini-apps.md#group-mini-apps)
cards inside the message that built them; `/groups/:id/mini-apps` lists them (linked
from group details) and `/groups/:id/mini-apps/:appID` opens one. Both routes reuse
`MiniAppList.vue` and `MiniAppScreen.vue` with a `groups/<id>` base. Behavior, copy and limits match iOS; see
[mini apps](mini-apps.md) and [caching](caching.md#mini-apps). Browser layout and live
loads have not been verified.
Saved state, checklists, toggles, choices, inputs, progress bars, timers and button
rows render with the same rules as iOS (`MiniAppView.vue`, `MiniAppTimer.vue`). Taps
apply instantly and are reconciled with the server (`useMiniApps`).

## Contact personality

The personality editor renders the shared trait list, so the new **Emoji** slider
appears with the others; see [emoji and reactions](personality.md#emoji-and-reactions).

**Contact details → Personality** (`/contacts/:id/personality`) matches the native
iOS experiment: stable identity, optional specialties (up to 1,000 characters), optional date of birth, birthday time zone,
computed age and fifteen labeled 1–10 sliders. Only the creator can save; other
participants have a read-only view. Existing contacts start disabled. Both clients
use the same server director for private/group replies and initiative. Relationships
follow stable person IDs across eligible contexts; only categorical acting direction
reaches the model. Private causes stay private and connector chats/groups keep local
isolation. No relationship scores or source events are downloaded into the UI.
There is no platform exception for this feature.

`usePersonality` owns session-only snapshots and dirty drafts with a budget of
eight entries, retaining active saves until they settle. Reopen uses cached data
immediately and revalidates; a refresh never overwrites unsaved edits. Explicit
refresh asks before discarding changes. Mutations invalidate older reads and
use the draft's original server revision, so a 409 preserves the input for review.
Deletion/access loss and account changes remove state. There is no disk retention.
See [personality](personality.md) and [caching](caching.md). The shared API's local
live-model evaluation and classifier budget correction are documented in the
[evaluation guide](personality.md#opt-in-live-model-evaluation); they affect both
iOS and web replies without client changes or additional caching. Functional visual,
offline, multi-account, race, and deployed client/model verification remain pending.

## Account onboarding

New registrations use the same first-circle flow as iOS: `/onboarding` requires a
name, Male/Female, a language and country dropdown, one of four visual styles and
explicit shared-memory acceptance. It shows durable progress and retries, then
opens the normal app with five generated contacts and an optional group. Friends, Study or Work shapes the cast; Study/Work requires the user’s field. Group creation is a separate toggle, enabled by default, and uses simple names (Friends, Study Group, Work Team). All five onboarding contacts appear immediately in Chats with No messages yet, without fabricated messages or unread counts. Existing
accounts bypass setup. The session-owned store caches options, progress and drafts,
deduplicates requests/submissions and rejects late responses on mutation/account
change. Unsubmitted drafts are memory-only; submitted input resumes from the API.
Photos use the existing private image cache. See [onboarding](onboarding.md) for
API, privacy, freshness, retry limits and the pending browser/device checks.
No browser or device validation or live generation has been performed.

### Contact access to profile images

Private and group replies use the shared API's read-only `view_profile_photo`
capability on both web and iOS. Contacts can inspect their own and the current
human's avatar in private chat, plus current member avatars in groups. No client
upload or extra UI is needed. Images are loaded only on demand with current
membership, model consent and version checks; absent or revoked images are not
guessed. Existing session-owned avatar caches remain unchanged; the inference
path does not use client caches. See [profile image access](profile-photos.md#profile-images-available-to-contacts)
for limits, privacy, retention and pending functional checks.

### Age and contact photos

Onboarding also requires an integer age (1–120), matching iOS. New contacts in all four styles
have validated ages within ±2 years, with explicit per-contact gender.
The realistic prompt uses `N years old female|male social media natural photo
taken with phone. profile picture for social media`, followed by Appearance and Personality cues. Other styles
request the planned age and age-appropriate appearance, without an adult-only instruction. Age uses the existing session draft/cache and D1
input, with no extra local persistence. Legacy saved setups still resume without
requiring or inventing age; completed photos are preserved. See [onboarding](onboarding.md).
Pending browser/device checks include numeric input, invalid ages, lower/upper
bounds, draft restoration, legacy retry and actual model adherence.

## Successive contact messages

Private chats render the delivered `assistantMessages` prefix as stable,
independently timestamped bubbles, falling back to `assistantText` for old history.
The existing one-second visible-chat polling and session cache reconcile parts;
there is no browser timer for delivery. Typing remains visible while the reply
runs. Mini apps appear only once. Private quotes/reactions and unread/push identity
remain per response turn, matching iOS. Group parts are ordinary cached messages
with independent receipts and energy charges. See
[successive messages](reply-messages.md) for interruption, limits, rollout and
fictional-data checks on both clients.

## Private text sharing in groups

Group details includes **Discuss my private chats**, matching iOS. Each switch
permits that contact to discuss the signed-in person's past and future private text
with everyone in this group after explicit confirmation. It defaults off, is
revocable, and cannot authorize another person's conversation. File bytes,
scheduled turns and connector-isolated conversations are excluded. Existing
shared-memory rules continue separately. See [group behavior](groups.md#optional-private-text-sharing).

Details now shares the session-owned group conversation snapshot (20-group cache),
including empty permission lists, synchronous reopen and background refresh.
Details requests are deduplicated. Successful mutations immediately update switches,
invalidate stale requests and refresh; transient refresh errors preserve usable
confirmed state. Refresh details explicitly revalidates. Access loss and session
changes clear snapshots and reject late results; no new private disk storage.
Browser/device behavior and real-model recall remain unverified.

## Group typing indicators

Like iOS, group bubbles and the member subtitle use the snapshot's explicit
`replies[].isTyping === 1` only for running replies. Queued work, research and
silent decisions show no typing. A completed nonempty draft starts a durable
0.9–3 second typing pause before publication; successive parts retain the indicator.
Retries still wait for all active jobs, including invisible queued work.
Missing typing flags are treated as inactive. Existing session snapshots, one-second
visible polling, invalidation and stale-response guards remain unchanged; no draft
text or extra client cache is introduced. See [groups](groups.md#group-typing-state)
for remaining fictional-account and device/browser verification.

## Contact-authored quotes

Contacts may quote a message when overlapping topics would make their reply unclear,
and default to no quote for obvious answers. Private delivered messages carry their
own optional `replyTo`; group messages use the existing quote payload. Both use the
existing quote component and original-message pagination/navigation, matching iOS.
See [replies](replies.md) for validation and pending verification.

Group contacts can silently skip a human question already answered sufficiently by
another member, while still giving their own answer when individual perspectives
are requested. This is shared server behavior with iOS; no placeholder or typing
is shown for a skipped decision. See [group participation](groups.md#contextual-participation).

Acknowledgements and closing group replies can end automatic bot continuations.
The shared server transaction closes the opportunities created by that reply;
original human questions and new human messages remain eligible. iOS and web use
their existing message/presence cache. See [loop control](groups.md#ending-acknowledgement-loops).

## Generated chat images

The web client already sends private image `side=assistant` as a query parameter.
The iOS request correction uses the same contract through `URLQueryItem`, restoring
parity for bot images in bubbles, the full-screen viewer and chat media. No web
behavior or cache change is needed. Device verification remains pending.

Chat image thumbnails use a square frame with `object-fit: cover`, cropping excess
edges without distortion. In private chats and groups, clicking a loaded image
opens a black full-screen modal in the same tab, reusing its existing private
image cache URL without downloading it again. The viewer fits the complete image;
Zoom in/Fit image or double-click toggles zoom, with scrolling to inspect it.
Close or Escape dismisses the modal and restores focus to the thumbnail. Navigation,
an image source change, or an account change removes the viewer. This web-only
presentation update follows the existing iOS cover thumbnails and full-screen
viewer; native pinch/pan and swipe dismissal remain iOS interactions. Browser
visual and touch verification is pending.

Contacts can generate one contextual image per response and optionally combine up
to three currently accessible avatars. The first private assistant message can
carry `attachment`; the private image component uses the authorized attachment
path with `?side=assistant`. Groups use ordinary attachment messages. iOS and web
show the same image/caption/quote data and preserve their existing session caches.
No draft bytes are returned during generation; server checkpoints contain metadata
only. See [generated images](generated-images.md) for scope, setup, retry limits
and pending live verification.


Image generation uses current avatars for requested selfies and named members, and
can retrieve photos sent by people or contacts in this same chat as scene/edit
references. Internal visual descriptions are server-only and are not shown in
captions, public history or media grids. Both iOS and web use the shared API and
the existing delivered-image viewer/cache; no client format changes are needed.
See [image references and descriptions](generated-images.md#internal-image-descriptions-and-retrieval)
for scope, lazy old-history indexing, limits, retention and verification.

## AI creation and personality drafts

Both iOS and web support [AI contact creation](contact-generation.md), alongside
manual creation, with persisted onboarding context and bot-only selectors. Creation
uses a session-owned draft/pending ID and a durable D1 job on the existing onboarding
Workflow; navigation reuses cached state, then revalidates. New generated contacts
receive random adult birthdays. Birthday edits must keep contacts at least 18.
Existing creators can generate/regenerate all personality fields into the existing
session draft, review them, and save with revision conflict protection. Generation
preserves the name and adult birthday. Account changes/access loss discard cached
private state; existing photo caches remain authoritative for bytes. See the linked
guide for recovery, retention, rate limits, cache details and pending device checks.

### Task web research permission

iOS and web task editors both offer **Public web research** after saving a contact
assignment. Saving a nonempty exact query grants one lifetime public search with
the app closed; clearing it revokes permission. Reassignment clears the grant.
Both clients show attempts used and pending/draft/report/failed receipt labels,
including consumption after failure or report deletion. They reuse the existing
versioned task board mutation and foreground revalidation, with no extra cache,
polling, source downloads or disk retention. The form retains the version and
grant snapshot captured on open, so polling cannot bypass a concurrent edit conflict.
Close/reopen after a conflict to edit fresh data. See [persistent work](persistent-work.md).
Functional/visual verification remains pending: default denial, editing/revocation,
assignment changes, uncertain outcomes, stale edit conflicts, offline/back navigation,
access loss and account switching using fictional tasks on both clients.

### Task collaboration

Both boards show **Deliverable: <document title>** and **Revision round n/2** with the
reviewer's feedback while the task is open (migration 0058). Contacts set these through
tools; there are no new controls. Unverified in browser and device.
See [tasks](tasks.md#collaboration-deliverables-and-bounded-reviews-0058).

### Semantic memory ranking

Server-only (migration 0057, flag `SEMANTIC_MEMORY_ENABLED`, off by default): memory
selection may add Workers AI embedding similarity. No client UI, cache or API change on
iOS or web. See [memory](memory.md#semantic-ranking-migration-0057).

### Page monitors

Both task editors offer **Page monitor** after saving a contact assignment: a public
URL, **Every hour / Every 6 hours / Every day**, optional comma-separated keywords, the
latest five checks and change turns used; the board row shows the same summary. The
server checks the page with code and starts a contact turn only for a relevant change.
Same versioned PATCH, board cache and polling as other task fields; no new cache.
Browser and device presentation remain unverified. See [page monitors](monitors.md).

### Conversation scrolling

Web private chats and groups open instantly at the bottom, follow content growth,
keep the reading position when scrolling up, and offer a return-to-latest button.
See [web chat scrolling](web-chat-scrolling.md) for synchronization and verification.


## Reply activity indicators

Both clients show Recording... during voice attachment preparation and Typing...
for text preparation. Private/group list second lines temporarily show that
activity instead of message previews and receipts, preserving message order,
timestamps and unread counts. Groups identify each active contact. This reuses the
existing session-owned summaries, foreground polling, deduplication, pagination,
account isolation and cache eviction without extra row requests or disk storage.
See [chat activity](chats.md#reply-activity-indicators) for freshness/failure
behavior and pending device checks, and [migration 0062](infrastructure.md#recording-presence-migration-0062)
for reproducible setup and rollback.

## Chat lifecycle

Chat rows have no Manage button. Open a contact's details from the chat title and scroll to the bottom for Archive/Unarchive, Clear chat with an optional memory-removal checkbox, and Delete contact and data. Group details place Archive/Unarchive and owner-only Clear chat at the bottom beside Delete group/Leave group. Destructive confirmations and existing session mutation/invalidation helpers are retained. This placement change is web-only; iOS retains its swipe actions and context menus as requested. Open Archived using the archive icon button immediately to the left of Account in the chat-list header; the button toggles the view and indicates its active state. The archived header also offers Back to Chats. Home has no Archived row. iOS places Archived in the top-left three-dot menu. Archived remains a view of the existing session list cache, retaining pagination and background refresh without a separate cache or request path. Clear group is owner-only and explicitly affects everyone. Behavior, copy, cascade, history fencing and cache rules match iOS; see [chat lifecycle](chat-lifecycle.md), including navigation verification steps. No browser execution/build validation has been performed for these actions.

The lifecycle API corrections in migration 0064 apply equally to web and iOS: pending cleanup now includes group-derived private work, generated images retain their chat scope, and stale failures cannot delay newer cleanup. [38 local integration checks](chat-lifecycle-testing.md) pass against actual routes and emulated bindings; this does not validate browser/iOS UI or production services. No client API/copy/permission contract changes were needed.

The iOS chat header three-dot actions menu and fixed-width truncating title (see
[chats](chats.md)) were scoped to iOS by request; the web chat header keeps its
separate buttons.
