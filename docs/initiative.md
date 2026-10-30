# Conversation initiative

Private contacts can continue an exchange and, when welcome, start another
conversation later. The shared API serves iOS and web using the existing D1,
one-minute Cron Trigger and `ChatWorkflow`. There is no always-running model or
new service. Migration **0065** adds adaptive initiative to 0032–0033.

## Episodes and adaptive opportunities

A completed reply to a direct human request starts a continuation episode. Its
first review is due after 30 seconds; personality and response history can defer
it before inference. New human input or an attachment invalidates the old episode
and any draft immediately. Scheduled messages, autonomous task work, group results
and proactive messages do not start episodes. There is no history backfill or
restart of stopped plans on upgrade.

A continuation can wait, send a useful next thought, or stop the current exchange.
Stopping an ordinary social exchange can instead create a later **ambient
opportunity**: an optional new conversation, greeting or relevant check-in. This
requires social participation in this private chat, no unanswered proactive
message, no ignored greeting, no task-only pattern, and no explicit pause. A
finished task is not a reason to keep probing socially. A goodbye ends the current
exchange; an explicit request to stop unsolicited contact also pauses future
initiative. Ambient opportunities expire seven days after the latest human input.
One published ambient message ends outreach until the person returns. A model
may also stop without sending, or wait for another flexible opportunity.

Continuations retain six evaluations over at most 24 hours. A transition to
ambient mode has a separate six-evaluation budget over the seven-day horizon;
mode changes preserve a monotonically increasing revision so Workflow IDs cannot
be reused. Deferrals after a claim and errors consume evaluations as before. Cron excludes
currently busy agents and active six-second typing leases before claiming a row,
so those conditions normally wait without consuming the six evaluations. If quiet hours or
busy attention exhaust the continuation, Cron can promote only a source already
classified social, with no proactive sends, to that finite ambient budget. An
unknown or unclassified source cannot acquire new ambient permission this way.

## Learning from this conversation

At a review, the server reads at most 160 completed turns from the previous
28 days of this participant's private chat. Dates and categorical observations
are considered; the current source is also included if it waited longer in the
queue, but such old input cannot train activity windows. The metadata
is used locally; the model receives twelve bounded recent text turns, the
attributed previous outreach, aggregate activity evidence, persona and eligible
memories. It does not receive the full statistical sample or numeric personality
traits. Shared agents do not combine participants' timing or receptivity.
Connector-isolated chats retain their local boundary and Standard processing.

The existing planning call also classifies the latest completed human request:

- Social participation, a practical task/question, a boundary, or uncertainty.
- Whether it actually engages with the preceding spontaneous message, changes
  subject without acknowledging it, is ambiguous, or has no outreach to answer.
- An explicit request to pause spontaneous contact or to resume it, if present.

Feedback is saved once per source turn, with the actual prior outreach ID when
applicable. The server links the first completed human request after an outreach,
or a human request explicitly quoting that bot message; a random later task
cannot count as its positive response. A quote to another message is not silently
reattributed to the latest outreach. The labels
are fallible model judgments, not facts about feelings. Unclear cases do not
count as positive engagement or explicit resumption. Reading, visiting or typing
alone never counts as a conversational response.

Consecutive human messages marked `MESSAGE_BATCHED` immediately before the source
are included in that request's context, so a short acknowledgment followed by a
separate task message is not automatically treated as ignoring the greeting.

An unanswered greeting suppresses further greetings and social check-ins. An
unrelated task does not lift this suppression; subsequent actual social engagement
can. Two recent classified practical requests suppress social openers. An ambient
message is never followed by another one without human input. For other outreach,
measured receptivity requires at least three known outcomes from at most twenty
recent proactive messages. Unanswered outreach older than 24 hours can reduce
that estimate; ambiguous responses remain unknown.

New proactive messages store their kind. Historical unclassified outreach keeps
an unknown kind instead of being retroactively labeled as a greeting.

Activity estimates deduplicate each civil day/hour, weight recent days more
strongly, smooth adjacent hours and give actual engaged responses extra weight.
A learned window needs activity on at least three different days. Only samples
with the current turn's time zone contribute, avoiding accidental mixing of travel
zones. Before enough evidence exists, the bot uses varied daytime opportunities
without claiming to know a routine. These estimates guide conversation timing;
they do not establish that someone is awake, at home or available.

## Personality timing and amount

Enabled personalities retain their acting director and expression guidance.
Initiative and patience also affect the minimum gap and amount of outreach:

- Low initiative, task-oriented use or low measured receptivity allows at most
  one unanswered continuation. Unknown receptivity normally allows two.
- Up to three requires high initiative, a less patient character and
  positive measured engagement. The global ceiling remains three.
- The personality continuation floor is now 20–101 seconds instead of 30–480,
  with the first continuation still subject to a 30-second minimum. Neutral traits
  give a 60-second floor; low initiative and high patience leave more room.
  Later unanswered continuations retain at least two- and ten-minute gaps.
- Poor response history still triples continuation spacing. Ambient minimum spacing
  is roughly 1.1–5.2 hours depending on initiative/patience, with six hours added
  for weak measured receptivity. The transition/review floor follows this same
  adaptive gap rather than imposing another six-hour minimum. Window selection,
  quiet hours, model decisions, Cron and queue load can make delivery later.
- Windows are selected with a deterministic, source/revision-seeded weighted draw
  and minute variation. Replay uses the same choice, while later opportunities
  vary. Ordinary review delays also receive additional breathing room.

A disabled personality uses neutral cadence values and still adapts to this
conversation's responses. Warmth, reserve, humor and verbosity continue through
the existing character direction; no fixed greeting or daily quota is imposed.
Explicit fixed-time reminders remain with schedule tools and are not jittered by
this planner. Birthday jobs, group initiative and proactive external actions are
not introduced.

## Delivery limits and control

No spontaneous message is delivered between **22:00 and 08:00** in the time zone
of the latest human turn. This remains a delivery boundary, not a promise to write
at 08:00. Missing/invalid zones suspend the episode without guessing. Cron checks
at most ten due rows each minute; inference, attention and queue load can delay
sending. At most three initiative messages per contact and twelve per account
can be published in a rolling 24-hour window. Private messages originating from
groups retain their separate existing budget and do not train initiative.

Before publication, the atomic transaction rechecks the source/revision/anchor,
current opt-out, archive/clear state, model selection, consent, MCP isolation,
read/typing evidence, personality revision, agent attention and rolling budgets.
New history prevents the old draft from publishing. Changed read/typing or profile
evidence discards the draft and schedules another bounded evaluation. Simply opening
or leaving the chat open no longer suppresses initiative or invalidates a draft:
only recent actual composer activity gets a courtesy pause. The same typing
watermark is checked in context, before Typing and in atomic publication/feedback
SQL, including multiple devices. Passive visit timestamps do not count as typing. Presence,
typing pauses, ordinary completed turns and the APNs outbox reuse existing paths.
No tools, connectors, native actions, group publication or schedule mutations are
available to the planner. Text can never prove an external action happened.

**Contact details → Conversation initiative** controls only this participant's
private chat, including when the agent is shared. Both clients explain adaptive
timing and ignored-greeting suppression. Disabling cancels the current plan.
Re-enabling waits for the next completed human exchange. An explicit conversational
pause is stored on this contact; a casual greeting or unrelated task does not
cancel it. An explicit resumption or switching initiative off/on clears it.
Direct human replies remain available while initiative is paused.

Archiving deletes the pending plan, and unarchiving does not restart it. Clear
chat removes the plan, source-linked learning and conversational pause along with
history, even when factual memory is retained. Contact/account deletion cascades.
These categorical labels are not extracted into shared contact memories. Historical
labels remain attached to their turns until history deletion, but only the bounded
28-day sample influences adaptation. The explicit pause remains until reset.

## Cache and setup

The enabled setting uses the existing session-owned contact cache and mutation
responses. Histories use the same bounded stores, polling, previews, unread state
and iOS APNs outbox; browser push is still unavailable. There is no client timing
cache, countdown, extra polling endpoint or private disk persistence. D1 plans
persist at most one row per contact; Workflow checkpoints retain the bounded
context under the existing platform policy. Existing account/access-loss and
late-response invalidation apply. See [caching](caching.md#conversation-initiative).

Apply all migrations through 0065 with the existing local migration command or
the automatic production pipeline. Reproducible provisioning, source verification
and rollback precautions are in [infrastructure](infrastructure.md#conversation-initiative).

## Verification

Static checks: API/web TypeScript, Swift editor parsing, `git diff --check`, and
`python3 scripts/checks/initiative-sql-compile.py`. The SQL script prepares the
actual Standard/Contributor SQL variants against an empty schema with all 65
migrations at expression depth 100. It performs no functional fixtures, inference,
network, credential or production access.

The opt-in `node scripts/checks/initiative.cjs` harness has been updated for the
current schema/decision contract, including unanswered greetings followed by
unrelated tasks, ambient transition/replay, explicit pause/resume and upgrade
invalidation. It has **not been run for this change**. Static success is not a
functional pass. Tests, builds, live inference and client interaction require their
separately authorized validation scope.

Classification shares the existing planner call (2,400 completion tokens including
reasoning, existing provider timeout); it does not add a second inference call.
The new ambient phase can add up to six bounded evaluations per social source,
so cost and cadence still need measurement before making quality claims.

With fictional data, verify 06:00 sends followed by 10:00 responses over several
days (while preserving quiet hours), changing activity windows, cold starts,
travel/DST, quiet-hour boundaries, reserved versus proactive personalities,
task-only use, ambiguous versus engaged replies and ignored greetings. Exercise
new input/read/typing, personality edits, consent/isolation changes, archive/clear,
account changes and daily budgets during inference. Verify crash/replay, leases,
failed inference, seven-day expiration and terminal evaluation budgets. On both
clients verify reopen/back, empty/offline states, failed setting mutations,
access loss and normal history/list/badge updates; APNs needs a configured iPhone.
Real-model semantic quality, cost/cadence calibration and devices remain pending.

## Faster cadence validation

The six scenarios previously run for migration 0033 established the earlier
cadence with a simulated model. They do not validate migration 0065, adaptive
classification, current windows or current clients. Earlier live-model evaluations
also predate this behavior. Preserve that distinction when reporting validation.

## Conversation learning integration (migration 0067)

The planner receives eligible [conversation learning](conversation-learning.md) from
this private agent/human audience, including observed preferences, one behavioral
adjustment and optional curiosity records. A curiosity alone cannot justify outreach
or override a pause, task-only pattern, unanswered-message suppression, quiet hours,
consent or budget. Actual question publication records an asked status atomically.
Reset/disable advances an epoch that rejects stale initiative drafts. Initiative does
not itself trigger a learning review or enable group initiative.

## Conversational activity refinement

The planner now explicitly considers one short next thought after a greeting or
an open social exchange, without needing another human question or read receipt.
It still decides whether there is anything worth saying. Unknown/poor engagement,
completed tasks, boundaries and unanswered outreach keep their existing suppression
and budgets; shorter opportunities do not grant more messages. Existing stopped
plans, already selected due dates and saved history are not restarted or rewritten.
Newly evaluated plans use the updated floors. Shared-contact statistics remain
isolated per private participant. Both clients use the same API implementation and
matching initiative help. Groups use separate in-round conversational direction,
not this private planner or its opt-out setting.

For this refinement, static API/web types, Swift editor parsing, SQL preparation
against 67 empty migrations and whitespace checks are the validation scope.
The SQL checker now substitutes a static integer for the validated learning epoch
added in 0067; it does not evaluate TypeScript. No functional harness, build,
provider inference or device/browser session was run. Check passive-open vs typing,
new input/read/profile changes during inference, personality cadence, ambient
transition, quiet hours, stop/opt-out and replay with fictional data before making
runtime or semantic quality claims.
