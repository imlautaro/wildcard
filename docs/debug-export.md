# Debug JSON export

On the web, open **My account → Export debug JSON → Download JSON**. This
web-only feature was explicitly requested for browser downloads; iOS has no new
export UI. The download never calls an AI provider or shares the file externally.

The version 1 `wildcard-debug-export` JSON contains account identity/model, contacts
and agent identity/personality, all available private turns and current-member
group messages (including archived chats), reply attempts/status/error codes and
Workflow IDs, group publication reservations, exchanges, receipts and reactions.
It also includes the person's local factual/retained memory, learning and initiative
state, schedules, consent/isolation settings, tasks/work/monitor checks, documents
and revisions, research receipts/results, and mini-app definitions/state/actions.
IDs link datasets; private turn user/assistant text is stored together in
`chat_turn`, while group messages and reply jobs are separate datasets. Stored
`*_json` fields remain JSON strings; media metadata stays in those fields.
Database timestamp fields use Unix milliseconds. Sequence fields order their
respective message tables. Dataset counts and start/completion dates accompany
the export. Empty datasets are included as empty arrays.

Authentication/session data, connector credentials, other people's private chats,
global agent memory, retained group memory and relationship direction, native
device context, embeddings, media file bytes, deleted history, infrastructure logs
and raw model requests are excluded. Group members' private archive/learning
settings are excluded; only the exporting person's settings are included.
Conversation text, attachments' metadata, documents and tool output can themselves
contain sensitive information. Review the downloaded file before sharing it with
an AI or another person. The file is an unencrypted local download managed by the
browser and user, outside the app's cache. It is not a backup/restore format.

## Authorization, consistency and caching

`GET /api/v1/me/debug-export` returns a manifest, account ID, dataset names and
current contact/group history revisions. `?dataset=<name>&cursor=<rowid>` returns
up to 25 explicitly allowlisted rows and a nullable `nextCursor`. Dataset names
select server-owned SQL; the cursor is a validated nonnegative safe integer. All
pages require the existing bearer session and recheck contact ownership or current
group membership. No caller-supplied account ID or scope is trusted. Authentication
and the existing web proxy's httpOnly cookie/service binding stay unchanged.

The client walks pages sequentially and assembles one JSON file. It retains up to
100 MB of encoded JSON parts in memory; final Blob/browser copies may temporarily
increase memory use. Exceeding that limit or any failed page discards the export
without saving a partial file. There is no silent row cap. Cancel, sheet closure,
account navigation/unmount, session expiry and account change abort the request,
discard the parts and reject late responses. Concurrent clicks are deduplicated.
The temporary download URL is revoked after triggering the browser download.

Exports intentionally bypass navigation caches: they must retrieve all available
history, including unloaded pages, and should not retain a second private history
cache. There is no disk cache, automatic refresh or background retry. Every manual
retry starts fresh; failures leave ordinary conversation caches untouched.
Before saving, the client re-fetches the manifest and rejects changed access or
history revisions. This is a live multi-request export, **not an atomic database
snapshot**: messages/statuses can change while it runs, and deletion/revocation
immediately after the final check cannot retract already downloaded bytes.

## Setup and verification

Uses existing D1, API authentication and the web API service binding. No new
resources, secrets, migrations, R2 objects or provider permissions are needed.
Run API and web locally as described in `web.md`. Release through committed,
pushed source and automatic deployments only. Rollback removes the UI/route;
there is no data migration to reverse and existing downloads remain independent.

Static verification: API/web type checks and preparation of every dataset query
against the complete migration schema. Browser/runtime behavior remains unverified.
With fictional data, verify a private conversation over 25 turns, a group over
25 messages, archived/empty chats, linked documents/tasks, valid JSON/counts and
that accounts cannot export each other's private conversations. Check cancellation,
navigation/reopen, failed/offline requests and retry, the size-limit error, group
removal/history clear during export, session expiry and account switching. Confirm
normal page caches survive export failures and no download occurs after cancel.

Since migration 0071 the export also includes each group reply's plan (`plan_rank`,
`plan_role`, `plan_angle`, `plan_tools`, `draft_ready_at`) and the `group_round`
coordinator rows, so a report shows who was chosen to speak and why others stayed silent.
