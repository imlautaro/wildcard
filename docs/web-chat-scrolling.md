# Web chat scrolling

This work is explicitly scoped to web private chats and groups. Native iOS keeps
its existing scroll implementation.

## Initial position

Each visit positions cached or first-loaded messages at the bottom in a post-patch
Vue watcher, before paint, using instant scrolling. A reused route resets this
visit state. The message viewport has an explicit minimum height of zero so it
shrinks inside the app shell instead of expanding with the conversation.

Browser verification remains pending: open short and long chats with and without
cached history, switch between contacts and groups, and reopen via back navigation.
No tests or builds were run; repository instructions permit static validation only.

## Follow content growth

A shared ResizeObserver follows message content and viewport resizing while the
reader is near the bottom. This covers new messages, media, document/app cards,
and composer resizing without waiting for reactions or auxiliary polling requests.
Explicit sends immediately opt into following. Observers disconnect on unmount;
scroll state belongs to the visit and adds no stored conversation data.

Pending browser verification: consecutive replies, delayed images/cards, voice
uploads and composer/viewport resizing while at the end.

## Open history and sidebar synchronization

When a list response detects newer activity in the visible conversation, it awaits
that conversation's history refresh before publishing the summary. Existing cached
content remains available during the request or a transient failure. Other chats
retain bounded background warming. Private and group history requests share one
in-flight promise per cached entry; list warming and visible polling no longer
supersede each other's responses. Session/account changes and deletion still
reject obsolete results through existing cache identity/revision checks.

This coordinates responses already observed by the list; separate server reads
are not an atomic snapshot. Newer activity is reconciled on subsequent polls.
Pending browser verification: incoming private/group replies with the sidebar
visible, overlapping refreshes, slow/failing requests, navigation and account reset.

## Keep the reader in control

Refreshes never issue a delayed scroll based on a position captured before a
network request. Sending opts into following once, when the send starts; completing
an upload cannot override scrolling that happened during the request. Upward wheel,
touch and keyboard input immediately detach following. Scrolling back to within
two pixels of the end reattaches it. Layout-driven following checks the current
visit and current intent at execution time.

Visible message rows anchor history pagination and message updates before/after
Vue patches. Browser scroll anchoring is disabled for this viewport to avoid double
compensation. Delayed media growth while detached never forces the reader down.
Pending browser verification: scroll up during a slow poll/upload, load earlier
history while replies arrive, open quotes, and use wheel, touch and keyboard.
