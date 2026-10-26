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
- Sending and retrying update the cached turn immediately after server acceptance
  and invalidate its freshness so polling can resume promptly. Changes to the last
  turn refresh the contact preview. Contact creation and rename update the local
  contact immediately and invalidate list freshness.
- Revision checks discard responses superseded by mutations, invalidation, or a
  replacement history window. Cancellation is not displayed as a network error.
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

This is an application memory cache. It does not persist messages, contact data,
or credentials to disk, bypass server authorization, or change HTTP no-store
headers. Process termination starts a new cache. Session restoration still requires
server validation and may show the existing splash. The original navigation cache adds no infrastructure. Unread tracking additionally
requires migration 0005 and the matching API release described in notifications.md.

## Verification

Swift static type checking and git diff whitespace validation cover this change.
No application builds, automated tests, simulator runs, or live account requests
are part of this verification. Installed-app behavior still needs checking: open
and reopen a conversation, navigate between tabs, refresh manually, lose and
restore connectivity, finish a pending reply, load older pages, delete a contact,
and sign in with another fictional account. Reinstall/run the updated iOS app to
use the change.

## Profile photo bytes

ContactsStore keeps encoded profile images in a session-scoped NSCache with a
16 MiB total cost limit, keyed by contact ID and photoVersion. Visible avatars
load through the authenticated API, and version changes discard the previous
visible image before fetching. Successful photo mutations evict the previous
version from the cache; signing out discards the entire store. HTTP responses
remain private/no-store and the app uses no disk photo cache. The notification
extension uses an independent ephemeral download with no shared session token.
See [profile photos](profile-photos.md).


Foreground chat visits and composer edits also report activity through a separate
three-second task. This does not mark history fresh or interfere with history
polling. Opening a chat registers one expiring visit; idle polling does not renew
it. Backgrounding/navigation close the visit best effort, and server TTLs expire
lost clients. See [visit presence](chats.md#visiting-a-chat-and-composing-a-draft).
