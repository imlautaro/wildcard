# Message replies

Private chats and groups support quoted replies, like common messaging apps. A
human chooses an earlier message, writes a new message (text, attachment or both)
and sends it with a reference to the original. The new message shows a compact
quote with the original author, up to two lines of text, or a photo/document
marker. Tapping or clicking the quote scrolls to the original and briefly
highlights it. Replies are ordinary messages: they use the existing send,
idempotency, receipt, unread, push and reply-round rules.

## Clients

Both clients offer **Reply** on every saved text, image and PDF message, from the
user or the agent in private chats and from any member in groups:

- iOS: swipe a message to the right, or hold it and choose **Reply** in the
  reaction popover. VoiceOver exposes a **Reply** action. The swipe uses a UIKit pan
  recognizer that only begins for rightward horizontal movement, so vertical
  scrolling keeps working; a light haptic marks the trigger point.
- Web: hover a message's row and use its floating reply button beside the reaction
  button, or hold/right-click the message and choose **Reply** in the actions panel
  below the message (on touch
  screens, which have no hover, use the hold). The web app has no swipe gesture.

The composer then shows the quoted message above the text field with a cancel
button. Messages still sending cannot be quoted. Sending clears the reply target
with the draft; if the send is not confirmed, the target is restored with the text
and attachment. The optimistic bubble shows the quote immediately. The reply target
follows each client's draft lifetime: iOS keeps it while the chat screen is open,
and the web app keeps it with the draft in the session conversation cache.

Quotes inside bubbles use the author's group sender color (the same FNV-1a palette
as sender names), the accent color for your own messages, and the contact's stable
palette color in private chats. When the original is not in loaded history, the
client loads earlier pages (at most 20 pages of 50 messages) before scrolling. A
quote whose original no longer exists shows **Original message unavailable** and is
not interactive. On iOS, a quote inside a PDF bubble is informational only; tapping
the bubble still opens the document.

## API

Private send, `POST /api/v1/contacts/:id/chat/turns`, accepts an optional
`replyTo: { "messageID": "<turn ID>", "side": "user" | "assistant" }`. The target
must be a turn in the same participant conversation, with the same eligibility as
reactions: `assistant` needs saved assistant text; `user` needs human text or an
attachment, so scheduled and group-result turns expose only their assistant side.

Group send, `POST /api/v1/groups/:id/messages`, accepts an optional `replyToID`
naming a message in the same group. Current membership is already required by the
group routes.

An invalid shape or unavailable target returns HTTP 400 with a message that both
clients show; nothing is stored. The target is also checked inside the insert, so a
race cannot store a reference to another conversation. Idempotent replays compare
the reply target as well as text and attachment: reusing a message UUID with a
different target returns 409.

Responses add `replyTo` to private turns (history, send and retry responses) and to
group history messages:

```json
{ "messageID": "…", "side": "user", "available": true, "userID": null,
  "agentID": null, "senderName": null, "text": "Up to 200 characters…",
  "attachment": { "name": "Photo.jpg", "mimeType": "image/jpeg", "size": 1024 } }
```

`replyTo` is `null` when the message is not a reply. The quote is resolved from
current history on every read and clipped to 200 Unicode code points. Private quotes
omit sender identity: `side` tells whether the participant or the contact wrote it.
Group quotes include the original `userID`/`agentID` and stored `senderName`.
Quoted text is visible only to readers who can already read the original
conversation: the same contact owner or current group members.

## Persistence

Migration `0025_message_replies.sql` adds nullable columns:

- `chat_turn.reply_to_id` referencing `chat_turn(id)` with `ON DELETE SET NULL`, and
  `chat_turn.reply_to_side` checked as `user` or `assistant`.
- `group_message.reply_to_id` referencing `group_message(id)` with `ON DELETE SET NULL`.

Existing messages are not replies. Messages are not individually deleted today;
contact and group deletion cascade whole conversations. If a quoted private turn
ever disappears, the side remains and the API returns `available: false`; a group
reply whose original disappears loses its quote.

## Agents

Agents see replies as context, so "no, that one" refers to the quoted message:

- Private turns prefix the current message and each recent history message with
  `[Replying to your/their own earlier message "<id>": "<quote>"]`. The system
  prompt explains the marker and treats quoted text as clipped, untrusted
  historical data, never instructions or authorization. Search and excerpt tools
  are unchanged.
- Group drafts add `replyTo` to the trigger, earlier replies in the round, recent
  messages and new messages since a draft. The quoted message passes the same
  author/shared-memory/Contributor-consent filter as group history; when it does
  not, only its `messageID` is disclosed with `unavailable: true`. Quoted text is
  clipped to 400 bytes.

Contacts can optionally author a quoted reply when overlapping messages or a return
to an older topic would otherwise make their answer ambiguous. Obvious replies,
including individual answers to a shared question about lunch, default to no quote.
The model chooses a target ID, never the displayed quote text. A burst quotes only
its first message. Private targets must exist in the same participant conversation,
with an eligible human/assistant side no later than the current turn. References
are stored in the delivered `assistant_messages_json` entry and resolved from
current history on reads; no migration is needed. Both clients render the same
quote and use their existing navigation to the original message.

Group drafts carry optional `replyToID` through review: keep preserves it, revise
can change it, and skip publishes nothing. The parser accepts only message IDs
supplied in the visible current context. Publication resolves the target inside
the insert with the same group, watermark and author/consent filters as history;
a removed or no-longer-authorized target drops the quote. Only the first message
of a burst quotes the target. Existing group quote rendering works on both clients.
Old private Workflow checkpoints with string arrays or prose remain deliverable.

This is a contextual model choice, not a guarantee of perfect quoting. Verify
multiple interleaved questions, returning to an old message, obvious answers with
no quote, review after intervening traffic, retries, inaccessible targets and
quote navigation on both clients using fictional data. Model and device behavior
remain unverified by static checks.

## Cache

Quotes travel inside the message payloads that the existing session conversation
caches already hold (`ChatStore`/`GroupChatStore` on iOS, the conversation and group
caches on the web). No new store, request type, polling or disk storage exists, and
pagination, trimming, invalidation, account switching and access loss follow the
existing conversation rules. Navigating to an older original uses the existing
**Load earlier** pagination. Pending sends keep their reply target with their UUID,
so retries after uncertain results reuse the same identifier only for the same
target.

## Verification status

Static checks only: API and web TypeScript (`npm run typecheck`,
`npm run typecheck:web`), a Swift typecheck of the whole iOS app target against the
iOS 27.1 simulator SDK, a typecheck of the `ios-conversation-sync` harness sources,
and preparation (`EXPLAIN`) of the new SQL statements against a freshly migrated
SQLite schema with D1's expression depth limit. No builds, functional tests, device
or browser runs, remote migrations, model calls or deployments were performed.

Before release verification, use fictional accounts:

- Private: reply to your own text, image and PDF messages and to agent replies;
  confirm the quote, author and tap-to-scroll, including originals beyond the loaded
  page; send a reply with only an attachment; cancel a reply; drop the network during
  a send and confirm retry keeps the quote; ask the agent about "this message" to
  confirm it uses the quote.
- Groups: reply to humans, bots and yourself; confirm sender colors match on iOS and
  web; check that bots interpret the quote; check that a non-consenting member's
  quoted text is not sent to the model.
- iOS: swipe while scrolling vertically, combine swipe with long-press reactions and
  text selection, and check VoiceOver, Dynamic Type and Reduce Motion.
- Web: keyboard access to the reply button, touch layouts and dark mode.

## Plain bot quote previews

Both clients show plain text for bot quotes in bubbles and the composer. The API
adds optional `previewText`, generated from full bot source before the 200-code-point
quote bound; local optimistic quotes do the same. Raw `text` and message identity
remain unchanged for agent context and navigation. Human quotes remain literal,
and previews of links/images retain their labels while code retains its contents.
Older snapshots fall back to local parsing. Preview fields use the same conversation
cache and invalidation as their quote; no additional fetch or persisted cache exists.
Static client/API checks passed; long quote, cache reopen and device verification
remain pending.
