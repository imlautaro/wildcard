# Private contacts

Contacts are persisted in the existing Cloudflare D1 database. Every operation
requires the current user's signed bearer session. The owner is taken exclusively
from that verified session; clients cannot provide or change ownership. Contacts
are private in this version. Sharing, common memory, AI replies, and conversation
persistence remain outside this feature.

## API

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/v1/contacts` | Newest contacts first, 50 per page |
| POST | `/api/v1/contacts` | Create using `{ "name": "My contact" }`; returns 201 |
| GET | `/api/v1/contacts/:id` | Read your contact |
| PATCH | `/api/v1/contacts/:id` | Rename using `{ "name": "New name" }` |
| DELETE | `/api/v1/contacts/:id` | Delete your contact; returns 204 |

A contact contains `id`, `name`, `createdAt`, and `updatedAt`; timestamps are Unix
milliseconds. Create/read/update return `{ "contact": ... }`. List returns
`{ "contacts": [...], "nextCursor": string | null }`. Pass the returned cursor as
`?before=<cursor>` to load the next page. Pagination is ordered by creation time
and ID descending and does not use offsets. Renaming preserves this order. New
contacts created after a page was read are picked up by refreshing the first page.

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
request failure, and populated states. There is no periodic polling or local
contact persistence; only the current session's in-memory presentation state is
retained. The store is recreated when the signed-in user changes, and responses
from a previous session or an invalidated request cannot populate the new state.

Tap **+**, enter a name, and tap Create. Swipe a row for Rename or Delete; a context
menu offers the same actions. Rename pushes the editor on the existing shared
navigation stack. Deletion requires confirmation. Successful mutations update the
list from the server response; creation dismisses the editor. Failed saves retain
the draft and show an error. A failed delete leaves the row available for retry.
Deleting a contact already removed on another client removes its stale local row.

Opening a contact reads its current record and shows an empty conversation screen.
Tap its title to rename it. No messages are sent or stored. A per-session record
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
its contact rows. Normal contact deletion removes only the selected owner's row;
there are no chat tables or sharing records in this implementation.

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
