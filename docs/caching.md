# iOS navigation cache

The signed-in HomeView owns ContactsStore, which owns ConversationCache. Views
reuse the same ChatStore for each contact rather than constructing a new store
on every navigation. Loaded content stays visible during refresh and network
failures. A full loading indicator is reserved for the first successful load;
empty cached lists retain their empty state during revalidation.

## Freshness and requests

- Contact lists and individual contacts are fresh for 30 seconds. Navigation and
  foreground activation reuse fresh data; pull to refresh and Retry force a request.
- Visible conversations check freshness every three seconds while foregrounded.
  Pending replies revalidate on each tick; idle history revalidates after 30 seconds.
  Failed refreshes back off for at least five seconds unless a reply is pending.
- Conversation pull to refresh and Refresh bypass freshness. Refreshes of the same
  conversation, list, or individual contact do not overlap.
- Sending and retrying update the cached turn immediately after server acceptance
  and invalidate its freshness so polling can resume promptly. Changes to the last
  turn refresh the contact preview. Contact creation and rename update the local
  contact immediately and invalidate list freshness.
- Revision checks discard responses superseded by mutations, invalidation, or a
  replacement history window. Cancellation is not displayed as a network error.

Only the visible conversation polls. Returning from background checks freshness;
background generation continues on the server as before. Older history remains
available through the existing pagination API. A stale contacts-list refresh
replaces its first page and resets list pagination, as a manual refresh does.

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
server validation and may show the existing splash. No infrastructure changes,
new services, migrations, or API deployment are required.

## Verification

Swift static type checking and git diff whitespace validation cover this change.
No application builds, automated tests, simulator runs, or live account requests
are part of this verification. Installed-app behavior still needs checking: open
and reopen a conversation, navigate between tabs, refresh manually, lose and
restore connectivity, finish a pending reply, load older pages, delete a contact,
and sign in with another fictional account. Reinstall/run the updated iOS app to
use the change.
