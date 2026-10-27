# iOS navigation cache

The signed-in HomeView owns ContactsStore, which owns ConversationCache. Views
reuse the same ChatStore for each contact rather than constructing a new store
on every navigation. Loaded content stays visible during refresh and network
failures. A full loading indicator is reserved for the first successful load;
empty cached lists retain their empty state during revalidation.

## Freshness and requests

- Individual contacts remain fresh for 30 seconds during navigation. The signed-in
  shell forces a contact-list refresh on activation and every three seconds while
  active so unread counts and previews update even outside a conversation. Automatic
  refreshes preserve previously loaded later pages; pull to refresh resets pagination.
- Visible conversations revalidate on each three-second foreground tick, including
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

Only the visible conversation polls history. Opening or returning to it forces
an immediate history refresh;
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
used eligible entry when another is opened. Stores with an active send/retry or
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

Swift static type checking and git diff whitespace validation cover this change.
No application builds, automated tests, simulator runs, or live account requests
are part of this verification. Installed-app behavior still needs checking: open
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
older retained outgoing IDs in batches of 100. History merging replaces receipt
state by message ID. Home acknowledges received group previews in one bounded
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
reply status every three seconds. A cache does not suppress live updates. Changes
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
