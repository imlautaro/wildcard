# Successive contact messages

A private reply or ordinary group response can contain one or several messages.
The model chooses conversational beats from the current request, conversation and
personality. One message remains valid; there is no fixed count or prescribed
three-part greeting. Keep code, lists and cohesive explanations together rather
than mechanically splitting sentences. The server validates 1–8 nonempty messages
with at most 20,000 Unicode characters including separators. Eight is an abuse and
latency ceiling, not a target.

## Delivery

The existing ChatWorkflow checkpoints the prepared response and publishes each
part separately. Between parts it sleeps for 1.5–4 seconds, based on the next
message's length. Workflow scheduling and network latency may increase this gap.
The timing uses durable [Workflow sleep](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/),
not timers in an open app. Both clients poll the visible conversation every second;
slow/offline clients can receive several already-delivered parts on their next refresh.
No unsent text is returned in chat history.

In private conversations, migration `0042_reply_messages.sql` adds
`chat_turn.assistant_messages_json`. It contains only the delivered prefix, with
stable part IDs and server timestamps. `assistant_text` is the joined delivered
text for history search, model context and older clients. The turn stays running
and typing until its last part. Each publication checks the attempt, exclusive
attention, applicable access and schedule validity. An atomic guard closes the
burst with its delivered prefix if a newer human turn exists before the next part;
the next queued turn handles that input. Coalescing cannot discard published text.
Recovery and Cron preserve a delivered prefix and never regenerate it. Publication
uses the delivered array length to prevent duplicate appends on step retries.

Private replies retain one turn-level unread count, sound and push alert after
completion (including a burst shortened by interruption). Quotes and reactions on
any private part still target the joined response for that turn. They are not
independent part-level reactions or quote targets. This matches both clients and
the existing server permission contract. Mini apps appear once alongside the first
part. Existing clients display the joined text; updated iOS and web clients show
independently timestamped bubbles. Old rows without the new array show one bubble.

Group responses use ordinary `group_message` rows with stable IDs. The first keeps
the reply's canonical ID; later parts use `/part/<index>`. The reply slot and
exclusive attention remain active during the burst. Before every further part,
the server checks membership, source authorization, consent, available energy and
that the preceding part is still the newest group message. Any intervening message
ends the unsent tail. Each published part costs one energy point and uses existing
exchange limits, receipts, unread counts, reactions, quotes and push outbox. Existing
pending-opportunity guards continue to bound bot continuations per exchange.
Directed questions that return an answer privately use one cohesive message, so
the returned answer remains complete. Explicit group-post tools and autonomous
initiative retain their existing single-publication contracts.

## Cache and deployment

The existing session-owned stores cache delivered parts inside their parent turn
on iOS and web. Stable IDs keep old bubbles stable while polling appends new ones;
attempt and update-time merge guards reject stale responses. No extra downloads,
view-local sequence timer, disk retention or parallel cache is introduced. Paging,
request deduplication, eviction, account isolation and access-loss invalidation
remain those in [caching](caching.md). Reopening shows the delivered cached prefix
immediately and revalidates through the existing sync loop. Groups reuse their
ordinary message cache without a client contract change.

Use the existing D1/Workflow services and bindings; no new secrets or resources
are required. See [infrastructure](infrastructure.md#successive-contact-messages)
for local migration, automatic release and compatibility.

## Verification

Static validation covers API/web TypeScript, Swift typechecking and SQL preparation
against the empty migrated schema (`node scripts/checks/reply-messages-sql.cjs`).
No functional tests, builds, model calls or device/browser verification are implied.
With fictional data, verify one-message and variable-message replies, code/list
cohesion, visible spacing and typing, navigation/background resume, a new human
message between parts, tool receipts, repeated publication after interruption,
offline refresh, old history, quotes/reactions, mini apps, unread/push behavior,
access revocation and account switching on both clients. In groups also verify
intervening speakers, low energy, the exchange ceiling and complete directed
private returns. Model quality and actual scheduling latency require live checks.

A contact may choose one optional quote for the first message in its burst; later
messages do not repeat it. Private delivered entries store references, resolved
from current history in API responses. See [replies](replies.md).
