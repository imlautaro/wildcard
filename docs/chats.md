# Private conversations

Web navigation uses a solid primary **+** icon button in the Chats header to open
Contacts. On wide screens a navigation rail switches between Updates, Chats and
Account; the chat list is shown beside conversations and new-chat flows and hidden
(not destroyed) on Updates and Account, keeping its Archived selection and scroll
position. Below 860 px a menu button to the left of Chats opens Updates and Account,
and pages replace the chat list. This layout change is scoped to web; iOS retains native navigation.
See [web layout](web.md#design) and [cache behavior](caching.md#web-app).

Ordinary human requests can use bounded [web research](web-research.md). The
contact normally uses the findings to understand the topic and continue the chat,
without creating a document. A requested lasting report uses the same sourced
document and source panel on iOS/web. Recent conversational findings remain scoped
to this participant/agent chat for bounded follow-up context. Autonomous and connector-isolated
turns do not gain search. See [agentic limits](agentic-limits.md) for budgets,
uncertain-outcome handling and the boundaries before persistent work.

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

## Temporal conversation context

Private replies receive the current UTC time, the current message's validated
recipient time zone and local date/time, and dated recent human/reply messages.
Each published assistant bubble uses its stored publication time. Legacy replies
without bubble metadata use the turn's last update, explicitly marked approximate.
The dates count toward the existing 12,000-byte recent-history budget.

Server timing distinguishes the gap before the current human burst from time
spent waiting for generation. Consecutive batched human messages share the first
arrival as that burst's boundary, so an older pause is not erased by a second
short message. The summary uses only rendered, bounded history; it does not claim
complete silence or infer read status. Scheduled/task turns are labeled automated.
Missing/invalid time zones retain UTC dates without guessing a local greeting.

A pause or a new local date does not reset memory or force a greeting. Contacts
may briefly acknowledge a return or an unfinished question when the current
message and [personality](personality.md#returns-after-a-pause) make it welcome.
Current tasks, urgent requests, sensitive disclosures and explicit quoted replies
take priority. Silence does not create an obligation to answer an old question.
The server does not classify every pause as abandonment or add relationship
penalties from this timing context. Existing relationship behavior is unchanged.

This is shared API behavior for iOS and web, including connector-isolated chats
within their existing local history boundary. No migration, additional model
call, service, client setting or cache is introduced. Histories retain their
existing polling, refresh, invalidation and pending submission behavior. It does
not add daily outreach or change [initiative](initiative.md) scheduling.

With fictional conversations, verify morning returns after hours, a short exchange
across midnight, direct tasks and sensitive messages after a long gap, an explicit
quote resuming an old topic, an unrelated new topic after an unanswered question,
batched messages, queued processing across a local-date boundary, multiple reply
bubbles, approximate legacy dates, DST and unknown zones. Compare warm/reserved,
patient/restless and playful/serious profiles, plus disabled personality. On both
clients check reopen/back, refresh and offline recovery through ordinary history
polling. Type checking does not establish real-model phrasing or device behavior;
those checks remain pending until performed with authorization.

## API contract

All routes require `Authorization: Bearer <session>` and return `Cache-Control:
no-store`. Prefix: `/api/v1/contacts/:contactID/chat`.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/turns?before=<sequence>` | Latest 50 turns, ascending, with `nextBefore` for older pages |
| POST | `/turns` | JSON `{ "id": "<client UUID>", "text": "Hello" }` plus optional [`replyTo`](replies.md#api); persist and return `{ turn }` with 202 |
| POST | `/turns/:turnID/retry` | Retry the latest failed human turn; autonomous schedule/group results cannot be retried; return `{ turn }` with 202 |

A turn includes `id`, global monotonic `sequence`, `userText`, nullable
`assistantText`, `status` (`queued`, `running`, `complete`, `failed`), `attempt`,
and millisecond `createdAt`/`updatedAt`, plus nullable `readAt` when the model successfully processes the turn
and nullable `groupRequestID` for automatic group results, plus nullable [`replyTo`](replies.md#api) quotes. Sequence gaps are normal and disclose no
message content. Internal workflow IDs, owners, and provider errors are omitted.
Repeated sends with the same UUID and trimmed text return the existing turn.
A reused UUID with different text returns 409. Multiple human turns can queue in the same conversation, enforced atomically within the account-wide limit. Different participants can queue concurrently; one agent-wide attention claim admits exactly one to processing. Each user has at most ten active turns and
20 new send/retry admission attempts per minute. Messages allow 1–4,000 Unicode
code points after trimming, exclude NUL, and use a 32 KiB body limit. Missing
model configuration returns 503 before persisting a new send. Replies are capped
at 4,096 completion tokens, 256 KiB of provider JSON, and 20,000 code points.

## Durable execution

1. The HTTP handler commits a queued turn to D1 before acknowledging acceptance.
2. A short background dispatch atomically claims agent attention for the oldest waiting sequence, then creates `wildcard-chat` with a deterministic ID
   for this turn/attempt. It performs no inference in the HTTP request lifetime.
3. `ChatWorkflow` waits one second, applies composer pacing and batching, then
   connects the agent by marking the turn running, marks it read, then calls Meta's Chat Completions endpoint
   with the configured Muse Spark variant (`META_CHAT_MODEL`), and journals the prepared reply before a separate publication step. See composer pacing below.
4. A Cron Trigger runs every minute, checks up to 50 pending turns, and recovers
   queued dispatch gaps. It checks five instances concurrently, rotating by last
   check time. Terminal instances with an unfinished row become failed and can
   be retried from the app. Temporary status-query failures are deferred.

Provider requests use manual redirect handling, as required by the Workers
runtime. Non-success responses, including redirects, are rejected without
forwarding the credential to another URL.

Generation has a 45-second timeout per model request and a three-minute step
timeout. It retries transient generation failures twice with exponential delay,
then persists failure. An attempt includes up to twelve completed or batched prior turns
within a 12,000-byte UTF-8 history budget, plus selected D1 memories. Long latest
turns are explicitly clipped. Older completed messages remain searchable through
bounded, private read tools; failed turns are excluded. See [contact memory](memory.md)
for extraction, retrieval limits, provenance, and rollout.

Accepted work continues independently of iOS. Closing the app before a send is
accepted cannot guarantee delivery; unsent drafts are not persisted. The client
retains the send UUID through uncertain network outcomes while the conversation
is cached. The session synchronizer polls every second while active and
revalidates idle visible conversations on the same tick to observe server presence. Returning to a cached conversation
displays its loaded history immediately. See [client caching](caching.md) for
lifetime, limits, invalidation, and manual refresh behavior. It offers earlier history, a multiline composer, pending status, and a
retry action for the latest failed reply. The shared iOS composer in private chats
and groups uses a continuous rounded rectangle with a fixed 22-point corner radius,
so its corners do not grow as the field expands from one to six lines. Verify
single-line, wrapped and explicit multiline drafts, including larger Dynamic Type,
in both chat types on a device; visual behavior has not been device-verified.
This presentation change does not affect draft storage, caching or network requests.
The Chats list shows the last reply or
user message, with a 500-code-point preview.

In private chats and groups, tapping the message history (including empty space)
dismisses the iOS composer keyboard. Interactive dismissal while scrolling remains
available. The tap gesture runs alongside message interactions. On the web,
tapping outside the focused message field blurs it so the mobile keyboard can
close; pointer events retain their normal behavior. Dismissing the keyboard keeps
the draft, attachments, reply target, and session-owned history cache intact and
makes no network request. Verify on a device with empty and populated histories,
after reopening a cached chat, and with message links, image previews, quoted
replies, long-press reactions, and swipe-to-reply. Device verification is pending.

Scrolling more than 80 points away from the bottom reveals a floating circular
chevron-down button above the composer's voice/send side. Tap it to return to the
latest message; it disappears near the bottom. The overlay reserves no history
space. New replies and receipt updates preserve the scroll position while reading
older messages. On iOS, cached history opens at the bottom using the default
scroll anchor; first-load positioning disables animations. Native `ScrollPosition`
targets the bottom content edge, including scroll insets, rather than a marker row.
While following the latest message, content size, viewport and inset changes
realign that edge without animation once scrolling is idle. Offset-only updates
cannot trigger a corrective loop. Touching/dragging the history, loading earlier
messages or following a quote disables this alignment; an explicit latest-message
scroll enables it again. Bottom-distance observation includes the bottom scroll
inset reserved for the composer. Loaded message rows
use a regular `VStack` so long text has a measured height before positioning,
instead of correcting lazy height estimates while entering the chat. New messages
can scroll to the bottom, including an optimistic outgoing message; receipt-only
updates do not trigger a private-chat scroll or insertion animation. The chevron's
fade is scoped to its overlay so crossing the 80-point threshold does not animate
the history layout. Scrolling and button transitions respect Reduce Motion.

This iOS presentation change preserves the session-owned stores, pagination and
cache rules; it adds no requests or persistence. Measuring all loaded rows trades
lazy rendering for stable positioning, so opening very large histories or explicitly
loading many earlier pages needs device performance verification. Verify cold and
cached entry with a final message taller than the viewport, long Markdown, images,
keyboard dismissal, incoming/outgoing messages, receipt polling, older-history
reading/pagination, quoted navigation and Reduce Motion. On October 29, 2026,
the user confirmed that the affected chat now opens correctly after the native-edge
alignment change. The broader device matrix and large-history performance remain
unverified; static validation cannot establish the absence of visual flicker.

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

When the draft is empty, the composer offers a microphone for recorded voice
messages: hold to record and release to send. Messages are transcribed after
sending, never before. See [voice messages](voice.md) for gestures, formats,
endpoint limits, privacy, caching and each client's implementation.

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
double checks appear when the server records `readAt`, after the attending agent is
connected and before it types (see [message lifecycle order](#message-lifecycle-order)).
Queue admission alone does not mark it read. Queued
messages in another participant's conversation remain unread until attention is
released. Retries retain their first recorded read time. These are server agent
processing receipts, not evidence of human reading or APNs delivery. The user's
unread-assistant-reply watermark remains a separate mechanism. Check sizes follow
Dynamic Type and accessibility exposes Received/Read.

Home shows the same persisted receipt to the left of an outgoing private-message
preview, including attachment-only messages. `lastMessageFromUser` and
`lastMessageReadAt` come from the same latest turn as the preview. Incoming agent
previews do not show outgoing checks. Private Received means durable acceptance
into the agent's server inbox, not human-device or APNs delivery. Previously stored
private `readAt` timestamps retain their older attention-admission meaning; this
change does not retroactively certify model processing of historical turns.

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
connection. `readAt` separately records successful model processing.

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
The Workflow waits one second durably (three seconds before migration 0045) before
marking the turn running and atomically connecting the agent as Online. Already-online contacts stay connected;
queue acceptance does not extend their lease. This wait also applies to retries
and continues with iOS closed.
The Workflow marks the message read, maintains prior memories and starts reply
generation at once; the short reading pause runs concurrently, and Typing starts
when it ends while the model is still working (see
[responsive orchestration](#responsive-orchestration-2026-10-30)). Saving a reply or failure atomically sets Online with a 30-second
idle deadline. Workflow sleep/expiry and the existing minute Cron persist Offline
and `lastSeenAt` equal to that deadline even if iOS is closed. Late expiry uses a
conditional deadline predicate so it cannot disconnect a newer message. History
reads also reconcile overdue presence before returning it. Cron/scheduler delays
can defer the physical update; history requests reconcile deadlines against
server time before reading presence.
Active work has a 15-minute lease, renewed on each generation attempt, to bound
stale presence if dispatch, recovery, or Workflows remain unavailable. Long-paused
work can therefore appear offline until another generation attempt starts.

The session synchronizer polls visible authoritative history/presence every second. This
has polling latency and may miss very short Online/Typing phases; there is no
WebSocket service. Navigation/backgrounding and refresh failures clear cached
presence, showing **Loading...** until the next successful refresh.
The navigation-bar header uses the principal title slot, placing the 38-point
avatar beside the left-aligned name and status with a compact 6-point gap. Tapping
it opens contact details. It reserves the subtitle line with **Loading...** while
presence is unavailable, including its accessibility value. The name and status
use -2 points of vertical spacing to tighten the font line metrics.

On iOS the header has a bounded width (bar width minus 160 points for the back
button, actions menu and margins, at least 120 points; `ChatHeaderLayout`), so long
contact and group names truncate on one line. It must stay in `.principal`:
placing the identity in `.topBarLeading` allowed iOS to collapse it and the actions
menu into a system overflow menu even with the width bound, creating two menu
levels. The principal title has no extra side-action padding. Chat actions (Tasks,
Schedules, Share contact; Tasks in groups) remain in one trailing three-dot menu
(`ChatActionsMenu`) whose buttons push onto the Home stack. This correction is
scoped to iOS by request; web keeps its header buttons. Existing session stores,
presence refresh and avatar caching are unchanged; no requests or cache are added.
Device checks pending: cold/cached entry, long names on small phones, landscape,
large Dynamic Type, presence updates, opening actions in one tap, title navigation
and back navigation in private and group chats.
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


## Message lifecycle order

Migration `0045_presence_ordering.sql` makes every visible state follow one order
in private chats, groups and follow-ups: a message is delivered, the contact
connects (Online), reads it, and only then types. A client can never observe Read
before Online, or Typing before Online and Read, from the server state.

- Private chats: one second after attention is claimed the turn becomes `running`,
  which connects the agent. After another second `markRead` records `readAt` on the
  turn and its earlier batched messages, only while the agent is connected. Memory
  maintenance follows; generation then starts while the reading pause (`readingDelay`,
  0.4–2.5 seconds by length) elapses, and `markTyping` requires the stored `readAt`. A fast generation still shows
  typing for at least the length-aware composition budget before the first text
  bubble, crediting generation time already spent typing. Each successive text
  message starts its own wait with Typing visible; recovery uses the same path.
  Text budgets grow at 12–16 Unicode characters per second plus a small lead-in
  and paragraph pauses, capped at 15 seconds per bubble. Voice retains a separate
  short Recording lead-in. See [successive messages](reply-messages.md) for details.
- Opening a chat or editing a draft never connects the contact. Visit activity only
  paces replies and follow-ups (see [visiting a chat](#visiting-a-chat-and-composing-a-draft)).
- Follow-up checks connect the contact for the decision, type for `messageDelay`
  when they send, and otherwise go Offline about five seconds after the check. See
  [conversation initiative](initiative.md#publication-and-control).
- Groups follow the same order; see [group receipts](groups.md#delivery-and-read-receipts).

A read is therefore a simulated contact action, not proof that a model response
succeeded: a generation failure after the read leaves a read message with a failed
reply, which the existing retry handles. All delays are deterministic Workflow
sleeps so replay cannot reorder them.

## Visiting a chat and composing a draft

Since migration 0045, visits never connect the contact: the presence trigger is
dropped, opens no longer start visit jobs and the Cron no longer recovers them.
Legacy `kind: visit` Workflow instances finish immediately. Visits still record
leases and `typing_at` for reply pacing and follow-up deferral. The paragraphs
below describe the earlier connection behavior where they mention Online.

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

## Chat list previews

The second line of a row in the Chats list (iOS Home and the web chat list, private
chats and groups alike) shows, in this order of priority:

1. Live activity (`Typing...`, `Recording...`, `Researching...`) and `Cleaning up...`.
2. An unsent draft: **`Draft:`** in the accent color followed by the composer text on
   one line (whitespace collapsed, at most 500 characters). Attachments alone do not
   count as a draft. No receipt or microphone icon is shown with it.
3. A reaction newer than the last message: `You: reacted with 👍` when you reacted,
   `Reacted with 👍` when the contact reacted in a private chat, and
   `<Name>: reacted with 👍` when another member or contact reacted in a group (the
   name is the viewer's alias for contacts). An unnamed group actor falls back to
   `Reacted with 👍`.
4. The last message, as before.

The row's time and the list order still follow the last message: a reaction only
changes the label and never moves a chat up, so server cursor pagination
(`COALESCE(lastMessageAt, createdAt)`) is unchanged. A draft keeps a chat that has no
messages yet in the list, at its creation time. Changing a reaction's emoji counts as
new activity; picking the same emoji again does not. Removing the newest reaction
falls back to the previous newer-than-message reaction, or to the last message.

### Drafts

On web, the open private chat or group hides its draft label and keeps the normal
activity, reaction, or last-message preview in the list. Leaving the conversation
reveals unfinished composer text as **Draft:**; reopening it hides the label again.
An otherwise empty contact with a draft stays in the list while open, with its
normal empty preview. This presentation rule is web-only.

The composer text belongs to the session conversation cache, not to the chat screen:
iOS keeps it in `ChatStore.draft` / `GroupChatStore.draft`, web in the existing
`entry.draft` of `useConversation` / `useGroupConversation`. Leaving and reopening a
chat restores it in the input. Drafts are memory-only and never sent to the server;
they are lost when the app or tab is closed, on sign-out or account change, and when
a chat is cleared, deleted or loses access (its cached conversation is discarded).
A conversation with a non-empty draft is never evicted from the bounded caches (8 on
iOS, 20 on web), the same protection pending sends have.

### Reactions

`GET /api/v1/contacts` (and single-contact responses) and `GET /api/v1/groups` (and
`GET /groups/:id`) include `lastReaction: { at, emoji, own, name? } | null`: the
newest reaction in that chat, by anyone, with `name` only for groups. Clients show it
only when `at` is greater than the last message time they display (including a
cached newer message) and no send is in progress. Migration 0090 adds
`message_reaction.created_at` and the owning `contact_id` / `group_id`, written by
every human and agent reaction, with partial indexes so each list row is one index
seek. Reactions saved before migration 0090 have no time and never become the
preview. The list picks up a new reaction on its regular polling (1 s on web and on
the iOS foreground synchronizer); there is no optimistic list update after reacting.

### Verification

Static: API and web `tsc`/`vue-tsc`, the iOS `swiftc -typecheck`, and migration 0090
on a scratch local workerd D1 with seeded fictional rows: backfill of `contact_id` /
`group_id` on legacy reactions, the real `writeReaction` statements (user and agent,
private and group, emoji change vs. same emoji), both full list queries and the
index plan. Not verified: device or browser runs, polling timing, visual styling,
staging/production migration. Check with fictional accounts: type without sending,
go back, see `Draft:` and reopen the chat with the text in the input (private and
group, iOS and web); send and confirm the label disappears; react and have the
contact react and confirm both labels, then send a message and confirm the label
returns to the message; group reaction by another member shows their name; sign out
and back in and confirm drafts are gone.

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

## Stickers in chats

The composer has a sticker button right of the message field (left of send/microphone) in private chats
and groups. A sticker is sent alone as `sticker: { id }`, shows as a bare transparent image without a
bubble, and supports quotes, replies and reactions. Contacts reply with stickers in private chats and
the long-press menu of their stickers offers **Save sticker**. See [stickers](stickers.md#ios) (iOS) and
[caching](caching.md#stickers-ios).


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


Group conversations have shared human/agent history and reuse the global agent attention queue. See [groups](groups.md) for finite reply rounds, consent, sender identities, group avatars, attachments and voice messages.


Group and individual chats share `MessageBubbleView` and the composer field,
action button and scroll-to-latest control in `ChatControls.swift`. Shared controls
preserve the same glass treatment, dimensions and Dynamic Type scaling. Groups add
sender names/avatars and aggregate [group receipts](groups.md#delivery-and-read-receipts). Groups also reuse
the attachment views, Photos/Files picker and the [voice message](voice.md) recorder,
composer gesture and bubble.
See [groups](groups.md).

## Shared Home and chat state

Home projects the same cached turn and receipt evidence as the conversation, and
foreground APNs requests synchronization before sound presentation. List refreshes
warm already opened conversations with changed previews or pending replies. Shared
requests survive navigation cancellation and merge delayed results without
regressing completed replies or read evidence. Catch-up bridges missing pages. See
[shared synchronization](caching.md#shared-conversation-synchronization) for request
ownership, timing limits, isolated regressions and device verification. This is an
iOS-only change using the existing API; install the updated app.

Read observations are enqueued synchronously by the visible chat and acknowledged
by the session, so leaving the screen cannot cancel the write. Failed reads retry
from the foreground timer while Home is visible. Counters update on server
acknowledgement, and stale lists cannot resurrect them. Conversation cache hits
change only non-observable LRU bookkeeping, preventing a lookup during render from
triggering its own render again. See [read acknowledgement lifetime](caching.md#read-acknowledgement-lifetime).

## Private message reactions

See [message reactions](reactions.md) for the shared iOS/web selector, actor and
message identity, agent tools, permissions, mutation retries, session cache freshness
and verification steps. Reactions use existing conversation synchronization and
add no unread messages or push alerts.

## Private message replies

See [message replies](replies.md) for the shared iOS/web Reply actions, quote
payloads, target validation, agent context, cache behavior and verification steps.
Replies are ordinary messages that carry a quoted earlier message; they add no new
request type, store or notification.

## External MCP tools

Private direct human turns in isolated contact chats can discover and call explicitly
authorized MCP tools. These chats use Standard, exclude shared-memory export and disable
group posting/delegation and schedule creation/editing. Durable reservations prevent
automatic replay of uncertain external writes. See [connections](connectors.md) for
limits, permissions, supported transports and pending verification.

## Per-account model selection

Private reply Workflows checkpoint the conversation account’s Standard/Contributor preference at startup; schedules and group-result deliveries use that account too. Contact-memory extraction reads its source account’s selection. MCP chats still force Standard. Preferences apply to new jobs; completed replies and already-started jobs keep their result/model.

See [model settings](model-settings.md) for the API, shared consent, cache behavior,
AI Gateway spending and pending runtime/device verification.


## Failed replies and response recovery

Reading, typing and idle-presence pauses checkpoint their remaining duration and
use relative Workflow sleeps only when time remains. Memory refresh, generation,
retries or delayed execution may consume the original deadline; an elapsed pause
continues immediately instead of failing the reply before inference or delivery.
The checkpoint keeps the sleep decision stable on Workflow replay. This shared
server behavior applies to iOS and web without changing conversation caches or
retry permissions. Verify short messages with slow memory refresh, generation
longer than typing, and resumed Workflows using fictional accounts after release;
static validation alone does not establish production recovery. Existing failed
turns retain their status and use the existing latest-turn retry action.

Both clients keep a failed-reply notice directly below the corresponding private
turn: **The reply to this message couldn't be completed.** A notice stops being
shown once a later turn in loaded history contains an assistant reply. Failed
rows are retained; they no longer accumulate as active visual failures after the
agent resumes replying. The existing latest-turn-only manual retry restriction
remains, including its server-side concurrency and account checks.

After the existing generation retries exhaust a recoverable model error, a direct
human turn gets one separate, one-minute recovery step with no retry and no tools.
It rebuilds bounded current context with the same model/isolation/consent rules and
explicitly tells the agent the earlier attempt failed. Original tool receipts from
the failed generation step are not supplied to this new context; it must not
invent external outcomes or claim their success/failure. The agent can answer
from available evidence or explain incomplete work and uncertainty. It cannot
promise to act later or silently repeat MCP/group/schedule operations.

This applies only while the original turn remains running and authorized; scheduled
turns and private group-result deliveries retain their existing failure behavior.
Access/configuration/storage errors do not trigger recovery. Saved replies use the
same transaction, notification outbox, read acknowledgements, memory maintenance
and attention release as normal replies. Persistent model outages still produce a
contextual failure with manual retry, not a fabricated assistant message.
Sanitized `chat_reply_failed`, `chat_reply_recovered` and
`chat_reply_recovery_failed` events identify the branch without chat content;
failed turns retain the sanitized code rather than a generic generation error.
See [caching](caching.md#reply-failure-presentation) for cache/device verification.

## Garbled characters

Contact replies occasionally showed sequences such as `ðŸ˜€` or `â€™` instead of an
emoji or a curly apostrophe (reported 2026-10-31). That is UTF-8 text decoded as
Windows-1252. The API decodes provider responses as UTF-8 and neither client decodes
message text with another encoding, and no affected rows exist in local data, so the
garbled text most likely comes from the model output itself; the exact source is
unconfirmed. `shared/mojibake.ts` (`repairMojibake`) repairs it in `museCompletion`
(`chat/meta.ts`), which every contact reply, group message, initiative message,
Updates card, document and tool argument passes through, and in the web research
report (`research/model.ts`). Earlier assistant messages in model history are repaired
before each request so the model is not invited to imitate them.

Only sequences that decode to a plausible character are rewritten: Latin-1 letters
(`Ã©` → `é`), general punctuation, arrows and symbols, variation selectors, CJK
punctuation and emoji. An emoji fragment whose remaining bytes were lost (`ðŸ`
followed by ordinary text) is removed. Ordinary text, including accented Spanish,
Portuguese and French, is left unchanged. Stored messages are not rewritten; messages
that already contain garbled text keep it. Offline regression:
`node scripts/checks/mojibake.mjs`. No client change.

## Bot message Markdown

Both iOS and web format bot replies in private chats and groups, including replies
already in loaded history. Essential Markdown supports paragraphs, emphasis,
strong emphasis, strikethrough, headings, ordered/unordered and nested lists,
quotes, explicit links, inline code, fenced/indented code, and basic tables.
iOS uses Foundation's Markdown parser with native SwiftUI block layout; web uses
markdown-it with raw HTML disabled. Standard Markdown paragraph rules apply:
soft line breaks can join within a paragraph; blank lines separate paragraphs.
Human messages remain literal. Bot text in quoted previews, notifications and the
chat list is converted to plain text without Markdown delimiters. Code contents
and link/image labels remain readable. Parsing failures fall back to readable source on iOS. Extended Markdown
attributes, embedded HTML, syntax highlighting and remote Markdown image loading
are not supported. Images in Markdown do not replace private attachment handling.
Only HTTP, HTTPS and mailto links are actionable. No Markdown-driven fetch occurs.
Since 2026-10-30 bare URLs with a scheme, `www.` hosts and email addresses are
links too, in bot Markdown (outside code) and in people's otherwise literal
messages and captions; host-only text such as `notes.md` or `example.com` stays
text. Web uses markdown-it linkify (`linkSegments` for literal text, new tabs with
`noopener`); iOS uses `NSDataDetector` with the same rules and underlines links.
The shared `formattingInstruction` asks contacts to keep short messages plain and
to format longer answers with light Markdown: bold key facts, short lists for steps
or options, named links instead of bare URLs, no headings or tables in chat.
Spoken replies already strip Markdown before synthesis.
iOS explicitly maps inline strong/emphasis to Manrope variable weights and an
oblique font descriptor, including combined emphasis and Dynamic Type. It does not
rely on automatic synthetic emphasis of the custom font.

Text remains selectable. Short inline replies keep the existing compact iOS
metadata layout; block replies place metadata below the content. Code wraps inside
bubbles; wide tables scroll horizontally. Native type remains Dynamic Type aware.

This is presentation derived from the existing session-owned conversation snapshots;
source text, pending IDs, freshness, pagination, eviction and account invalidation
do not change. Additive API `lastMessagePreview` and quote/activity `previewText`
fields carry bot summaries parsed before clipping (500/200 code points). Clients
prefer those fields and derive summaries from full cached source where available;
older snapshots fall back to parsing their existing summary. Legacy raw summary
and quote fields remain available for history identity and model context. There is no new network request, persisted HTML or
shared cache of parsed private text. Web memoizes derived HTML per mounted message
and recomputes when its text changes; native layout derives from the current text.
See [caching](caching.md#markdown-presentation).

Static web and iOS type checking passed during implementation. Builds, tests and
visual device/browser verification were not run. With fictional messages, verify
short/long replies, nested emphasis/lists, code containing markup, basic tables,
links with permitted and rejected schemes, malformed syntax, large text sizes,
light/dark appearance, quotes/reactions/receipts and scrolling in both clients.
Reopen cached history offline and switch accounts to confirm that formatted history
follows the existing session cache and that human text remains literal.

## Native iOS tools

Direct private messages from explicitly enabled iOS contacts may carry snapshotted
native device capabilities. `request_native_action` stores a reviewable proposal;
`list_native_actions` retrieves that person's device-reported states in this chat.
Neither tool reads system data or performs phone actions in the cloud. Pending
must never be described as executed. Groups, schedules and automatic group-result
turns receive neither tool. See [native experiments](native-experiments.md).

## Conversation initiative

[Conversation initiative](initiative.md) adds bounded assistant-only follow-ups after direct human replies, with read/activity context, AI-selected waits, quiet hours and a per-participant switch in contact details on iOS and web. New human input cancels outstanding plans; explicit schedules remain separate. Existing history, polling, previews and notifications deliver these messages.

The shared server cadence now starts reviews after 30 seconds, with minimum subsequent gaps of two and ten minutes. The planner treats greetings as openings and favors a short natural continuation; later silence gets progressively more space. Cron runs once a minute, so sends are approximate. The same behavior applies to iOS and web without client or cache changes. Three-message, six-evaluation, daily-budget, quiet-hour and cancellation limits remain in place. See [initiative](initiative.md#faster-cadence-validation) for migration 0033 and local versus live validation.


## Consecutive messages and composer pacing

Both iOS and web allow another send once the preceding HTTP submission is accepted,
without waiting for the agent reply. Typing the next draft stays available during
submission; sends remain serialized while a client UUID has an uncertain result.
The existing per-account ten-active-turn and twenty-per-minute limits still apply.
Agent attention remains exclusive across private conversations and groups.

Actual field edits report activity (at most once per two seconds on web; iOS checks
new edits every three seconds). Focus, keyboard visibility and retained draft text
are not typing. `chat_visit.typing_at` expires for pacing after six seconds, separate
from the thirty-second online lease. Accepted input clears older activity, and
leaving closes the visit. Expired visits renew only after new input. No draft text
is uploaded by activity reporting, and activity failures never block sends.

After the existing three-second connection delay, a turn allows up to twelve
seconds of additional composer pauses, checked every two seconds. Before inference
and atomically before publication, consecutive ordinary messages of at most 1,000 UTF-8 bytes each can fold into the
next queued message, with at most seven preceding messages per burst. Quoted
messages, attachments, scheduled messages and automatic results keep their own
execution. Native-enabled messages can group when their device/capability context
is identical; enabling native experiments alone does not prevent grouping. Each original message retains its UUID, text and order.
The model and tool authorization receive the bounded burst as the current request,
including later corrections. Existing tool budgets apply per burst, including the
one-publication limit for group requests.

For compatibility with the existing complete-requires-text constraint, a folded
row uses internal terminal `failed`/`MESSAGE_BATCHED`, exposed as `complete` with
null reply/error by the API. This is not a generation failure or a retryable turn.
It produces no assistant bubble, unread reply, push or initiative episode. Its read
receipt is recorded only after the model processes the burst; processed batch
messages also remain eligible for grounded memory extraction and history search.

If editing is still recent after generation, a response-only model decision chooses
whether the prepared reply should wait briefly or publish immediately (for example,
an urgent answer or action receipt). It sees only submitted text and the prepared
reply, using current model/consent and connector isolation rules. A positive decision
allows up to six additional seconds, never an indefinite wait. The decision has no
tools; invalid output/provider failure falls back to publication. Model latency is
additional to these pause limits. Generation recovery retains its existing bounded
response-only fallback and may publish immediately. Typing alone does not regenerate
replies. A newer eligible message accepted before publication discards the obsolete
draft and folds its human input into the next queued turn. This final check and
publication share one D1 transaction, so a send cannot slip between them. The check
also runs after memory preparation to avoid unnecessary stale inference.

Migration `0036_reply_publication_guard.sql` persists `tools_started` before any tool
call, including reads. Once a tool has started, the reply retains its own execution
and receipt; coalescing never hides or replays actions. Existing in-flight or retried
rows are conservatively marked during migration. Independent checks for native
actions/group publications preserve older recorded outcomes. Group reply-round
policy is unchanged.

Migration `0035_chat_message_queue.sql` is required before using the new API; it
replaces the single-active-turn index with a queue index and adds the typing timestamp.
See [infrastructure](infrastructure.md#consecutive-message-queue).

Both clients present a timeline of independent messages: human bubbles use
`createdAt`, assistant bubbles use publication `updatedAt`, with stable side-specific
IDs and deterministic sequence/side tie breaks for equal timestamps. Status rows
stay after the loaded messages; native receipts stay with their request. Web pending
sends participate in this timeline too. A reply to an earlier turn saved after a
second human message therefore appears after both, instead of between them. Existing
historical bubbles gain the corrected order on refresh/reopen. Quoting, reactions
and pagination still address original turn IDs/sequences.

Static validation covers API/web TypeScript, complete iOS app Swift typechecking
against the Simulator SDK and SQL compilation. No runtime
or device verification is implied. Verify rapid sends, edits during generation,
keyboard-only focus, abandoned drafts, resumed editing after idle, navigation,
background/foreground, offline retry, attachments/device actions, shared-contact
attention, access revocation and account switching using fictional conversations.

## Personality direction

An enabled [contact personality](personality.md) adds shared stable character
information, authoritative calendar facts and behavioral prose to reply context.
A separate bounded classifier creates an idempotent pending observation of the
current source, using the same permitted model and no tools. Relationship projection includes only eligible published text replies, with
continuity across eligible private/group contexts. Source causes remain server-side;
the contact gets one categorical acting plan per current recipient. Connector
conversations neither import nor export relationship state. A discarded burst, failed
attempt, skipped turn or reaction-only response cannot build up resentment.
Recovery and scheduled deliveries read existing state without appraising a new
human message. Group-result deliveries keep the contact's style while retaining
attribution and their existing action restrictions. A seen-gap reaction requires
actual read receipts, remains mild and decays without lowering durable rapport.
Existing consent, tool, batching, publication and delivery rules continue to apply.

### Looking at profile photos

Private contacts can use `view_profile_photo` to inspect their own canonical
avatar or the current human's account photo when useful. This is available from
both iOS and web without attaching the image manually. Other people's photos
are unavailable through private calls. Reads revalidate access and photo version
before model inference; see [profile photos](profile-photos.md#profile-images-available-to-contacts)
for image budgets, model processing, caching and pending validation.

## Successive messages

A contact can choose one reply bubble or a short sequence, delivered durably with
brief pauses. Both iOS and web render each delivered part with its server timestamp
and keep typing visible while the turn runs. A new human message stops the unsent
tail. Private reactions, quotes, sounds, unread counts and push retain turn-level
identity. See [successive contact messages](reply-messages.md) for limits, recovery,
legacy history, cache behavior and verification steps.

Contacts may send a contextual generated image, or an album of two or three when
the content needs several visuals, with their first reply message, optionally
referencing current authorized avatars. See [albums](generated-images.md#albums). The delivered assistant entry
contains attachment metadata; both clients use the ordinary incoming image/caption
UI and private image cache. See [generated images](generated-images.md).


Image generation uses current avatars for requested selfies and named members, and
can retrieve photos sent by people or contacts in this same chat as scene/edit
references. Internal visual descriptions are server-only and are not shown in
captions, public history or media grids. Both iOS and web use the shared API and
the existing delivered-image viewer/cache; no client format changes are needed.
See [image references and descriptions](generated-images.md#internal-image-descriptions-and-retrieval)
for scope, lazy old-history indexing, limits, retention and verification.

### Initial onboarding contacts

The five contacts atomically published by onboarding have `onboardingChat: 1`
(migration 0049). iOS and web include them in Chats before their first message,
using **No messages yet**, without unread counts or synthetic messages/receipts.
Creation time controls initial row order; real activity uses normal ordering and
pagination. Other empty contacts remain excluded. The marker stays in existing
session contact snapshots and is removed with the contact, not after opening a
chat. See [onboarding](onboarding.md) and [caching](caching.md).


## Reply activity indicators

Private chat headers and incoming reply indicators show **Recording...** for a reply
that will be a voice note, from the start of its composing pause through synthesis.
Since 2026-10-30 every contact shows **Typing...** during inference, including
contacts whose replies may be spoken: showing only Online after Read while the
model worked looked like being ignored. Recording... replaces Typing once the
spoken message is known. **Researching...** replaces both while a web search runs
(`isResearching` on presence; older clients keep showing Typing...). Group contacts already stay online during inference and now start with
Recording... when their single-message reply will be spoken. Groups label each responding contact separately.
Text fallback restores typing, and a finished turn returns to the normal presence.
Chat list second lines temporarily replace the last message with **Typing...** or
**Recording...**, hiding the last message's sender/checks. Groups name the contacts
in a sentence built by the API (`shared/activity.ts`): **Ana is typing...**, **Ana
and Bo are typing...**, **Ana, Bo and Cy are typing...** (current clients word it
themselves with a locale list format: **Ana, Bo, and Cy are typing...**), or **Ana is researching,
Bo is typing...** for mixed activities. More than three contacts, or a line longer
than 48 characters, collapses to **4 people are typing...** (**are replying...**
when activities differ). Group summaries also carry the same entries structured as
`replyActivityEntries` (`[{ name, activity }]` or `null`); current clients word the
line themselves in the interface language with the same rules
([localization](localization.md)), while older builds keep showing `replyActivity`
verbatim. Previews the API words itself for non-text messages (`Voice message`,
`Scheduled message`, `Group response`, `Working on a task`, `Sticker <emoji>`,
`Attachment: <name>`, `<n> photos`) are translated by both clients at display time. Message timestamps, unread counts and ordering do not change. Task
work bubbles keep their existing task label. This applies to both iOS and web.

Activity comes from the existing session-owned contact/group summaries and the
existing conversation polling; there are no per-row requests or new disk caches.
List refreshes run every second in the foreground with existing deduplication,
account generation checks, pagination and cache eviction. Successful reads replace
activity even when the last message is unchanged. Existing offline/failure behavior
retains the latest loaded summary until a successful refresh; activity may therefore
remain stale while disconnected. A shared contact only exposes private typing or
recording for the currently attended participant; a group only exposes its own
attended replies. The server recording overlay (`markRecording` in
`apps/api/src/chat/presence.ts`) expires after at most two minutes, is cleared for
the attended turn after synthesis (including text fallback), and resets on a new
typing phase. It does not indicate that the contact is listening to incoming audio.

Requires migration `0062_recording_presence.sql`. Static API/web typechecking,
Swift syntax parsing and SQL compilation do not validate visible or audible behavior.
Device/browser verification remains pending: text/voice/fallback replies, multiple
group contacts, navigation back to the list during synthesis, reopening an empty
chat, refresh, failed/offline refresh and recovery, revoked access and switching
accounts. Very fast synthesis may complete between polling ticks.

## Clearing and archiving

See [chat lifecycle](chat-lifecycle.md) for private history removal with optional memory retention, Archive/Unarchive, creator/member deletion, history revision fencing and retryable resource cleanup. Clear cancels chat-owned schedules and task/monitor work as well as replies.

## Conversation learning

Private replies use [conversation learning](conversation-learning.md) to apply grounded
interaction observations, one small behavioral adjustment and optional contextual
questions. Direct human exchanges periodically trigger silent durable reviews;
schedules, task work and group-result delivery do not train them. Both clients offer
inspection, disable and reset from contact details. Ordinary factual memory and the
configured personality remain separate. Migration 0067 is required; model/device
validation remains pending.

## Natural wording and depth

Both clients receive the shared [conversation style](conversation-style.md):
sparing use of names, subtle regional wording even with voice off, grounded
expression of creative identities, and stable optional chat-writing habits per
contact. Current-audience recent replies supply bounded name/length feedback;
private wording and measurements are never carried to groups. Short social replies
remain short; requested explanations, evidence and necessary nuance retain depth.
Scheduled/task replies and private initiative use the same style direction within
their existing permissions. No client cache or response contract is added.
Private delivery guidance is reinforced at final generation without another call;
group replies can use the bounded optional review described in the linked guide. Existing messages are unchanged; model/device verification is pending.


## Responsive orchestration (2026-10-30)

The visible lifecycle (delivered, Online, Read, Typing/Recording, message) is
unchanged, but its pauses now overlap the work instead of preceding it:

- **Generation starts at the read.** `prepare-reply` launches `contactReply` and,
  concurrently, waits out the remaining reading pause before `markTyping`. The
  first bubble's composition budget credits the time Typing was visible, so a
  reply is usually published as soon as it exists. Composer waits and message
  batching still happen before generation, so typing humans cause no wasted calls.
- **An attended chat reads at once.** When the person has the chat open (an open
  `chat_visit`) and the contact is still Online, the connect and read beats are
  0.3 seconds instead of one second each: the contact is "in the chat", so the
  message goes almost straight to Read.
- **Contacts stay while you talk.** The visible chat polls `GET /turns` every
  second. That poll renews the open visit and, when the contact is already Online
  and the conversation had a message within the last three minutes, extends its
  presence lease by 20 seconds (throttled to one write per ten seconds). It never
  connects an Offline contact. Leaving the chat stops the poll and the lease
  expires normally; idle conversations still go Offline after three minutes.
  Visit consumers key on `typing_at`, so longer visits do not change pacing or
  initiative.
- **Research is announced.** See [web research](web-research.md#announced-research-and-grounded-answers-migration-0071):
  the contact first sends a short "looking it up" bubble (`<turn>/assistant/0`),
  shows Researching... while the search runs, and then continues with what it found.
  Later bubbles are offset after the announcement. A turn whose only bubble is the
  announcement can still use response recovery.

## JSON export

Details → **Export chat** downloads this conversation as a readable JSON transcript on
iOS and the web. See [chat export](chat-export.md).
