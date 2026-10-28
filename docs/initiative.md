# Conversation initiative

Private contacts can decide to continue a conversation after their last reply,
even when the app is closed. This is implemented on the server with the existing
D1 database, one-minute Cron Trigger and `ChatWorkflow` binding. There is no
always-running model loop and no new cloud service.

After a direct human turn completes with a text reply, migrations 0032–0033 create a
private episode for that participant. The first review becomes due 30 seconds
later. Existing conversations are not backfilled. Scheduled messages, group
results, reactions without text and proactive messages do not start new episodes.
A new human message or attachment immediately invalidates the previous episode,
including any draft being generated. Its successful reply starts a new episode.

At each due review, Muse Spark receives up to eight completed turns (bounded text,
attachment presence without bytes), their dates and actual read watermark, the
last confirmed reply-read time, the previous brief intent, elapsed time,
conversation-eligible memories and agent persona. Model selection follows account
settings and existing shared-contact consent. MCP-isolated conversations always
use Standard and their existing memory isolation. The model chooses:

- **Wait:** retain a short intended next step and choose another review delay.
- **Send:** write a natural, contextual message now and choose a later review.
- **Stop:** end this episode and wait for new human input.

The persisted intent is a short future-action summary, not a reasoning transcript.
The model distinguishes an initial continuation from repeated unanswered outreach.
A bare greeting is an opening: prefer one brief warm opener or relevant thought,
rather than declaring the exchange finished. For a fresh conversation, send a
useful continuation when already due, or normally review again in 30–120 seconds.
The timing evidence explicitly supplies the phase, elapsed time, last confirmed
read time and current minimum send gap. Later review guidance is 2–5 minutes
after one proactive message and 10–30 minutes after two. These are model guidelines,
not delivery guarantees or fixed timers: explicit user timing and context can
justify longer waits. An unread proactive message normally calls for more space;
a read receipt does not authorize escalating attention. Prefer one or two sentences,
avoid repeating unanswered questions, and do not end every message with a question.

The model is instructed to respect goodbyes, requests to stop and natural endings,
to avoid repeated questions, guilt or pressure, and to offer something useful
instead of mechanically repeating greetings. These are semantic model decisions,
not guaranteed intent classification. The model can stop before sending anything.
No tools, MCP execution, native actions, group publication or schedule mutation
are available to this planner. Explicit reminders retain their existing workflow.

## Initial limits

These are implementation defaults that can be adjusted after product evaluation:

- At most three unanswered proactive messages, six evaluations (including failed
  dispatches/attempts and deferred reviews) and 24 hours per episode.
- At least 30 seconds after the original reply, then two minutes after the first
  follow-up and ten minutes after the second. The AI may choose longer waits.
  Review delays accept 30–86400 seconds; publication still enforces these minimum
  gaps, even when the AI requests a shorter review.
- At most three proactive messages per contact and twelve per account in a rolling
  24-hour window, including across separate episodes.
- No proactive sends between 22:00 and 08:00 in the timezone supplied with the
  latest human turn. Quiet-hour reviews defer to morning. Unknown/invalid timezones
  suspend that episode rather than guessing. Travel changes apply on the next turn.
- Cron checks up to ten due episodes per minute. A 30-second initial due time
  typically reaches the next Cron in roughly 30–90 seconds, before inference.
  This does not implement second-accurate messages. Delivery times are approximate;
  model inference, server load and unavailable attention can delay them.

Waiting performs no inference between due dates. Errors back off fifteen minutes
and consume the finite evaluation budget. A five-minute D1 lease allows a crashed
or undispatched job to be replaced with a new revision. Six failed attempts stop
until the next human exchange. Revisions, source IDs and atomic publication keep
old jobs from posting after replacement.

## Publication and control

Before publishing, an atomic D1 transaction rechecks the episode revision, latest
conversation anchor, enabled setting, model/consent/isolation, current read
watermark and read time, visit activity, agent attention and rolling budgets.
Changed read/visit evidence discards a draft and schedules a fresh evaluation;
new human input invalidates it completely. An active foreground visit/activity
lease or busy agent defers a due review without invoking the model; activity is
checked again at publication. No draft is published while another private/group turn holds
the agent's attention. Planning itself does not claim attention or show typing.
A successful publication briefly updates online presence.

Messages are ordinary completed assistant-only turns, so both clients reuse their
history, Markdown, quotes/reactions, previews, unread state and foreground polling.
The iOS APNs outbox is enqueued in the same transaction; Cron retries notification
failures independently. Browser push remains unavailable. A message already
published remains in history when initiative is disabled.

**Contact details → Conversation initiative** is enabled by default in iOS and
web. Any participant can change their own setting, including for a shared contact;
it never changes another participant's initiative or shared agent identity.
`PUT /api/v1/contacts/:id/initiative` accepts only `{ "enabled": boolean }` and
returns the current contact projection. Contact responses include numeric
`initiativeEnabled`. Disabling deletes the pending episode. Re-enabling waits for
the next completed human exchange and does not resurrect old outreach.

## Cache and verification

The setting lives in the existing session-owned contact cache. Both editors reuse
loaded contacts immediately and refresh in the background. Mutation responses
replace the cached contact; concurrent mutations are disabled, pending reads are
rejected, errors retain the last confirmed setting, and session changes reject
late responses. No separate settings cache or private disk persistence is added.
Plans stay server-side, at most one per contact, until replacement or contact
removal. Workflow checkpoints follow the existing platform retention policy.
Conversation messages use the same bounded conversation stores and invalidation
rules as human-triggered replies. See [caching](caching.md).

Before release, use fictional accounts to verify a greeting, an unanswered
question, a goodbye, an explicit stop request, read versus unread messages, human
input/read/typing during inference, concurrent shared-agent attention, quiet
hours, budget exhaustion, crash/notification recovery, and deletion/consent loss.
Verify both editors on reopen/back navigation, empty and offline states, failed
mutations, explicit refresh, contact removal and account switching. Confirm new
messages update histories, previews and badges, and APNs on a configured iPhone.
Static validation does not establish model quality, runtime timing or device
behavior; these checks remain pending until explicitly performed.

For reproducible setup, migration order, release and rollback, see
[infrastructure](infrastructure.md#conversation-initiative).

## Faster cadence validation

Migration 0033 replaces only the episode-creation trigger and advances pending
first reviews that have never been evaluated. It preserves selected waits, stopped
episodes, active Workflow leases, counters and history. It does not restart old
conversations. The server adjustment applies equally to iOS and web through their
existing histories, polling, caches and per-participant setting; no client update
is required for the cadence itself.

Run `node scripts/checks/initiative.cjs` explicitly for isolated checks of the
actual migrated SQLite schema and initiative Workflow with simulated model/time.
Six checks cover initial publication, replay without duplicates, increasing gaps,
three-message and six-evaluation limits, a longer AI-selected wait, stopping,
new-input/disabled invalidation and upgrade preservation. They use fictional data,
no network, no secrets and no persistent database. These passed for the faster
cadence. They do not verify that the real model follows the new greeting guidance.
The earlier live Contributor run validated the previous policy; the new prompt
still needs a separate live evaluation after an authorized release. UI, APNs,
physical devices and sub-minute Cron timing were not exercised here.
