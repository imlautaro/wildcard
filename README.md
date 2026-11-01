# Wildcard

A native iOS app, a Nuxt web app, and a Hono API for Cloudflare Workers, with email/password
authentication backed by Better Auth, private conversations in Cloudflare D1,
and durable Muse Spark 1.3 replies through Cloudflare Workflows.

## Layout

```text
apps/
  api/                       # TypeScript API, managed with npm workspaces
    src/app.ts               # Hono application and auth routes
    src/index.ts             # Worker entry point
    wrangler.jsonc           # Worker configuration
  web/                       # Nuxt 4 web app and same-origin API proxy Worker
    app/                     # Pages, components, session-owned stores
    server/api/v1/           # Proxy to the API Worker through a service binding
    wrangler.jsonc           # Web Worker configuration
  admin/                     # Nuxt 4 super admin panel Worker (registration, users, flags)
  ios/
    Wildcard/                # SwiftUI app, auth client, and Icon Composer icon
    Wildcard.xcodeproj/       # Xcode project
    WildcardTests/
    WildcardUITests/
packages/
  ui/                        # Wildcard UI: Nuxt layer with the web/admin design system
shared/
  messageMarkdown.ts         # Shared web/API Markdown rendering and plain summaries
docs/
  infrastructure.md          # Reproducible provisioning and automatic releases
  authentication.md          # Auth contract, session behavior, and limitations
  web.md                     # Web app architecture, features, and limitations
  design-system.md           # Wildcard UI layer: tokens, components, spacing rules
  appearance.md              # System/Light/Dark theme preference on iOS and web
  admin.md                   # Super admin panel, account deletion, and runtime flags
  mini-apps.md               # Contact-built native mini apps over MCP tools
  tasks.md                   # Shared to-do lists and contact work turns
  persistent-work.md         # Task progress, retained budgets and pause/resume
  documents.md               # Collaborative Markdown documents in chats
  web-research.md            # Public conversational research and sourced reports
  monitors.md                # Code-checked page monitors that wake task contacts
  link-previews.md           # Link cards with server-fetched page metadata
  updates.md                 # Updates: an adaptive feed the contacts curate together
```

## API development

Use Node.js 24 or later and npm. From the repository root:

```sh
npm ci
npm run auth:setup:local
npm run dev
```

Wrangler serves the API locally at `http://localhost:8787`. Local setup creates an
ignored auth secret and applies D1 migrations. Sign in through `/api/v1/auth/sign-in/email` or register through `/api/v1/auth/sign-up/email`. New accounts complete [onboarding](docs/onboarding.md), which can create five personalized AI contacts (in any of six styles, including 3D animated pets or a custom theme), generated portraits and an optional Friends, Study or Work group; the person enters the app while those contacts are still being created.
Existing accounts are preserved; `/api/v1/me` requires
a signed bearer session. Unrelated paths return HTTP 404 JSON. See
[authentication](docs/authentication.md) for the contract and limitations.
Email ownership verification and password recovery are not configured yet.

```sh
npm run typecheck  # Generate Worker types and check TypeScript
npm run build      # Bundle locally using Wrangler's dry run; does not publish
```

Add feature routes in `apps/api/src` as they are implemented. Regenerate Worker
binding types with `npm run types --workspace @wildcard/api` after configuration
changes. Generated types are ignored by Git.

## iOS development

Open `apps/ios/Wildcard.xcodeproj`, or run `npm run ios` on macOS. Select the
`Wildcard` scheme in Xcode 27.1 or later. The current minimum deployment target is
iOS 27.0. For a physical device, select your own signing team and bundle identifier.

The app includes sign-up/sign-in, a [first-circle onboarding](docs/onboarding.md), native Chats, Updates and Account tabs ([Updates](docs/updates.md)), Keychain session
storage, restoration on launch, and logout. Account supports editing your name and
choosing, cropping, replacing, or removing your own private [profile photo](docs/profile-photos.md#account-profile)
directly through the centered avatar/name menus shared with contact editing. It uses the updated [Wildcard branding](docs/branding.md), including the Icon Composer
icon and bundled [Manrope typography](docs/typography.md). Debug and Release
default to the public API through `WILDCARD_API_URL`; an independent installation must replace that setting. See the auth guide for local
simulator configuration.

The signed-in shell uses one navigation stack around the tabs. Chats shows only
conversations with at least one message plus the five onboarding contacts, ordered by recent activity (creation time for empty onboarding rows). Tap **+** to
open Contacts directly: Create group, Group Invitations, Contact Invitations,
Create contact and Join Shared Contact appear first, followed by
all contacts in alphabetical order. Tap a contact to open its conversation. Swipe a contact to Edit or Delete (with confirmation);
tap a contact to open its conversation and its title to edit it. Editors
push over the full tab layout, preserving the selected tab on return. Chats supports
pull to refresh and paginated loading. Choose, crop, replace, or remove a [profile photo](docs/profile-photos.md) in the
contact editor. Private photo bytes use R2. Contact identities are saved in D1; each participant has an isolated private conversation. See [contacts](docs/contacts.md). The shared [conversation style](docs/conversation-style.md) guides natural regional wording, distinct writing habits, brief useful replies and group addressing in both clients. Conversations format bot replies with essential Markdown and show plain bot text in
chat list previews, quoted replies and notifications. Contacts can choose [successive messages](docs/reply-messages.md) with length-aware durable typing pauses before each text bubble on iOS and web. Conversations support
[emoji reactions](docs/reactions.md) from humans and bots on their own or others’
messages in both private chats and groups, [quoted replies](docs/replies.md) to any
earlier message (swipe or hold on iOS, reply button on the web) that agents read as context, persisted messages, reply status, earlier history, contextual failure notices, and bounded response-only recovery before manual retries. The chat title shows
D1-backed Online/Typing/Last seen presence maintained by the server Workflow and Cron,
with a brief durable wait before the agent connects. Opening a chat also connects
the agent briefly; actual composer activity extends its server-side idle lease. Private chats allow consecutive messages while replies are pending, with bounded
pauses for actual typing, grouping of short messages through an atomic publication
check, and independently timestamped human/reply bubbles. Started tools keep their receipts. Accepted replies
continue in Cloudflare when the app closes. See [chats](docs/chats.md) for the API,
limits, and background execution. [Contact memory](docs/memory.md) stores grounded facts in D1 (including conversation-local memory for MCP chats/groups), selects bounded recent context, and provides shared attributed memories with private history search tools. Each agent also keeps its own stated persona/preferences across chats and can discover common group members and retrieve their attributed group statements through bounded, permission-checked search. An empty draft offers a microphone for
WhatsApp-style [voice messages](docs/voice.md): hold to record, release to send, slide
to cancel or lock. They are transcribed after sending, and contacts can answer with
their own ElevenLabs v4 voice with conversational delivery and a creator-managed
speech accent preference (migration 0061, including Argentine). Navigation reuses a bounded session-scoped [memory cache](docs/caching.md) for
private/group chats, group details, schedules and sharing, and
refreshes loaded content in the background. Recent chat images and avatars share
a bounded memory/protected disk cache, reducing reloads across navigation and app
restarts. [Reply push notifications](docs/notifications.md)
use APNs when the app is closed/backgrounded, after configuring Apple signing
and provider secrets. Alerts show the contact name, reply text, and a contact avatar through the embedded
notification service extension. Tapping an alert opens the chat. Bundled message sounds distinguish activity in the
visible chat, replies elsewhere in the foreground, and background push alerts. Unread reply counts persist on the server and
appear on chat rows, the Chats tab, and the app icon; returning to the app refreshes them immediately. Contacts can inspect their own and the current human’s [profile photos](docs/profile-photos.md#profile-images-available-to-contacts) on demand, plus current member photos in groups. Contacts can also [schedule messages](docs/schedules.md) once or at fixed intervals, edit or cancel them in chat, and inspect/cancel them from the chat toolbar clock button. Scheduling uses the existing D1, Cron, Workflow, and push services. The composer supports private [image and PDF attachments](docs/attachments.md) from Photos or Files, with native previews. Creators can [share contacts](docs/sharing.md) by an existing account’s email through in-app requests, or using expiring invitation codes: recipients start empty private chats with the same agent, shared memories/presence, and exclusive attention across participants. Schedules, unread counts, attachments, and notifications remain per recipient. The iOS sharing screens disclose shared-memory and Contributor data use and require explicit acceptance. Participants can also [ask the shared contact to message another participant privately](docs/sharing.md#private-messages-between-shared-contact-participants), without a group, with requester attribution and one-send receipts (migration 0084).

## Native iOS experiments

Optional [native experiments](docs/native-experiments.md) let a private contact
prepare device-specific requests for system timers and alarms, Calendar, and
Reminders (including location reminders). NFC, focus sessions, guided recipes and
spoken responses are deprecated; their source is retained but disabled.
Enable a contact from **Contact details → Native experiments** or **Account → Native
experiments**. New timers and alarms run automatically while the requesting iPhone
app is open; choose other automatic tools in **Run without confirmation**. Calendar,
location reminders and older requests retain manual review. iOS permissions still apply.
Active timers and alarms are visible inside the app, with
system controls and per-message operation receipts. The backend briefly waits for
automatic device receipts before replying and includes recent outcomes in later
native-enabled turns. The app also
includes Siri/Shortcuts actions, Action button shortcuts, a contact widget, shared
input drafts and authorized contact links. Actions and permissions remain per person and
device. Apple App Group/Associated Domains signing setup and migration 0031 are
required; see [infrastructure](docs/infrastructure.md#native-ios-experiments).
These Apple integrations have no browser execution equivalent; the web app offers
a feature guide and authorized contact-link fallback. Device verification is pending.

A first [remote timer/alarm prototype](docs/native-remote.md) lets an iOS or web chat target
an explicitly linked iPhone through a visible APNs notification and its notification
extension, including while locked or the main app is closed. Enable **Allow remote
timers and alarms** per contact on iPhone, then select that phone in chat.
With [participant delegation](docs/native-remote.md#allow-a-shared-contact-participant)
(migration 0083), explicitly allow a named shared-contact participant to request
timers/alarms on your iPhone, or revoke their permission, on either client. Sharing
alone grants no device access. See [setup and rollback](docs/infrastructure.md#shared-contact-device-delegation--migration-0083).
Migration 0034 and App Groups signing for the Notification Service App ID are
required. No autonomous initiative actions are enabled. Physical-device behavior
remains unverified; a device receipt is required before claiming execution.

## Web development

The [web app](docs/web.md) is a Nuxt 4 SPA served by a separate Worker,
`wildcard-web`. It proxies `/api/v1/*` to the API through a service binding and
keeps the session token in an `httpOnly` cookie, so the API needs no CORS. It covers
auth, account, the unified chat list, private and group chats with attachments,
contacts, and contact sharing. Voice dictation, push, and schedules are not
available on the web yet. Its look comes from the shared
[design system](docs/design-system.md) layer in `packages/ui`, which the admin panel
extends too. With the API running locally:

```sh
npm run dev:web        # http://localhost:3000
npm run typecheck:web
```

## Super admin panel

The optional [admin panel](docs/admin.md) is a separate Nuxt 4 Worker,
`wildcard-admin`. It reaches a private `AdminAPI` entrypoint of the API through a
service binding. Super admins, listed by user ID in `SUPER_ADMIN_USER_IDS`, can open
or close registration, list accounts with their contact counts, delete an account
with its owned data and durable asynchronous R2/Workflow cleanup, and change runtime
flags without a release. Account deletion requires migration
[0069](docs/infrastructure.md#account-deletion-cleanup-migration-0069). See
[infrastructure](docs/infrastructure.md#admin-worker) for provisioning.

```sh
npm run dev:admin      # http://localhost:3001 (needs ADMIN_LOCAL_ROUTES=true locally)
npm run typecheck:admin
```

## Group conversations

[Groups](docs/groups.md) combine human accounts and existing contacts in one
shared chat, with explicit shared-memory and model consent, in-app invitations,
per-member invitation permissions, sender avatars/names, [persisted recipient receipts](docs/groups.md#delivery-and-read-receipts)
that require all original recipients for Received/Read, and a scrolling member
subtitle. Each human message starts a bounded automatic reply round. Up to two contacts prepare replies simultaneously, with coordinated publication
and prioritized directed participation. Long press a group message (right click on
web) and choose **Message info** to see recipient reads and timestamps. Groups and
private chats share the same exclusive attention queue per agent. Create one from
**Chats → + → Contacts → Create group**. Each turn sees the original request,
earlier replies in its round and current bounded group history. Group instructions
discourage repeated formulas and closing questions. Before publication, an atomic
history check sends a stale draft through up to two reviews; canceled, superseded
or continuously changing turns can finish without a message. See the
[reply policy and review limits](docs/groups.md#reply-rounds-and-exclusive-attention).
Participants can optionally allow a contact to [discuss their private text](docs/groups.md#optional-private-text-sharing) in one group from Group details, with per-person consent and revocation. Groups support editable avatars,
image/PDF attachments with native previews, voice messages, and foreground polling. Chats interleaves groups and individual
conversations by latest message, with dates and a bold sender prefix on group
previews. Group messages from other members generate push alerts, persistent
unread counts and foreground banner/sound notifications; tapping an alert opens
the group. A human can also privately [ask an agent to post in a shared group](docs/group-requests.md):
greetings, announcements, statements, questions or other requested text. Ordinary
posts require no designated recipient and allow other bots to respond within
[server-managed energy limits](docs/energy.md). When a response
from one specific agent is requested, it gets one reply slot and its answer returns
privately with attribution. Both modes use durable receipts, the existing attention
queue and current membership/consent checks. Each bot shares 50 energy points across
groups, spends one per published group message and recovers one every five minutes
even offline. Its creator can inspect/reset energy in contact details; private
replies remain available. Each exchange also has a fixed 100-bot-message ceiling. Group schedules are not implemented.

## Infrastructure and releases

See [infrastructure setup](docs/infrastructure.md), including private R2 bucket
provisioning before the first profile-photo release. The API uses Cloudflare Workers Builds connected to
`imlautaro/wildcard` on `main`, targeting
`https://wildcard-api.imlautaro.workers.dev`. Build command:
`npm ci && npm run typecheck`; automatic deployment command: `npm run release:ci`.
The release script requires Workers Builds, a clean checkout, the production branch,
and a matching source commit, then tags the Worker version with that commit.
Releases apply D1 migrations before publishing and initialize the runtime auth
secret on the first auth release, preserving it afterward. Chats also require the
encrypted `META_API_KEY` build secret, copied securely to runtime by the release.
Each account selects Muse Spark 1.3 Standard or Contributor in **Account**, with
explicit Contributor acceptance and Standard as the database default. Existing
shared-memory permissions remain independent; MCP chats always use Standard.
[Model settings and AI Gateway](docs/model-settings.md) describes durable selection,
privacy, and estimated Spark spending in the Cloudflare dashboard. Provision the
optional gateway before enabling `AI_GATEWAY_ID`; all Spark calls then use the AI
binding and existing `META_API_KEY`. Gateway routing is temporarily disabled in the
checked-in configuration after production HTTP 502 failures; direct Meta requests
preserve account model selection but do not appear in gateway spending metrics.
Wrangler configures the Workflow and recovery Cron Trigger in the same release. Commit and push to
release; do not deploy manually. Preview builds are disabled.
The web Worker `wildcard-web` needs a second Workers Builds project on the same
repository (build `npm ci && npm run typecheck:web && npm run build:web`, deploy
`npm run release:web`). See [Web Worker](docs/infrastructure.md#web-worker).

Follow the [working agreements](AGENTS.md), including English-only project content
and reproducible infrastructure documentation.

## MCP connections

Configure remote MCP connectors once in **Account → Connections** on iOS or web,
either from the [connector library](docs/connectors.md#connector-library) of official
servers (Notion, Linear, GitHub, Stripe, Google Workspace and more) or manually.
Grant each contact access from contact details → **Connections**. Bot owners can
explicitly enable assigned connectors in **Group details → Connections**; human
members can request tools and responses are visible to everyone. Authorized private
chats and groups permanently use Standard and stay excluded from cross-chat memory. See [MCP connections](docs/connectors.md)
for permissions, permanent private-chat isolation, Standard processing, supported
transports, deployment prerequisites and pending verification. Streamable HTTP supports
public/Bearer access and OAuth authorization-code with PKCE, registered or dynamic
clients, encrypted credentials and refresh tokens. Gmail setup requires your own
Google OAuth client and preview access; live provider/device validation is pending.

Private chats and groups can keep [shared task lists](docs/tasks.md): contacts and
people create, assign, block and cancel tasks, and an assigned contact works on its
task in its own turn, again when its blockers finish, and in periodic reviews.
[Persistent work](docs/persistent-work.md) records next steps/evidence and exposes
pause/resume/cancel and retained work-turn budgets on iOS and web (migration 0054). Chats also hold [Markdown documents](docs/documents.md) that
contacts and people write together, opened full screen with a viewer and editor.
Tasks can link a deliverable document and reviewers can send work back at most twice
([collaboration](docs/tasks.md#collaboration-deliverables-and-bounded-reviews-0058), migration 0058).

Human requests can use [web research](docs/web-research.md) through Meta Responses
and `web_search` to inform the conversation without creating a document. Requested
lasting reports still save sources and original provenance in those documents. iOS and web show cited-source counts, check dates and source panels.
Requests have durable replay receipts and rolling account/installation limits.
Assigned tasks may run one human-saved exact public query with the app closed
(migration 0055), with grant/revoke and receipt status on both clients. Schedules,
ordinary bot triggers and connector-isolated chats cannot research.
A person can also attach a [page monitor](docs/monitors.md) to a contact's task
(migration 0056): code checks the public page and wakes the contact only for new,
relevant changes. Memory selection can optionally add
[semantic ranking](docs/memory.md#semantic-ranking-migration-0057) with Workers AI embeddings stored in D1 (migration 0057, off by default).
See [agentic execution limits](docs/agentic-limits.md) for current work budgets and
the controls required before extending persistent autonomous work.

[Updates](docs/updates.md) is an iOS tab and the web page `/updates`: an adaptive feed that the person's contacts build together. A
durable curation run reads what the person's contacts know about them, their recent
messages, connectors, mini apps and schedules, decides which topics to follow and
which contact prepares each, and composes native cards (headlines, matches, tables,
metrics, charts, trackers, notes, lists) with web research or read-only connector
data. Updates also offers quick access to the most used mini apps and an agenda of
schedules and assigned tasks. People can follow topics, give feedback or hide cards;
contacts can add topics from chat. Migration 0074 and `HOME_FEED_ENABLED` are required.

In private chats a contact can build [mini apps](docs/mini-apps.md): declarative
small tools and dashboards (saved state such as counters, stats, lists, charts and
actions) rendered with native SwiftUI and web components. Apps that use connector
tools stay disabled until you review those tools, and enabled apps re-run their
reads when opened. Apps open full screen with optional native tabs, menus,
composers and lessons, and are verified offline (automatic checks plus the
contact's tests) before they are saved. Migrations 0037–0038 are required.

Private contacts also support [adaptive conversation initiative](docs/initiative.md): durable AI reviews choose whether to wait, add a thought without another prompt, start a later conversation or stop. Passive open chats no longer block initiative; actual typing gives the person space. Timing and amount adapt to personality and this participant's responses, with varied activity windows, ignored-greeting suppression and explicit conversational pauses. Each participant can disable it in contact details on iOS or web. It reuses D1, Cron and Workflows; migrations through 0065 are required. Continuations have a 24-hour horizon; eligible new-conversation opportunities have a separate bounded budget over seven days, and one unanswered ambient message ends outreach until human input.

## Contact personality experiment

Creators can configure [Personality](docs/personality.md) in contact details on
both iOS and web: concise behavioral identity (values, judgment and conversational
quirks, without an invented human routine), birthday/time zone with computed age,
and fifteen temperament sliders. The contact receives behavioral direction rather
than scores. Relationships continue across eligible chats/groups through a
server-side acting director that produces per-recipient direction without private
causes. Connector conversations retain their local isolation. Initiative adapts within existing delivery limits. Existing contacts
remain disabled until explicitly enabled. Migrations 0039–0040 are required; see
[infrastructure](docs/infrastructure.md#contact-personality) for release and rollback.

Contacts can [generate contextual chat images](docs/generated-images.md) with
portrait, landscape or square framing chosen from context, including optional
private spontaneous image messages within existing initiative limits (migration
0079). They can optionally
combining up to three authorized current profile photos and images from the same
chat. Selfies use the contact avatar; named members use their avatars. Internal
visual descriptions support finding earlier scenes without exposing labels in chat. Both clients show images
with captions; migrations 0044/0048 and the existing Meta/R2 services are required. See
[infrastructure setup](docs/infrastructure.md#contact-generated-chat-images).
When content needs several visuals (a comparison, before/after, steps), a contact
can send an [album of two or three images](docs/generated-images.md#albums) on
one message (migration 0082, [setup](docs/infrastructure.md#contact-generated-image-albums--migration-0082)).

New contacts can be created manually or [generated with AI](docs/contact-generation.md)
on iOS and web, reusing saved onboarding context with bot-only selectors. Creators
can also regenerate an existing personality as a reviewable draft. Generated
contacts receive random adult birthdays; birthday edits require age 18 or older.


Reply activity now distinguishes Typing... and Recording... in private/group chats
and list previews on iOS and web. Recording covers voice attachment preparation;
see [voice messages](docs/voice.md#reply-activity-indicators) and
[migration 0062 setup](docs/infrastructure.md#recording-presence-migration-0062).

Chat rows support [archive, clear with optional memory removal, and contact deletion](docs/chat-lifecycle.md) on iOS and web. Group owners can clear shared history for everyone. Deletion uses a durable D1 outbox for Workflow and R2 cleanup.

Voice bubbles and chat-list previews show [per-account listening state and audio duration](docs/voice.md#voice-bubbles) on iOS and web (migration [0066](docs/infrastructure.md#voice-playback-receipts-migration-0066)).

Loaded voice messages support [background playback and system media controls](docs/voice.md#background-playback-and-ear-routing).
iOS includes proximity-based receiver routing on iPhone and a brief startup margin;
web background support depends on the browser and has no receiver-routing API.
See [iOS setup](docs/infrastructure.md#ios-background-voice-playback). Physical-device
and browser playback verification remains pending.

Run [lifecycle integration checks](docs/chat-lifecycle-testing.md) with `npm run test:lifecycle` (local fictional D1/R2/Workflow data only). Migration 0064 fixes cascade ordering, generated-media ownership, lost Workflow acknowledgements, retry revisions, linked chat scopes, and memory isolation with embeddings.

## Conversation learning

[Conversation learning](docs/conversation-learning.md) reviews recent direct human
exchanges silently, keeping audience-local interaction observations, small behavioral
adjustments and optional questions. Private/group replies on iOS and web use the same
API behavior; private initiative uses it within existing outreach limits. Both clients
provide per-person inspection, disable and reset controls. Migration 0067 uses the
existing D1, Workflows and minute Cron; no new service or secret is required.

The web account screen can [download a debug JSON export](docs/debug-export.md)
with private/group chat history and related authorized records, including archived
chats. It downloads locally without uploading to an AI; credentials and media bytes
are excluded. The feature is web-only and uses existing infrastructure.
