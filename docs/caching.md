# iOS navigation cache

The signed-in HomeView owns ContactsStore, which owns ConversationCache. Views
reuse the same ChatStore for each contact rather than constructing a new store
on every navigation. Loaded content stays visible during refresh and network
failures. A full loading indicator is reserved for the first successful load;
empty cached lists retain their empty state during revalidation.

## Shared conversation synchronization

`HomeView` owns `ConversationSync` for the signed-in session. A one-second
foreground timer, navigation, completed sends and foreground APNs all request
synchronization through coalescing event streams. Private and group lists have
independent consumers. Histories run independently by conversation ID, and list
warming uses at most four concurrent histories per source. A slow history does
not delay list publication, another conversation, or read acknowledgements.
Invitations refresh separately every 15 seconds.

List and history callers await the same in-flight request instead of dropping a
refresh behind a loading flag. Navigation cancellation does not cancel the shared
read. Already started reads may finish after backgrounding; the canceled session
loop starts no more ticks. Activation run identities prevent old-loop cleanup from
stopping a replacement loop. Session authorization and store invalidation still
reject obsolete results. A wake arriving while a list request is in flight is
retained for another pass.

Home derives its last-message preview, sender, sending clock and receipt from the
same observable cached conversation used by the chat when that evidence is at
least as recent as its server summary. Both caches expose observable insertions,
so a chat created after Home's first render can update the list immediately.
Cache hits update only non-observable LRU bookkeeping. Replacing an observable
entry during a SwiftUI render would invalidate the same render repeatedly; stable
lookups keep the original store identity without publishing a mutation. Insertions
and removals remain observable, and LRU eviction still honors visible/pending stores.
Summary receipt evidence reconciles back into the matching cached message.
Private summaries identify outgoing turns by their exact server creation time;
groups use immutable message IDs. Evidence is never transferred to a different
message. Private turn merging respects attempts/timestamps and preserves read
receipts independently; group receipt merging only advances Sent → Received →
Read. Catch-up traverses missing pages without replacing previously loaded history.

Group HTTP acceptance marks the optimistic row Sent before audio or a follow-up
history request. It does not imply Received or Read. History then replaces that
row by UUID, without displaying both. A 429, 5xx or unclassified transient group
response preserves the UUID for retry. Newly observed private completions request
audio after the shared history is committed. Foreground remote pushes request
fresh data instead of immediately playing sounds; group banners use the fetched
activity. Audio waits a further 100 ms for observation updates, and visible reply
rows retain their existing insertion delay. These are presentation delays, not
proof of a rendered frame; physical-device timing remains to be checked.

This implementation uses the existing HTTP API and APNs, with polling as the
fallback. It adds no WebSocket/SSE service, migration or deployment dependency.
A one-second tick is a scheduling interval, not a latency guarantee; requests,
network outages, API limits and server generation can take longer. Foreground
request volume increases compared with the former three-second polling. Histories
for unopened private chats fetched only to identify a new notification are
transient and do not evict the eight navigation caches. Existing retention,
privacy, image budgets and revocation rules remain in force.

Run the opt-in isolated store regressions with
`python3 scripts/checks/ios-conversation-sync.py` on macOS with Xcode installed.
They compile the production stores with fictional models and an in-memory
transport; no network, credentials, app build, simulator or APNs is used. Device
verification must cover send → Home → chat, delayed/out-of-order replies and
receipts, multiple group responders, slow/offline recovery, repeated navigation,
background/resume, foreground push/poll races, audio ordering, pagination, access
revocation and account switching. Install the updated iOS binary to verify these
presentation behaviors.

## Read acknowledgement lifetime

Private and group unread-watermark writes use a session-owned
`ReadAcknowledgementQueue`. Visible, active chats synchronously record their latest
loaded reply/message watermark on appearance, newly loaded content and departure.
Home does not create read observations from previews or prefetching. Canceling a
view or leaving with the keyboard open cannot cancel an already queued write.
The queue coalesces to the highest observed sequence and sends a newer observation
that arrives while a write is in flight. Failures and partial acknowledgements
remain queued for the foreground timer, independently of stalled list requests.
No read task sleeps or retries while holding the main actor synchronously.

The server acknowledgement updates row counts and the combined badge; a failed
write retains the server count rather than pretending it succeeded. Read revisions
reject a list response started before the acknowledgement. Concurrent private read
responses reconcile their count deltas when another read has already completed,
preventing an older owner-total snapshot from undoing that completion. Deletion,
confirmed access loss and the existing session checks discard obsolete work.
These intents live in session memory only; process termination can lose a write
that has not reached the server, and subsequent activation refreshes server state.

Group recipient read receipts remain distinct from unread watermarks: only a
message row observed at least 50% onscreen creates that read receipt. A canceled
row acknowledgement remains pending, and a later cached history refresh retries
it even after leaving the group. Neither Home previews nor a read watermark
fabricate recipient Read evidence.

The isolated regressions reproduce a self-invalidating cache hit and a canceled
read leaving Home unread against the previous implementation. They cover stable
private/group lookups, LRU order, read coalescing, failed-read recovery from Home,
a list stalled during retry, canceled group reads and recipient receipts, and
stale list responses. UI rendering, keyboard responsiveness and real device
network cancellation still require physical-device verification.

## Freshness and requests

- Individual contacts remain fresh for 30 seconds during navigation. The signed-in
  shell forces a contact-list refresh on activation and every second while
  active so unread counts and previews update even outside a conversation. Automatic
  refreshes preserve previously loaded later pages; pull to refresh resets pagination.
- Visible conversations revalidate on each one-second foreground tick, including
  idle history, to observe server presence. Presence is cleared when leaving or
  backgrounding the chat and after refresh failures. Failed requests retry on the
  same tick; overlapping requests are still prevented.
- Conversation pull to refresh and Refresh bypass freshness. Refreshes of the same
  conversation, list, or individual contact do not overlap.
- Sending inserts a separate optimistic outgoing bubble before the network
  request. It retains the submission UUID and local attachment bytes in the cached
  store while sending, survives history refreshes, and is replaced by the matching
  persisted turn without duplication. It never participates in server sequence or
  read-state calculations. Unconfirmed failures remove it and restore an unchanged
  draft. Sending and retrying update persisted cached turns after server acceptance
  and invalidate freshness so polling can resume promptly. Changes to the last
  turn refresh the contact preview. Contact creation and rename update the local
  contact immediately and invalidate list freshness.
- Revision checks discard responses superseded by mutations, invalidation, or a
  replacement history window. The shared API transport normalizes URLSession's
  `URLError.cancelled` and canceled task results to `CancellationError`. Group
  lists, group history, invitations, member details, sharing, and contact editors
  ignore cancellation just like private chat refreshes, preserving loaded content
  and pending submission identifiers. Cancellation does not create an error row
  or a Refresh/Retry button. Other failures keep their existing error and recovery
  controls; canceling a send does not imply the server rejected it.
- Chat rows prefer the API's `lastMessageAt`. With older APIs, they reuse the
  matching latest cached turn or a session-scoped timestamp keyed by contact and
  message preview. Missing timestamps require one history lookup per uncached
  preview, rather than another lookup each time the row appears. Deleting the
  contact clears its timestamp. No timestamp cache is written to disk.

The visible conversation revalidates on every foreground tick. Cached private
conversations with pending replies, and cached groups with changed previews or
outstanding outgoing receipts, also revalidate. Opening or returning to a chat
requests an immediate history refresh;
background generation continues on the server as before. Older history remains
available through the existing pagination API. Unread acknowledgements invalidate concurrent contact snapshots so a late response
cannot resurrect a cleared counter. Read state is persisted on the server; the
navigation cache itself remains in memory.

## Chats and Contacts lists

The initial Chats list waits for both the contacts and groups caches to load before
revealing their merged, activity-sorted rows. Both requests start independently;
foreground polling and pull to refresh also refresh the two sources concurrently.
Existing loaded caches stay visible during revalidation. A failed source releases
the initial loading gate so available rows remain accessible alongside its retry
controls. Cancellation does not count as a successful empty list. The existing
private-chat pagination boundary still determines which older groups are visible.
No additional cache or network endpoint is introduced.

Device verification: cold-open Chats with either list response delayed, with no
contacts, with no groups and with both lists empty; confirm a single initial reveal
and the correct empty state. Fail either request, retry, navigate away/back,
refresh, resume from background and switch fictional accounts. Cached mixed rows
should remain visible during successful revalidation and transient failures.
These presentation checks remain pending on device.

Both screens share the same session contact cache and mutation state. Chats
filters out contacts without message metadata and keeps activity order. Contacts
sorts all loaded contacts by name and automatically fetches remaining pages so
empty conversations remain reachable. Chats automatically skips pages containing
only empty conversations. Loading and mutation guards prevent overlapping page
requests; failures retain the cache and show Retry. Foreground refreshes still
preserve loaded later pages and rebase pagination when first-page membership changes.

## Memory and isolation

The cache keeps eight recently accessed conversations, evicting the least recently
used eligible entry when another is opened. Visible stores and stores with an active send/retry or
history-page request are temporarily exempt from eviction. Leaving a conversation
retains its latest 100 turns when no mutation or page request is in progress;
older turns can be fetched again using the restored pagination cursor. While
reading a conversation, explicitly loaded pages remain available until leaving.

Deleting a contact or receiving a contact 404 invalidates and removes its cached
conversation. A conversation-history 404 clears that store and disables sending.
Invalidated stores reject late network results. Signing out, session expiration,
and switching users remove the signed-in shell and its cache; withSession also
rejects results belonging to a superseded credential.

Conversation records, contact metadata, and credentials are not persisted by the
navigation cache. Process termination starts new conversation/contact stores.
Recent image bytes use the separate protected cache below. Session restoration
still requires server validation and may show the existing splash. HTTP no-store
headers and authenticated network retrieval remain unchanged. The original navigation cache adds no infrastructure. Unread tracking additionally
requires migration 0005 and the matching API release described in notifications.md.

## Verification

Swift static type checking, git diff whitespace validation and 39 isolated
store regressions cover the shared synchronization update. No application builds,
simulator runs, real APNs/audio checks or live account requests are part of this
verification. Installed-app behavior still needs checking: open
and reopen a conversation, navigate between tabs, refresh manually, lose and
restore connectivity, finish a pending reply, load older pages, delete a contact,
and sign in with another fictional account. Reinstall/run the updated iOS app to
use the change.

## Recent chat images and avatars

AuthStore owns `PrivateImageCache`, shared by chat thumbnails, the fullscreen
viewer, contact avatars, and the account avatar. It activates only after a session
has been verified. There are two levels:

- Memory: NSCache cost targets of 32 MiB for decoded thumbnails/avatars and 16 MiB
  for original encoded bytes. iOS may evict entries under memory pressure. Avatars
  decode at up to 288 pixels and chat thumbnails at 520 pixels. Views consult the
  decoded cache synchronously when recreated to avoid a placeholder flash on a hit.
- Disk: up to 64 MiB of original image bytes per account in `Caches/PrivateImages-v1`,
  with least-recently-read files removed first. Entries unused on disk for seven
  days expire; reads prune at most once per minute and writes enforce the size
  budget. The OS may purge Caches. Reads/writes and pruning run on a separate actor.
  Directories and files use complete file protection; cache directories are
  excluded from backups. Account and resource names are SHA-256 hashes on disk.
  Cache I/O failure falls back to ordinary image loading without failing the image.

Avatar keys include contact ID and photoVersion (or the account photoVersion).
Chat image keys include conversation ID and immutable turn ID. All entries are
also separated by account. New photo versions immediately choose new cache keys;
old unreachable versions expire or are evicted. Accepted photo uploads and image
messages seed the original-byte cache, including uncertain sends subsequently
confirmed by history. Unaccepted optimistic previews remain in view memory only.
PDFs are not cached here. Fullscreen images decode at up to 4096 pixels using the
same cached original, without another download on a hit; large decoded fullscreen
images remain owned by their viewer rather than consuming the thumbnail cache.

Concurrent misses for the same resource share one disk/network request. Leaving
a view does not cancel the shared download, so it can warm the cache for return.
Session/cache epochs reject results after invalidation; disk invalidation also
blocks late requests from repopulating cleared files. Decoding is off the main
actor. Invalid image data is removed so a retry can fetch it again.

Signing out or a rejected/absent restored session clears the relevant account
cache (all cached accounts when the restored session has no known user ID).
Session expiry also clears it. Deleting a contact, detecting a confirmed removal
from the refreshed first page, or receiving a contact/history 404 conservatively
clears the entire current account image cache. These checks do not discover
revocation while offline; already loaded images may remain visible until normal
metadata/history refresh detects a loss of access. Local cached files are private
application data, not public URLs or authorization for another account. Cleanup
is best effort; protected files can remain until a later purge if deletion fails.
The notification extension keeps its independent ephemeral download.

Installed-app verification remains pending: navigate away/back, cold-launch after
successful session restoration, open fullscreen offline after caching, replace or
remove an avatar, simulate memory pressure, exceed the disk budget, retry corrupted
cache data, revoke/delete a contact, and sign out/sign in with another fictional
account. No builds, runtime tests, private-media downloads, or live account actions
were performed for this cache change.


Foreground chat visits and composer edits also report activity through a separate
three-second task. This does not mark history fresh or interfere with history
polling. Opening a chat registers one expiring visit; idle polling does not renew
it. Backgrounding/navigation close the visit best effort, and server TTLs expire
lost clients. See [visit presence](chats.md#visiting-a-chat-and-composing-a-draft).


## Group images

Group avatar versions and message IDs use distinct `group/<id>/avatar/<version>`
and `group/<id>/attachment/<messageID>` resource keys in the same account cache,
sharing all existing budgets, protection, lifetime, deduplication and logout cleanup.
Confirmed image submissions seed local bytes. Group list membership loss, explicit
leave/deletion and group-history 404 clear the account cache conservatively.
Cached images require refreshed group metadata for revocation discovery; offline
images can remain until that check. Group member avatars use the same cache with group/member/version keys.
See [group media](groups.md#group-photos-attachments-and-voice).

## Receipt updates

Home summaries carry outgoing receipt state and group sender identity alongside
their cached preview. Group stores retain per-message aggregate receipt states;
visible polling refreshes recent history and fetches only aggregate states for
older retained outgoing IDs in batches of 100. History merging preserves the
strongest receipt evidence for each message ID. Home acknowledges received group previews in one bounded
request per changed set; failed acknowledgements retry on later list refreshes.
Message rows acknowledge reading only when visible in the foreground. Stores
retain observed-but-unacknowledged reads for retry during group polling and
reject updates after invalidation. Successful delivery/read deduplication follows
retained history plus current preview IDs and disappears with the signed-in shell.
No message/receipt data is newly persisted on device. Server receipt rows use D1
with migration 0022 and cascade with group/message deletion; membership snapshots
intentionally survive a recipient leaving. See [receipt semantics and verification](groups.md#delivery-and-read-receipts).

## Group navigation and secondary screens

GroupsStore now owns a `GroupConversationCache`, so navigating away and back
reuses the same history, pagination, snapshot, reply state and uncertain submission
ID. It targets eight recently accessed groups; visible stores and stores with a
send, earlier-page request or unresolved submission are exempt from eviction.
Inactive histories retain the latest 100 messages and restore an earlier-page
cursor. The target may be exceeded while every store is exempt. Eviction and
confirmed membership loss invalidate stores and reject late responses.

Group history tracks its first successful load independently of the group snapshot.
On first entry, loading remains visible until history arrives; metadata alone never
triggers the empty conversation state. Successful empty histories retain that state
during background refreshes. Failures retain the existing error/Refresh controls,
and invalidation resets the history-load flag together with the cached messages.

The chat, member details, invite-user and add-contact screens share the same group
snapshot. Concurrent snapshot reads share a request. Navigation displays the
snapshot immediately and revalidates; the visible chat still polls history and
reply status on the shared one-second foreground tick. A cache does not suppress live updates. Changes
to identity, members and permissions invalidate concurrent snapshot reads before
revalidation. Explicit leave/delete removes the cached group. History-confirmed
image submissions also seed image bytes after a lost send acknowledgement.

Member avatars now use `PrivateImageCache`, including synchronous decoded hits,
background decoding, shared downloads and protected disk storage. Their keys
include group, member kind, member ID and photo version, preserving the group
access context. They share the existing account budgets and cleanup policy.

ContactsStore owns separate `NavigationSnapshotCache` instances for schedules and
contact-sharing metadata, each with an eight-contact LRU limit. Empty schedule
lists are successful cached values. Reopening renders loaded content immediately
and revalidates; schedules keep their five-second foreground polling. Concurrent
reads share a request that can finish after navigation. Mutations invalidate
in-flight reads, retain visible content and reload after success. Deletion,
confirmed first-page removal and resource 404 discard affected data. Neither
invitation codes nor consent toggles are added to the cache. All of these metadata
and history caches are session-only and disappear with the signed-in shell.

Implementation rules for future features live in [AGENTS.md](../AGENTS.md#cache-by-default).
Device verification: open a populated group with delayed history and confirm no
empty-state flash, open a genuinely empty group, retry an initial history failure,
reopen a group and its details, revisit schedules and sharing
(including empty lists), return while a send acknowledgement is uncertain, page
back beyond 100 messages, navigate across more than eight groups, replace/remove
member photos, refresh offline, revoke membership and switch fictional accounts.
Static validation cannot establish scrolling smoothness or measured latency.

## Web app

The [web app](web.md) applies the same policy to a browser tab, with memory-only
caches.

- **Ownership.** Each store (`useChats`, `useConversation`, `useGroupConversation`,
  `usePrivateImage`) calls `registerSessionReset`. Sign-out, a 401 from any
  authenticated request, and signing in as a different account clear all of them
  before new data loads. Stores also track a generation or revision, so a late
  response from an earlier session or request is discarded.
- **Navigation.** The chat list, directory, invitations, and up to 20 recently opened
  private and group conversations render synchronously from memory, including empty
  results. Spinners appear only on first load. Refreshes run in the background, and
  failures keep loaded content visible with a retry notice.
- **Freshness.** Polling runs only while the tab is visible, on the iOS one-second
  cadence (see [web app](web.md)), and returning to the tab refreshes immediately. A
  conversation refresh merges its newest page into cached history by ID: private
  turns follow the iOS `merging` rule (later attempt, then later update, then the more
  advanced status, keeping the latest `readAt`), and group receipts only advance
  Sent → Received → Read. If the newest page doesn't reach cached history, up to ten
  earlier pages are fetched to bridge the gap; past that, the disconnected cache is
  dropped. "Load earlier messages" prepends older pages.
- **Home projection.** Home rows read the cached conversation without reordering the
  cache: a pending send, or the latest cached turn/message when it is at least as
  recent as the server summary, supplies the preview, sender, clock, and receipt.
  Summary receipts reconcile back into the matching cached group message. A list
  refresh warms already opened conversations with newer activity, at most four at a
  time, without acknowledging them as received.
- **Read state.** Unread watermarks go through a session queue that survives
  navigation and retries on the list tick. Acknowledged watermarks are remembered, so
  a list fetched before the write cannot bring a cleared counter back. Recipient
  receipts are tracked per group outside reactivity: received and read IDs are
  deduplicated (bounded to retained history), pending reads survive failures, and
  confirmed Home previews are bounded to the current preview IDs.
- **Mutations.** Sends are optimistic. A pending send keeps its UUID, text, and
  attachment across navigation and failures. Retry resends the same UUID (the API
  treats it idempotently), and Edit moves the text back to the composer. Contact
  edits, deletions, group leave/delete, and read receipts update the list in place.
  A 404 marks the conversation unavailable and removes it from the list.
- **Images.** Avatars and chat thumbnails are fetched through the proxy and kept as
  blob URLs in a bounded (150 entry) LRU keyed by account ID, access path, and photo
  version or message ID. Evicted and reset entries are revoked. Failed loads are not
  cached. The API's `no-store` header keeps bytes out of the browser disk cache. No
  private data goes to `localStorage`, IndexedDB, or a service worker. Files open
  from a temporary blob URL that is revoked after a minute.
- **Energy.** Creator energy uses up to eight memory-only snapshots reused
  synchronously on entry, with shared in-flight reads, a five-second refresh while
  the editor is visible, and a reset that invalidates earlier reads. A 404 drops the
  snapshot. Contact deletion and session reset clear it.
- **Not cached.** Sharing details, group member management, and account data are
  always loaded on open, because they gate permissions.

Verified in a headless browser with fictional accounts: cached navigation, receipt
progression, unread clearing, and sign-out/sign-in. Not yet verified: offline
recovery, access revocation while a chat is open, and multi-page catch-up. See the
verification status in [web app](web.md#verification-status).


## Contact energy

Creator details reuse a session-owned, eight-entry `NavigationSnapshotCache<ContactEnergy>`.
Zero is a loaded value. Entry and five-second active-view refreshes share in-flight reads;
cached server balances remain visible on reopen or transient failure. No local timer
calculates energy or authorizes a send. A reset invalidates previous requests before
storing its server response; revisions reject late replies after invalidation/eviction.
Deletion, confirmed access loss and account-owned store teardown clear entries. No new
on-disk state. Verify details → back → details, zero/full balances, reset during refresh,
offline/retry, background/resume and switching accounts with fictional data. See
[energy](energy.md) for server recharge and independent conversation limits.
