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
  ios/
    Wildcard/                # SwiftUI app, auth client, and Icon Composer icon
    Wildcard.xcodeproj/       # Xcode project
    WildcardTests/
    WildcardUITests/
docs/
  infrastructure.md          # Reproducible provisioning and automatic releases
  authentication.md          # Auth contract, session behavior, and limitations
  web.md                     # Web app architecture, features, and limitations
```

## API development

Use Node.js 24 or later and npm. From the repository root:

```sh
npm ci
npm run auth:setup:local
npm run dev
```

Wrangler serves the API locally at `http://localhost:8787`. Local setup creates an
ignored auth secret and applies D1 migrations. Register/sign in through
`/api/v1/auth/sign-up/email` and `/api/v1/auth/sign-in/email`; `/api/v1/me` requires
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

The app includes sign-up/sign-in, native Chats and Account tabs, Keychain session
storage, restoration on launch, and logout. Account supports editing your name and
choosing, cropping, replacing, or removing your own private [profile photo](docs/profile-photos.md#account-profile)
directly through the centered avatar/name menus shared with contact editing. It preserves the Wildcard Icon Composer
icon and bundled [Manrope typography](docs/typography.md). Debug and Release
default to the public API through `WILDCARD_API_URL`; an independent installation must replace that setting. See the auth guide for local
simulator configuration.

The signed-in shell uses one navigation stack around the tabs. Chats shows only
conversations with at least one message, ordered by recent activity. Tap **+** to
open Contacts directly: Create group, Group Invitations, Contact Invitations,
Create contact and Join Shared Contact appear first, followed by
all contacts in alphabetical order. Tap a contact to open its conversation. Swipe a contact to Edit or Delete (with confirmation);
tap a contact to open its conversation and its title to edit it. Editors
push over the full tab layout, preserving the selected tab on return. Chats supports
pull to refresh and paginated loading. Choose, crop, replace, or remove a [profile photo](docs/profile-photos.md) in the
contact editor. Private photo bytes use R2. Contact identities are saved in D1; each participant has an isolated private conversation. See [contacts](docs/contacts.md). Conversations support
persisted messages, reply status, earlier history, and retries. The chat title shows
D1-backed Online/Typing/Last seen presence maintained by the server Workflow and Cron,
with a brief durable wait before the agent connects. Opening a chat also connects
the agent briefly; actual composer activity extends its server-side idle lease. Accepted replies
continue in Cloudflare when the app closes. See [chats](docs/chats.md) for the API,
limits, and background execution. [Contact memory](docs/memory.md) stores grounded facts in D1, selects bounded recent context, and provides shared attributed memories with private history search tools. Each agent also keeps its own stated persona/preferences across chats and can discover common group members and retrieve their attributed group statements through bounded, permission-checked search. An empty draft offers a microphone for
[Muse Voice Transcribe dictation](docs/voice.md); the transcript is editable before
sending. Navigation reuses a bounded session-scoped [memory cache](docs/caching.md) for
private/group chats, group details, schedules and sharing, and
refreshes loaded content in the background. Recent chat images and avatars share
a bounded memory/protected disk cache, reducing reloads across navigation and app
restarts. [Reply push notifications](docs/notifications.md)
use APNs when the app is closed/backgrounded, after configuring Apple signing
and provider secrets. Alerts show the contact name, reply text, and a contact avatar through the embedded
notification service extension. Tapping an alert opens the chat. Bundled message sounds distinguish activity in the
visible chat, replies elsewhere in the foreground, and background push alerts. Unread reply counts persist on the server and
appear on chat rows, the Chats tab, and the app icon; returning to the app refreshes them immediately. Contacts can also [schedule messages](docs/schedules.md) once or at fixed intervals, edit or cancel them in chat, and inspect/cancel them from the chat toolbar clock button. Scheduling uses the existing D1, Cron, Workflow, and push services. The composer supports private [image and PDF attachments](docs/attachments.md) from Photos or Files, with native previews. Creators can [share contacts](docs/sharing.md) by an existing account’s email through in-app requests, or using expiring invitation codes: recipients start empty private chats with the same agent, shared memories/presence, and exclusive attention across participants. Schedules, unread counts, attachments, and notifications remain per recipient. The iOS sharing screens disclose shared-memory and Contributor data use and require explicit acceptance.

## Web development

The [web app](docs/web.md) is a Nuxt 4 SPA served by a separate Worker,
`wildcard-web`. It proxies `/api/v1/*` to the API through a service binding and
keeps the session token in an `httpOnly` cookie, so the API needs no CORS. It covers
auth, account, the unified chat list, private and group chats with attachments,
contacts, and contact sharing. Voice dictation, push, and schedules are not
available on the web yet. With the API running locally:

```sh
npm run dev:web        # http://localhost:3000
npm run typecheck:web
```

## Group conversations

[Groups](docs/groups.md) combine human accounts and existing contacts in one
shared chat, with explicit shared-memory and model consent, in-app invitations,
per-member invitation permissions, sender avatars/names, [persisted recipient receipts](docs/groups.md#delivery-and-read-receipts)
that require all original recipients for Received/Read, and a scrolling member
subtitle. Each human message starts a bounded automatic reply round. Groups and
private chats share the same exclusive attention queue per agent. Create one from
**Chats → + → Contacts → Create group**. Each turn sees the original request,
earlier replies in its round and current bounded group history. Group instructions
discourage repeated formulas and closing questions. Before publication, an atomic
history check sends a stale draft through up to two reviews; canceled, superseded
or continuously changing turns can finish without a message. See the
[reply policy and review limits](docs/groups.md#reply-rounds-and-exclusive-attention).
Groups support editable avatars,
image/PDF attachments with native previews, voice dictation with an editable
transcript, and foreground polling. Chats interleaves groups and individual
conversations by latest message, with dates and a bold sender prefix on group
previews. Group messages from other members generate push alerts, persistent
unread counts and foreground banner/sound notifications; tapping an alert opens
the group. A human can also privately [ask an agent to post in a shared group](docs/group-requests.md):
greetings, announcements, statements, questions or other requested text. Ordinary
posts require no recipient and create no automatic bot replies. When a response
from one specific agent is requested, it gets one reply slot and its answer returns
privately with attribution. Both modes use durable receipts, the existing attention
queue and current membership/consent checks. Group schedules are not implemented.

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
`META_CHAT_MODEL` selects Muse Spark Standard or Contributor. This owner's
single-user development backend currently uses `muse-spark-1.3-contributor` with
explicit consent for Meta's training use of the existing test chats. Independent
or public installations should select Standard unless separately authorized; see
[model configuration](docs/infrastructure.md#development-contributor-model).
Wrangler configures the Workflow and recovery Cron Trigger in the same release. Commit and push to
release; do not deploy manually. Preview builds are disabled.
The web Worker `wildcard-web` needs a second Workers Builds project on the same
repository (build `npm ci && npm run typecheck:web && npm run build:web`, deploy
`npm run release:web`). See [Web Worker](docs/infrastructure.md#web-worker).

Follow the [working agreements](AGENTS.md), including English-only project content
and reproducible infrastructure documentation.
