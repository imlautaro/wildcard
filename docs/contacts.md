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

Chats shows only conversations with at least one persisted message, including
attachment-only messages. Empty contacts stay available in Contacts. Chats keeps
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
in both lists. Choose **Create contact**, enter a name, and tap Create to return
to Contacts. **Join Shared Contact** accepts a code from a creator; it requires
sharing consent and opens a new empty private chat. The person-plus button in a creator’s chat opens sharing/access management, including invitations by an existing account’s email. Recipients open **+ → Contacts → Contact Invitations** to accept or decline requests; no mailbox email is sent. Swipe a row for Edit or Delete; a context
menu offers the same actions. Edit pushes the editor on the existing shared
navigation stack. Deletion requires confirmation. Successful mutations update the
list from the server response; creation dismisses the editor. Failed saves retain
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
