# Shared contacts

A shared contact is one agent with one identity, profile photo, memory space,
presence, and attention queue. Each participant has a separate private conversation,
read watermark, unread count, schedules, attachments, and push destinations. Joining
starts an empty chat. It never clones an agent or copies someone else's history.

Sharing alone gives no device access. A participant can separately allow another
current participant to request timers/alarms on their own linked iPhone through
this agent, and revoke that permission on iOS or web. See
[explicit device delegation](native-remote.md#allow-a-shared-contact-participant).
This permission does not expose either private conversation.

## iOS flow and consent

The creator opens a contact and chooses **Share contact** in the chat's three-dot menu. **Share
Contact** lists participants and pending invitations (remove/revoke are icon
buttons), with the general explanation behind an info button. **Invite someone**
opens a sheet that keeps the shared-memory text beside its consent switches and lets
the creator enter an existing user's email and tap **Send invitation**, or create an
invitation code. Web uses the same layout. The server resolves that address to an immutable account ID and creates
an in-app request for that account. The recipient opens **Chats → + → Contacts → Contact Invitations**
and accepts or declines there. Acceptance still
requires shared-memory consent and, when applicable, Contributor consent. No
mailbox email or invitation push alert is sent. The foreground app refreshes its
invitation inbox at most once every 15 seconds, immediately on foreground entry,
and on manual refresh. Its pending count appears on the Contact Invitations row, separate from message badges.

The optional **Invite with a code instead** disclosure retains the earlier flow:
create a code, share it with the system share sheet, and have the recipient choose
**+ → Contacts → Join Shared Contact**. Codes expire after 24 hours, are single-use bearer
capabilities, and are not bound to a recipient. Directed requests also expire
after 24 hours, but only the resolved recipient account may accept/decline them,
even if someone else knows their invitation ID.

Email lookup trims whitespace and matches case-insensitively. It requires an
existing account, rejects self-invites, and reports already-authorized members.
An existing member may be invited again if new Contributor consent is required.
Resending to the same account reuses an unexpired pending request without
extending its expiry; it does not create duplicates. Declining or creator
revocation removes the pending request without changing membership. Requests
follow account IDs if an address changes, and are removed if that account is
deleted. A new account registering the old address cannot claim them. Email
ownership verification remains unconfigured in authentication; this feature
selects an account by its registered address and does not prove mailbox ownership.

iOS rejects the signed-in account's own email before sending an invitation,
ignoring surrounding whitespace and letter case. The API remains authoritative.
Sharing requests display the API's bounded, plain-text validation errors for
self-invites, missing accounts, existing access, expired invitations, and rate
limits. These errors never fall through to contact-name or sign-up messages.
Missing/malformed error bodies use a sharing-specific fallback; HTTP 401 still
uses the existing expired-session handling. Install the updated app with Xcode
to receive this client-side correction. Static Swift type checks cover the fix;
no runtime tests, real invitations, build, or release were performed for it.

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

Migration `0014_directed_contact_invitations.sql` adds nullable `recipient_id`,
recipient-inbox indexing, and a unique pending request per agent/recipient. Existing
codes retain null recipients and their original behavior. Pending requests do not
create contact rows, grant memory access, or affect the agent's attention queue.

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
Workflow starts. It waits one second, changes that turn to `running` (Online),
records `readAt` a second later, catches up prior memories, marks the agent typing, generates and saves
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

`agent_presence` stores one status/deadline/last-seen value per agent. Replies,
group rounds and follow-up checks update that same row; chat visits no longer
connect the agent (migration 0045). Reads and Cron reconcile expired leases. All
participants share online/offline connectivity, last seen, and expiry, subject to
their polling time. Typing is visible only to the conversation whose running
turn holds the agent's matching attention claim and attempt. Other participants
receive `online`, even while the stored agent status is `typing`; a queued
conversation does not render a typing bubble. Checks use persisted `readAt` rather than the previous
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
Email lookup additionally admits at most ten attempts per user per minute. There
is no user-directory or autocomplete endpoint, and emails/requests are not logged.

| Method | Path | Contract |
| --- | --- | --- |
| GET | `/:id` | Creator-only members, pending invitation IDs/expiry/nullable `recipientEmail`, and `contributorModel` |
| POST | `/:id/invitations` | Consent fields plus optional `email`; directed requests return `invitationID`, `recipientEmail`, `expiresAt`; without email, returns `code`, `expiresAt` |
| POST | `/preview` | `{ "code": "..." }`; returns contact name, expiry, and `contributorModel` |
| POST | `/accept` | Either `code` or directed `invitationID`, plus consent fields; returns recipient `contactID` |
| GET | `/inbox` | Current account's first 100 unexpired pending directed invitations, soonest expiry first, plus `contributorModel` |
| DELETE | `/inbox/:inviteID` | Current recipient declines a pending request; idempotent 204 |
| DELETE | `/:id/invitations/:inviteID` | Creator revokes a pending invitation |
| DELETE | `/:id/members/:memberID` | Creator removes a non-owner participant |

`:id` is the creator's private contact ID; `:memberID` is an ID from the creator's
member list. Single-use acceptance and membership insertion share one D1 batch.
Random UUID codes are returned only on creation; D1 stores their SHA-256 digest,
not their usable plaintext. Codes travel in request bodies, not access-log URLs.
The digest is the revocation ID and is not a transferable invitation capability.
Directed requests expose this ID only to the creator and intended recipient;
ID-based acceptance additionally requires the matching authenticated account.
Code preview, membership insertion, consumption, and acceptance retries all
enforce recipient binding when present. Directed creation discards its random
plaintext code and returns no bearer code. No email, external message, or push
notification is sent by either flow. Only directed requests appear in the inbox.

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

## Directed invitation validation status

Migration 0014 compiles with the previous migrations against an empty SQLite
schema with foreign keys enabled. All 21 sharing SQL statements prepare with
EXPLAIN without executing application statements. TypeScript and Swift type
checks and whitespace checks cover this local extension. No builds, runtime
tests, real invitations, account lookup in production, inference, remote
migration, push, or deployment were run. Existing-account email matching,
duplicate requests, acceptance by a different account, decline/revoke/expiry,
acceptance retries, inbox refresh, and foreground/account-switch behavior need
authorized verification with fictional accounts before end-to-end claims.


Groups extend sharing to a common conversation with several users and contact agents. Invitation rights are granted per group member; adding a contact requires its creator and explicit memory consent. See [groups](groups.md).


The iOS screen retains its loaded metadata in a bounded session cache, renders it
immediately on return and revalidates in the background. See
[navigation caching](caching.md#group-navigation-and-secondary-screens) for
request deduplication, mutation/access invalidation and verification.

## Contributor account isolation

With per-account selection, a contact creator no longer has an implicit
Contributor exemption for other accounts’ memory retrieval/extraction. Foreign
contact/persona sources require explicit contact Contributor consent; the
processing account can submit its own bounded history. The creator’s explicit
acceptance in the contact invitation flow is saved on their own contact row.
Existing rows are not granted new consent automatically. Group processing
distinguishes its human requester from the agent owner’s lookup contact.
See [model settings](model-settings.md#sharing-and-mcp).

## Private messages between shared-contact participants

In your private chat, ask a shared contact: “Tell Alice I will be ten minutes late.”
The same contact places an assistant message in Alice's existing private chat,
prefixed with `Message from "<requester name>":`. No group is required. Both iOS
and web use the same API tools and existing chat rendering. Sharing help on both
clients explains delivery and attribution. This is an in-app message, not SMS.

The contact resolves actual participant IDs with `list_message_recipients`, then
uses `send_private_message`. Discovery returns current eligible names/IDs only,
never another person's messages, emails or files. Duplicate names and unresolved
recipients require clarification. A separate bounded semantic authorization checks
the current human request, requested text, recipient and at most three recent
clarification exchanges. Hypotheticals, capability questions, cancellations,
assistant suggestions and retrieved instructions cannot authorize a send. Only
the requested text crosses chats. Sharing does not authorize copying transcripts.

Delivery requires both existing contact projections for the same shared agent,
its creator's continued participation, current sharing and applicable Contributor
consent. Connector-isolated chats on either side are ineligible. Contact instances
are fixed before authorization and rechecked atomically with the running source
attempt/agent attention at save. Tasks, schedules, initiative, group replies and
returned group answers cannot invoke these private tools. A message scheduled for
another participant is authorized when the human creates the schedule and delivered
verbatim later without inference, never by a scheduled model turn. A recipient can reply
normally to the contact; returning that reply to the requester requires another
explicit send request from that recipient. No automatic relay loop is created.

### Images and scheduled messages

`send_private_message` can attach one image, with the message as its caption:
`generatedImage` is the position of an image that `generate_chat_image` created earlier
in the same reply, and `chatImage` is a `search_chat_images` reference to a photo of the
requester's own chat (including one the human just sent). The image is resolved with
the same live access checks as image search before authorization, and authorization
must find a request to send that participant an image. The bytes are copied to a new
object under the recipient's chat prefix and attachment registry, so the recipient's
cleanup and image search never depend on the requester's chat, and the requester's
generation prompt or descriptions never reach them. A generated image also stays in
the requester's chat as the reply. If the image cannot be resolved or copied, nothing
is sent. iOS and web render it as an ordinary contact image message.

For a later time, the contact uses `create_schedule` with `recipientUserID`; see
[Schedules](schedules.md#messages-for-another-participant). The contact is instructed
never to deliver something meant for another participant in the requester's chat
as a substitute, and to say plainly when a send or schedule fails.

One message/recipient is allowed per human turn, up to 2,000 Unicode characters /
8,000 UTF-8 bytes. Each source and target contact has a 12-message rolling daily
limit. The existing six tool executions/three rounds and human send limits apply;
authorization adds one model completion capped at 2,048 tokens with at most 32 KB
of evidence. No additional inference generates the delivered text.

Migration 0084 adds `private_contact_message` and `chat_turn.is_private_relay`.
A D1 batch saves the complete assistant-only turn, unique source-turn receipt and
push outbox together. A retry, changed arguments or failed private confirmation
returns the original outcome; it cannot change content/destination. Recipient
history clear/removal retains a receipt with null destination so it cannot
resurrect the message. Source clear/deletion removes its receipt, while the
already-delivered recipient message remains. Old attempts cannot save without
current source/attention. Receipts confirm persistence, never reading or APNs
acceptance. Unknown writes recover their receipt or report uncertainty.

Messages use ordinary private history, unread counts and list previews without a
fake human bubble. iOS uses the existing optional APNs provider/outbox, checked
against the original sharing/contact/model permissions before enqueue and before
submission. Ending access or adding connector isolation stops unsent alerts;
rejoining creates no new authority for an old receipt. Already delivered text and
accepted APNs alerts are not recalled. Web receives messages through ordinary
foreground polling; it has no browser push. Direct complete inserts do not enqueue
human-memory extraction, agent self-memory or autonomous reply work.

### Cache and verification

There is no new client fetch, recipient-directory cache, persistent client store
or endpoint. Tool discovery is a small live server read per request because current
permissions are essential. iOS/web reuse session-owned chat/list caches, existing
polling/explicit refresh, request deduplication, history pagination/budgets,
late-response rejection and account/access-loss invalidation. Original pending
submission IDs survive navigation as before. A saved delivery appears on the
recipient's next ordinary sync; transient failures retain already loaded content.
No other participant's history is downloaded by the requesting client.

Static API/web type checks, Swift parsing, all 84 migrations compiled in empty
in-memory SQLite, relay SQL preparation and diff checks passed. No tests, builds,
model inference, real messages, notifications, persistent migrations or release
were run. After the automatic release, verify using fictional accounts on iOS/web:

- A shared contact with no group delivers a literal message once, with the right
  name, recipient preview, unread count and no sender access to recipient history.
- Recipient ambiguity, no common contact, missing/removed participant, connector
  isolation, applicable model consent, cancellation and unsupported autonomous sends.
- Voice-transcribed requests, immediate clarification, recipient reply followed by
  an explicit return message, and ordinary ongoing private chats.
- Duplicate tool calls/retries, changed arguments, lost database acknowledgement,
  limits, recipient clear/removal/rejoin and source deletion around save/push.
- Reopen/back, empty cached chat, refresh, offline recovery, account switch,
  foreground sync and iOS closed-app APNs with the independent installation's keys.

See [reproducible setup and rollback](infrastructure.md#private-shared-contact-messages--migration-0084).

### Reply references and authoritative send history

A fresh human request such as “Tell him back I adore him” can refer to the sender
of a received private relay. The server supplies up to three incoming references
from the last twelve completed turns, plus an explicitly quoted relay when present,
with message ID, actual sender user ID/name, saved time and at most 1,600 UTF-8 bytes
of locally received text per item. Identity comes from the persisted receipt, never
from names or instructions embedded in the message body. Both contacts must still
be eligible under sharing/isolation/model checks. The authorization model sees the
same verified references as the chat planner; a quoted incoming sender takes
precedence, otherwise the latest relevant sender can resolve a reply. Competing
references require clarification. Receiving text never authorizes replying by itself.
The other participant's original request, private history and subsequent replies
are never retrieved for this purpose.

Every ordinary private human turn also receives up to six recent outgoing receipts
from its own chat. They identify source turn, recipient when still available, save
time, whether the delivered turn remains and a bounded excerpt of its sent text.
These facts override historical assistant claims, including mistaken denials.
`get_private_message_receipts` searches older receipts by source turn ID or a
literal substring of the original request/sent text; it never sends a message or
reads recipient replies. Source deletion still removes its receipt; recipient
history deletion retains evidence that a send occurred with text unavailable.
This uses migration 0084's existing records, including messages sent before this
repair. No new migration or backfill is needed.

A thank-you, a delivery-status question or a correction is not a send request.
A failed new attempt does not revoke an earlier successful delivery. A vague retry
of a successful send confirms its receipt; sending another copy requires an
explicit request for another copy. Replays of the same source turn still return
its one original receipt. Receipts prove a saved message, never reading or push
acceptance. Semantic ambiguity remains fail-closed.

`private_relay_result` logs fixed tool/stage/outcome codes and the send flag;
`private_relay_failed` records only stage/sanitized exception code. No message
text, participant/turn IDs, prompts, arguments, provider body or credentials are
logged. Pre-save failures, uncertain saves and recorded successes are distinct.
The previous release did not log normal rejection reasons, so the precise first
rejection in the reported incident cannot be reconstructed from database receipts.

This repair changes the shared API for both iOS and web, without client protocol,
UI, polling, cache lifetime, pending IDs or retry changes. Static API/web types and
preparation of nine relay/access SQL statements over the 84-migration empty SQLite
schema passed; no local tests/builds, live inference, sends or notifications were
run. Runtime verification remains required: reply by pronoun immediately after a
received message, quote an older sender among several participants, resolve duplicate
names by receipt ID, acknowledge a successful send, challenge an earlier false
denial, search an older receipt, request a second copy explicitly, and check that
cancellations, access loss and injected message-body instructions cannot send.
