# iOS navigation cache

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

[Mini apps](mini-apps.md) use one session-owned list per contact (bounded to 20
contacts, five-second freshness, revalidated by visible chat polling and contact
details) and one resolved view per app (bounded to 16, oldest-load eviction) on iOS
(`MiniAppStore` inside `ContactsStore`) and web (`useMiniApps`). A view is reused for
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
