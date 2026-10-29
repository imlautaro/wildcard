# Group conversations

An initial reply to a human message can perform [web research](web-research.md)
and save a sourced document for the group. Every contact in that human round
shares one research reservation, so another contact cannot multiply paid requests.
Bot triggers, task notices, reviews, directed requests and connector-isolated
groups do not gain search. Both clients use their existing group document caches
and show the same source panel. Research does not authorize external writes or
access to private conversations.

Groups bring existing contact agents and human accounts into one shared history.
From Chats, tap **+ → Contacts → Create group**. Tap the group header to push its
details onto the existing navigation stack. The chat has no trailing members
button, and details do not open in a bottom sheet. The details screen has a **+**
menu with **Invite a user** and **Add your contact**, enabled for members with
invitation permission. Inviting opens a separate email form. Adding opens the
alphabetical contact list with avatars: current group contacts remain visible,
disabled and labeled **In group**. Shared contacts created by someone else are
also disabled, with a **Shared contact** label. Selecting an eligible contact opens
its explicit memory/Contributor consent screen before addition. Returning to the
list refreshes membership badges. Details also manage identity and permissions,
and show the group's photos and files under **Shared in this chat** (see
[attachments](attachments.md#shared-in-this-chat)). Groups also keep shared
[task lists](tasks.md) that can assign work to contacts and humans, and shared
[mini apps](mini-apps.md#group-mini-apps) that a contact builds when someone asks;
every member sees and edits the same saved values. Details → **Mini apps** lists them.
Invitations appear in **+ → Contacts → Group Invitations**, with a pending count.
The Contacts screen also includes **Contact Invitations**.
They are in-app invitations; the server does not send email.

On first entry, the chat keeps its loading indicator until the first successful
history response. Group metadata arriving earlier does not show **Start a
conversation**. That empty state appears only after a successful empty history;
cached history remains visible during refreshes. Initial failures show the existing
error and **Refresh** control. See [cache verification](caching.md#group-navigation-and-secondary-screens)
for device checks.

The Home Chats list waits for the initial contacts and groups loads before showing
its combined rows, ordered by activity within the loaded pagination window. These
requests run concurrently. Existing cached rows remain visible during refreshes;
a failed source exposes retry controls and any available rows. See
[Chats list caching and verification](caching.md#chats-and-contacts-lists).

## Sender colors

Each human and agent identity receives a stable, pseudo-random palette color within
a group. Sender labels use the same color in text, image/caption and PDF bubbles,
including messages from former members. A fixed hash of group ID, member kind and
member ID keeps colors stable across launches, renames and history pagination;
colors can repeat. The palette pairs darker inks for light mode with lighter tints
for dark mode. Own messages retain their existing layout without a sender label.
No network calls, persisted assignments or additional cache are needed.
The [web app](web.md) uses the same hash and palette, so a sender has the same
color on both clients.

Device verification: compare sender labels across text, images and PDFs in both
appearances, reopen the group, load older messages and rename/remove a member.
Confirm colors remain stable and names remain readable. Device visual verification
is pending; static checks do not establish rendered appearance.

## Membership and consent

The creator owns the group and can grant or revoke **Can invite** per human
member. That permission allows inviting accounts and adding contacts created by
that member. A shared-contact recipient cannot add someone else's agent. Only
the group owner or the contact's contributor can remove a contact; only the owner
can remove another human or grant permissions. Members can leave. The owner must
delete the group to leave; ownership transfer is not implemented.

**Group details layout (iOS and web).** Rows with icons: **Discuss my private chats**
shows "N of M on" and opens a sheet with the per-contact switches (explanation behind
an info button), then Connections, Mini apps and Tasks. Members are compact rows with
their role ("Owner", "Can invite", "Member", "Contact"); a "⋯" button on members you
can manage offers **Allow invites/Stop allowing invites** and **Remove from group**.
Invitations and adding contacts open from **+** in the iOS toolbar and from **Invite
people** / **Add a contact** sheets on web, where the shared-memory text that consent
covers stays visible. iOS also offers **Shared memory consent** as a row with a sheet.
Web refresh is an icon in the page bar; iOS uses pull to refresh.

Creation, acceptance and adding a contact require an unchecked, explicit shared
memory confirmation. With the Contributor model they also require separate
Contributor data-use consent. Group details can renew consent for future messages.
The disclosure covers full group history (including messages before joining),
member names and profile photos, access to existing shared contact memories, and
future memories from human group messages being recalled in other conversations.
Consent is mandatory for membership in this version; there is no private-memory
mode inside a group. Adding an owned agent sets its existing `memory_shared` flag.
Removing it does not reset that flag or revoke existing private-contact sharing.

Private transcripts, private attachments and schedules are never included in group
context. Model context contains bounded recent group history and selected shared
memories, attributed by stable user ID and display name. Each contact retains its
identity, global presence and memory; adding it creates no independent agent.
Group extraction stores at most three grounded memories per human message and
agent, with a verbatim source quote, up to 64 keys per agent/source user. These
memories participate in private-chat memory selection as well as group replies.
Extraction is best effort and does not support an explicit forget tool yet.
Agents also keep their own explicit persona/preferences across private and group
replies in a separate agent-scoped profile. Private chats can discover common
group members and retrieve that group's original human/bot statements only while
both the current human and replying agent are members. Group tools search only
the current group's history, within the current draft/review sequence snapshot.
They do not expose another agent's private profile or raw private replies. Group FTS stores statements
once, with bounded search/excerpt tools rather than per-bot transcript copies.
See [cross-chat identity and provenance](memory.md#one-agent-identity-across-private-chats-and-groups)
for migration 0019, extraction/retry limits, revocation and verification.

Leaving/removing a human stops retrieval of their group memories and removes the
contacts they added. Removing a contact stops retrieval of its memories sourced
from that group. Group messages and already generated replies remain in history.
Deleting the group cascades through its messages, jobs, invitations and sourced
memories. Previously delivered replies and unrelated private memories are not
retracted. Consent checks cannot retract data already sent to Meta. A model switch
to Contributor blocks generation until current members consent; historical group
messages lacking Contributor consent remain excluded even after renewal.

Invitations expire after 24 hours and require current invitation permission at
acceptance. Revoking permission deletes that sender's pending invitations.
Limits: 16 humans and eight contacts per group, 100 memberships per user, 20
unexpired invitations per group, 40 mutation requests per user/minute, messages up
to 4,000 Unicode characters, and at most 64 queued/running contact replies before
accepting another human message. Limits are implementation choices, not product
requirements. An accepted message can add up to eight replies above the queue
admission threshold. Leaving does not erase history; the UI explains this.

## Reply rounds and exclusive attention

Each accepted human message snapshots the current contacts into a finite round:
at most one response per contact in insertion order. New human messages can queue
while contacts respond. Published bot messages can enqueue other contacts in the
same exchange, subject to [shared energy and finite conversation limits](energy.md).
A human can privately [ask an agent to post in the group](group-requests.md),
including greetings and announcements. Ordinary posts require no designated recipient
and permit bounded public responses. A directed question starts with one designated
reply whose answer returns privately; that public answer can then start bounded
conversation. No additional private result is created for later conversation.
Group replies are serialized by their persisted sequence. Agents added later do
not answer old messages, including after an HTTP retry. A group can have no bots.

Each draft identifies its human or bot trigger, current members, the round's
participants and earlier replies in that round, plus up to 24 recent eligible
messages. Earlier round replies (at most eight) are supplied separately so new
human traffic cannot hide them outside the recent window. Text is clipped to
1,600 UTF-8 bytes per history entry with truncation flags; the original request
is supplied in full. History and read tools share a fixed inclusive sequence
watermark for each draft or review. They now include later human messages already
accepted before that watermark, rather than stopping at the original request.
Current author membership and Contributor eligibility filter history and tools.
Private transcripts and other groups' raw history remain inaccessible.

The group instruction asks agents to continue the exchange, avoid repeated
greetings/explanations and automatic closing questions, and mention another member
only when useful. Agents keep their own preferences even when another bot shares
them. A question addressed to everyone normally still receives each agent's own
answer. Later human requests have separate rounds; this turn uses them to account
for corrections, cancellation or supersession without answering the new request
again. Structured decisions contain only an action and publishable text; review
metadata is never posted as a chat message. These are model instructions, not a
guarantee of conversational quality or perfect cancellation detection.

Publication atomically checks for any group message after the draft's watermark,
revalidates attention, source-author membership, agent sharing and Contributor
consent, inserts at most one message and completes the slot. A race between the
last read and insert therefore cannot post an unchecked draft. If history changed,
the agent reviews its previous draft against a fresh bounded snapshot and can
keep its exact text, revise it or skip the obsolete turn. There are at most two
reviews after the initial draft. If history changes again after the second review,
the slot completes without a message so the queue can continue. Explicitly
canceled or clearly superseded requests can also be skipped at initial drafting.
Skipping creates no message, unread count, push or self-memory event; grounded
human-memory maintenance still follows its existing policy. Later human messages
keep their existing rounds; subsequent bot messages share their original exchange
and its fixed publication budget. Fresh human-requested public openings require an initial generated response unless
new human traffic permits cancellation/supersession; older similar greetings do not
suppress a new opening. Agents can skip later ordinary bot turns when there is
nothing useful to add. Exhausted/capped turns complete without inference or a bubble.

Draft/review preparation, each inference, each tool result, read acknowledgements
and guarded publication use separate durable Workflow steps. A successful result
is reused on replay; a final-format failure never restarts completed research.
Preparation retains two retries and a two-minute timeout, allowing the optional
personality classifier plus context reads. Model steps have one
transient retry and a one-minute timeout; provider requests retain their
45-second timeout. Tool steps have no automatic retry and a one-minute timeout;
the MCP reservation/receipt ledger still protects interruptions before checkpoint.

Each draft/review has two explicit phases. Evidence gathering exposes retrieval,
reactions and, only for authorized direct human triggers, MCP. It does not request
structured output. The model ends this phase with the internal, side-effect-free
`finish_group_research` control tool, called alone. Plain prose cannot end research
or be published as a decision. Gathering admits at most six model rounds and six
internal/external executions within a three-minute admission window. Already
started requests may finish after that window. Exhaustion moves to finalization
with the available evidence; it never grants more tool executions.

Finalization exposes no tools and requests strict JSON with the current allowed
actions. The server also validates action, text, extra fields, the 20,000-code-point
limit and opening/review rules. Invalid/truncated output gets one new finalization
attempt using the same evidence. Generation budgets are 4,096 tokens for research
and the first finalization, then 8,192 for the recovery attempt, including reasoning.
Intermediate prose and truncated output are never treated as successful tool
execution or a final decision. Analysis may be longer than ordinary group banter.
Failures log bounded codes without provider text. No fallback silently publishes
unvalidated prose or converts an invalid response to skip.

Current group/source/attention access is checked before each new inference and
tool execution. Cached external receipts also require current connector ownership,
contact/group grants, grant/OAuth generations and tool approval before subsequent
inference. MCP execution keeps its existing stricter admission checks, including
rejection after a later human trigger. Reviews still have no external tools.
Snapshots remain bounded and preserve their history watermark. Attachments are
checkpointed only as object references and loaded inside inference steps; their
bytes are not written into Workflow step output. There is no unlimited catch-up
or parallel draft generation. Up to two reviews still run only after the atomic
publication guard detects newer messages. The additional phases can increase
latency/cost, including ordinary group replies; live measurements remain pending.

Opt-in fictional regressions: `node scripts/checks/group-completion.cjs`,
`node scripts/checks/group-energy.cjs` and `node scripts/checks/group-receipts.cjs`.
These cover orchestration/replay, malformed/truncated decisions, permission loss,
limits, opening/review rules and read acknowledgement timing using simulated
providers. They do not prove real provider or device behavior. For this change,
only static checks were run; these regressions have not been executed.

Implementation references: [Meta structured output](https://dev.meta.ai/docs/structured-output),
[Meta Chat Completions](https://dev.meta.ai/docs/protocols/chat-completions), and
[Cloudflare Workflow rules](https://developers.cloudflare.com/workflows/build/rules-of-workflows/).

`agent_attention` remains the single unique lock per agent. Dispatch chooses the
oldest eligible job across private chats and group rounds. A group agent waits for
an earlier group reply, and for its own work in other chats. Group research and
the decision to reply or skip remain Online. Only a nonempty completed draft
starts Typing, followed by a durable 0.9–3 second pause before first publication.
Subsequent parts retain Typing until the burst ends. A context review returns
to Online while reconsidering the draft; publication still rechecks current history,
permissions and energy, so a changed or revoked draft can be discarded.
Saving the response ends visible typing; memory extraction completes before releasing the agent to another
chat. Private-chat typing remains scoped to the attended private conversation;
a contact replying in a group appears Online in its private chats. Workflow retries
check saved completion before generating again. Cron recovers missing dispatches
and terminal claims. Removed group jobs leave active attention locked until their
Workflow ends/recovery observes termination, preventing overlapping model calls.

Static TypeScript checking and SQL EXPLAIN preparation cover this context/review
change; runtime behavior and model quality remain unverified. With fictional
accounts, check the three-bot favorite-color question (including equal preferences),
one repeated follow-up question, a correction/cancellation during generation, a
message arriving between review and save, continuous activity through both reviews,
bounded-history truncation/tool retrieval, replay after saving, and access or
consent changes before publication. Confirm skipped turns release the queue and
create no bubble, notification or unread count.

Client-generated message UUIDs make submission idempotent. An uncertain network
failure retains the same UUID for retry. Database rejection restores the draft.
Earlier history is paginated in pages of 50, and polling catches up across missing
pages after backgrounding. The session synchronizer refreshes visible history and
reply status on its one-second foreground tick; changed cached groups and pending
outgoing receipts also refresh while Home is visible. Unread acknowledgements run
in a session queue that survives navigation, so a slow acknowledgement cannot hold up incoming messages or
leave an old typing indicator on screen. Device verification of slow read
acknowledgements, background/foreground transitions and returning from group
details remains pending. Revoked group access clears the visible chat on 404.

## API

All routes are bearer authenticated under `/api/v1/groups`; group-specific reads,
photos and mutations require current membership. Responses have `no-store`.

| Method/path | Purpose |
| --- | --- |
| GET / | Up to 100 memberships, preview/time/sender, per-member `unreadCount`/`lastReadSequence`, up to 50 unread `activity` events, model consent flag |
| POST / | Create with `name`, `shareMemory`, `contributorConsent`; returns `id` |
| GET /invitations | Pending invitations for the signed-in recipient |
| POST /invitations/:id/accept | Explicit consent; returns group `id` |
| DELETE /invitations/:id | Decline own invitation |
| GET /:id | Group, members, queued/running/failed replies and permissions |
| POST /:id/consent | Renew own consent for future messages |
| PATCH /:id | Owner updates `name` |
| GET /:id/photo?version=uuid | Current group avatar, members only |
| PUT or DELETE /:id/photo | Owner replaces/removes the JPEG avatar |
| GET /:id/messages/:messageID/attachment | Download a group message file |
| POST /:id/transcriptions | Transcribe a bounded WAV for a member (older clients only; see [voice messages](voice.md)) |
| POST /:id/agents | Add owned `contactID`, with explicit consent |
| DELETE /:id/agents/:agentID | Remove a contact from this group |
| POST /:id/invitations | Invite an existing account by `email` |
| PATCH /:id/members/:userID | Owner changes `canInvite` |
| DELETE /:id/members/:userID | Remove a human or leave |
| DELETE /:id | Owner deletes group |
| GET /:id/messages?before=sequence | History, `messages` (with nullable [`replyTo`](replies.md#api) quotes) and `nextBefore` |
| PUT /:id/read | Acknowledge displayed `sequence` for the current member |
| POST /:id/messages | Submit UUID `id`, `text`, optional base64 `attachment` and optional `replyToID`; HTTP 202 after persistence |
| POST /:id/replies/:replyID/retry | Retry a failed reply after active work finishes |
| GET /:id/photos/:kind/:memberID | Current member avatar, kind `user` or `agent` |

## Delivery and read receipts

Migration `0022_group_receipts.sql` records the human and agent recipient identities
at each new message insert, atomically with the message. It excludes the sender.
New joiners do not become recipients of earlier messages; leaving/removing a member
never deletes their snapshot or manufactures their confirmation. An unconfirmed
recipient who leaves can therefore prevent that message reaching Received/Read.
Deleting the group/message cascades its receipts. Snapshots contain IDs, not names
or copies of message content, and have the lifetime of the shared message.

- Clock: a local submission is awaiting server confirmation.
- One muted check: the message is persisted (Sent), without confirmation from all.
- Two muted checks: every snapshotted recipient confirmed receipt (Received).
- Two colored checks: every snapshotted recipient confirmed reading (Read).

For humans, iOS explicitly acknowledges downloaded Home previews and group history.
A server HTTP response or accepted APNs request alone does not prove client receipt.
Reading requires a message row to be at least 50% visible in the active group while
the app is foreground. Read implies receipt. This is a client display acknowledgement,
not proof of attention or comprehension, and does not mean a PDF/image was opened.
The existing unread counter watermark is separate and does not grant read receipts.
Older clients do not send these acknowledgements and can keep an aggregate pending.

For agents, the durable shared message history is their mailbox: receipt is recorded
at insertion. Since migration 0045, when a reply round starts (one second after its
attention claim) every group agent with unread receipts up to the round's trigger
connects (Online, a 30-second lease that never shortens or interrupts other work),
and one second later those agents read every message up to that trigger. The
aggregate can therefore turn Read before any contact types, while human recipients
still confirm their own reads. Model contexts additionally record reads for IDs
actually included after a successful model response, including bounded history, the original trigger,
earlier round replies and retrieval excerpts. Private-agent contexts also acknowledge
included shared group excerpts. Context can be clipped and attachment markers may
omit bytes. No reply is generated merely to advance a check. An unaddressed agent
may stay unread until a later authorized turn includes the message. Failed model
calls do not confirm consumption. Agent reads describe model processing, not humans.

Legacy messages lack a snapshot and return `receiptState: null`; iOS conservatively
shows Sent, never inferred Received/Read. Empty recipient snapshots also remain Sent.
APIs expose aggregate states only, behind current group membership. Acknowledgements
are account-bound, bounded to 100 IDs, idempotent and rate-limited; they check current
membership again at write time. Read/delivery timestamps retain their first value.

`PUT /api/v1/groups/receipts` confirms receipt of up to 100 Home preview `messageIDs`.
`PUT /api/v1/groups/:id/receipts` accepts `messageIDs` and `state: received | read`.
`GET /api/v1/groups/:id/receipts?messageIDs=<JSON array>` refreshes aggregate states
for up to 100 retained message IDs. History returns each message's `receiptState`;
group summaries return `lastMessageID`, `lastMessageUserID`, `lastMessageReceiptState`.
Home uses bold **You:** for the signed-in human's last message and shows its check.

The session-owned stores deduplicate successful acknowledgements, retry failures
during visible polling, retain already observed reads for retry, and bound receipt
deduplication to retained history/preview IDs. Receipt refreshes update cached rows,
including older outgoing messages outside the newest history page, without another
message-body cache. Invalidation blocks late results; session changes discard state.
A failed receipt refresh keeps usable history visible. No additional service is used.

Opt-in isolated checks: `node scripts/checks/group-receipts.cjs` and
`node scripts/checks/group-publication.cjs` (Node 24+). They use migrated in-memory
SQLite and simulated model/network boundaries, never real chats or provider calls.
Device verification remains pending: two fictional human accounts plus bots, offline
recipient, background/foreground, a row scrolled offscreen, long/image/PDF messages,
retry, older pages, join/leave/removal and account switching. Confirm no premature
aggregate check, no Home preview marking read and no claims of push delivery.

## Private messages from a group

A contact in a group can continue a topic one-to-one, in a member's existing private
chat with it: when the person asks ("Bot 1, let's talk about this privately") or,
on its own, when something clearly concerns only that person (personal or sensitive,
a follow-up only they need, a correction meant for them). This is the reverse of
[private requests to publish in a group](group-requests.md).

- **Who can receive one.** Only a current human member who already has a private
  chat with that contact: their own contact or a shared one. The group context marks
  those members with `privateChat`. Nothing is created for anyone else; the tool
  returns an error and the contact talks in the group instead. Under the Contributor
  model the private chat needs the same Contributor consent as any private reply.
- **What is sent.** `message_privately` (in `groups/private-messages.ts`) inserts one
  complete, assistant-only turn in that private chat, with the text the contact wrote
  during its group turn, and sends the normal reply notification. The message must
  stand on its own and say which group and topic it continues, because the person
  reads it outside the group. Private memories are not consulted when it is written;
  the person's next private message runs with the full private context.
- **When it is offered.** Only on the initial draft of a reply to a human's own
  message (not bot triggers, directed questions or reviews), with the group decision
  still required: the contact may say in the group that it wrote privately, or skip.
- **Limits.** One private message per group reply (`<replyID>:private`, so a replayed
  Workflow step never sends twice), never while that private chat has a reply queued
  or running, at most three per contact and twelve per account in a rolling 24 hours
  (`chat_turn.origin_group_id`, migration 0051). It costs no group energy and does not
  start an [initiative](initiative.md) episode.
- **Clients.** Both clients already show assistant-only turns (as for initiative), so
  iOS and web need no change: the message appears as a normal contact message, with
  the usual unread count, list preview and, on iOS, push notification.

## Interface and current limits

Other senders have an avatar beside the bubble and their name inside the bubble,
above the message content. This applies to text, images and PDF cards. Incoming
avatars align with the bottom of the message content, beside its lower-left tail;
outgoing tails sit at the lower right, matching individual chats. The group
header shows comma-separated members and scrolls horizontally if they overflow;
Reduce Motion keeps this text stationary and VoiceOver reads the full list.
The marquee clips to an explicitly sized, leading-aligned subtitle viewport so
moving text cannot draw behind the avatar. It pauses at each end, stays within
the measured overflow and restarts from the left when members or width change.
Group messages use the same `MessageBubbleView` as individual chats, including
colors, tails, flat backgrounds, timestamps and typography, with sender avatars/names added
for other members. Outgoing checks use the aggregate receipts described below.
Both chats share the glass capsule composer field, circular tinted action button
and floating scroll-to-latest control from `ChatControls.swift`. Groups use the
same 16-point history spacing/padding, soft bottom scroll edge, native bottom safe
area bar, loading/empty presentation and Reduce Motion-aware insertion/scroll
animations. As in private chats, iOS measures loaded rows in a regular `VStack`
before positioning, opens cached history with a bottom anchor and disables the
first-load scroll animation. The shared native `ScrollPosition` targets the bottom
content edge including scroll insets and maintains alignment through idle content,
viewport and inset changes while following latest. User scroll interaction,
earlier-page loading and quoted navigation stop that alignment. Returning to latest
re-enables it. The latest-message button animates only its overlay.
This avoids lazy height corrections and history-wide animations around long final
messages. Pagination and session caching are unchanged. Device checks must cover
cold/cached entry, very tall text/Markdown, images, keyboard resizing, pending sends,
new replies, older-page loading and quoted navigation; large loaded histories also
need performance verification. See [chat positioning](chats.md) for the tradeoff.
The group header aligns its 38-point identity and compact title/member
subtitle beside the back button, matching the individual chat header layout.

Groups support text, image/PDF attachments, [voice messages](voice.md) and foreground polling.
Group push alerts, per-member unread counts and foreground notifications are
implemented; group schedules are not implemented.
Groups and individual conversations appear together in one plain Chats list,
ordered by the latest message timestamp with stable type-prefixed ID ties. Group
rows use the same avatar/name/preview/date layout and no disclosure chevron.
The preview renders **Sender: message**, with only the sender prefix in bold,
using the name stored with that message. Line breaks collapse to spaces; attachment-
only messages show the attachment label. Both row types share date formatting:
local time today, Yesterday, weekday for two–six days ago, then dd/MM/yyyy.
An empty group has no date and keeps its creation-time sorting fallback. Older
groups wait behind the current private-chat page boundary until Load more reaches
them, so unloaded newer private chats cannot be skipped. Older API responses may
omit the new optional sender/time fields; rows retain their preview and use the
existing activity timestamp as a fallback when a message exists. Group identity avatars and message
images use the same bounded account-scoped protected image cache as private chats.
Human/contact member avatars remain in view memory. Lost group membership or a
group-history 404 conservatively clears the account image cache; logout clears it.
As with private chats, offline revocation is detected only after metadata refresh.

## Group photos, attachments and voice

Creation offers the same avatar/name controls and square cropper as contacts.
The owner can edit the name and choose, crop, replace or remove the photo in group
details. Every member sees it in Chats and the header. Other members cannot edit
it. Photos use versioned JPEG objects at `groups/<groupID>/<version>.jpg` in the
existing private bucket, up to 512 KiB and 64–1024 square pixels. Writes use
compare-and-swap and a separate 12-per-minute account limit. Replacement, removal
and group deletion clean old objects best effort; orphaned photos can persist if
cleanup fails or an account is removed outside these routes.

The paperclip offers Photos and Files with the same JPEG/PNG/GIF/WebP/PDF formats
and 5 MiB limit as private chats. Images use identical bubbles, optional captions,
cover thumbnails and full-screen zoom/swipe dismissal; PDFs use native Quick Look.
Incoming files align left with the sender's name/avatar, outgoing files right.
An uncertain submission retains its original UUID and attachment bytes for retry;
database rejection restores the draft without overwriting later edits.

Files are stored privately at `group-attachments/<groupID>/<senderID>/<messageID>/<random>`.
History returns only public metadata, never storage keys. Current members can
retrieve files, including from before joining; former members cannot. The existing
attachment-object registry and Cron protect both group and private references,
removing unreferenced files after a 24-hour grace period. Group deletion removes
message references, making these files eligible for that cleanup.

Each bot round includes one group attachment for the model: the current file, or
the most recent file in bounded eligible group history. Other file markers omit
bytes. Contributor checks apply to source messages and historical files. File bytes
are untrusted evidence and grant no permission to alter schedules or other data.
Group memory extraction still uses only human text/captions, not file contents.

The microphone records [voice messages](voice.md) with the same recorder, composer
gesture, bubble and protected audio cache as private chats: hold to record, release
to send, with mono 16 kHz WAV clips of 0.5–60 seconds. Messages are stored as
playable audio and transcribed after sending by the first contact reply of the
round; the transcript stays behind **View transcript**. An uncertain send keeps its
clip and UUID pending for **Retry sending**. Group dictation
(`POST /:id/transcriptions`) remains for older clients only.

## Setup and verification

See [infrastructure](infrastructure.md#group-conversations). Migrations `0016`,
`0017`, `0018`, `0019`, `0020` and `0021` are additive and use existing D1, R2, Workflow, Cron and Meta bindings; no new
resource, secret, APNs topic, dependency or manual deployment is required.

Static checks cover TypeScript, full Swift type checking and temporary SQLite
schema/query compilation. They do not establish runtime, network or visual behavior.
With fictitious accounts, verify creation, invitation acceptance/decline/expiry,
owner-only permission changes, revoked invitation rights, member removal/leave,
owned-contact addition, history pagination, retry deduplication, bounded rounds,
shared memories with correct authors, and simultaneous group/private requests.
Check a Standard-to-Contributor model change excludes old unconsented messages.
Check group deletion while a reply is running, offline send recovery, owner photo
editing/removal, non-owner photo rejection, group image/PDF sending/preview,
attachment-only messages, idempotent file retries, revoked file access, orphan
cleanup, voice message permission/hold/cancel/lock/retry/background interruption
and playback, avatars,
header overflow/Reduce Motion, Dynamic Type and keyboard layout on a device.


## Notifications and unread messages

Every new message from a different human or any contact counts as unread for each
current human member until their read watermark advances. Your own messages do
not count or notify your other devices. Opening the group acknowledges its loaded
history only while the chat is visible and the app is active; Home, group details
and background polling do not create read observations. A queued observation can
finish or retry after leaving the chat. Counts appear on group rows, the
Chats tab and the app icon, combined with private unread replies. `PUT /:id/read`
accepts a positive displayed sequence, never moves backwards, clamps it to actual
group history and removes read notifications from the server outbox. It has a
separate 120-per-minute read-update budget. Stale list responses cannot overwrite
a locally confirmed read state.

Migration 0018 initializes existing memberships at the current history boundary,
because earlier versions recorded no group read history. It does not infer old
unread messages or send historical push alerts. Newly accepted members start with
existing history read; messages saved after joining count normally.

An SQL trigger creates a persistent per-device outbox in the same transaction as
human and bot messages. It excludes the author and requires a current member,
registered device and unexpired session. Human submission and the bot Workflow
attempt immediate delivery; Cron retries missing attempts. Membership removal,
logout/expired session, read acknowledgment and device reassignment are checked
again before sending. Deletion cascades cancel queued group deliveries. APNs
already accepted before revocation/read cannot be retracted across other devices.

Alerts show the group title, sender subtitle and message or attachment label,
with `groupID`, recipient `userID`, message ID/sequence and source time for routing.
They use the existing background sound, Apple topic/provider secrets and device
registration. Payloads remain bounded to 4096 UTF-8 bytes. Bot IDs are hashed for
the 64-byte APNs collapse-ID limit. These are standard group alerts using the app
icon; private-contact communication-avatar notifications keep their existing path.

While active outside the group, a remote alert presents a system banner and the
foreground chime. One-second group polling also supplies bounded unread activity
as a local foreground fallback. Stable message IDs deduplicate the banner and
sound across polling/APNs. While viewing the group, a new received bubble uses
the in-chat sound after insertion, with no banner. Outgoing sound requires server
acceptance. Old messages from before foreground activation do not replay sounds
or local alerts. Alert display respects system notification permissions; the app
uses its existing foreground sound behavior. Reading advances the local watermark
and removes that group's delivered notifications up to the acknowledged sequence.
Account changes clear local notification state; taps route only to the matching
signed-in account and still require server membership on history reads.

Delivery uses the existing bounded batches (30 entries, five concurrent sends),
two-minute claims, backoff, eight attempts and 24-hour expiry. Delivery is retryable,
not exactly once; delayed accepted alerts can outlive an already displayed local
fallback. No remote push or device behavior was exercised during implementation.
See [notifications](notifications.md#group-notifications) for setup and checks.


Group chat history and details now share a bounded session cache. Member avatars
use the protected image cache, and navigation revalidates while retaining loaded
content. See [group navigation caching](caching.md#group-navigation-and-secondary-screens)
for eviction, pagination, access invalidation and device verification.

## Consistent Home and group navigation

Home projects the same cached latest message, sender and aggregate receipt as the
group view. List receipts reconcile by message ID, and delayed history/pagination
cannot regress a Read check. The optimistic clock changes to Sent on server
acceptance, before a follow-up history request or the send sound. HTTP acceptance
does not confirm recipient receipt. Transient server/rate-limit failures retain
the submission UUID. Foreground remote pushes wake synchronization before fetched
activity produces audio/banner presentation. Histories, lists, invitations and
read acknowledgements have separate lifecycles. See [shared synchronization](caching.md#shared-conversation-synchronization)
for polling limits, cache budgets, isolated regressions and pending device checks.
No backend change or new infrastructure is required; install the updated iOS app.

Unread-watermark writes survive view cancellation and coalesce observations made
while another write is pending. The session timer retries failures even if Home's
list request is stalled. Observed recipient read receipts also retry through cached
history refreshes; they remain separate from watermarks. Group cache hits preserve
the same store without observable LRU writes during render. See
[read acknowledgement lifetime](caching.md#read-acknowledgement-lifetime) for
cancellation, count reconciliation, retention and verification limits.

## Group message reactions

See [message reactions](reactions.md) for the shared iOS/web selector, actor and
message identity, agent tools, permissions, mutation retries, session cache freshness
and verification steps. Reactions use existing conversation synchronization and
add no unread messages or push alerts.

## Group message replies

See [message replies](replies.md) for the shared iOS/web Reply actions, quote
payloads, target validation, agent context, cache behavior and verification steps.
Replies are ordinary messages that carry a quoted earlier message; they add no new
request type, store or notification.

## Model selection by requester

Except for groups permanently isolated by connector access (Standard), group reply Workflows select the human source author/requester’s account model at job startup, including later bot turns in that exchange. They do not select the responding agent owner’s model. Existing shared-memory and Contributor consent checks remain; switching one account to Contributor cannot grant consent for anyone else. Background group-result dispatch and push checks resolve the corresponding account rather than using another workflow’s model.

See [model settings](model-settings.md) for the API, shared consent, cache behavior,
AI Gateway spending and pending runtime/device verification.

## Explicit connector access

On iOS and web, Group details → Connections lists connectors already assigned to
your own bots that you added to this group. Grant each bot/connector pair once;
confirmation explains ongoing read/change/send permissions and exposure to every
current and future human member. Group owners cannot grant another bot owner's
connectors. Any human member may request an enabled external tool from that bot.
Bot continuations, private delegations, scheduled turns and draft reviews cannot
initiate external actions. Private assignment, ownership/adder, group membership,
OAuth and current tool approvals remain required at execution. Revocation blocks
future admissions; actions already admitted may finish. Contact revocation removes
associated group grants; account disconnection removes every grant.

The first group grant permanently selects Standard and excludes the whole group
from cross-chat memory and retrieval, even after revocation. Human facts and bot
persona/preferences continue to be extracted and recalled locally within that
group; matching keys in other groups cannot overwrite them. See
[conversation-local memory](memory.md#conversation-local-memory-with-mcp). Group members retain
normal access to history within that group. An independent reply-owned execution
ledger prevents automatic retries of uncertain actions; draft reviews cannot rerun
tools. No grants are enabled by migration. Both clients cache schema-free access
lists and revalidate on entry; see [caching](caching.md#mcp-connection-metadata) and
[connector migration/verification](connectors.md#account-connector-migration-and-verification).


## Failed replies and response recovery

The group snapshot's reply metadata includes `sourceID`, `sourceSequence` and
`attempt`, in addition to the existing ID, agent, name and status. Both clients
place an exhausted failure directly below its source message, with the agent's
name and **Retry reply**. No detached failure footer is shown. A source outside
loaded history is displayed only when that source is loaded. Older API responses
without source metadata are decoded safely, without guessing the source.

A failed slot stops appearing when the same agent has any later group message
(after that source's sequence); another agent's response does not clear it.
The server filters resolved failures independently of loaded history, and clients
also filter against loaded messages while their snapshot revalidates. Original
failed rows remain diagnostic history, not unresolved chat alerts. Retry admission
rejects a resolved slot or one blocked by current work with a 409; current
membership, source access, attention and consent checks remain unchanged.

After two invalid decisions, or a recoverable model failure, the group Workflow
attempts one response-only recovery phase (up to two model calls under its existing
one-retry step policy), capped at 2,048 output tokens per call. It uses already
checkpointed evidence, no tools and no JSON decision schema, and asks for a short
natural-language answer or an honest account of incomplete work. No fabricated
static bot message is inserted when the model remains unavailable. The recovered
draft still passes normal history-watermark/publication/energy checks. A later
human request or ordinary bot continuation can close an obsolete recovery without
publishing; mandatory human-requested openings retain their reply requirement.
Only successful inference acknowledges newly processed context.

Access, consent, credential/configuration and database errors do not enter this
recovery path. MCP grants/OAuth generations/tool approvals and saved receipt access
are rechecked before inference. Recovery never re-executes tools or creates a new
request/attempt; uncertain external actions remain protected by their existing
ledger. Recoverable transport failures are stored as bounded step results so a
Workflow replay reaches the same recovery branch without repeating the exhausted
call. It cannot guarantee the external task was completed.

Decision validation now logs only a fixed reason (`invalid_json`, `invalid_shape`,
`invalid_action`, `invalid_text`), with no provider text. The existing backend limit of 20,000 characters remains.
Existing attempt limits,
latest-history review, finite bot exchanges and memory isolation remain in force.
See [infrastructure](infrastructure.md#reply-failure-diagnostics-and-recovery) for
release, verification and the observed incident.

## Bot message formatting

Both clients apply [essential Markdown](chats.md#bot-message-markdown) to messages
whose sender is an agent. Other members' human messages remain literal, regardless
of incoming/outgoing bubble alignment. Bot list and quote previews and foreground/background alerts use plain text
parsed before clipping. Sender attribution, quotes, reactions,
receipt metadata and the cached original text are preserved. Verify formatting
with fictional private and group replies in both clients; visual verification is
pending.

## Personality and relationship continuity

[Personality](personality.md) is one shared creator-owned profile. Its server-side
acting director compiles the current topic, temperament, local atmosphere and
persistent relationship with each current human/agent member into individual
speech directions. Alice can receive restrained phrasing while Bob receives
warmth within the same reply; neither ambiguous names nor another member's
apology can merge their relationships. Private conflict does not become a cold
default for everyone. Care/practical topics override grievances and irony.

Relationships can continue from an eligible private chat or another group, but
the performing model receives no source quotes, private IDs, event categories,
read timestamps or explanation of the cause. The classifier sees only local
message evidence and current audience. Current source membership, model consent,
publication and deletion rules filter every projection. Pending/skipped drafts
have no lasting effect, reviews reuse their one appraisal, and removal/revocation
removes a source's influence. Connector groups/chats stay local and neither import
nor export relationships. Factual memory, tool permissions, energy and round
limits are independent. See the feature guide for bounded retention and privacy
limitations and the opt-in fictional-data regression checks.

## First-circle group

[Onboarding](onboarding.md) creates one group with the new account and its five
generated contacts after explicit shared-memory acceptance. Membership references
the same contact agents; it does not clone them or invite other people. The group
starts empty, with normal permissions, memory rules, energy and reply policies.
Setup uses Standard processing and stores no Contributor consent.

### Looking at member profile photos

During evidence gathering, contacts can call `view_profile_photo` for their own
avatar or the account/contact avatars of current group members using roster IDs.
The shared API provides the same behavior to iOS and web. Reads are limited to
the current group, current consent and current photo version; no private contact
or account edit permission is granted. Bytes are loaded inside inference steps,
while tool checkpoints retain references only. See [profile photos](profile-photos.md#profile-images-available-to-contacts)
for budgets, revocation behavior and pending functional checks.

## Successive response messages

An ordinary contact response may contain several separately delivered group
messages. Each has its own receipt/quote/reaction identity and costs one energy
point. Intervening messages, changed access or exhausted energy stop the remaining
parts. Directed answers returned privately stay cohesive in one message. Both
clients reuse their existing group message caches and polling. See
[successive contact messages](reply-messages.md) for delivery and verification.

## Optional private text sharing

In **Group details → Discuss my private chats** (a row that opens a sheet), each human can allow an individual
contact to discuss that human's entire past and future private text conversation
with everyone in this group. Each switch is off by default and enabling it requires
an explicit disclosure/confirmation on iOS and web. The permission is scoped to
human + agent + group; even a group owner cannot authorize someone else's chat.
The audience includes future members of that group. No raw history is granted in
other groups or to another agent. Existing attributed shared-memory rules remain
unchanged; switching off raw history access is not a full memory privacy switch.

`PUT /api/v1/groups/:id/private-sharing/:agentID` accepts `{ "enabled": boolean }`.
The server resolves the authenticated human's private contact, current memberships,
shared-memory consent and applicable Contributor consent. Group detail snapshots
return only the caller's `privateSharing` settings with agent ID, enabled and
availability. A missing private contact or permanent MCP isolation disables granting.

The group model receives eligible source identities and the read-only
`search_authorized_private_messages` tool. It can search completed ordinary private
turns by lexical query, request recent turns without a query, select user ID,
paginate by sequence, and read a specific returned turn with character offsets.
Results attribute the human and distinguish user/assistant text and dates. Up to
four turns fit a 3,600-byte payload with clipped text and continuation metadata.
This includes temporary plans omitted by durable memory extraction. It is bounded
retrieval, not guaranteed exhaustive recall. Text may discuss or summarize files;
file bytes, scheduled turns, private group-result relays and permanently isolated
connector conversations are excluded. Existing model processing rules still apply.

Every read checks live access. Removing permission atomically completes pending,
running and failed group replies for that agent, preventing old tool checkpoints,
drafts, retries and unsent successive messages from publishing after revocation.
Leaving/removing the source human, removing the agent, deleting the private contact,
or adding private connector isolation cascades removal. Rejoining/readding requires
a new grant. Changing private Contributor consent also completes affected attempts.
Previously sent group messages, copies and provider processing cannot be recalled.
New messages can start fresh reply rounds normally.

Both clients reuse their session-owned group snapshot. Successful changes update
cached switches immediately and invalidate older requests before revalidation;
transient refresh failure retains that confirmed state. Reopening shows cached
settings immediately with background refresh; pull to refresh on iOS and Refresh
details on web fetch current state. Cached permissions never authorize retrieval.
See [cache rules](caching.md) and [migration setup](infrastructure.md#group-private-text-sharing).

Static checks cover API/web types, Swift types and SQL preparation. Runtime/device,
provider recall, authorization races and visual behavior require verification with
fictional accounts: pizza plans with on/off permissions, other humans/groups/agents,
revoke during research and successive delivery, regrant/rejoin, MCP isolation,
Contributor consent changes, pagination, offline navigation and account switching.

## Group typing state

The group snapshot adds numeric `replies[].isTyping` (0 or 1), derived from a
running reply, its current attempt's exclusive attention claim, and an unexpired
Typing presence. Queued replies and silent decisions never imply typing. Both
iOS and web require this explicit flag; missing fields from older API snapshots
show no indicator. The web subtitle follows the same rule. Retry availability
continues to consider all queued/running jobs. No migration or new service is needed.

Replies that are task work turns carry `replies[].taskID` and `taskTitle`. Both clients
show them as a "Working on “…”" row in the contact's name (queued or running, with or
without typing) and add "<names> working…" to the header subtitle. See
[tasks](tasks.md#seeing-the-work).

The existing session snapshot and one-second visible polling carry this state;
there is no client prediction or draft disclosure. Existing cache invalidation and
late-response guards remain in place. Live checks are pending on both clients:
address one of three fictional contacts, verify the others skip silently, verify
multiple actual replies appear in turn, successive messages, interrupted reviews,
failures, navigation/reopen, offline recovery, removal and account switching.

## Optional contact quotes

Contacts may choose a visible message to quote when its identity clarifies an
ambiguous reply. Clear answers normally omit quotes. Draft review preserves or
revises the target and publication rechecks group visibility; only the first
message of a burst quotes it. iOS and web reuse their existing quote presentation
and navigation. See [replies](replies.md).

## Contextual participation

An ordinary human trigger offers every contact a decision, not a mandatory message.
The model compares the trigger with earlier replies and recent history before
choosing reply or skip. An open factual question can be settled by one sufficient
answer; other contacts should speak only with a useful addition or correction. A
request for each person's own meal, experience or preference still invites separate
answers, including coincident preferences. Questions to one named member normally
leave the others silent. No artificial disagreement is needed to earn a turn.
Required human-requested opening greetings and designated private-return questions
keep their existing contracts. A skipped turn costs no energy, creates no message
or typing indicator, and needs no client cache mutation. This server policy applies
equally to iOS and web. Validate factual questions, personal round-robin answers,
named recipients, useful corrections and late/interleaved messages with fictional
participants; prompt quality is not established by static validation.

## Ending acknowledgement loops

Draft decisions include `invitesReply`. The model uses false for acknowledgements,
agreement, compliments, farewells and repeated sentiments; a filler question does
not count as a new contribution. Recent agreement is a reason to skip rather than
paraphrase it. Useful new information or meaningful questions can still continue
a bot conversation. During publication, false closes only the queued opportunities
created by that message, in the same D1 transaction as its insert. Later parts of
the burst obey the same decision. Existing rounds for the original human question
remain intact, as do directed answers and subsequent human messages. Recovery
messages never invite automatic continuation. Old in-flight drafts without the
field keep their previous behavior. No schema, service or client payload changes
are needed; both clients see the same ordinary messages and silence.

The semantic decision remains model-driven and can be wrong; this is not a proof
that all repetition is impossible. Verify a team compliment, several agreement
messages, substantive follow-up questions, personal round-robin answers, successive
messages, publication retries and interleaved human messages with fictional data.

## Generated contact images

On an initial direct human trigger, contacts can generate a useful image with zero
to three current authorized profile references and publish it on their first
message. Draft review reuses that image rather than generating another; skips
publish nothing. Bot continuations and designated private-return answers cannot
generate images. Both clients use ordinary group attachment/cache/navigation
behavior. See [generated images](generated-images.md) for current access checks,
latency, durable reservations and pending live validation.


Image generation uses current avatars for requested selfies and named members, and
can retrieve photos sent by people or contacts in this same chat as scene/edit
references. Internal visual descriptions are server-only and are not shown in
captions, public history or media grids. Both iOS and web use the shared API and
the existing delivered-image viewer/cache; no client format changes are needed.
See [image references and descriptions](generated-images.md#internal-image-descriptions-and-retrieval)
for scope, lazy old-history indexing, limits, retention and verification.


## Reply activity indicators

Both clients show Recording... during voice attachment preparation and Typing...
for text preparation. Private/group list second lines temporarily show that
activity instead of message previews and receipts, preserving message order,
timestamps and unread counts. Groups identify each active contact. This reuses the
existing session-owned summaries, foreground polling, deduplication, pagination,
account isolation and cache eviction without extra row requests or disk storage.
See [chat activity](chats.md#reply-activity-indicators) for freshness/failure
behavior and pending device checks, and [migration 0062](infrastructure.md#recording-presence-migration-0062)
for reproducible setup and rollback.

## Archive and clear

Each member can Archive/Unarchive independently. The owner can Clear chat for everyone, keeping or deleting memory learned in the group. Membership, photo and archive preferences survive. [Chat lifecycle](chat-lifecycle.md) documents permissions, cascading work/media removal, history revisions, cache invalidation and pending real-device/cloud verification.
