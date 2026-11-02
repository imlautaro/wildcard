# Group conversations

Replies interpret pauses using visible message dates and the trigger's arrival
time, separately from generation delay. The shared [temporal guidance](chats.md#temporal-conversation-context)
allows an optional personality-appropriate acknowledgment of a return or loose
end while prioritizing the current request and the existing round/skip rules.
Groups supply no recipient local time zone, so bots must not infer anyone's
morning/evening from UTC or their fictional birthday zone. A group pause cannot
prove that one person ignored a question, and private gaps are not disclosed.
No new service, migration, model call, setting or cache is introduced; iOS and web
reuse their history polling. Real-model and client verification remain pending.

An initial reply to a human message can perform [web research](web-research.md)
to understand a topic and continue the shared discussion without a report card.
A human-requested lasting report still becomes a sourced group document. Every
contact in that human round shares one research reservation, so another contact
can reuse completed conversational findings without multiplying paid requests.
Bot triggers, task notices, reviews, directed requests and connector-isolated
groups do not gain search. Both clients show ordinary conversational replies;
explicit reports use their existing group document caches and source panel. Research does not authorize external writes or
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
Contributor data-use consent. Group details can renew consent for future messages:
**Shared memory consent** in the details list on iOS and web shows "Pending" while this
account's Contributor consent is missing, a notice with **Give consent** appears above
it, and human members without consent are labeled "Contributor consent pending". Only
the member can consent for themselves (`POST /:id/consent`); removing and re-adding
is not needed. The chat's consent notice links to Members (`?consent=1` on web opens
the consent sheet when this account's consent is missing).
The disclosure covers group history (including messages before joining unless the
inviter or adder turned off **Can see earlier messages**; see
[join banners and welcomes](#join-banners-and-welcomes)),
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
memories are used in that group's replies and in private chats of people who are
members of the group; never in another group. A group reply uses participants'
private-chat facts only from its own members, and never from chats kept private
([privacy](privacy.md)).
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
at most one response per contact. A [round coordinator](#round-coordinator-migration-0071)
chooses which contacts actually speak. Up to four contacts prepare concurrently.
Admission uses the oldest four unfinished slots, with a single atomic attention claim
per agent and a four-claim group cap; publication follows plan rank, then readiness. New human messages can queue
while contacts respond. Published bot messages can enqueue other contacts in the
same exchange, subject to [shared energy and finite conversation limits](energy.md).
A human can privately [ask an agent to post in the group](group-requests.md),
including greetings and announcements. Ordinary posts require no designated recipient
and permit bounded public responses. A directed question starts with one designated
reply whose answer returns privately; that public answer can then start bounded
conversation. No additional private result is created for later conversation.
Group messages still publish atomically with a fresh history watermark. Agents added later do
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

Initial drafts have two explicit phases. Stale-draft reviews go straight to tool-free
finalization with fresh bounded history and the saved draft; they do not restart research. Evidence gathering exposes retrieval,
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
rejection after a later human trigger. Reviews have no tools.
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
oldest eligible job across private chats and group rounds. A group admits at most four preparing agents (two before migration 0071), and each waits for its own work in
other chats. An unplanned decision to reply or skip remains Online, and web
research shows Researching. Planned speakers type during generation; otherwise only
a nonempty completed draft starts Typing, followed by a durable length-aware composition wait before first
text publication. Each subsequent part refreshes Typing and receives its own wait,
scaled to that part's Unicode length and capped at 15 seconds (60 before 2026-10-30). The server checks
that the preceding message is still current before starting each later wait and
rechecks publication access/history afterward. Voice notes retain the short
Recording lead-in. See [successive messages](reply-messages.md) for timing details. A context review returns
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
| GET /:id | Group, members (humans include `contributorConsent` 0/1), queued/running/failed replies and permissions |
| POST /:id/consent | Renew own consent for future messages |
| PATCH /:id | Owner updates `name` |
| GET /:id/photo?version=uuid | Current group avatar, members only |
| PUT or DELETE /:id/photo | Owner replaces/removes the JPEG avatar |
| GET /:id/messages/:messageID/attachment | Download a group message file |
| POST /:id/transcriptions | Transcribe a bounded WAV for a member (older clients only; see [voice messages](voice.md)) |
| POST /:id/agents | Add owned `contactID`, with explicit consent and optional `includeHistory` (default `true`) |
| DELETE /:id/agents/:agentID | Remove a contact from this group |
| POST /:id/invitations | Invite an existing account by `email`, optional `includeHistory` (default `true`); `GET /invitations` returns it |
| PATCH /:id/members/:userID | Owner changes `canInvite` |
| DELETE /:id/members/:userID | Remove a human or leave |
| DELETE /:id | Owner deletes group |
| GET /:id/messages?before=sequence | History from the member's `historyStart` (null = full), `messages` (with nullable [`replyTo`](replies.md#api) quotes and nullable membership `event`) and `nextBefore` |
| PUT /:id/read | Acknowledge displayed `sequence` for the current member |
| POST /:id/messages | Submit UUID `id`, `text`, optional base64 `attachment` and optional `replyToID`; HTTP 202 after persistence |
| POST /:id/replies/:replyID/retry | Retry a failed reply after active work finishes |
| GET /:id/photos/:kind/:memberID | Current member avatar, kind `user` or `agent` |

Chat list rows show an unsent draft as **Draft:** and a reaction newer than the last
message as `You: reacted with 👍` or `<Name>: reacted with 👍`; see
[chat list previews](chats.md#chat-list-previews).

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
calls do not confirm consumption. Agent reads describe the server contact read acknowledgement, which may precede
response generation; they do not prove a completed model response or a reply.

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
The group header places its 38-point identity and compact title/member subtitle
in the principal navigation title slot between the back button and the single
actions menu, matching the individual [chat header layout](chats.md). It is not
a leading bar action, which iOS could collapse into a nested overflow menu.
Tapping the title still opens group details; member marquee and session caching
are unchanged. Device verification of the title and one-level menu is pending.

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
Incoming voice messages also keep the normal text-row sender avatar on the left
in both clients, alongside the avatar inside the voice bubble on the right.
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
Typing presence or a running web search (`replyActivity: "researching"`). Queued
replies and silent decisions never imply typing; planned speakers type while their
reply is generated (see [round coordinator](#round-coordinator-migration-0071)). Both
iOS and web require this explicit flag; missing fields from older API snapshots
show no indicator. The web subtitle follows the same rule and formats the typing
contacts with the rules of `replyActivityLabel` (`shared/activity.ts`), worded in the
interface language by `useReplyActivityLabel.ts` (iOS: `ReplyActivityLabel.swift` for
the chat list); the API keeps the English function for the chat-list `replyActivity`
summary ("Ana and Bo are typing...", "4 people are
typing..."; see [chats](chats.md)). The summary query returns at most 50 active
replies as JSON and the API formats them, so no migration is needed. Retry availability
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

On an initial direct human trigger, contacts can generate a useful image, or an
[album](generated-images.md#albums) of two or three images, with zero to three
current authorized profile references per image and publish it on their first
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

Both clients show Recording... during voice attachment preparation, Typing...
for text preparation and Researching... during a web search. Private/group list second lines temporarily show that
activity instead of message previews and receipts, preserving message order,
timestamps and unread counts. Groups identify each active contact. This reuses the
existing session-owned summaries, foreground polling, deduplication, pagination,
account isolation and cache eviction without extra row requests or disk storage.
See [chat activity](chats.md#reply-activity-indicators) for freshness/failure
behavior and pending device checks, and [migration 0062](infrastructure.md#recording-presence-migration-0062)
for reproducible setup and rollback.

## Archive and clear

Each member can Archive/Unarchive independently. The owner can Clear chat for everyone, keeping or deleting memory learned in the group. Membership, photo and archive preferences survive. [Chat lifecycle](chat-lifecycle.md) documents permissions, cascading work/media removal, history revisions, cache invalidation and pending real-device/cloud verification.

## Conversation learning

Each agent can learn about each human from that human’s direct messages and its own
replies in this group. [Conversation learning](conversation-learning.md) never imports
private interaction patterns or another audience’s questions. Group details on iOS
and web show only the signed-in human’s profiles, with per-person disable/reset.
Membership/consent changes and source deletion invalidate derived state. Questions
remain optional contributions under existing reply/skip, energy and publication
limits; this feature adds no group initiative. Migration 0067 is required; model
quality and device behavior need functional validation.

## Addressing the shared conversation

The shared [conversation style](conversation-style.md) distinguishes a trigger's
author from its addressee. A deterministic participation index lists current
members' visible messages after the trigger, deduplicating recent and round
history. It includes humans and bots but does not interpret queue completion as an
answer or an absent message as proof of silence. The model reads actual content
and quotes to decide who is addressed, what is still open and whether a short
contribution adds value. It avoids asking again for answers already given, across
planning, opinions, decisions and conversation as well as greetings.

Group-wide personality appraisals do not force a primary individual recipient.
Directed replies retain individual tone guidance. Existing required openings/task
updates, skip decisions, consent, energy and atomic stale-draft review stay in
force. Reviews rebuild visible participation; they do not reveal private exchanges.
This API behavior is shared by iOS and web, with no new request or cache. Model
quality and device/browser behavior remain pending verification.

## Final delivery review

[Conversation delivery](conversation-style.md#final-delivery-and-optional-wording-review)
reuses the current message's audience classification and chooses categorical
audience, name, depth and follow-up direction inside finalization. A question or
member-name mention can trigger one optional tool-free wording review before
publication. It can keep/revise prose, preserves prepared images, cannot replay
actions, and still passes the existing access/history-watermark guards. Review
failures preserve the useful draft. This adds bounded model usage and latency;
semantic metadata is not proof of compliant prose. Shared context also guides the
evidence-gathering phase to avoid rebuilding another participant's artifact.
Both clients receive ordinary published messages through existing stores.

## Conversational participation

Ordinary in-round responses now receive replay-stable conversational direction
seeded by agent/trigger IDs and weighted by initiative and curiosity. A contact may
build on another member's point, offer a preference or concrete proposal, or ask
a specific optional question that moves an open social/exploratory thread forward.
It can converse with other contacts without another human prompt. Recent peer
questions encourage joining one thread rather than stacking fresh openers.
These are conditional model directions, not a required question, guaranteed reply
or deterministic classifier of social intent. Tasks, sensitive topics, settled
questions, explicit boundaries and endings still take priority.

The internal delivery schema accepts `followUp: conversation` alongside `none` and
`missing-information`. Finalization and optional wording review see the same
conversational direction; review preserves meaningful optional curiosity while
still removing repeated check-ins, names and filler. A substantive new point,
proposal or question may set `invitesReply` true using the existing continuation
queue. Acknowledgements and closures remain terminal. Existing consent, current
membership, history guards, per-agent energy and the 100-message exchange ceiling
remain unchanged. There is no idle-group Cron or automatic restart of an ended
exchange, and no new external-action permission.

The API serves the same behavior to iOS/web; messages, Typing, read state, sounds
and delivered-part caches reuse their normal paths. No schema migration, client
response field, timer or setting is added. Additional conversational turns can
consume more existing model/energy budget. Static types/SQL cannot establish natural
banter, balance across personalities or when a thread should end; use fictional
social, practical, directed, settled, sensitive and farewell conversations to verify
that contacts both contribute and leave space without repeated greetings/questions.


## Concurrent preparation and directed participation (migration 0070)

Two agents (four since migration 0071) can prepare drafts and retrieve context simultaneously. The atomic
`agent_attention` insertion enforces the group cap, including concurrent dispatch
and recovery. One agent still attends only one private/group turn at a time.
A ready draft acquires `group_publication`, a D1 reservation held through
composition, history review and its message burst. Other bots keep preparing but
wait to publish. Reservation acquisition is independent of insertion order and
retries for at most 180 one-second durable waits. This avoids bot-to-bot review
starvation; human traffic can still invalidate drafts. The existing two-review
bound, access/consent checks, energy and exchange caps remain authoritative.
Terminal attempts release reservations; admission removes stale reservations, and
parent deletion cascades remove them. Missing/expired lanes fail visibly rather
than bypassing publication guards. Required drafts still invalidated after both
reviews leave a failed reply for the existing retry UI instead of silently completing.

Retrieval is concurrent. A preparer that requests a tool outside the read-only
retrieval/photo catalog first checks for older unfinished slots. If blocked, no
such call executes; the turn waits at most 180 five-second durable waits, then
rebuilds current input and makes a new decision after the older slot finishes.
This preserves ordered tool effects and lets the model see work already completed
by peers. Existing receipts and tool-specific guards still apply; semantic
identification of duplicate work remains fallible. Group voice transcription
uses the oldest unfinished turn, while other preparers wait for the saved
transcript or for that predecessor to finish, with the same bounded wait.

The evidence-completion tool declares whether the current request requires this
agent's own response. Direct questions, requests to intervene, requests for each
member's perspective and references to silent members take precedence over the
optional-contribution rule. The final decision schema removes skip when a response
is required, and the obligation survives reviews without newer human traffic.
A newer human message may cancel/supersede the request; another bot's answer alone
cannot satisfy a personal response. Identity/reference resolution is model-based,
not keyword matching. The bounded participation index includes visible messages
before and after the trigger so references to previously silent members have
context; absence from partial history is not proof of never participating. Exhaustion, access loss, failures and continuous human
traffic can still prevent delivery; this is not a guarantee that every bot always
answers. In private, asking why a contact was silent does not request a public
post or require sending permission; contacts must not invent prior skip reasons.

## Per-message read information

Long press a group message on iOS, or right click/long press on web, and choose
**Message info**. Both clients show **Read by**, first read times, and **Not read
yet** with Sent/Received status. This is available for messages by any sender.
The sender is excluded by the original recipient snapshot. New members do not
appear in old snapshots; former recipients remain represented. Legacy messages
without receipt tracking show unavailable, never fabricated reads.

`GET /api/v1/groups/:id/message-info?messageID=...` requires current group membership
and that exact visible message in the group. It returns only recipient kind/ID,
name, delivered/read timestamps and whether tracking exists. It does not mark
anything read. The response is private/no-store; clients use bounded session-only
memory caches, immediately reuse loaded/empty snapshots and revalidate on opening,
every five seconds while visible, and on explicit refresh. iOS uses an eight-entry
NavigationSnapshotCache per retained group; web retains at most 32 message snapshots.
Requests deduplicate. Clear/deletion/access loss/account changes invalidate caches
and reject late writes. Transient failures keep a previously loaded snapshot.
There is no disk persistence or recipient pagination (membership is bounded).

Opt-in fictional checks: `node scripts/checks/group-concurrency.cjs`,
`node scripts/checks/group-completion.cjs`, `node scripts/checks/group-energy.cjs`
and `node scripts/checks/group-receipts.cjs`. They were not run for this change.
Device/browser and real model validation remain pending: check two concurrent
preparers, a third waiting, earlier work blocking effects, publication races and
replay, cancellation/revocation, directed/silent-member requests, legacy/empty
read lists, reopen/back, offline recovery, refresh, clear and account switching.


## Round coordinator (migration 0071)

A debug export from 2026-10-30 showed 137 reply slots for 17 human messages:
every contact prepared a full draft (personality appraisal, evidence round,
decision and review) for every message and bot reply, 104 of them only to stay
silent, two at a time. Human messages waited three to eight minutes behind that
queue, and answers arrived for messages long superseded.

**Planning.** The first admitted slot of an eligible trigger claims `group_round`
and makes one coordinator call (`groups/planning.ts`, minimal reasoning, about
3–8 seconds). The coordinator sees the trigger, the message it quotes (even when
older than the window, then with up to three messages on each side as
`quotedExchange`: a database read, not a coordinator tool round, to keep planning
a single call; deeper history is left to speakers it gives tools, who can search
and read group history), up to 16 visible messages (same author/Contributor filter
as replies; voice messages are marked and represented by their transcripts), and each candidate's name, persona summary,
specialties, energy, recent activity and Researching state. It returns at most
three ordered speakers (four for a deep or project round, see [research depth](#research-depth-quick-deep-and-project-migration-0072)), each with a role (`answer`, `research`, `react`, `spark`),
a one-line internal angle and whether tools are needed. Human questions, requests,
greetings and news get at least one speaker; name-addressed contacts and called-out
silent contacts speak; social openings get two or three distinct angles with one
`spark` that adds a hook (opinion, persona detail, proposal or question). Requests
for current or public information get exactly one `research` speaker, first. Bot
triggers get zero or one continuer, so acknowledgement chains end. A human
question never ends with zero speakers. Directed requests, task notices and
requested openings keep their designated responders and are not planned.

**Applying the plan.** Selected slots store `plan_rank`, `plan_role`, `plan_angle`
and `plan_tools`; unselected queued slots complete immediately without starting a
Workflow, and an unselected running slot completes after the plan is known.
Other slots wait at most 20 one-second durable polls; a failed or expired plan
marks the round `failed` and every slot falls back to the per-contact decision
described above, so the group never goes silent because of the coordinator.

**Speaking.** The plan is a system instruction for the speaker (never mentioned to
people). The angle is a hint: when the speaker's fuller context (a quote, a voice
transcript, history) already answers what the angle asks for, the conversation wins.
Before this was added, a quoted voice message outside the coordinator's window made
it plan "ask for the lyric", and contacts claimed they could not hear the audio. Rank 1 of a human round must reply and shows Typing from the start of its
generation; its first-message pause credits that time. A planned turn without
tools skips the evidence round and goes straight to its decision; planned drafts
are reviewed only for vocatives. Later ranks prepare in parallel, wait (at most 90
seconds) until earlier ranks have a ready draft (`draft_json`, filtered by the
Contributor consent of the reader), receive those drafts as `peerRepliesThisRound`,
start Typing and decide. Publication follows rank. The history watermark (both the
ready check and the publication `INSERT`/`UPDATE`) ignores bubbles of this reply
and of earlier ranks of the same round, since their drafts were already context;
any other new message, especially a human one, still forces a review. Shared tool
actions are ordered by rank within a planned round. A bot-to-bot continuation
waits for an earlier planned round to finish before taking the publication lane.

**Superseding.** A new human message completes still-queued slots of older
non-directed, non-task triggers in the same transaction that enqueues its round.
Running turns continue and review against the new message. The coordinator and the
first speaker receive the earlier unanswered human messages since the last bot
message as `foldedEarlierMessages` and answer them too.

**Researching members.** Contacts see who is researching right now and do not
start the same search. The researcher announces it first in the group
(`<reply>/part/0`, one energy point, no continuation slots) when it can take the
publication lane within eight seconds; otherwise the Researching indicator alone
informs people. See [web research](web-research.md#announced-research-and-grounded-answers-migration-0071).

Receipts are unchanged: agent receipts are delivered on insert and read when the
first slot of the round starts, which now happens within about two seconds, and the
first speaker types right after planning. Planning adds a model call per eligible
trigger but removes the silent drafts; it does not guarantee that every contact
answers, and the model can still choose poorly.

## Research depth: quick, deep and project (migration 0072)

The coordinator also returns a round `depth`. **Quick** (default) keeps at most one
researcher; when the topic is broad, that researcher ends by offering a deeper group
investigation with a shared document instead of asking a clarifying question first.
**Deep** is chosen only for an explicit request for a thorough, better or
comparative investigation, a report, or acceptance of that offer: two or three
contacts take `research` with distinct sub-questions as their angles and one other
contact takes `compile` last (up to four speakers). **Project** (a plan, roadmap or
work split) is deep plus a task list.

Each planned researcher has its own research receipt
(`research-group-<message>-<agent>`; migration 0072 rebuilds `web_research` so one
group message can have several receipts, unique per reply). Only the first
researcher announces, describing who covers what; each researcher then posts one
short finding. The compiler waits (at most 180 one-second durable polls) for the
researchers' drafts before using any tool, receives their drafts and their bounded
research findings with cited sources (same Contributor model consent), writes one
group document with `create_document`, and posts the key takeaways. For a project
it also creates a task list: contacts get only work they can do with their own
tools without new web research (agent-assigned tasks start the existing
[persistent task work](persistent-work.md)), people get actions only they can take.
Account research budgets rose to 30 per day (global 300) because a deep round uses
two or three searches. Live checks (Contributor model) chose deep for "can you do a
better research about this", quick for a plain lookup and project for a moving plan.

## Contact aliases in groups

A bot appears in a group under the shared name for everyone except a member who gave that contact a private
alias: that member sees the alias on messages, quoted messages, the members list, typing/researching/recording
activity, the chat-list preview and unread activity, read-receipt details, reactions, task and document names,
learning profiles and push subtitles. Other members still see the shared name. `group_message.sender_name`
stays the shared snapshot; the API overlays the viewer's alias by `agent_id` on each read. Message text,
mentions and anything the model writes are not rewritten. A member who holds no contact for the bot has no
alias to apply. See [contacts](contacts.md#contact-alias-private-display-name).

## Join banners and welcomes

Migration `0081_group_join_events.sql`. Adding a contact or accepting an invitation
writes a membership notice into the shared history, ordered by `sequence` like any
message: **"Lautaro added Mila"** for a contact, **"Ana joined · invited by
Lautaro"** for a person. People are never added directly; they join by accepting an
invitation, so the notice names them as the actor and records the inviter.

A notice is a `group_message` row with `event_json` (`kind: member_joined`,
`memberKind` `user`/`agent`, `memberID`, `actorID`, optional `invitedByID`,
`includesHistory`), no user or agent sender, and `requester_id` set to the human
whose action produced it (the adder, or the invitee). History returns it with
`event` (those fields) and a viewer-resolved `text` (current names and contact
aliases). Clients render it as a centered banner without bubble, avatar, receipts,
reactions, reply or message info. Notices do not count as unread, do not appear as
the chat preview or Home activity, and send no push. Duplicate or refused adds write
nothing.

**Debounced welcome.** Every join upserts `group_welcome` with `due_at = now + 2
minutes`, keeping the first notice's sequence, so adding three contacts in a row
produces one welcome. The minute cron (`dispatchWelcomes`) claims due rows
atomically and enqueues one round sourced on the latest notice. That round covers
every notice after the last human message or earlier welcome. It is skipped when a
human wrote after the latest notice (that message's own round already sees the
banners), when the actor left or revoked shared memory, while the group is
clearing, when Contributor consent is missing, or when the reply queue is full. The
[round coordinator](#round-coordinator-migration-0071) treats it as a membership
trigger: each newly added contact introduces itself, and one existing contact (two
for four or more newcomers) welcomes everyone together. Contacts receive
`round.trigger.membership` (`joined` with `seesEarlierMessages`/`youJoined`,
`addedBy`) and are told not to welcome people one by one or to cite earlier
messages to someone who cannot read them. Welcomes use normal energy, publication,
history-watermark and finite exchange rules; a new human message supersedes a
queued welcome like any other round. No learned-context fence applies to a notice.

**Past-history access.** The invite form and the add-contact sheet offer **Can see
earlier messages** (on by default, the previous behavior). The choice is stored on
the invitation (`include_history`) and, on joining, as `history_start` on
`group_member`/`group_agent`: the sequence of the member's own join notice. `NULL`
means full history; memberships before 0081 keep full history. With a floor:

- People: history, shared media and attachment downloads start at their notice;
  they cannot reply to an earlier message (HTTP 400). Group details show
  "Joined without earlier messages".
- Quotes: when someone replies to an earlier message, the member still sees the
  clipped quote (200 characters; the replier chose to surface it) with
  `beforeJoin: true` and no file (a "Photo"/"Attachment: name" label instead).
  Clients show it as not tappable and never download it. Contacts see the same
  quoted snippet in their context.
- Contacts: model context and `search_group_messages`/`get_group_excerpt` start at
  their notice. The round coordinator, which only picks speakers and angles, still
  reads the 16 most recent messages. A newly added
  contact has no group memories from before it joined.
- Private chats: when a person asks a contact about a group, retrieval also starts
  at that person's floor.

Consent text (create, invitation, add, consent review) now reads "Members can
read the group's history, including messages sent before they joined, unless they
were added without earlier messages." An invitation without history replaces it
with "You'll see messages from when you join."; on iOS, the consent review for a
member who joined without history shows "You can read messages from when you
joined." (web shows the same sentence in its consent sheet).

Limits: existing contacts and people remember earlier discussion and may mention it;
the floor restricts reading, searching and downloading, not what others say. Group
tasks, documents and mini apps are shared workspace items and stay visible.
Reactions, receipts and message info of older messages are not exposed through
history because those rows are never returned. Re-adding a removed member writes a
new notice and floor.

Verification (2026-10-31): API type check; all new/changed statements prepared on
local workerd D1 (52 `EXPLAIN`s, including `groupSourceAccess` embedding); a
Miniflare D1 scenario covering two consecutive contact adds plus a duplicate, an
invited person without history, viewer text, quotes with `beforeJoin`, welcome
batching, suppression by a later human message, round enqueueing for all contacts,
source access and unread exclusion. Not verified: live model welcomes, client
rendering on devices/browsers.

**iOS.** `GroupChatView` renders a message with `event` as a muted centered capsule
(`GroupEventBanner`) with the server text and no avatar, sender name, receipts,
reactions, swipe-to-reply, context menu, message info or new-message sound; a failed
welcome reply sourced on the notice shows the usual Retry row under it. Notices
are skipped for "received" acknowledgements, for the cached chat preview, and when
comparing the list's `lastMessageID` with the newest cached message (warm refresh);
read state still advances by sequence. A `beforeJoin` quote is shown with a "Before
you joined" caption, is not a button, and never pages earlier history. The add-contact
sheet and the invite form have the **Can see earlier messages** toggle (sent as
`includeHistory`). When an invitation has `includeHistory` 0, the accept sheet uses
"You'll see messages from when you join." in place of the full-history sentence of
the consent text. Group details show "Joined
without earlier messages" for members with `includesHistory` 0. Flags decode as JSON
booleans or 0/1 integers; new fields are optional and flow through the existing
in-memory `GroupConversationCache` (nothing is persisted to disk). Verified with the
static `swiftc -typecheck` of the app target only; device rendering is unverified.

## JSON export

Details → **Export chat** downloads this conversation as a readable JSON transcript on
iOS and the web. See [chat export](chat-export.md).
