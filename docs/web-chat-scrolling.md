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
