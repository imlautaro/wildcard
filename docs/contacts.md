# Private contacts

Contact records are persisted in Cloudflare D1; optional
[profile photos](profile-photos.md) are stored privately in R2. Every operation
requires the current user's signed bearer session. The owner is taken exclusively
from that verified session; clients cannot provide or change ownership. Contacts
are private in this version. Sharing and common memory remain outside this feature.

## API

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/v1/contacts` | Most recent conversation activity first, 50 per page |
| POST | `/api/v1/contacts` | Create using `{ "name": "My contact" }`; returns 201 |
| GET | `/api/v1/contacts/:id` | Read your contact |
| PATCH | `/api/v1/contacts/:id` | Rename using `{ "name": "New name" }` |
| DELETE | `/api/v1/contacts/:id` | Delete your contact; returns 204 |

A contact contains `id`, `name`, nullable `photoVersion`, `createdAt`, and `updatedAt`; timestamps are Unix
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

Chats loads the first page on appearance, refreshes on returning to the foreground,
and supports pull to refresh and Load more. It distinguishes loading, empty,
request failure, and populated states. While active, the signed-in shell refreshes
contacts every three seconds and immediately on foreground activation. Loaded
later pages survive automatic refreshes and are sorted with refreshed rows by
message activity. Previously loaded rows displaced below the first page are
retained. When first-page membership changes, pagination restarts at its new
boundary; loading more updates/deduplicates existing rows while filling gaps.
This can revisit a previously loaded page after activity changes. Contact snapshots are cached in memory;
read state is persisted on the server. The store is recreated when the signed-in user changes, and responses
from a previous session or an invalidated request cannot populate the new state.

Tap **+**, enter a name, and tap Create. Swipe a row for Edit or Delete; a context
menu offers the same actions. Edit pushes the editor on the existing shared
navigation stack. Deletion requires confirmation. Successful mutations update the
list from the server response; creation dismisses the editor. Failed saves retain
the draft and show an error. A failed delete leaves the row available for retry.
Deleting a contact already removed on another client removes its stale local row.

Opening a contact reads its current record and opens its persisted conversation.
Tap its title to edit its name or photo. See [chats](chats.md) for message storage and generation. A per-session record
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
its contact rows. Normal contact deletion removes the selected owner's contact and its conversation
turns, and requests termination of active generation. Sharing is not implemented.

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

Renaming preserves the conversation. Deletion cascades all turns
and requests best-effort termination of active generation; an in-flight provider
request may still consume credits. No sharing or cross-user context is enabled.

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
