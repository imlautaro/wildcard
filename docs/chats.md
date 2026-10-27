# Private conversations

Each participant has one private conversation with an agent. A [shared contact](sharing.md)
keeps the same identity, global memory, presence, and exclusive attention across
these conversations. Bearer-session authorization isolates each participant's
raw history, attachments, read state, notifications, and schedules. A new member
starts with no messages. Another participant's conversation ID still returns 404.

A human can explicitly [ask this agent to publish text in a common group](group-requests.md):
greetings, announcements, statements or questions. Ordinary posts confirm sending
without triggering automatic replies. Only a requested response from one specific
agent returns in an assistant-only private turn with `groupRequestID`
and empty `userText`. It uses normal unread/push delivery and cannot initiate
further group actions, mutate schedules or be manually retried. The conversation
is free for other messages while waiting for the group response. The planner uses
separate post/question tools and current tool results to report success or the
actual rejection category. Recent successful destinations can resolve references
in a fresh request; they cannot authorize replaying the old message.

## API contract

All routes require `Authorization: Bearer <session>` and return `Cache-Control:
no-store`. Prefix: `/api/v1/contacts/:contactID/chat`.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/turns?before=<sequence>` | Latest 50 turns, ascending, with `nextBefore` for older pages |
| POST | `/turns` | JSON `{ "id": "<client UUID>", "text": "Hello" }`; persist and return `{ turn }` with 202 |
| POST | `/turns/:turnID/retry` | Retry the latest failed human turn; autonomous schedule/group results cannot be retried; return `{ turn }` with 202 |

A turn includes `id`, global monotonic `sequence`, `userText`, nullable
`assistantText`, `status` (`queued`, `running`, `complete`, `failed`), `attempt`,
and millisecond `createdAt`/`updatedAt`, plus nullable `readAt` when the agent starts attending the turn
and nullable `groupRequestID` for automatic group results. Sequence gaps are normal and disclose no
message content. Internal workflow IDs, owners, and provider errors are omitted.
Repeated sends with the same UUID and trimmed text return the existing turn.
A reused UUID with different text returns 409. Only one active turn per participant conversation is allowed, enforced atomically in D1. Different participants can queue concurrently; one agent-wide attention claim admits exactly one to processing. Each user has at most ten active turns and
20 new send/retry admission attempts per minute. Messages allow 1–4,000 Unicode
code points after trimming, exclude NUL, and use a 32 KiB body limit. Missing
model configuration returns 503 before persisting a new send. Replies are capped
at 4,096 completion tokens, 256 KiB of provider JSON, and 20,000 code points.

## Durable execution

1. The HTTP handler commits a queued turn to D1 before acknowledging acceptance.
2. A short background dispatch atomically claims agent attention for the oldest waiting sequence, then creates `wildcard-chat` with a deterministic ID
   for this turn/attempt. It performs no inference in the HTTP request lifetime.
3. `ChatWorkflow` waits three seconds before connecting the agent and marking the
   turn running, then calls Meta's Chat Completions endpoint
   with the configured Muse Spark variant (`META_CHAT_MODEL`), and saves the reply to D1 before completing the step.
4. A Cron Trigger runs every minute, checks up to 50 pending turns, and recovers
   queued dispatch gaps. It checks five instances concurrently, rotating by last
   check time. Terminal instances with an unfinished row become failed and can
   be retried from the app. Temporary status-query failures are deferred.

Provider requests use manual redirect handling, as required by the Workers
runtime. Non-success responses, including redirects, are rejected without
forwarding the credential to another URL.

Generation has a 45-second timeout per model request and a three-minute step
timeout. It retries transient generation failures twice with exponential delay,
then persists failure. An attempt includes up to eight completed prior turns
within a 12,000-byte UTF-8 history budget, plus selected D1 memories. Long latest
turns are explicitly clipped. Older completed messages remain searchable through
bounded, private read tools; failed turns are excluded. See [contact memory](memory.md)
for extraction, retrieval limits, provenance, and rollout.

Accepted work continues independently of iOS. Closing the app before a send is
accepted cannot guarantee delivery; unsent drafts are not persisted. The client
retains the send UUID through uncertain network outcomes while the conversation
is cached. It polls every three seconds while active with a pending reply and
revalidates idle conversations on the same three-second tick to observe server presence. Returning to a cached conversation
displays its loaded history immediately. See [client caching](caching.md) for
lifetime, limits, invalidation, and manual refresh behavior. It offers earlier history, a multiline composer, pending status, and a
retry action for the latest failed reply. The Chats list shows the last reply or
user message, with a 500-code-point preview.

Scrolling more than 80 points away from the bottom reveals a floating circular
chevron-down button above the composer's voice/send side. Tap it to return to the
latest message; it disappears near the bottom. The overlay reserves no history
space. New replies and receipt updates preserve the scroll position while reading
older messages; initial history and a new optimistic outgoing message still scroll
to the bottom. Scrolling and button transitions respect Reduce Motion.

Each message bubble shows its send time with hours and minutes in the device's
local time zone and preferred time format. User messages use the turn's
`createdAt`; completed replies use `updatedAt`, recorded when the reply is saved.
Pending and failed reply indicators do not show a send time.

D1 state updates are conditional on attempt and status. A replay after a saved
reply skips inference. There is no exactly-once guarantee for the external Meta
request: a crash after provider acceptance but before saving can incur another
call on retry. Quota exhaustion, paused instances, or a persistently unavailable
Workflows control plane can delay work and require operator intervention. The
recovery job does not force a new inference attempt for an unqueryable running
instance. Inspect instance state and generic `chat_*_deferred` events; avoid
logging prompts, responses, tokens, or provider error bodies.

Deleting a contact cascades all its turns and requests termination of its active
workflow. Termination is best effort. An already accepted provider call may still
consume credits; conditional writes cannot recreate a deleted conversation.
Cloudflare workflow metadata/checkpoints have separate platform retention; only
turn IDs and attempt numbers are passed as workflow parameters, and step return
values contain no conversation text. Messages and selected memories are sent to Meta for replies and memory extraction;
this implementation does not establish a new consent or training-data policy.

## Voice input

When the draft is empty, the composer offers a microphone. Record, stop, and
review the Muse Voice Transcribe result as an editable draft before sending it.
See [voice dictation](voice.md) for permissions, formats, endpoint limits, privacy,
foreground lifecycle, and verification status. Durable generation begins after
sending the reviewed text; recording/transcription is not a Workflow job.

## Setup and release

See [infrastructure](infrastructure.md) for configuration, permissions, secret
handling, local setup, automatic releases, and rollback. Meta credentials require
access to Muse Spark 1.3. Configure `META_API_KEY` as an encrypted Workers Builds
secret; the guarded release script transfers it to the Worker's runtime secrets
without placing the value in Git, arguments, or logs. For local inference only,
add it to ignored `apps/api/.dev.vars`; leave it absent to work on auth/contacts
without making model calls. Restart Wrangler after changing local bindings or
secrets. Local Workflows/Cron emulation follows the versioned Wrangler config;
Cron recovery is not evidence of a production deployment.

Migration `0003_chat_turns.sql` adds the conversation table, composite contact-owner
foreign key, cascading deletion, and the partial unique active-turn index. It is
additive and compatible with the previous contact-only API. Code rollback does
not remove messages or stop existing workflow instances. Preserve the
`ChatWorkflow` export/binding while instances exist; pause new sends and drain or
explicitly terminate active work before a rollback to code without that class.
Do not delete the database or rewrite the migration to roll back.

## Verification status

Static TypeScript and Swift checking, release-script syntax, local migration
application, and whitespace validation were performed during implementation.
No application builds, automated tests, simulator runs, remote migrations,
production workflow creation, or paid inference were run. Installed-app behavior,
independent-account provisioning, token permissions, real model access, and
background completion still require verification after an authorized automatic
release. With fictional data, verify separate-user 404s, idempotent resend,
concurrent-send rejection, reload after app closure, retry after provider failure,
history paging, deletion during generation, and dispatch-gap recovery when runtime
checks are authorized.

## References

- [Meta Chat Completions](https://dev.meta.ai/docs/protocols/chat-completions)
- [Meta model availability](https://dev.meta.ai/docs/models)
- [Cloudflare Workflows API](https://developers.cloudflare.com/workflows/build/workers-api/)
- [Workflows execution rules](https://developers.cloudflare.com/workflows/build/rules-of-workflows/)
- [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)

## Reply notifications

Completed replies enqueue [APNs push notifications](notifications.md) atomically
with the saved response. Delivery and retries run independently of generation;
a provider failure never turns a saved reply into a failed chat. Apple setup and
an updated iOS installation are required. Foreground polling remains in use.

## Outgoing message checks

Persisted user messages show muted double checks after server acceptance. Colored
double checks appear only when the server records `readAt` as the agent starts
attending that turn. This replaces the previous fixed-delay simulation. Queued
messages in another participant's conversation remain unread until attention is
released. Retries retain their first recorded read time. These are server agent
processing receipts, not evidence of human reading or APNs delivery. The user's
unread-assistant-reply watermark remains a separate mechanism. Check sizes follow
Dynamic Type and accessibility exposes Received/Read.

## Immediate composer clearing and server typing

Tapping Send immediately clears the submitted text/attachment from the composer
and inserts an outgoing bubble before waiting for API acceptance. The bubble uses
local time and a clock receipt while sending; image previews use the selected
local bytes. Attachment preview actions become available after server acceptance.
ChatStore holds this optimistic presentation separately from persisted history,
so it never supplies a local sequence to pagination, read acknowledgements, or
reply retry. Polling cannot discard it. A matching persisted UUID replaces it
without a duplicate, using the server timestamp and normal receipts.

If sending fails, the existing history recovery checks whether the same UUID was
accepted despite the error. Only persisted history counts as acceptance. An
unconfirmed send removes the optimistic bubble and restores the submitted text
and attachment if there have been no subsequent draft edits. New draft text is
never cleared by a previous request's successful completion. Retries retain the
same UUID for unchanged content to avoid duplicate sends after uncertain results.
The local outgoing bubble is session memory only and is cleared on invalidation.

Replies show **Typing…** only when their own turn is running and global D1 presence
is `typing`. Queued turns have no waiting label. No client timer decides whether
the agent is generating a reply. Completed replies are never artificially delayed.

## Persisted contact presence

Migration 0013 supersedes the original per-conversation presence table/triggers below with one `agent_presence` row per shared agent. See [shared contacts](sharing.md#exclusive-attention-and-recovery) for current arbitration and recovery. The original migration history below describes how presence was introduced.

Latest/older history pages and send/retry responses include `presence` with
`status` (`offline`, `online`, `typing`), nullable `lastSeenAt`, and nullable
`expiresAt`, using Unix milliseconds. Ownership follows the existing contact
middleware. Presence is activity of the contact's server agent, not a human device
connection. `readAt` separately records processing admission.

For shared contacts, the API returns `typing` only to the recipient conversation
holding the current attention claim for a running turn and matching attempt.
Other participants receive `online` while the agent writes elsewhere. The global
presence row, last-seen timestamp, expiry, and exclusive attention remain shared.
This response projection uses existing D1 tables and the existing response shape;
no migration, binding, or iOS update is needed. Static TypeScript, SQL preparation,
and whitespace checks cover the change; runtime verification remains pending.

Migration `0008_contact_presence.sql` adds a private, cascading D1 table and atomic
turn triggers. Migration `0009_delayed_contact_connection.sql` updates them:
accepting a
message/retry keeps the previous presence (or Offline for a new conversation).
The Workflow waits three seconds durably before marking the turn running and
atomically connecting the agent as Online. Already-online contacts stay connected;
queue acceptance does not extend their lease. This wait also applies to retries
and continues with iOS closed.
The Workflow sets Typing immediately before reply generation, after prior-memory
maintenance. Saving a reply or failure atomically sets Online with a 30-second
idle deadline. Workflow sleep/expiry and the existing minute Cron persist Offline
and `lastSeenAt` equal to that deadline even if iOS is closed. Late expiry uses a
conditional deadline predicate so it cannot disconnect a newer message. History
reads also reconcile overdue presence before returning it. Cron/scheduler delays
can defer the physical update; history requests reconcile deadlines against
server time before reading presence.
Active work has a 15-minute lease, renewed on each generation attempt, to bound
stale presence if dispatch, recovery, or Workflows remain unavailable. Long-paused
work can therefore appear offline until another generation attempt starts.

The visible chat polls authoritative history/presence every three seconds. This
has polling latency and may miss very short Online/Typing phases; there is no
WebSocket service. Navigation/backgrounding and refresh failures clear cached
presence, showing **Loading...** until the next successful refresh.
The leading navigation-bar header places the avatar beside left-aligned name
and status. The avatar measures 38 points, with a compact 6-point gap before the
text. The header retains the native toolbar background and link style, with a
6-point leading padding reduction to bring the avatar closer to the capsule's
edge and 8 points of extra trailing padding after the name/status. It reserves
the subtitle line with **Loading...** while presence is unavailable, including
its accessibility value. The name and status use -2 points of vertical spacing
to tighten the visual gap left by the font line metrics.
The title shows Online, Typing..., Last seen today/yesterday at HH:mm, or a dated
Last seen
for older activity. A contact without prior activity shows Offline rather than an
invented date. Existing finished turns seed historical last-seen dates without
pretending they connected during migration. Existing active turns start Online.
Read checks use the persisted agent-attention receipt described above.

## Conversational presentation and reply length

The server-driven Typing indicator uses three softly animated dots with no spinner.
The dots pause while inactive; Reduce Motion keeps them still. New outgoing
messages and incoming replies use a 0.22-second fade with an eight-point
horizontal/four-point vertical offset. Reduce Motion uses a short fade only and
no animated scroll. The initial history load and earlier-history pagination do
not deliberately animate every existing message.

Bubbles measure their content with ViewThatFits. If the complete text and metadata
fit on one line, the time and outgoing checks sit beside the message. Longer or
explicitly multiline text uses the trailing metadata row underneath. This uses
actual layout measurements rather than a character-count cutoff and adapts to
Dynamic Type and the available width. Checks are 20 percent smaller, with the
same server acceptance/read meanings described above.

The model's system instruction now asks for natural, direct one-to-one replies,
usually one to three sentences, matching the user's language and tone. It avoids
unnecessary introductions, recaps, lists, repeated explanations, and automatic
follow-up questions. Longer answers remain appropriate when requested or required
by the topic/context; correctness and useful information take priority. The model
and token safety limit remain unchanged. This prompt applies to future generation
after the API's automatic commit/push release, without rewriting existing replies.
Static Swift/TypeScript and whitespace checks cover the source; no builds, tests,
visual device verification, or paid inference were performed for this change.

## Outgoing bubble colors

User bubbles use the adaptive OutgoingMessageBackground color asset: a pastel
blue (#D9E7FB, approximately 85 percent white mixed with the current #045DE3
primary color) in light mode and a deeper blue (#02255B, approximately 60 percent
black mixed with primary) in dark mode. Message text uses the system primary
foreground, and timestamps and Sent/Received checks use the secondary foreground.
Read checks use primary blue in light mode and pale cyan in dark mode. Keep this
asset aligned with AccentColor if the app's brand color changes. Contact bubbles
retain the system secondary background. Swift and whitespace checks passed;
visual device verification remains pending, with no builds or tests run.


## Visiting a chat and composing a draft

`POST /activity` accepts `{ "visitID": "<UUID>", "kind": "open" }`, `typing`,
or `leave`, scoped to the authenticated owner/contact. It returns `{ active }`;
this reports whether that visit lease accepts activity, not whether the agent is
already connected. This endpoint never receives draft text and never calls Meta.
Limits: 1 KiB JSON, 120 activity requests and 20 opens per user per minute, and
at most ten unclosed, unexpired visits per user. Open is idempotent by UUID;
replaying an expired or closed visit does not reopen it. A new interaction after
expiry uses a new UUID. Ownership filters cover every read and write.

Migration `0010_chat_visits.sql` stores private visit leases in D1 with cascading
contact deletion, indexes, and activity triggers. An open schedules a visit job
through the existing `CHAT_WORKFLOW` binding, using a separate `visit-` instance
ID and an explicit payload kind. Its branch performs no generation, memory work,
or push delivery. Three seconds after the server accepts the open, a durable
step connects the agent and preserves it for 30 more seconds. An idle open chat
does not keep renewing this lease and does not reconnect repeatedly after expiry.

Opening the keyboard counts once as activity. Subsequent actual composer edits
are coalesced on a separate three-second foreground activity loop and extend the
lease to 30 seconds after the server receives activity. Keeping the keyboard open
or retaining an unchanged draft does not keep the contact online. New interaction
after expiry can start a fresh delayed visit. Programmatic composer clearing after
Send does not count as a draft edit. History/presence polling runs independently;
activity requests have a five-second timeout and failures never block sending.
The first status change may take an additional polling interval to become visible.

Leaving or backgrounding closes the visit best effort, cancels an unconnected
visit, and stops edit heartbeats. An already-connected visit keeps its remaining
idle window. Tombstones prevent an out-of-order open from reconnecting a closed
visit. If delivery fails or iOS is killed, leases still expire without a client.
Expired records/tombstones are removed after one day by the existing Cron/expiry
path. No text or key contents are stored in visits, only IDs, timestamps and flags.

Multiple devices/visits extend the same contact presence. Real agent Typing takes
priority over draft activity; completing/failing a reply preserves any newer visit
lease while dropping the long generation lease. Expiry always checks the current
combined deadline so old jobs cannot disconnect current generation or drafting.
The visit job follows renewed deadlines for at most 120 sleep/check cycles; after
that Cron and authoritative reads continue expiry. Cron also attempts dispatch of
up to 20 still-pending, unexpired visits in groups of five. Dispatch outages can
prevent a short visit from connecting before its lease expires; the client retries
uncertain registration with the same UUID. No realtime service or new binding is
required, but visit jobs consume Workflows executions and activity adds D1 writes.

## Scheduled messages

[Schedules](schedules.md) add autonomous assistant turns with nullable `scheduleID`
and `errorCode`. Their `userText` is empty; clients must not render a user bubble
for them. Send optional IANA `timeZone` with new human messages to resolve local
scheduling requests. Existing message-only clients can omit it. Scheduled turns
share the normal presence, history, unread count, Workflow recovery, and push
pipeline, but cannot be manually retried or mutate schedules.


## Image and PDF messages

The composer paperclip adds one private image or PDF, with optional message text.
Turn JSON includes attachment display metadata; bytes are retrieved through an
owner-authenticated route and sent inline to Meta during generation. See
[attachments](attachments.md) for supported formats, API payloads, the 5 MiB limit,
context retention, migration, cleanup, provider data policy, and validation status.


## Bubble appearance experiment

Bubbles use a continuous outline with a small integrated pointed tail at the bottom
corner: left for incoming messages, right for outgoing messages. The tip extends
approximately 6 points outward and 3 points downward, with a slightly rounded tip
curving back into the side of the bubble.
The remaining corners retain their base radius (20 points for text/images,
16 for documents). This replaces the earlier decorative circle and half-radius
corner experiment. Image tails use the corresponding incoming/outgoing bubble color; image pixels remain
clipped to the bubble outline with a 2-point inner border in the bubble color. Message alignment, receipts, and attachment opening
retain their existing behavior.

Text bubbles and image captions use the same adaptive text/metadata layout. A
short single-line message shares its baseline with the time/checks; longer or
multiline text puts metadata beneath it. Images have their own rounded corners
inside the surrounding bubble and its 2-point rim.

Text, image, captioned image, and document bubbles use a flat appearance without
a drop shadow, in both individual and group conversations.


Group conversations have shared human/agent history and reuse the global agent attention queue. See [groups](groups.md) for finite reply rounds, consent, sender identities, group avatars, attachments and voice dictation.


Group and individual chats share `MessageBubbleView` and the composer field,
action button and scroll-to-latest control in `ChatControls.swift`. Shared controls
preserve the same glass treatment, dimensions and Dynamic Type scaling. Groups add
sender names/avatars and suppress unsupported read receipts. Groups also reuse
the attachment views, Photos/Files picker and voice recorder/transcription flow.
See [groups](groups.md).
