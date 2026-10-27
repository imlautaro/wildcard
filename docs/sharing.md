# Shared contacts

A shared contact is one agent with one identity, profile photo, memory space,
presence, and attention queue. Each participant has a separate private conversation,
read watermark, unread count, schedules, attachments, and push destinations. Joining
starts an empty chat. It never clones an agent or copies someone else's history.

## iOS flow and consent

The creator opens a contact and taps the person-plus toolbar button. **Share
Contact** explains shared memory, requires approval to share existing and future
memories, and creates an invitation code. Use the system share sheet to send that
code. A signed-in recipient chooses **+ → Join Shared Contact**, pastes the code,
previews the name, explicitly accepts shared memory, and joins. Codes expire after
24 hours, are single-use, and are bearer capabilities: anyone possessing a code
can accept it. They are not bound to an email address or a named recipient.

This implementation supports four participants per agent, including its creator,
and ten pending invitations. Existing participants can accept a new invitation
without creating a second conversation. Successful acceptance retries by the
same recipient return the existing conversation, including after code expiry.

Only the creator edits the shared name/photo, creates/revokes invitations, or
removes participants. Removing someone deletes that person's conversation,
schedules, attachments' D1 references, pending pushes, and contributed memories.
R2 attachment bytes follow the existing deferred cleanup. A participant can also
leave by deleting their contact row. Creator deletion deletes the whole agent
and all participants' conversations; iOS explicitly describes this before its
existing deletion confirmation. In-flight provider calls and delivered alerts
cannot be recalled. A removed fact may survive in replies already sent to others,
provider requests, platform checkpoints, and backups. This is not comprehensive
erasure or a granular per-fact privacy system.

The existing installation uses Contributor mode with the creator's earlier
single-user consent. That does not authorize other people. Both invitation
creation and acceptance explicitly disclose possible Meta training use when the
configured model is Contributor and require agreement. Acceptance persists that
participant's Contributor consent. Generation, transcription admission, memory
extraction, and shared-memory selection enforce the configured model's consent
requirements. If an operator later changes Standard to Contributor, an existing
member without that consent must accept a new invitation before generation;
their memories are omitted from Contributor inputs until then. Standard remains
the recommended independent-account setting unless separately authorized. No
configuration/model change or inference was performed for this implementation.

## Identity and private conversation storage

Migration `0013_shared_contacts.sql` introduces `contact_agent` as the identity
and retains `contact` as a participant's private conversation projection. The
existing contact IDs and composite foreign keys remain intact. Existing contacts
become agents with the same ID and creator; no history is moved or copied. A new
participant gets a new private `contact.id` referencing the same `agent_id`.
`UNIQUE(agent_id, user_id)` prevents duplicate membership. API contact responses
include `agentID` and `role` (`owner` or `member`). Use `id`, not `agentID`, for all
existing chat, schedule, photo, unread, and notification routes.

Canonical agent metadata is projected to all participant rows by D1 triggers;
only creator-authorized endpoints can change it. Authenticated photo reads and
signed notification-avatar URLs validate the recipient's membership/session,
then resolve the canonical creator/agent R2 key. No photo bytes are duplicated.

## Shared memory, private history

The memory space is the union of grounded memories contributed by its members,
with `sourceUserID` and `sourceUserName` attached to every retrieved memory. Each
member retains an independent extraction cursor and at most 64 memories, so
there are at most 256 candidates per agent. Keys and correction/removal rights
are scoped to their contributing participant. Two people's `favorite_color`
keys coexist. Extraction receives the speaker's server-resolved identity and
only that speaker's messages/memories; it cannot rewrite another person's rows.

Reply context and `search_memories` can retrieve memories from the same agent
after sharing consent. Stored memory content, source quotes, and attribution are
shared; full original transcripts and attachment bytes are not. Other agents'
memories remain inaccessible. The current speaker is explicitly identified in
the reply instructions. Recent history, `search_messages`, source excerpts,
attachment retrieval, and schedule tools remain scoped to that speaker's private
conversation. A source turn ID in another person's remembered fact does not
grant access to its raw turn.

For example, if Alice tells the agent her favorite color is red, Bob can ask for
Alice's favorite color and receive the remembered fact. Bob's own favorite color
uses a different author scope. Recall is model-assisted, lexical, bounded, and
fallible; memory extraction failures defer learning and do not fail a saved
reply. Existing facts retain server-side attribution even if their old content
used the generic word “user.” There is no bulk inference backfill.

## Exclusive attention and recovery

An accepted message is stored as `queued` without reading it or showing local
typing. Different participants may queue one active turn each; each user retains
the existing ten-active-turn limit. `dispatchAgent` atomically inserts a single
`agent_attention` claim for the oldest queued sequence. Only the claimed turn's
Workflow starts. It waits three seconds, changes that turn to `running`, records
`readAt`, catches up prior memories, marks the agent typing, generates and saves
the reply, attempts notification delivery and current-speaker memory maintenance,
then releases attention and dispatches the next conversation. Waiting chats show
**Waiting for contact…**. Typing bubbles require their own turn to be running.

A database trigger also rejects transitions to `running` without the matching
agent/turn/attempt claim. Workflow steps are replay-safe; reply writes check
attempt/status and schedule validity. A model failure or cancelled schedule keeps
attention until that Workflow unwinds. The claim deliberately has no cascading
turn foreign key: deleting/revoking a participant cannot unlock an in-flight
generation. Existing termination requests are best effort. Cron releases abandoned
claims only after the recorded Workflow reports `complete`, `errored`, or
`terminated`, then dispatches the next queued turn. Missing/temporarily unavailable
instance status never grants another turn concurrent attention. Paused or
persistently unqueryable instances may block the agent and require operator
intervention; there is no time-based unsafe lock expiry. A dispatch gap is
recovered by the existing minute Cron.

`agent_presence` stores one status/deadline/last-seen value per agent. Reply and
visit triggers update that same row; another participant's visit cannot override
an active reply's typing lease. Reads and Cron reconcile expired leases. All
participants observe the same global status, subject to their polling time.
Header typing describes the agent's global activity; a queued conversation does
not render a typing bubble. Checks use persisted `readAt` rather than the previous
three-second simulation: muted double checks mean server acceptance, colored
double checks mean the agent started attending that turn. They do not certify
human reading or APNs delivery. Legacy completed/running turns receive a
historical `readAt` during migration.

Schedules remain per participant and recipient. Due jobs join the same agent
queue and cannot bypass active attention. Schedule tools cannot list/edit/cancel
another participant's schedule. Completion creates push outbox entries only for
the turn's user and live sessions; shared membership does not broadcast replies.
Badges, read acknowledgements, sound deduplication, and tap routing continue to
use that participant's private conversation ID.

## Sharing API

All routes require the existing bearer session and `no-store`. Prefix:
`/api/v1/contacts/sharing`. Bodies are limited to 2 KiB and sharing admission to
40 requests per minute per user. Identity/ownership comes only from the session.

| Method | Path | Contract |
| --- | --- | --- |
| GET | `/:id` | Creator-only members, pending invitation IDs/expiry, and `contributorModel` |
| POST | `/:id/invitations` | `{ "shareMemory": true, "contributorConsent": true/false }`; returns `code`, `expiresAt` |
| POST | `/preview` | `{ "code": "..." }`; returns contact name, expiry, and `contributorModel` |
| POST | `/accept` | Code plus both consent fields; returns recipient `contactID` |
| DELETE | `/:id/invitations/:inviteID` | Creator revokes a pending invitation |
| DELETE | `/:id/members/:memberID` | Creator removes a non-owner participant |

`:id` is the creator's private contact ID; `:memberID` is an ID from the creator's
member list. Single-use acceptance and membership insertion share one D1 batch.
Random UUID codes are returned only on creation; D1 stores their SHA-256 digest,
not their usable plaintext. Codes travel in request bodies, not access-log URLs.
The digest is the revocation ID and cannot itself be used as an invitation.
No email, external message, or notification is sent by creating a code.

## Setup, rollout, and verification status

See [infrastructure](infrastructure.md#shared-contact-migration) for local and
automatic-release steps, prerequisites, compatibility, and rollback. Reuse D1,
R2, the existing Workflow/Cron, Meta configuration, auth, and APNs secrets. No
new binding, external service, account permission, or provisioning script is
needed. D1 configuration already points to the versioned migration directory.

Static TypeScript and Swift type checks, migration compilation on an empty
SQLite schema, SQL preparation, and whitespace checks cover this local change.
No app/Worker build, runtime test, live two-account exercise, inference, remote
migration, push, commit, or deployment was performed. Before claiming end-to-end
behavior, authorize and exercise fictional two-account invitation races,
independent history/read/badges/schedules/attachments, cross-user recall,
simultaneous sends, cancellation/removal during generation, failed memory
maintenance, control-plane failure/recovery, and iOS presentation. Static
validation does not establish runtime correctness or recall quality.
