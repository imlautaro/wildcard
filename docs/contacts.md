# Contacts and private conversations

The Chats toolbar uses the adaptive system label color for the plus button,
which opens Contacts directly. Chat toolbar sharing and schedule buttons use the same
neutral color in light and dark appearance.

Contact records are persisted in Cloudflare D1; optional
[profile photos](profile-photos.md) are stored privately in R2. Every operation
requires the current user's signed bearer session. The owner is taken exclusively
from that verified session; clients cannot provide or change ownership. A contact identity can be shared through [invitations](sharing.md); conversation records remain private per participant. The creator controls the shared name/photo and participant access.

## API

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/v1/contacts` | Most recent conversation activity first, 50 per page |
| POST | `/api/v1/contacts` | Create using `{ "name": "My contact" }`; returns 201 |
| GET | `/api/v1/contacts/:id` | Read your contact |
| PATCH | `/api/v1/contacts/:id` | Creator renames using `{ "name": "New name" }` |
| PATCH | `/api/v1/contacts/:id/alias` | Any holder sets or clears their private alias using `{ "alias": "Berdi" }` or `{ "alias": null }`; returns the contact |
| DELETE | `/api/v1/contacts/:id` | Creator deletes the whole agent; a member leaves and deletes their private conversation; returns 204 |

A contact contains the private conversation `id`, shared `agentID`, `role` (`owner` or `member`), `name`, nullable `photoVersion`, `createdAt`, and `updatedAt`; timestamps are Unix
milliseconds. Create/read/update return `{ "contact": ... }`. List returns
`{ "contacts": [...], "nextCursor": string | null }`. Pass the returned cursor as
`?before=<cursor>` to load the next page. Pagination is ordered by `lastMessageAt` (falling back to `createdAt` for empty
chats) and ID descending, without offsets. Cursor timestamps use that same
activity value. Sending a message or receiving a reply moves the chat up;
renaming, changing a photo, opening, or marking read does not affect activity.
New contacts and newly active conversations are picked up by refreshing the
first page. Activity is mutable, so pagination is not a frozen snapshot.

Names are trimmed and must contain 1–100 Unicode code points with no control
characters. Only `name` is accepted in create/update bodies; malformed JSON,
unknown fields, empty names, and invalid cursors return 400. Bodies are limited to
4 KiB. SQL uses prepared bindings, including IDs and cursor values.

All reads, updates, and deletes include the session's user ID in the database
predicate. A missing ID and another user's ID return the same 404 response. An
unauthenticated or invalid session returns 401. Cookie authentication does not
substitute for the supplied bearer token on these routes. Responses use
`Cache-Control: no-store`, and returned contacts do not expose owner IDs.

## iOS flow

Chats shows conversations with at least one persisted message, including
attachment-only messages, plus the five onboarding contacts marked `onboardingChat: 1`.
These initial rows show No messages yet until activity begins; ordinary empty
contacts stay available only in Contacts. See [onboarding](onboarding.md). Chats keeps
its recent-message ordering, loads the first page on appearance, refreshes on
returning to the foreground, and supports pull to refresh and Load more. If a
page contains only empty contacts, it automatically continues until it finds
conversations or reaches the end. It distinguishes loading, empty,
request failure, and populated states. While active, the signed-in shell refreshes
contacts every three seconds and immediately on foreground activation. Loaded
later pages survive automatic refreshes and are sorted with refreshed rows by
message activity. Previously loaded rows displaced below the first page are
retained. When first-page membership changes, pagination restarts at its new
boundary; loading more updates/deduplicates existing rows while filling gaps.
This can revisit a previously loaded page after activity changes. Contact snapshots are cached in memory;
read state is persisted on the server. The store is recreated when the signed-in user changes, and responses
from a previous session or an invalidated request cannot populate the new state.

Tap **+** to open the **Contacts** screen without a dropdown. Its action rows are
**Create group**, **Group Invitations**, **Contact Invitations**, **Create contact**
and **Join Shared Contact**. Invitation rows remain visible when empty and show
pending counts when present. These actions are followed by all contacts sorted
alphabetically using localized name comparison, with IDs breaking equal-name ties.
Contacts automatically loads remaining pages, re-sorting as they arrive; errors
retain loaded rows and offer Retry. Tap a contact to open its chat and return to
Home when navigating back. Swipe and context-menu Edit/Delete remain available
in both lists. Choose **Create contact**, enter a name, and tap Create to open
the new contact's chat (iOS and web). **Join Shared Contact** accepts a code from a creator; it requires
sharing consent and opens a new empty private chat. **Share contact** in a creator’s chat (the three-dot menu on iOS) opens sharing/access management, including invitations by an existing account’s email. Recipients open **+ → Contacts → Contact Invitations** to accept or decline requests; no mailbox email is sent. Swipe a row for Edit or Delete; a context
menu offers the same actions. Edit pushes the editor on the existing shared
navigation stack. Deletion requires confirmation. Successful mutations update the
list from the server response; creation replaces the editor with the new chat. Failed saves retain
the draft and show an error. A failed delete leaves the row available for retry.
Deleting a contact already removed on another client removes its stale local row.

Opening a contact reads its current record and opens its persisted conversation.
Tap its title to edit its name or photo. The editor shares `ProfileIdentityView`
with Account: tap the centered avatar with its camera badge for Choose Photo or
Remove Photo, and tap the centered name below for Edit name. Creating a contact
uses the same controls, showing Add name until a name is entered. Create/Save
persists the contact draft; shared-contact members have no editing menus. See [chats](chats.md) for message storage and generation. A per-session record
cache preserves a contact detail when first-page refresh changes the visible list.
Concurrent refreshes cannot overwrite successful mutations, and mutations retain
loaded pages and their keyset cursor. A session rejection clears the saved token
and returns to authentication, using the existing Keychain recovery behavior if
local session removal fails.

## D1 migration and independent setup

Migration `apps/api/migrations/0002_contacts.sql` creates `contact`, with a foreign
key to `user` using `ON DELETE CASCADE` and an index on owner/creation time/ID. It
adds no Cloudflare resource, secret, or external service. Use the existing `DB`
binding and D1 edit permissions from [infrastructure setup](infrastructure.md).
For local use, apply pending migrations with `npm run db:migrate:local` before
starting the API. The automatic release applies the same versioned migration to
the configured remote database before deploying the pushed Worker.

The migration is additive and compatible with the prior auth-only API. Do not
rewrite migration 0001 or an already applied 0002. Worker rollback does not remove
the table or recover deleted contacts. An authorized user/account deletion cascades
its contact rows. See [shared contacts](sharing.md) for migration 0013, per-participant projections, deletion/revocation behavior, and attention recovery.

## Validation status

TypeScript and Swift type checks passed. Migration 0002 was applied to local D1;
static query review confirmed owner predicates on each contact read/update/delete.
Production receives the migration and API through the documented automatic
release after commit and push. Verify that the release completed, its version tag
matches the pushed commit, and D1 has no pending migrations before using the
client with the public API. No runtime CRUD tests, two-account isolation tests, iOS build,
or simulator session were run. Before claiming end-to-end verification, use
fictional accounts to check create/list/rename/delete, cross-user reads and writes,
invalid bodies, pagination, logout/re-login, stale refreshes, and failure states
when runtime testing is authorized. Do not use other people's private data.

## Conversation integration

Contacts now open [private conversations](chats.md). List/detail responses include
nullable `lastMessageText`, truncated to 500 code points from the latest reply or
user message, and nullable `lastMessageAt` in Unix milliseconds for that same
message. Completed replies use the turn's completion timestamp; otherwise the
user message's creation timestamp is used, including during retries or failures.
Empty conversations return null. Renaming does not change the message timestamp.
The timestamp is derived from existing turns and requires no migration or new
service. Older API responses without this field remain decodable by iOS.

Chats uses a full-width plain list without a Contacts header or disclosure arrows.
Only interior rows have separators; the first row has no top divider and the last
has no bottom divider.
The message preview trims each line, removes empty lines, and joins the remaining
lines with spaces before wrapping to at most two lines. Stored messages and the
conversation bubbles retain their original formatting.
Each row opens the conversation and shows the last message time on the right,
above its unread badge: local hours and minutes today, `Yesterday` one calendar
day ago, an English weekday two through six days ago, and `dd/MM/yyyy` for older
messages. Labels refresh every minute while visible. Empty chats have no date.
If an older API omits `lastMessageAt`, rows reuse a matching final turn from the
conversation cache or a timestamp retained by ContactsStore for the same preview.
Recreating a row or returning to Home does not clear the cached timestamp. A
visible populated row without a matching cache entry requests the latest
conversation page and retains its timestamp for the session. Concurrent requests
for the same contact and preview are deduplicated; mismatched or deleted-contact
results are discarded. This read does not mark the conversation read or generate
replies. Failures leave the date absent, and empty chats make no fallback request.
The first uncached lookup still requires network access. Identical previews for
different messages cannot reliably invalidate this compatibility cache; the
server's `lastMessageAt` is authoritative once released and requires no extra
history request. Install the updated iOS app to use this compatibility
path; release the API through the existing automatic commit/push pipeline to
provide timestamps directly.

Renaming projects the shared name to all participants and preserves their private conversations. Creator deletion cascades every participant’s turns; a member leaving removes only their own projection. Both request best-effort termination; in-flight provider work may still consume credits. [Shared memory](sharing.md) exposes attributed facts, while raw transcripts remain private.

## Unread replies

Contact responses include `lastReadSequence`; list/detail reads also include
`unreadCount`, counting completed assistant replies after that sequence. The list
response adds `totalUnreadCount` across all owner contacts, including unloaded
pages. iOS shows counters on chat rows and the Chats tab. The reply is acknowledged
only after the active conversation has loaded it, through
`PUT /api/v1/contacts/:id/chat/read` with `{ "sequence": <last displayed completed reply> }`.
The acknowledgement returns `lastReadSequence`, `unreadCount`, and
`totalUnreadCount`; the last is the authoritative total for the app icon, including
contacts on unloaded pages. This owner-authorized, monotonic update cannot acknowledge a reply after the
provided sequence or move the watermark backwards. Merely fetching contacts or
history does not mark anything read. Failed acknowledgements retry on the next
active conversation poll. Other devices observe the shared owner read state.

Migration `0005_read_state.sql` adds a nonnegative, initially zero watermark to
contacts. Existing completed replies initially appear unread until opened because
previous versions never recorded reads. Local setup and automatic releases apply
the additive migration using existing commands and credentials. Rollback retains
the column; older clients continue working but cannot acknowledge new replies.

Profile-photo API, crop behavior, failure recovery, migration 0006, R2 retention,
and notification avatars are documented in [profile photos](profile-photos.md).

## Recent-first ordering (October 27, 2026)

The API and iOS store use the same descending last-message/creation timestamp
and ID tie-breaker for all refresh, pagination, and local mutation paths. The
existing turn-derived timestamp and D1 indexes are reused; no migration, binding,
or infrastructure change is required. Scheduled replies participate normally.
Static TypeScript, Swift, and SQL checks are recorded with this change. Runtime
pagination and visual behavior have not been exercised; no tests/builds or
release were run in this implementation turn.


Group conversations are interleaved with populated private chats in the same
section, sorted by their latest message timestamp. Both use plain buttons without
chevrons, 48-point avatars and the same date presentation. Group previews add a
bold sender prefix. Existing private-contact swipe/context-menu actions and the
alphabetical Contacts directory remain available. Groups older than the current
private-chat pagination boundary appear only as Load more reaches that timestamp.
See [groups](groups.md).

## Contact details layout

Contact details follow the settings pattern used across both clients:

- **Identity header.** Avatar with a camera button (choose or remove the photo) and the
  name below it; tapping the name edits it (iOS name editor; web `AppSheet`). Shared
  participants see "Shared contact · managed by its creator" instead.
- **Settings rows** with leading icons. Switches stay inline (Conversation initiative,
  Voice messages). Anything with choices or details is one row with its current value
  that opens a sheet: **Voice** (accent and voice) and, for the creator, **Group
  energy**. Explanations are behind info buttons (iOS `InfoButton` popover, web
  `InfoButton` sheet) instead of footer paragraphs.
- **Navigation rows** with icons: Personality, Connections, Mini apps, Tasks, and on web
  Share contact.
- Shared media and docs, then (web) archive, clear and delete at the bottom.

The iOS edit screen keeps its toolbar **Save** for name and photo changes; web saves a
renamed name or a new photo immediately. Device and browser checks of sheets, popovers,
focus and screen readers are pending.

## Shared in this chat

Contact details on iOS and web show the photos and files of your private chat with
that contact in Media and Docs tabs. See [attachments](attachments.md#shared-in-this-chat).
Private chats can also keep [task lists](tasks.md) that the contact works on.

## Personality

After creating a contact, open **Contact details → Personality** on iOS or web.
The creator edits the shared fictional identity, optional specialties (relative strengths
that do not limit conversation topics), optional birth date and time
zone, and fifteen integer temperament controls; other participants can inspect
these read-only. Age is derived from the current date. The experiment starts
disabled and settings use a separate versioned endpoint, leaving the existing
name-only creation/rename contracts unchanged. Saving personality changes clears
its emotional observations across conversations while preserving transcripts and
factual memories. Relationships follow each person across eligible chats and
groups through per-recipient acting direction; private causes stay private and
connector conversations remain isolated. See [personality](personality.md) for the complete API, behavior,
privacy, cache, and pending device/model verification.

## First-circle contacts

New-account [onboarding](onboarding.md) creates five owned contacts with contrasting
enabled personalities, names proposed as common in the chosen country and a
preferred conversation language. Meta Muse Image 1.0 generates private avatars
in the selected visual style. They use the normal contact/agent trigger, photo
routes and caches. The onboarding group references those same five identities.
Existing accounts and their contacts are unaffected.

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

## Voice

Contacts expose `voiceID`, `voiceName` and the participant's `voiceMessagesEnabled`.
The voice belongs to the shared agent (creator-only `PUT /:id/voice`); the opt-in is
per participant (`PUT /:id/voice-messages`). Contact details show these controls only
when `GET /me` reports `features.voiceMessages`. See [voice messages](voice.md).

## Lifecycle actions

Both clients expose [archive, clear and delete](chat-lifecycle.md). A clear affects only this participant's private conversation, optionally keeping extracted knowledge. Creator deletion now also removes the agent's authored group messages/media and assigned work; member deletion keeps other participants' access. External deletion failures are durably retried.

## Contact alias (private display name)

Each user can give a contact a private display name. It exists only on that user's own
`contact` row (`contact.alias`, nullable, migration `0075_contact_alias.sql`), so
other participants, shared invitations and groups keep showing the shared name. A creator
and a member can both set an alias; members cannot rename the shared contact.

- Contact responses: `name` is the **display name** (`alias`, else the shared name), `realName`
  is the shared name and `alias` is the raw value or `null`. The creator-only rename edits
  `realName`; clients must populate the rename field from `realName`, not `name`.
- `PATCH /api/v1/contacts/:id/alias` accepts only `alias`: 1–100 code points, no control
  characters, trimmed. `null` or a blank string clears it. 404 when the caller does not hold the contact.
- Resolved by the server for the requesting user (alias, else shared name): contact list/detail,
  direct and group push titles/subtitles, the Updates feed (cards, progress, schedules, tasks, mini
  apps), group message `senderName`, quoted messages, group list preview/activity, group members,
  typing/research/recording activity, message info receipts, reactions, task and document
  assignee/author names, conversation-learning profiles and MCP group access.
- Contact awareness (2026-10-31): in the holder's own private chat, the reply prompt and the
  private initiative prompt add one line saying how this person saved the contact
  (`aliasAwareness` in `contacts/alias.ts`). It is context only: the contact keeps its shared name, is not
  asked to mention the alias, and is told not to introduce itself by it, store it as a self fact or
  repeat it in groups or to other people. Group prompts, other holders' chats, tasks, schedules
  and Updates curation do not receive it. No client change: clients already send the alias.
- Never resolved: other model prompts and tool results (the bot still knows itself and its peers by the shared name),
  text typed or generated inside messages (an `@Alberdi` mention or a name inside a bot reply is
  stored text and is not rewritten), invitations/sharing (the recipient sees the shared name and sets their own alias),
  and the admin app.
- Renaming (creator only, `PATCH /contacts/:id`) changes the shared name everywhere in one D1 batch:
  `contact_agent.name` and every holder's `contact.name`, bumping their `updated_at`. Aliases are untouched,
  so a holder with an alias keeps seeing it. New invitations, new group messages and the bot's own prompts
  use the new name; earlier group messages keep their stored `sender_name`. Other holders' clients pick up the
  new name on their next refresh of the contact list; there is no push for it. Checked on the local workerd
  D1: a member's attempt changes nothing, the creator's rename updates the agent and all copies.
- Group messages keep an immutable shared `sender_name` snapshot; the alias is overlaid at read time
  by `agent_id` (`apps/api/src/contacts/alias.ts`). Removing the alias restores the shared name
  everywhere on the next read.
- Caching: caches that hold server-resolved names (group conversation/members/list, tasks, documents,
  reactions, learning, Updates feed) are invalidated and refetched after an alias change; see
  [caching](caching.md) and [web](web.md).
- Verification (October 31, 2026): the overlay SQL was exercised on the local workerd D1 with two users
  holding the same agent (alias for one only): messages, quotes, members, group summary,
  activity and contact rows returned the alias for the holder and the shared name for the other.
  Push delivery, both clients and the remaining queries were checked statically only.

**iOS:** the contact editor (`ContactEditorView`) has an **Alias** section for every holder, with its own Save alias
and Remove alias buttons because members have no toolbar Save; the rename field is populated from the shared
name. `Contact.realName`/`alias` decode optionally so older cached snapshots still load. Static typecheck
only; not run on a simulator or device.
