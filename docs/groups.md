# Group conversations

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
list refreshes membership badges. Details also manage identity and permissions.
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

## Sender colors on iOS

Each human and agent identity receives a stable, pseudo-random palette color within
a group. Sender labels use the same color in text, image/caption and PDF bubbles,
including messages from former members. A fixed hash of group ID, member kind and
member ID keeps colors stable across launches, renames and history pagination;
colors can repeat. The palette pairs darker inks for light mode with lighter tints
for dark mode. Own messages retain their existing layout without a sender label.
No network calls, persisted assignments or additional cache are needed.

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
while contacts respond. Ordinary replies never enqueue more replies, preventing autonomous loops.
A human can privately [ask an agent to post in the group](group-requests.md),
including greetings and announcements. Ordinary posts require no recipient and
create no reply slots. Only an explicitly requested response from another agent
adds one slot for that target; its answer returns privately without another round.
Group replies are serialized by their persisted sequence. Agents added later do
not answer old messages, including after an HTTP retry. A group can have no bots.

Each draft identifies its original human request, current members, the round's
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
keep their existing rounds; ordinary bot replies never create new rounds.

Draft/review calls and guarded publication use separate durable Workflow steps.
Successful step results are reused on replay; transient failures retain the
existing two retries per preparation step. Each preparation has the existing
three-minute timeout and two tool rounds/six tool executions (up to three model
requests), so active conversations can incur extra latency and inference cost.
Snapshots are bounded, may omit older changes and expose tools for retrieval;
there is no unlimited catch-up or parallel draft generation. No extra model
review runs on the normal path when the publication watermark is unchanged.

`agent_attention` remains the single unique lock per agent. Dispatch chooses the
oldest eligible job across private chats and group rounds. A group agent waits for
an earlier group reply, and for its own work in other chats. Saving the response
ends typing; memory extraction completes before releasing the agent to another
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
pages after backgrounding. Message/reply-status polling restarts when the group
becomes visible or returns to the foreground. Read acknowledgements run in a
separate task, so a slow acknowledgement cannot hold up incoming messages or
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
| POST /:id/transcriptions | Transcribe a bounded WAV for a member |
| POST /:id/agents | Add owned `contactID`, with explicit consent |
| DELETE /:id/agents/:agentID | Remove a contact from this group |
| POST /:id/invitations | Invite an existing account by `email` |
| PATCH /:id/members/:userID | Owner changes `canInvite` |
| DELETE /:id/members/:userID | Remove a human or leave |
| DELETE /:id | Owner deletes group |
| GET /:id/messages?before=sequence | History, `messages` and `nextBefore` |
| PUT /:id/read | Acknowledge displayed `sequence` for the current member |
| POST /:id/messages | Submit UUID `id`, `text` and optional base64 `attachment`; HTTP 202 after persistence |
| POST /:id/replies/:replyID/retry | Retry a failed reply after active work finishes |
| GET /:id/photos/:kind/:memberID | Current member avatar, kind `user` or `agent` |

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
for other members. Group receipts do not claim every member has read the message.
Both chats share the glass capsule composer field, circular tinted action button
and floating scroll-to-latest control from `ChatControls.swift`. Groups use the
same 16-point history spacing/padding, soft bottom scroll edge, native bottom safe
area bar, loading/empty presentation and Reduce Motion-aware insertion/scroll
animations. The group header aligns its 38-point identity and compact title/member
subtitle beside the back button, matching the individual chat header layout.

Groups support text, image/PDF attachments, voice dictation and foreground polling.
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

The microphone uses the same `VoiceRecorder` as private chats: mono 16 kHz WAV,
0.25–60 seconds, 2 MiB request maximum, six transcriptions per account/minute shared
with private chats, cancellation/interruption handling and retry/discard. Audio is
transcribed by Muse Voice Transcribe and discarded; the editable transcript is
sent only after tapping Send. This is dictation, not a stored playable audio clip.
The group endpoint checks membership and model consent before transcription and
membership again before returning text. No additional microphone permission,
provider model, secret or storage service is required.

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
cleanup, voice permission/stop/cancel/retry/background interruption, avatars,
header overflow/Reduce Motion, Dynamic Type and keyboard layout on a device.


## Notifications and unread messages

Every new message from a different human or any contact counts as unread for each
current human member until their read watermark advances. Your own messages do
not count or notify your other devices. Opening the group acknowledges its loaded
history only while the chat is visible and the app is active; Home, group details
and background polling never acknowledge it. Counts appear on group rows, the
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
foreground chime. Three-second group polling also supplies bounded unread activity
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
