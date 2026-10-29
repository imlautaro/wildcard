# Message reactions

Private chats and groups support 👍 ❤️ 😂 😮 😢 🙏 on text, images and PDFs.
Each human or agent may have one reaction on each message, including its own.
Choosing another emoji replaces it; choosing the same emoji again removes it.
Reactions persist separately from message bodies. They do not create text replies,
unread messages, push notifications, bot reply rounds or group energy charges.

## Clients

In iOS, hold a sent message to open the emoji popover. Tap an existing badge to
see who reacted and change/remove your reaction. The same action is exposed to
accessibility services. Unsaved outgoing messages cannot be reacted to.
Contacts react on their own according to their personality; see
[emoji and reactions](personality.md#emoji-and-reactions).
On the web, hold a message, right-click it, or use its keyboard-focusable reaction
button. That button and the reply button float beside the message on hover or
keyboard focus (to the right of incoming messages, to the left of your own), so they
take no space in the conversation. The selector floats over the conversation, above
the message when there is room and below it otherwise, and closes on scroll, resize,
Escape or a click outside. Pointer movement cancels the hold, preserving scrolling. Badges show counts;
opening the selector shows participant names. Both clients use the same emoji set,
selection, replacement, removal and explicit retry behavior.

## API and persistence

- `GET /api/v1/contacts/:id/chat/reactions?messageIDs=<JSON array>`
- `PUT /api/v1/contacts/:id/chat/reactions`
- `GET /api/v1/groups/:id/reactions?messageIDs=<JSON array>`
- `PUT /api/v1/groups/:id/reactions`

GET accepts 1–100 IDs per request. Responses contain `reactions`, with `messageID`,
`side`, `actorID` (`user/<id>` or `agent/<id>`), current display `name` and `emoji`.
Private turn IDs have two separate targets: `side: "user"` and `side: "assistant"`.
Group message IDs use `side: "group"`. Scheduled turns expose only their actual
assistant message. Reaction-only private turns have no assistant target.
PUT accepts exactly `{ "messageID": "...", "side": "user", "emoji": "👍" }`;
use explicit JSON `null` for removal. The authenticated human identity comes from
the session, never the body. Absolute PUT operations are idempotent; they do not
blindly toggle on retry. Successful writes return `{ "saved": true }`.

Current contact ownership or group membership is checked for reads and inside
writes. Targets must belong to that conversation and actually exist. Human writes
are limited to 120/account/minute, plus the existing group write limit for groups.
Migration `0024_message_reactions.sql` creates the D1 table, checks, identity index
and cascading foreign keys. Deleting a message, actor or its parent conversation
removes its reactions. Leaving a group removes access; historical reactions remain
public to the group's current members. Models only receive reactions by currently
eligible participants with current shared-memory/model consent.

## Agents

`react_to_message` is available during ordinary private and group model turns.
It accepts actual `messageID`, `side`, `emoji` and optional `endTurn`. The server
sets the agent identity and rechecks the active turn, attention lease, conversation,
membership and consent. Private tools cannot react in another participant's chat;
group tools are confined to the current group and context sequence boundary.
Agents can react to earlier own messages as well as messages from humans or bots.
Recent private message IDs and reactions, and eligible recent group reactions, are
included as untrusted context. Retrieval tools can supply older target IDs.

In private, a successful non-null reaction with `endTurn: true` completes with no
assistant text, unread badge or reply push. The human's message remains in history
and memory processing. In groups, the final decision can choose `skip` after a
reaction when allowed by the existing policy. Required human-requested openings
still require text. Group energy admission still applies to starting a model turn,
even though a reaction does not itself spend energy. A human reaction alone does
not wake agents: they see it during a later eligible conversation turn. Model use
of reactions is discretionary; no forced emoji or new notification service exists.

## Cache and verification

Reaction caches belong to the existing session conversation entries. They are
available synchronously when returning to a chat, including empty snapshots. The
existing foreground synchronizer/poller refreshes all retained message IDs, in
batches of 100, after history refresh or pagination; it does not download message
bodies again for reactions. History trimming also prunes iOS reaction rows. There
is no additional disk storage or view-owned polling. Cache lifetime follows the
existing conversation budgets (eight iOS entries, twenty web entries); in-flight
or failed reaction writes protect an entry from eviction until retried or its
conversation/session is explicitly removed.

Refresh requests deduplicate. A mutation increments a revision so an older refresh
cannot overwrite its acknowledgement. A write is shown after server acceptance;
failures preserve the previous snapshot and the exact pending absolute operation
for Retry reaction across navigation. Permissions failures clear reaction state;
conversation deletion, confirmed access loss and account changes discard caches
and reject late results. Transient refresh failures keep usable badges and retry
on subsequent foreground synchronization. An explicit chat refresh also refreshes
reactions. Background/closed clients catch up on return; no reaction APNs exists.

Static validation covers API/web TypeScript, iOS Swift, and 128 SQL preparation
variants using EXPLAIN against an empty migrated SQLite schema with expression
depth limited to 100. SQL preparation does not validate runtime behavior. No functional tests,
build, device run, provider call or remote migration was performed for this change.
Before release verification, use fictional accounts in private and group chats:
hold own/other text and attachment messages; select/change/remove; inspect counts
and names; let bots react to humans and earlier own messages; verify reaction-only
private completion; paginate and react to old messages; navigate away/back; retry
a dropped write; restore connectivity; remove membership; switch accounts. Check
that no text placeholder, unread badge, bot loop or reply push is created. Validate
VoiceOver, web keyboard controls, mobile scrolling and the iOS text-selection/hold
interaction physically. Static checks do not establish visual or model behavior.
