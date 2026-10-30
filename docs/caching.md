# iOS navigation cache

[Temporal reply context](chats.md#temporal-conversation-context) is derived on the
server from the current turn and its bounded visible history. It is request-local;
there is no new client or persistent timing cache, learned routine, pagination or
disk retention. Existing history budgets, freshness, request deduplication,
late-response rejection, pending IDs, deletion/access-loss and account-switch
invalidation apply on iOS and web. Published replies use ordinary history/list
polling. Reopen/back, refresh and offline/device verification remain pending.

Private reply timing is managed by the shared API Workflow, with checkpointed
remaining durations for reading, typing and idle pauses. Elapsed deadlines do not
create a failed reply. This changes no client cache keys, freshness, invalidation,
pending submission IDs or retry permissions on iOS or web. After release, verify
slow memory refresh followed by a short message, reopen/back navigation and
refresh: the existing pending turn should update through ordinary polling.
Production recovery and device behavior require runtime verification.

The signed-in HomeView owns ContactsStore, which owns ConversationCache. Views
reuse the same ChatStore for each contact rather than constructing a new store
on every navigation. Loaded content stays visible during refresh and network
failures. A full loading indicator is reserved for the first successful load;
empty cached lists retain their empty state during revalidation.

### Transient failures during background revalidation

Polling refreshes (one-second chat sync, five-second native actions) keep loaded
content visible and stay silent when a request fails transiently, instead of
showing an error that the next tick clears. Transient means a connectivity
failure (iOS `URLError` timeout, offline, lost connection, unreachable host or
DNS; web `ApiError` status 0) or a gateway failure (web 502/503/504; iOS
`AuthAPI.Failure.temporarilyUnavailable`, which groups use for 429/5xx). Both
clients share this rule through `AuthAPI.isTransient` (iOS) and
`isTransientFailure` (web), applied to the contact and group lists, private and
group histories, and native/remote action snapshots. First loads with no cache,
user-initiated actions, and non-transient failures (404 access loss, 401,
validation) still surface their error. An existing error stays visible until
the next successful refresh rather than being cleared when a request starts.
The iOS "Load more" control waits for an in-flight list refresh instead of being
disabled by it, so background revalidation does not toggle its state.

Verify on a device by enabling airplane mode with loaded chats: rows and
histories stay visible without an error banner; disable it and confirm they
catch up. With no cache, the first load still shows its error and Retry.

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


## Voice message audio

System playback artwork reuses the existing versioned sender-avatar image cache:
iOS reuses/loads a 288-pixel image and retains just the current artwork in the
session player; web pins its active avatar object URL in the existing 150-entry
image LRU and releases the pin on stop/replacement. No parallel image cache or
extra private disk retention is added. Missing/offline photos use a nonprivate
generic avatar. Audio starts independently of the photo load. Cancellation,
player/request identity and the existing cache epochs reject late artwork after
replacement or invalidation; account/access/history resets clear system metadata
as well as the original caches. See [sender artwork](voice.md#sender-artwork-on-system-playback-controls)
for photo disclosure and pending offline/navigation/eviction/account checks.


An already loaded message now remains owned by the session player across navigation
and backgrounding. iOS retains the active decoded player in memory without reading
protected disk files while locked; web retains/pins the existing active object URL.
No extra download cache, retention period or background revalidation is introduced.
Position, route/proximity state and system media metadata remain memory-only;
recording, completion, failure, known access loss, history clear/delete and account
reset release playback resources and clear system metadata. Pause retains the clip
and position for explicit resume. Existing cache invalidations still stop playback
and reject late downloads. See [background playback](voice.md#background-playback-and-ear-routing)
for platform limitations and the required offline/reopen, sensor, lock-screen,
access-revocation and account-switch checks; physical behavior is not yet verified.


Voice message bytes use `VoiceAudioCache`, owned by `PrivateImageCache` so it shares
the image cache's activation and every clear (sign-out, session expiry, account
switch, contact deletion, contact/history 404, lost group membership). It keeps an
8 MiB memory cache and a separate protected disk directory, `Caches/PrivateAudio-v1`,
written by the same `ProtectedDiskCache` actor: complete file protection, excluded
from backups, 64 MiB per account, least recently read eviction and seven-day idle
expiry. Keys include the account directory, conversation ID, immutable message or
turn ID, side and reply part. Concurrent requests share one download, failures are
not cached (the bubble shows a retry button), and accepted outgoing clips seed the
cache. A clip that failed to send stays in its session conversation store with its
UUID until it is retried or deleted, and that store is not evicted meanwhile. The
contact voice catalog is a session `NavigationSnapshotCache` on `ContactsStore`.
The API combines all pages of the installation's ElevenLabs default and saved
voices, deduplicates IDs and caches only a complete successful result for one hour
per Worker isolate. Collection changes do not invalidate client session caches:
after server expiry, refresh explicitly on iOS or start a new signed-in web session.
Provider failures do not replace the server snapshot with a partial list; expired
server reads fail and existing client snapshots remain usable. Loading is bounded
by 20 seconds and 100 pages of 100 voices per filter. No provider metadata is
persisted to disk. Verify collection additions/removals, duplicate IDs, empty saved
collections, multiple pages, failed refresh and account switching on both clients.
See [voice messages](voice.md#ios-caching). Device verification is pending: replay
after navigation and relaunch, offline replay of a cached clip, failed download
retry, budget eviction and account switching.

### Voice bubble avatars and waveform

Both clients reuse the existing versioned account, contact and group-member photo
caches for avatars inside voice bubbles and beside incoming group voice rows.
The outer and inner avatars share the same member/version resource and existing
request deduplication, eviction and account/access invalidation rules.
Visible bubbles load immutable audio through
the existing audio cache and derive 37 real RMS amplitude samples. Analysis and
playback share downloads; repeated navigation uses cached samples or derives them
from cached bytes. Pending clips use local bytes without a separate download.

iOS caches derived samples in `VoiceAudioCache` with a 256 KiB cost budget and
512-entry limit, deduplicates concurrent analysis, cancels it on reset/removal and
rejects late session results. Decode runs off the main actor using bounded PCM
chunks and a protected temporary file removed after completion/cancellation; stale
files left by interruption are cleaned on cache initialization after 15 minutes.
Samples never persist. Existing protected audio bytes retain their disk budgets
and expiry. Web stores samples/in-flight analysis on its existing audio entries,
charges numeric sample bytes against the same 32 MiB budget and serializes decoding.
Eviction removes the samples with the audio; reset clears all entries and late
analysis is rejected. Decoded PCM buffers are not retained on either client.

Silent clips produce minimum-height bars. Decode failures show a neutral baseline
and can retry on viewport re-entry or play, without preventing playback. The cache
keeps no failed sample result. There are no API, permission or freshness changes;
server authorization remains required for uncached audio. See
[voice bubble verification](voice.md#voice-bubble-presentation-and-verification) for
pending device/browser checks, including reopen/back navigation, cached offline
playback, download/decode failure, eviction, photo refresh, access loss and account
switching. This presentation has only static validation so far.

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
  Account and new-chat flows hide the mounted chat list rather than destroying it,
  preserving its Archived selection and scroll position. Its existing list/read
  retry and invitation polling continue while the tab is visible. No new cache,
  request cadence, retention or invalidation rules are introduced by the navigation menu.
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
  attachment or recorded voice clip across navigation and failures. Retry resends the same UUID (the API
  treats it idempotently), and Edit moves the text back to the composer (Delete
  discards a failed voice message). Contact
  edits, deletions, group leave/delete, and read receipts update the list in place.
  A 404 marks the conversation unavailable and removes it from the list.
- **Images.** Avatars and chat thumbnails are fetched through the proxy and kept as
  blob URLs in a bounded (150 entry) LRU keyed by account ID, access path, and photo
  version or message ID. Evicted and reset entries are revoked. Failed loads are not
  cached. The API's `no-store` header keeps bytes out of the browser disk cache. No
  private data goes to `localStorage`, IndexedDB, or a service worker. Chat images
  open in an in-page full-screen viewer using the same original blob URL as their
  cover thumbnail, with no additional fetch or cache. Pending images use their
  existing local preview URL. The viewer is removed on source/account change or
  component unmount; modal state does not survive navigation. Verify offline
  reopen, source replacement, navigation and account switching in a browser.
  PDF files open
  from a temporary blob URL that is revoked after a minute.
- **Voice audio.** Voice message bytes and voice samples are object URLs in a
  memory-only LRU bounded to 32 MiB per session, keyed by account ID and download
  path, with deduplicated downloads, no caching of failures, seeding from accepted
  outgoing clips and a full reset (playback stopped, URLs revoked) on sign-out and
  account changes. The voice catalog loads once per session. See
  [voice messages](voice.md#web-caching).
- **Energy.** Creator energy uses up to eight memory-only snapshots reused
  synchronously on entry, with shared in-flight reads, a five-second refresh while
  the editor is visible, and a reset that invalidates earlier reads. A 404 drops the
  snapshot. Contact deletion and session reset clear it.
- **Photo crop drafts.** Account/contact web editors keep the selected, oriented
  bitmap only while the local crop dialog is open (bounded to 2048 pixels).
  Cancel, confirmation, navigation, loss of editability and account changes release
  it; generation guards discard late decoding and unmounted encoding results.
  Cropping sends no request until **Use Photo**. Accepted uploads keep the existing
  versioned avatar cache behavior, with no persistent source-image storage. Verify
  cancel/reopen, upload failure, navigation and account switching in a browser;
  these interactions have not been established by static checks.
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

## Reaction snapshots

See [message reactions](reactions.md) for the shared iOS/web selector, actor and
message identity, agent tools, permissions, mutation retries, session cache freshness
and verification steps. Reactions use existing conversation synchronization and
add no unread messages or push alerts.

## Reply quotes

[Message replies](replies.md#cache) travel inside cached message payloads; no
separate reply cache, request or disk storage exists. Pending sends keep their reply
target with the idempotency UUID. Reaching an older quoted original pages history
through the existing **Load earlier** path, bounded to 20 pages.

## MCP connection metadata

Both clients cache one session-owned account catalog with at most sixteen 256 KB
connector catalogs (approximately 4 MB JSON before overhead), including an empty
result. Legacy accounts exceeding sixteen retain all migrated connectors; their
snapshot can exceed this normal budget until redundant connectors are explicitly
removed. The migration never silently deletes authorization state. Schemas are cached once per connector, independently of assignments. iOS
uses NavigationSnapshotCache and web uses useMcpConnections (`account` key).
Contact/group access lists use separate schema-free snapshots through the existing
iOS cache and useMcpAccess, bounded to eight lists (up to sixteen account choices
per contact or 32 bot/connector pairs per group). Complete catalog discovery remains
bounded/paginated; failed refresh preserves the prior complete snapshot. Search is
local transient state. No credentials or provider results enter these caches.
Entry/explicit refresh revalidates in the background and deduplicates reads. Mutation
invalidates earlier responses; account mutations invalidate access lists and contact
revocation invalidates group lists. Access loss, deletion and account changes reject
late reads and clear relevant entries. Stale snapshots never authorize execution.
See [the full cache and verification contract](connectors.md#client-caching).

Enable all tools uses the existing permission mutation path: invalidate pending reads,
send one complete catalog fingerprint set, then revalidate saved permissions once.
The search filter does not reduce approval scope. Confirmation retains the reviewed
snapshot; the server rejects catalog mismatches and conditional-update conflicts
without partial changes. Failed saves retain visible cached content and surface the
error; no automatic retry or new cache is introduced. Check cancellation, filtered
approval, stale catalog conflicts, offline recovery, reopen and account switching on
both clients; bulk approval runtime/device verification is pending.

OAuth status, public issuer/scope and callback URI share the MCP session snapshots.
Provider tokens, PKCE state, codes and client secrets do not. Web sessionStorage
holds only initiating flow/contact/connection/user IDs during full-page OAuth and
clears them on completion/session reset. The one-use completion proof is removed
from URL history before authenticated completion. iOS keeps the ASWebAuthenticationSession
and matching flow only in memory; navigation/cancellation cannot finish it later.
Reauthorization invalidates tool approvals on the server. Both clients revalidate
metadata and discover tools separately after completion; catalog failure leaves a
connected account with tools requiring refresh/review. See the OAuth guide for
expiry, account switching and pending browser/device checks.

## Account model preference

The existing session-owned profile holds chatModel. iOS revalidates on Account entry; web deduplicates a background profile read on Account mount and rejects reads predating a model save, sign-out or account reset. A model save applies the returned profile synchronously. Web updates Contributor flags on cached lists/groups and rejects older snapshots without clearing message history, drafts or pending UUIDs. iOS cancels group-detail reads, removes secondary sharing snapshots, wakes list synchronization and refreshes invitation consent flags; group details revalidate on reopen. Existing bounded retention, eviction and account isolation remain unchanged. Gateway response caching is bypassed because the task is cost observation and includes private state/tool calls.

See [model settings](model-settings.md) for the API, shared consent, cache behavior,
AI Gateway spending and pending runtime/device verification.

## Group generation checkpoints

Group research and finalization reuse server-side Workflow checkpoints scoped to
one reply, attempt, draft/review and step name. These are durable computation
results, not a new client cache. Successful inference/tool results are reused on
replay; a decision-format recovery cannot invalidate them or grant additional
executions. MCP still uses its reply-owned reservation/receipt ledger and current
permissions before new inference/execution. The publication watermark guard and
both clients' session-owned conversation caches remain authoritative for visible
history and late-response rejection. No extra client persistence is introduced.

Context snapshots include bounded history and references to attachments; bytes
are loaded from private R2 within inference steps, never persisted in step output.
Model responses retain the 256 KiB transport and 20,000-code-point text limits;
research admits at most six rounds and six bounded tool results (24 KB each for
MCP), then a separate final decision. Private operational checkpoint retention is
managed by the existing Workflow service; it is not a navigation LRU or public log.
The snapshot does not become shared/self memory. Grant revocation and account
changes continue to invalidate client permissions and reject late UI responses.
Server inference checks current group access and authorization of saved external
receipts; publication still checks current group membership/consent and history.

Static checks cannot verify reopen/back, empty history, refresh, offline recovery,
mutations, grant revocation or account switching on device. Verify those scenarios
on both clients after authorized release using fictional MCP data, including
closing the app during research and returning after the final response.


## Conversation-local agent memory

Local MCP memory is server-only and assembled during generation; clients do not
fetch or persist fact/persona profiles. API payloads, session cache keys, deduplication,
retention budgets, eviction and mutation invalidation stay unchanged. Both clients
show the same local-retention disclosure before granting connector access. A grant
uses existing contact/group access refresh and invalidation; disconnect never
promotes local knowledge to a shared profile. Verify reopen/back, failed refresh,
grant/revoke, member removal and account switching with fictional local memories
on both clients after an authorized release. Device checks remain pending.


## Reply failure presentation

Reply errors are projections of existing session-owned messages and group detail
snapshots, not a separate cache. Group source metadata shares snapshot request
deduplication, eviction, revision rejection and account/membership invalidation.
Snapshot refresh removes resolved group failures; loaded-message checks hide a
stale notice immediately when that bot's later message is present. Private notice
visibility derives from the cached turn sequence and later saved assistant text.
No local dismissal persistence or optimistic completion is used. Retry uses existing
server admission and refresh; stale/resolved retries return 409 rather than silently
claiming that a new job started. Server recovery keeps the same turn/reply ID, so
existing merge/completion ranking and polling handle its saved message normally.

With fictional data, verify both clients: a failed agent among successful group
agents, notices beneath the correct human/bot source, loading earlier sources,
reload/back with an old failure, subsequent responses by a different versus the
same bot, a private failure followed by success, failed retry/refresh, offline
reopen, access removal and account switching. View/device checks remain pending;
static checking does not establish scrolling or accessibility behavior.

## Markdown presentation

Bot message formatting and plain compact previews derive synchronously from the source text in existing
session-owned private/group conversation snapshots. It adds no network fetch,
disk persistence, alternate conversation cache or retained cross-account parser
results. Web keeps computed HTML only in each mounted message and invalidates it
when the text changes; iOS derives attributed blocks from the current text when
laying out content. Existing pagination, memory budgets, stale-response rejection,
access-loss invalidation and logout/account-switch eviction remain authoritative.
Reopening cached history formats it without waiting for revalidation, including
offline. Pending human submissions keep their literal text and idempotency IDs.
Static client checks passed; visual/offline/account-switch verification remains
pending. See the [formatting and verification contract](chats.md#bot-message-markdown).

Optional `lastMessagePreview` and quote/activity `previewText` fields share existing
snapshots and their existing lifetime/invalidation; they are not a separate cache.
Cached conversation projections refresh the plain summary together with its raw
text and sender metadata, including optimistic human messages, so a prior bot's
summary cannot survive a newer message. Server summaries parse full bot source
before clipping; older snapshots use the client fallback. No timestamps or source
text comparisons are based on the cleaned preview.

## Native experiments

NFC, focus, recipe and native speech experiments are deprecated as of 2026-10-30.
On activation, iOS intersects saved kinds with the active allowlist and removes
retired automatic timestamps, persisting the filtered settings. Historical request
snapshots/receipts remain available; retired requests cannot execute. Active legacy
focus/recipe activities are ended. No new cache or retention is introduced. Verify
upgrade from old settings, offline reopen, account switching and remaining timer/
alarm behavior on a device; browser guide/cache behavior is unchanged.

The session-owned `NativeExperiments` store retains up to 20 contact action lists
of 50 records. Empty results are cached; five-second freshness and shared in-flight
requests avoid repeated navigation loads. The active requests screen and a
foreground automatic runner share this cache and revalidate every five seconds;
chat reply changes and explicit refresh also update it. Transient failures preserve
lists, and account change/confirmed access loss rejects late results and clears
applicable native state. Automatic per-kind activation timestamps live in account-
scoped local settings and exclude older proposals. Disabled tools remove their
activation timestamp; re-enabling starts a new cutoff. Settings are not cloud-synced
or shared through the App Group. The session tracks attempted automatic action IDs
to avoid retrying uncertain execution; account reset clears this transient set.
Errors retain manual recovery in the request list and appear in a dismissible banner.
The old-API capabilities fallback retries a rejected message once with the same
submission ID and original content, omitting only the optional automatic-kind hint.
It does not reset the cached submission or retry action claims.
Operation claims are never automatically replayed. See
[native experiments](native-experiments.md#cloud-action-contract-and-failure-handling).

The baseline App Group holds explicitly enabled contact identities and bounded,
account-bound shared drafts (ten × 5 MB, 24-hour expiry), protected with complete
file protection. Account credentials remain in the main app's Keychain. Optional remote execution
adds the protected allowlist/alarm-ID handoff described below. Same-account cold
launches preserve drafts; sign-out/account replacement clears them. Drafts are
removed on send/discard, not on navigation. Identical identity snapshots do not
rewrite storage or reload widgets. Widget timelines request a 15-minute refresh,
subject to iOS scheduling. Native proposal lists have no disk cache; existing
private image cache rules are unchanged. Device lifecycle and failure checks are
listed in the feature guide and remain unverified until run on a signed device.

Native AlarmKit management retains a separate protected Application Support ledger
of at most 200 IDs/titles and account/contact identities, including across sign-out,
to manage alarms that continue in iOS. The account view filters to its own records;
authorized refresh prunes system-removed alarms. This local ledger is not a network
cache or agent memory and is not exposed through the App Group or model tools.

## Conversation initiative

The per-participant `initiativeEnabled` field uses the existing contact cache and its session isolation, freshness, pagination and eviction budgets. No new client cache or private disk retention is introduced. iOS contact details uses the existing 30-second contact freshness and deduplicated refresh; web details refreshes in the background on entry. Both reuse loaded contacts synchronously and keep content visible on errors. A confirmed mutation replaces the cached contact and rejects older in-flight reads; controls serialize mutations and retain the confirmed setting on failure. Deletion/access loss and account changes use existing contact/conversation invalidation, with generation checks rejecting late responses. Follow-ups are completed assistant-only turns and use ordinary conversation/list revalidation, pagination and read acknowledgements. Plans have no client snapshot or polling endpoint. See [initiative](initiative.md) for server retention and the pending cross-client verification matrix.

The faster initiative cadence (migration 0033) changes server scheduling and prompt guidance only. iOS and web retain the same contact/conversation caches, polling intervals, freshness, empty-state reuse, session isolation and late-response rejection. No client-side countdown, extra settings cache, pagination change or disk retention is added. Messages still enter the normal history/read/preview paths.

Adaptive initiative (0065) derives activity/receptivity from at most 160 completed
turns over 28 days of this participant's chat. These statistics are request-local,
not a new materialized or client cache. Categorical source-linked feedback remains
on its original turns; the explicit conversational pause stays on the contact.
Neither is copied into shared factual memory or another participant's profile.
Clearing history removes its labels and pause even when factual memory is kept;
contact/account deletion cascades. Archiving cancels the pending plan. Finite
ambient opportunities remain in the existing D1 plan and bounded Workflow
checkpoints, with no extra client requests, pagination or disk retention. Existing
contact mutation invalidation and history/account/access guards are unchanged.
Both clients' help now explains adaptive timing; reopen/back, refresh, offline,
mutation failure, revocation and account-switch verification remain pending.

Native in-app status reuses the same bounded action list for per-message receipts.
It adds an account-filtered, in-memory AlarmKit snapshot for at most the existing
200 locally tracked alarm IDs; the alarm ledger and retention are unchanged.
The `alarmUpdates` sequence and foreground refresh reconcile system removals,
pauses/resumes and alerting without network traffic. One-second timelines read
local ActivityKit state, never poll the API or persist presentation snapshots.
Account clearing drops system snapshots. Transient system-store failure preserves
last known IDs; an unavailable status is shown until a successful refresh.
Live focus/recipe/speech cards use existing system activities and the session
speaker. This system state needs no independent network cache. Model receipt
reads are bounded to ten terminal outcomes and scoped to contact/person/device;
they do not cache or expose another participant's state.

### Remote timer/alarm prototype

[Remote native execution](native-remote.md#local-storage-and-cache) adds session-owned
web device/receipt snapshots for at most 20 contacts, with five-second freshness,
shared in-flight reads, empty-result reuse, access/session invalidation and late-
response rejection. Revocation updates cached choices; a pending submission keeps
its original device, time zone and message ID. There is no browser disk persistence.

On iOS the per-account remote preference lives with native settings. The App Group
holds only the opted-in execution allowlist and up to 200 alarm-ID handoff records,
readable while locked after first unlock through until-first-authentication file
protection. Main account tokens remain in Keychain. Existing complete-protection
drafts are unchanged. Sign-out/account replacement clears the execution allowlist;
possibly scheduled alarm IDs remain available for same-account reconciliation.
The main app imports confirmed IDs into the existing protected alarm ledger and
prunes non-active expired handoffs on authorized refresh. See the feature guide for
retention, device cases and the pending client-identity verification.


## Consecutive private sends and typing activity

Private conversations retain their existing session-owned stores, pagination,
UUID-based send recovery, revision checks, polling, eviction budgets and account
invalidation. Accepted turns merge immediately, allowing the next send independently
of reply completion. One unresolved HTTP submission remains protected per client;
typing a different next draft does not replace that submission. Server-folded burst
messages normalize to completed user-only turns and merge through existing status
ordering; their text remains visible, without manufactured assistant receipts.

Typing is deliberately not cached or persisted on clients: it is an ephemeral
six-second server timestamp on the existing visit, containing no draft. Focus alone
does not refresh it. Opening a cached draft does not recreate typing. Activity
requests do not fetch conversation snapshots or change permission authority. The
web rejects activity renewal for a superseded visit/contact and closes visits when
hidden; iOS renews on subsequent actual edits. Existing server visit cleanup removes
expired visit rows after one day. No new private disk retention is introduced.

Verify cached reopen/back, multiple sends, empty chat, explicit refresh, delayed
submission/response, offline recovery, access loss and account switching, plus
leaving a keyboard or unfinished draft idle. These runtime/device checks remain
pending; static checks do not establish UI behavior.


### Chronological private-chat presentation

The session stores still own sequence-ordered turns; a derived timeline splits each
turn into human (`createdAt`) and assistant (publication `updatedAt`) items with
stable turn/side IDs. Equal timestamps use side, sequence and ID tie breaks. Only
presentation order changes, so pagination cursors, status merging, reply/reaction
identities, UUID retries, LRU budgets and account invalidation retain their existing
rules. Web optimistic sends and iOS outgoing messages join the timeline at their
local creation time until the accepted server timestamp arrives. No extra network
fetch or private persistence is added. iOS scroll observation and native receipt
refresh now detect late changes to earlier turns as well as the latest sequence.

The API can normalize a previously running conversational turn into a user-only
completed turn if newer eligible input arrives before publication. Both clients
already merge this terminal state. Only an unpublished, tool-free draft is discarded;
existing replies and tool receipts remain. Reopen/back, refresh, earlier-page merges,
optimistic sends, equal timestamps, quoted navigation, read receipts, revocation and
account switching require runtime verification; static type/SQL checks passed.

## Mini apps

[Mini apps](mini-apps.md) use one session-owned list per base, `contacts/<id>` or
`groups/<id>` (bounded to 20 lists, five-second freshness, revalidated by visible
chat polling and contact or group details) and one resolved view per app (bounded
to 16, oldest-load eviction) on iOS (`MiniAppStore` inside `ContactsStore` for
private apps and inside `GroupConversationCache` for group apps) and web
(`useMiniApps`). A group chat forces a list refresh whenever its latest message
changes, because a shared app is created just before the message that shows its
card. Leaving, deleting or losing access to a group drops its list and views. A view is reused for
60 seconds because each load runs the app's remote reads. Local state actions in
apps without remote reads return the updated view, which replaces the cached view
unless a newer load started; otherwise a completed action forces a reload. Explicit refresh, pull to
refresh, a changed input or a completed action bypass that window. In-flight loads are
deduplicated; a newer input selection, invalidation or account change rejects late
responses. Transient failures keep the loaded view visible; a first-load failure
shows a retry. Approval, disabling and deletion replace the list entry and drop the
view. A 404 or `REVIEW_REQUIRED` clears the view and revalidates the list. Contact
removal, confirmed access loss and sign-out clear both caches. Resolved connector
data stays in memory only, with no disk cache. A pending action keeps its execution
UUID only in its screen's state; leaving the screen drops it, and an unknown
outcome is never resubmitted. Device checks for reopen, back navigation, refresh,
offline recovery, revocation and account switching are pending.

Local taps and direct state edits from bound components (toggle, choice, input,
checklist rows) are queued per app view, in memory, and applied immediately to the
displayed state. They are sent in order with one execution UUID each. A response
with a `resolution` replaces the cached view; the display is that view plus the taps
still pending. A transient failure retries the same UUID twice, then drops the queue
and reloads. Leaving the screen keeps the queue running in the session store. Account
changes and view invalidation discard it, and late responses are rejected.

## Personality snapshots and drafts

The [personality editor](personality.md) uses `NavigationSnapshotCache` plus
session-owned `PersonalityDraft` objects in `ContactsStore` on iOS, and
`usePersonality` on web. Each budgets eight entries in memory. Active saves are
protected from ordinary eviction and may temporarily exceed the budget. No
profile, dirty draft, or derived relationship state is persisted to client disk.

Specialties live in the same profile snapshots and dirty drafts as identity and
traits, with the same eight-entry budget, revision handling and invalidation. No
additional request, persistent cache or capability catalog is introduced. Old
profiles normalize missing specialties to empty text.

The last snapshot (including the disabled/empty default) is immediately reusable.
Opening/reopening revalidates in the background; iOS also refreshes on foreground.
Explicit refresh asks before discarding a dirty draft. The server revision used
for a dirty draft never silently advances during revalidation. Requests deduplicate,
saves invalidate earlier reads, and successful mutations update snapshot and draft.
Errors retain usable data and input; confirmed deletion/access loss and account
changes clear state and reject late responses. There is no pagination or new image
cache. Age/birthday display is refreshed on navigation or explicit refresh, while
server reply context always derives the current date.

Verify specialties survive reopen/back and failed saves, clear on account changes,
and preserve dirty edits during refresh. Verify empty defaults, refresh/discard,
offline reads and failed saves,
concurrent edits/409, pending saves across navigation, eviction, deletion/revocation,
and account switching on both clients. These checks remain pending on devices and
in a browser; static type checking cannot establish UI behavior.

Relationship projections and acting plans are server-only and are never cached or
persisted on either client. They are rebuilt from current eligible sources for
each preparation/review, with model consent and connector isolation rechecked.
The editor copy on both platforms explains continuity without private causes and
the connector exception. Its existing snapshot/draft API and retention are
unchanged by relationship continuity; no additional network-backed UI state is
introduced.

## First-circle onboarding

Both clients keep one session-owned options snapshot, progress snapshot and draft;
empty/pending results are cached. First reads load, navigation reuses content and
revalidates in the background. Reads and submissions deduplicate. Mutation/session
revisions reject stale responses, and logout/expiry/account switching clear all
state. Polling is 3 seconds during generation and 10 seconds otherwise, with
manual refresh after errors. Pending submission tasks survive view navigation.
Drafts persist in memory only; accepted input/identity plans persist in D1 for
resumption, with no automatic expiry. No pagination is needed for the single setup
resource; fixed option lists plus one snapshot/draft bound memory. Avatar keys
retain account, access context, agent identity and immutable version in the
existing private image cache. See [onboarding](onboarding.md#cache-and-account-isolation)
for recovery, mutation behavior and pending device/browser verification.

## On-demand profile images in model context

The shared iOS/web API's `view_profile_photo` path deliberately avoids a persistent
inference image cache. Every inference revalidates current conversation membership,
consent and the requested immutable version, reads R2 inside the inference step,
and checks access/version again after reading. Tool checkpoints hold references
only; transient bytes are deduplicated per member and bounded to three images and
8 MiB per inference. Missing/replaced/revoked images produce an unavailable marker.
This prevents a checkpoint or cached image from granting later access. Client
`PrivateImageCache` and web session caches retain their existing behavior and
invalidation; no network-backed client state or navigation loader is added.
See [profile photos](profile-photos.md#profile-images-available-to-contacts) for
fictional-data validation cases; device and live-model behavior remains unverified.

Onboarding age follows the same session-owned draft and snapshot lifecycle. New
input requires a whole age from 1–120; legacy input missing age decodes as empty,
retains its immutable saved setup and can retry. Mutations/account changes reject
late snapshots, and neither client adds local disk retention of age. Saved plans
and portraits are reused rather than regenerated after an age-prompt update.

## Delivered reply sequences

Private delivered parts live inside the existing cached ChatTurn on iOS and web.
Stable part IDs and timestamps render separate bubbles; the aggregate text remains
available for previews/legacy compatibility. Existing attempt/update-time guards,
request deduplication, turn pagination and session eviction apply unchanged. No
unsent model output, client timer or extra disk copy enters these caches. Reopen
shows the cached delivered prefix immediately and sync appends newer parts; access
loss and account changes invalidate it with the parent conversation. Group parts
use normal message rows and the existing group cache. Length-aware composition
waits run only in the server Workflow; both clients poll the same delivered prefix
and current Typing/Recording state. Clients never hold a complete reply to release
it on a timer. An offline or suspended client may receive multiple already-published
parts in one refresh, so gaps are only observable while syncing live. Check reopen/back navigation,
empty/legacy history, offline recovery, new input during a burst, late responses,
revocation and account switching as described in [successive messages](reply-messages.md).

## Group private text permissions

Private-sharing settings live inside existing group snapshots: iOS GroupChatStore
and the web's session-owned 20-group conversation cache. Empty permission arrays
are reusable loaded results. Group details renders cached content immediately and
revalidates on entry/explicit refresh. Concurrent details requests share one request;
mutation invalidation rejects earlier completions and successful grants/revocations
update cached switches before revalidation. Offline/failure keeps usable content.
Existing store eviction, access-loss clearing and account reset apply. No extra
disk retention or raw private transcript cache is introduced in either client.
Server authorization is live on every retrieval; revocation cancels affected
pending group attempts to invalidate model checkpoint contents as well. Validate
reopen/back, empty state, failed refresh after mutation, revocation and account
switching on device/browser; static checks alone do not establish these behaviors.

## Group typing snapshots

Group `replies[].isTyping` travels with existing session-owned snapshots and
one-second visible polling on iOS and web. Both clients require an explicit 1
and running status; old snapshots without the field show no typing. Queue
occupancy never predicts typing. No new request, cache, disk data, retention,
pagination or eviction policy is introduced. Background revalidation replaces
this transient state using the existing generation guards; offline snapshots
can retain the last observed state until a successful refresh. Deletion, access
loss and account changes use existing conversation invalidation. Verify reopen,
back navigation, refresh, offline recovery, revocation and account switching
with fictional accounts on both clients; runtime/visual checks remain pending.

### iOS history positioning

Private and group chats measure all currently loaded rows using a regular `VStack`
so bottom positioning does not depend on lazy height estimates for long messages.
Cached navigation retains the default bottom anchor; the first asynchronous history
load positions without animation. Receipt-only private-chat updates do not request
another scroll. Native `ScrollPosition` targets the bottom edge including scroll
insets. While following latest, idle content/viewport/inset changes re-align that
edge without animation; offset changes alone do not trigger alignment. User scroll
interaction, earlier-page loading and quoted navigation disable alignment until
an explicit latest-message scroll. The latest-message button's fade is confined
to its overlay.
Store ownership, freshness, deduplication, stale-response rejection, pagination,
compaction, LRU limits, pending submissions, invalidation and persistence are unchanged;
this adds no fetch or cache. Eager layout costs grow with explicitly loaded pages.
Verify cold/cached reopen and back navigation, long last messages, older pages,
quotes, keyboard resizing, offline refresh, deletion/revocation and account switching
on a device. Static checks do not establish smoothness or large-history performance.

## Contact-authored quotes

Private assistant quotes travel in delivered `assistantMessages` and group quotes in
ordinary messages. The existing session conversation caches retain these payloads;
no new fetch, disk store, image cache or timer is added. History revalidation resolves
quotes from current authorized history; attempt/update-time guards, pagination,
eviction, access-loss invalidation and account isolation are unchanged. Verify
quoted replies after reopen, offline recovery, pagination and account switching on
both clients. A cached quote never grants access to the original.

Contextual group participation reuses existing round and history snapshots on both
clients. Skips publish no message and expose no draft; existing polling refreshes
reply status and presence without adding a synthetic bubble or a parallel cache.
Verify empty/skipped rounds on reopen, offline recovery and account switching.

Terminal group replies close their own queued bot continuations atomically at
publication. No client cache entries, synthetic messages or new polling are used.
Existing group snapshots revalidate queue/presence changes on iOS and web. Confirm
that terminal replies remain stable across navigation/offline recovery and that
fresh human traffic still updates the conversation after it has gone quiet.

## Generated assistant images

iOS supplies the assistant side through the request builder's query items rather
than embedding it in the URL path. Existing cache identities, budgets and access
invalidation remain unchanged. After installing the corrected client, retry a
failed image, open it full screen and from chat media, then reopen the chat;
also verify a human image on the same turn, offline recovery and account switching.
Device verification of this request correction remains pending.

Private generated-image metadata is part of the delivered assistant message, so
existing attempt/update-time merges reject stale data. The byte path has
`?side=assistant`; iOS adds `assistantAttachment` to the existing PrivateImageCache
resource enum. These distinct immutable keys include conversation/turn identity
and the existing account boundary, preventing collisions with human attachments.
Thumbnails and full-screen images use the same cache, budgets and protected disk
policy, with ordinary eviction, deduplication, access-loss/account invalidation
and cancellation. Groups reuse message attachment keys. No polling or download
is added to a view. Verify cache reopen/back, refresh, offline recovery, image
publication, deletion, revocation and account switching on both clients. See
[generated images](generated-images.md) for byte retention and cleanup.

## Chat details media

Both clients keep one session-owned page list per chat and kind (`image` or
`file`): `NavigationSnapshotCache<ChatMediaPage>` on iOS (in `ContactsStore` for
private chats and `GroupConversationCache` for groups, eight entries LRU) and
`useChatMedia` on web (24 entries). Lists hold metadata only; thumbnails load
through `PrivateImageCache`/`usePrivateImage` with the same resource keys as chat
bubbles (`contact/:id/attachment/:turn`, `contact/:id/assistant-attachment/:turn`,
`group/:id/attachment/:message`).

- Reopening details shows the cached page immediately, including empty results,
  and revalidates the first page in the background (iOS on every visit, web after
  15 seconds). A refresh replaces the list with the first page and drops later pages.
- **Load more** appends the next page; first-page requests are deduplicated.
- Transient failures keep the cached list visible; a 403/404 clears it.
- Contact removal, leaving or losing a group, and sign-out drop the lists
  (`forgetConversation`/`forgetGroup` on web; the store removal paths on iOS).
- Nothing is written to disk besides the existing protected image cache.

Device verification pending: reopen details after sending a new image, switch tabs
while loading, pull more pages, leave a group with details open, and switch accounts.

## Chat documents

Web research reports add nullable provenance to the existing document list/detail
snapshots. Both clients reuse those session-owned entries for the source panel and
card badge, including cached empty lists. There is no source request or search on
navigation/refresh. Snapshot deduplication, stale-response rejection, freshness,
mutations, LRU eviction, access-loss invalidation and account clearing remain the
same as ordinary documents. Original provenance stays fixed across edits and is
removed on document deletion. Verify reopen/back, refresh, offline recovery,
deletion, revocation and account switching on both clients; static checks alone do
not verify presentation. See [web research](web-research.md).

Per chat, a document list (summaries only) and up to eight (iOS,
`NavigationSnapshotCache`) or 16 (web, `useDocuments`) open documents, kept in memory
and never on disk. Chat screens refresh the list when new replies arrive, to show
cards; an open viewer revalidates every five seconds, but never replaces an open
draft. A save replaces the cached document and invalidates the list; a 409 reloads
the document and keeps the draft for the person to decide. A 404 clears the entry.
Contact removal, leaving a group and sign-out drop the lists. Device verification
pending.

## Task boards

One board (`{ lists, members }`) per chat: `NavigationSnapshotCache<TaskBoard>` on
iOS (`ContactsStore.taskSnapshots`, `GroupConversationCache.tasks`) and `useTasks`
on web (16 entries). Reopening Tasks shows the cached board at once and revalidates;
while the screen is visible it revalidates every five seconds, because contacts
change tasks during their own turns. Every edit returns the full board, which
replaces the cache; on web a pending edit blocks polling from overwriting it. A
failed edit shows its error and reloads. Transient failures keep the board visible;
404 shows that the tasks are unavailable. Contact removal, leaving a group and
sign-out drop the boards. Nothing is written to disk. Device verification pending.

Persistent work (0054): execution state, next step, evidence, blocked reason and
work-turn consumption travel in this same board. Pause/resume/cancel and progress
edits use the existing versioned PATCH and full-board replacement. No optimistic
permission grants, independent requests, disk retention or new cache keys are
introduced. Polling can show a queued old turn until its Workflow observes the
revoked generation; server admission/publication checks remain authoritative.
Check reopen/back navigation, cached empty boards, explicit refresh, offline
recovery, a stale editor versus background progress (409), pause/resume from
another client, cancellation, access loss and account switching with fictional
data. Static validation does not establish those client behaviors.


## Internal chat image description index

Migration 0048 stores derived visual search descriptions and attributed context in
D1 for the shared API. This server index is not a client image cache: iOS/web
retain their current session stores, account/context/immutable-resource image keys,
request deduplication, stale-response rejection, protected disk limits, navigation
reuse and offline viewing. No descriptions or object keys enter public history or
media endpoints, and no view-local downloads are introduced.

Indexing reuses a completed description by immutable object key and digest and
shares a 60-second lease between concurrent group bots. Failed descriptions retry
after the lease; legacy history fills lazily one image per search. Every lookup and
model byte read checks the current source, chat audience, membership, consent and
sequence watermark. Cached tool references are reauthorized at later inference,
generation and before publication. Deleting a source message deletes its metadata;
orphaned generated objects/index rows follow registry cleanup after the 24-hour
grace period. Avatar replacement does not invalidate old delivered chat images.

With fictional accounts, verify reopen/back, offline viewing and recovery, page
boundaries with both human/assistant images, indexing failure, deletion, revoked
membership/consent, connector isolation and account switching on both clients.
Only API types and SQL preparation were checked for this server-only change.

### Optional onboarding group and initial Chats rows

Circle purpose, group toggle and occupation/studies share the existing session-owned
onboarding draft, frozen submission, polling and reset/revision rules. Friends
submissions clear occupation/studies. No additional local persistence or cache is
introduced. Onboarding-created contacts carry `onboardingChat: 1` through the
existing contact list/detail snapshots on iOS and web. This server-persisted marker
keeps their empty Chats rows visible across refresh, navigation and session restart;
ordinary empty contacts still stay hidden. Real messages take over previews and
ordering normally. Deletion/access loss/account switching follow existing contact
cache eviction. Verify completion with/without group, empty-row refresh/reopen,
first-message ordering, offline recovery, deletion and account switching on devices
and browsers; static validation does not confirm these flows.

## AI creation and personality drafts

Both iOS and web support [AI contact creation](contact-generation.md), alongside
manual creation, with persisted onboarding context and bot-only selectors. Creation
uses a session-owned draft/pending ID and a durable D1 job on the existing onboarding
Workflow; navigation reuses cached state, then revalidates. New generated contacts
receive random adult birthdays. Birthday edits must keep contacts at least 18.
Existing creators can generate/regenerate all personality fields into the existing
session draft, review them, and save with revision conflict protection. Generation
preserves the name and adult birthday. Account changes/access loss discard cached
private state; existing photo caches remain authoritative for bytes. See the linked
guide for recovery, retention, rate limits, cache details and pending device checks.

Task research (0055): exact public query, attempts used and receipt status travel
in the same task-board snapshot. The existing five-second foreground refresh
replaces receipt state even when the task edit version is unchanged; task editing
still uses the version and grant snapshot captured when the editor opened, even
when foreground polling replaces the cached board. A conflict requires reopening
the refreshed editor. Grants use the existing PATCH and replace the full board;
no permission is acted on optimistically. Reports and provenance use the document
cache above; there is no new disk store, network-backed view state or cache key.
Revocation/access loss/account reset and late-response rejection follow those same
board/document rules. Device/browser verification remains pending for reopening,
empty results, offline recovery, in-flight revoke, failed/uncertain receipts and
account switching with fictional queries.

Page monitors (0056): URL, keywords, interval, change turns used, pending state and
the latest five check outcomes travel in the same task-board snapshot and follow the
same refresh, versioned-edit, conflict, access-loss and account-reset rules. Check
excerpts and stored page text stay on the server. No new cache, polling or disk
store. Device/browser verification of the monitor section, check list refresh,
revocation and reassignment remains pending. See [page monitors](monitors.md).

Task collaboration (0058): deliverable title, revision rounds and feedback travel in
the same board snapshot; document titles follow the board's refresh, not the document
cache. No new cache or polling.

## Super admin panel

`apps/admin` keeps session-owned, in-memory caches for the overview, the settings
list and the current account search, with background revalidation on navigation,
cached content kept through transient failures, revision counters that reject late
responses, invalidation after account deletion and setting changes, and a full reset
on sign-out or session expiry. Nothing is persisted in the browser. The API reads
runtime settings from D1 on every use, with no isolate cache. Details:
[admin panel caching](admin.md#panel-caching). A 202 account-deletion response
removes the account row and invalidates Overview immediately, while the server
continues durable R2/Workflow cleanup. This creates no new client cache, storage
or polling. Reopening the list, transient failures, late list responses and account
switching retain the existing revision guards. Other iOS/web sessions clear private
snapshots on confirmed session expiry/access loss; offline downloaded copies are
not remotely recalled. Browser/device verification of the correction is pending.

## Speech accent preference (0061)

The shared accent travels with existing contact responses; iOS `ContactsStore`
and web `useChats` retain it in the same account-owned memory snapshots as voice ID.
No separate preference cache or local persistence is introduced. The selector
reads these snapshots synchronously, uses existing background contact revalidation,
and updates them only from a successful creator mutation response. Existing
mutation serialization and account-generation guards reject stale results; failed
writes retain the saved selection. Other participants observe shared edits on the
next ordinary contact refresh, without new polling or cross-device push.
Sign-out, account changes, deletion and confirmed access loss use existing contact
store invalidation. The server rechecks creator ownership on every write and reads
the current preference for new audio. Presets are bundled constants, not network data.

Generated MP3s keep their existing immutable message keys. Settings changes neither
invalidate historical audio nor regenerate catalog previews; the next new voice
reply gets the new delivery. Existing download deduplication, memory/disk budgets,
eviction and session rejection rules are unchanged. Pending verification in both
clients: back/reopen, offline save failure, refresh after another participant edits,
creator/member restrictions, revocation and account switching during a save.

## Web conversation refresh coordination

Web private/group history refreshes deduplicate requests per cached entry. The
sidebar refresh prioritizes the visible history before publishing newer activity.
Existing cache ownership, eviction, stale-response checks and pending-send IDs
remain in force. Scroll state is visit-local and adds no persisted private data.
See [web chat scrolling](web-chat-scrolling.md) for behavior and pending browser
checks, including navigation, failures and session/account changes.

## Voice playback speed preference

Playback rate is a small local preference, separate from cached audio. One validated
numeric value (1, 1.5 or 2) per account is retained in UserDefaults on iOS and
localStorage on web under `voicePlaybackRate.v1.<userID>`. It restores synchronously
when that account's player activates, with a 1x fallback for missing/invalid data.
No extra fetch, refresh, request deduplication or media-cache entry is needed.
The active player updates immediately and all later clips reuse the selection;
audio bytes, waveform samples, immutable keys, cache budgets and eviction stay the
same. Time labels and seek remain in source-audio seconds.

Sign-out/account switches stop the player and clear the in-memory rate, retaining
the saved numeric value for that account's next sign-in. The preference contains
no audio, transcript or position; it is intentionally not erased with media cache
clears, contact deletion or access loss. Clearing local app/browser storage removes
it. No device/browser/live-tab synchronization is implemented. Browser storage
failures keep the in-memory selection usable for the session. Verify restart,
account switching, offline playback, interrupted playback and denied storage on real
clients; these behaviors are not established by static checks.


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

## Chat lifecycle invalidation

Archived is opened from the top-left Chats menu on iOS and the header archive
button beside Account on web, with no Home list row. These entry points keep the
same session stores and refresh/pagination behavior. Web contact/group details
read archive state reactively from these stores and use the existing lifecycle
mutation helpers for archive, clear and contact deletion; no view-local cache is
added. Verify details state after archive/unarchive and history invalidation after
clear, including both memory choices and deletion failures. Verify returning from an
archived chat, an empty archive, unarchiving and Back to Chats on device/browser.

[Clear/delete](chat-lifecycle.md) purge conversations, pending submissions, reactions and secondary resource snapshots, stop playback, and clear existing image/audio caches (including iOS protected disk storage). Server history revisions reset other devices' caches and fence pagination/offline sends. Archive uses the existing session list cache and pagination; unread totals still include archived chats. Device/browser failure-recovery verification remains pending.

Lifecycle validation now includes source deletion, retained-memory permissions and pending cleanup across linked private/group scopes. See the [local integration report](chat-lifecycle-testing.md). The 0064 corrections are server-side and preserve both clients' existing revision/cache invalidation contract; device/browser cache eviction and stale viewer responses still need UI verification.

## Voice listening metadata

Migration 0066 stores incoming private listening by immutable turn/assistant part
and group listening by message/account. History and chat-list summaries return
`ownListenedAt`; outgoing `listenedAt` retains the existing contact-listening meaning.
The API checks current ownership/membership and audio type inside idempotent writes.
Private metadata is deleted with its turn; group playback rows cascade with the
message or account. This stores playback metadata, never another audio copy.

Both clients update the existing session conversation store after playback starts,
coalesce concurrent receipt writes, and merge history/summary listening evidence
without reverting to unlistened on a stale response. Lists project the same metadata
and duration from retained conversations/pending sends before server summaries.
No new client disk retention, pagination or audio-cache budget is introduced; metadata
shares the existing conversation LRU and lifecycle. Account changes, clear/deletion
and confirmed access loss discard it with the conversation. Late replies cannot
recreate discarded data. Failed writes retain local evidence until cache eviction
and retry on the next playback; only confirmed writes survive sign-out/reload.
Existing history/list background refresh and explicit refresh bring in other-device
receipts while keeping loaded content visible through transient failures.

Manual verification on iOS and web remains pending: received audio starts grey, play
turns the thumb/microphone and latest-row icon to the read color, pause/replay/back
navigation preserve it, and a fresh session/device restores a confirmed receipt.
Check both directions, groups with two human accounts, pending sends, multi-part
replies ending in audio versus text, activity overrides, dark mode, screen readers,
failed decoding, seek-only interaction and waveform loading without playback.
Also check offline playback/retry, empty chats, explicit refresh, cache eviction,
clear/delete, membership revocation and account switching during a receipt request.

## Conversation learning

[Conversation learning](conversation-learning.md) uses a session-owned eight-entry
`NavigationSnapshotCache` in iOS contact and group stores; entry and explicit refresh
revalidate without hiding loaded or empty content. The web session map holds eight
snapshots, with thirty-second freshness and explicit Refresh. Reads are deduplicated;
mutation revisions and entry identity reject stale completions, including account
switches. Transient refresh failures preserve usable content. Confirmed access loss,
history clear and contact/group removal drop affected snapshots. Local group consent
or membership mutations invalidate group learning. No disk persistence, pagination
or added chat polling is required; each API response contains at most eight bounded
agent profiles and is marked no-store.

Server learning expires on read and minute-Cron cleanup, retaining only a small
watermark after profile expiry. Reset/disable advances a source floor and epoch;
late inference and unpublished drafts cannot restore older learning. Ordinary factual
memory follows its own retention controls. Verify reopen/back, empty results, explicit
refresh, offline/failure recovery, reset during a request, history clear, remote
revocation and account switching on both clients; device/browser checks are pending.

## Natural conversation style

[Conversation style](conversation-style.md) introduces no downloaded resource or
client cache. Stable writing habits are computed server-side from the shared
agent ID and current traits. Regional wording reads the existing speech override
and validated original generation preferences during context preparation. Local
name/length feedback and the group participation index use only that audience's
already-authorized history; no cross-conversation measurements are cached.

Both clients retain their current session conversation/contact stores, pagination,
request deduplication, loaded/empty snapshots, background refresh, stale-response
rejection, pending submissions and account/access invalidation. Accent mutations
upsert the existing contact responses; failures retain the prior selection. No
new persistence, eviction policy or image key is introduced. Checkpoints can retain
older direction for an in-flight draft; newly prepared contexts use current
settings. Stored historical messages do not change after a release. Check reopen,
refresh, empty chats, offline recovery, mutation failure, revocation and account
switching on iOS/web. Static checks do not verify these device behaviors.

The final group wording review uses the existing Workflow step checkpoints; it
creates no client cache or downloaded state. It sees only the current authorized
group context and candidate prose, never other private text. A review does not
grant access, change recipients' permissions or replay tools. Publication keeps
its current membership/consent/history checks, and existing stale-draft review
handles traffic arriving during the extra model call. Text-only effects failing
speech fitness simply arrive as ordinary text in both session conversation stores.

## Name pools and conversational activity

Name-pool candidates are ephemeral server data inside generation. Only selected
names enter the existing immutable D1 plan/contact and normal iOS/web caches; there
is no candidate endpoint, local name history or global cross-account cache. Saved
plans are reused after retry/navigation; a completed contact follows the usual
store refresh. Existing creation deduplication, pending IDs, access/account reset,
stale-response guards, pagination and eviction budgets remain unchanged.

Conversational direction and activity statistics remain request-local/Workflow
checkpoints. Private initiative reads the composer typing watermark rather than
passive visit timestamps; it adds no client requests or timing cache. Group replies
reuse normal delivered-message rows and one-second foreground sync, including
Typing between parts. Reopen/back/empty views use existing snapshots; offline
recovery can fetch several already-published messages together. Deletion/access
revocation/account switching retain their normal invalidation and rejection of
late responses. No additional private disk retention is introduced. Device checks
for these transitions remain pending.

## Conversational research

Migration 0068 keeps conversational public findings in the existing server receipt,
not a document or new client cache. The API reuses at most two audience-local
findings as bounded context, checking sequence, model/consent, current group roles
and private contact/user/agent scope on every read. These request-local excerpts
are not permissions, shared factual memory or a cross-account knowledge cache.
Receipts retain one bounded normalized body/provenance until parent deletion;
clear-history cascades remove them even when factual memory is kept. No extra
private client disk persistence or retention sweeper is introduced.

Only the ordinary reply reaches the existing iOS/web conversation stores, including
source links the contact actually uses. Explicit document delivery still updates
the normal document caches/source panels. Conversational delivery does not mutate
the Docs list, so cached empty lists remain valid. Existing session freshness,
request deduplication, pagination, budgets/eviction, pending IDs, stale-response
rejection, mutation invalidation, access loss and account reset apply unchanged.
Reopen/back/offline recovery reuses delivered messages and revalidates normally;
it never reruns a search. Functional device/browser checks remain pending.


## Group message read details

**Message info** uses the immutable receipt snapshot through the membership-checked
`groups/:id/message-info` endpoint. iOS keeps eight NavigationSnapshot entries per
retained group; web keeps a 32-entry session LRU. Loaded and empty results render
synchronously on reopening; refresh runs on open, every five seconds while visible,
and manually. Requests deduplicate and reject writes after invalidation. Transient
errors retain usable snapshots. Clear/group deletion/access loss and account reset
remove the relevant values; no private data is written to disk. There is no new
conversation cache or pagination. Server permissions remain authoritative. Reopen,
back, empty states, offline/error recovery, refresh, clear/access revocation and
account switching need device/browser verification; static checks do not prove them.


## Public web message audio

The root app caches only the two public decoded UI sound buffers and their
in-flight loads in memory (under 1 MiB at bundled sample rate). Reuse is immediate;
failed loads evict, teardown clears, and unchanged bundled files use normal HTTP
caching. There is no private audio or account data in this cache. Session reset
stops active sounds and invalidates pending events/played IDs; visibility loss also
stops and invalidates events. Playback checks generation, destination and visibility
after async decoding and skips events delayed over 1.5 seconds. No old sound replays
after unlock, navigation, account switching or offline recovery. Browser listening,
keyboard/touch unlocking and background/resume behavior remain unverified.

## Explicit debug exports (web only)

[Debug JSON export](debug-export.md) intentionally has no cache: a user-triggered
full-history download must fetch unloaded pages and avoid retaining another copy of
private conversations. One session-owned operation deduplicates clicks, loads 25
rows per page, retains at most 100 MB of JSON parts, and releases them after download,
failure or cancellation. Final Blob/browser allocations can temporarily add memory.
No disk persistence occurs except the explicit browser download. Cancel, sheet close,
account-page unmount and session reset abort the request and reject late responses;
the temporary object URL is revoked after download. Retry starts from scratch;
conversation caches are untouched. Authorization is checked on every page and the
scope/history manifest is checked again before saving. This remains a live export,
not a transaction snapshot. Browser checks for navigation, empty/archived histories,
offline recovery, access revocation, clear, cancellation and account switching are
pending; see the feature guide for the full fictional-data checklist.

## Link preview cards

Both clients keep link card metadata in a memory-only, account-keyed session cache
(web `useLinkPreviews`, iOS `LinkPreviewCache` owned by `PrivateImageCache`) of at
most 200 URLs. Cached previews render synchronously on reopen and navigation;
requests for one URL are deduplicated; a server `failed` result is kept for the
session and transport failures retry on the next render. Session reset, sign-out,
account switch and access loss drop the cache, and late responses from an earlier
session are discarded. Images reuse the private image caches with the preview fetch
time as version. Server-side previews expire after seven days (failed after six
hours). See [link previews](link-previews.md).
