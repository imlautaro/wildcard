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
one response per contact in insertion order. New human messages can queue while
contacts respond. Replies never enqueue more replies, preventing autonomous loops.
Group replies are serialized by their persisted sequence. Agents added later do
not answer old messages, including after an HTTP retry. A group can have no bots.

`agent_attention` remains the single unique lock per agent. Dispatch chooses the
oldest eligible job across private chats and group rounds. A group agent waits for
an earlier group reply, and for its own work in other chats. Saving the response
ends typing; memory extraction completes before releasing the agent to another
chat. Private-chat typing remains scoped to the attended private conversation;
a contact replying in a group appears Online in its private chats. Workflow retries
check saved completion before generating again. Cron recovers missing dispatches
and terminal claims. Removed group jobs leave active attention locked until their
Workflow ends/recovery observes termination, preventing overlapping model calls.

Client-generated message UUIDs make submission idempotent. An uncertain network
failure retains the same UUID for retry. Database rejection restores the draft.
Earlier history is paginated in pages of 50, and polling catches up across missing
pages after backgrounding. Revoked group access clears the visible chat on 404.

## API

All routes are bearer authenticated under `/api/v1/groups`; group-specific reads,
photos and mutations require current membership. Responses have `no-store`.

| Method/path | Purpose |
| --- | --- |
| GET / | Up to 100 memberships, latest message preview, model consent flag |
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
colors, tails, shadows, timestamps and typography, with sender avatars/names added
for other members. Group receipts do not claim every member has read the message.
Both chats share the glass capsule composer field, circular tinted action button
and floating scroll-to-latest control from `ChatControls.swift`. Groups use the
same 16-point history spacing/padding, soft bottom scroll edge, native bottom safe
area bar, loading/empty presentation and Reduce Motion-aware insertion/scroll
animations. The group header aligns its 38-point identity and compact title/member
subtitle beside the back button, matching the individual chat header layout.

Groups support text, image/PDF attachments, voice dictation and foreground polling.
Group push notifications, unread badges and schedules are not implemented.
Groups appear in a separate section of Chats. Group identity avatars and message
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

See [infrastructure](infrastructure.md#group-conversations). Migrations `0016` and
`0017` are additive and use existing D1, R2, Workflow, Cron and Meta bindings; no new
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
