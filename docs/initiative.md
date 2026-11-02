# Conversation initiative

Private contacts can continue an exchange, start another conversation later,
introduce themselves when they are new and text first after a quiet spell. The
shared API serves iOS and web using the existing D1, one-minute Cron Trigger and
`ChatWorkflow`. There is no always-running model or new service. Migration
**0065** adds adaptive initiative to 0032–0033; **0094** adds
[welcome messages](#welcome-messages) and [re-engagement](#re-engagement-after-silence)
and relaxes the ambient gates ([proactive outreach](#proactive-outreach-migration-0094)).

## Episodes and adaptive opportunities

A completed reply to a direct human request starts a continuation episode. Its
first review is due after 30 seconds; personality and response history can defer
it before inference. New human input or an attachment invalidates the old episode
and any draft immediately, as does a message the contact writes privately after a
[For you comment](updates.md#private-messages-from-comments) (which never starts one
either). Scheduled messages, autonomous task work, group results
and proactive messages do not start episodes. There is no history backfill or
restart of stopped plans on upgrade.

A continuation can wait, send a useful next thought, or stop the current exchange.
Stopping an exchange can instead create a later **ambient opportunity**: a new
conversation, greeting or relevant check-in. Since 0094 this requires no
unanswered proactive message, no explicit pause and no boundary in the source
request; a prior social classification is no longer needed. Task-only chats may
receive task-related follow-ups but no greetings, and a greeting ignored in the
last 24 hours suppresses greetings only. A goodbye ends the current exchange; an
explicit request to stop unsolicited contact also pauses future initiative.
Ambient opportunities expire seven days after the latest human input. One
published ambient message ends this episode; later outreach comes from
[re-engagement](#re-engagement-after-silence). A model may also stop without
sending, or wait for another flexible opportunity.

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

A greeting left unanswered for less than 24 hours suppresses further greetings
(0094; previously greetings and social check-ins, without expiry). An unrelated
task does not lift this suppression; subsequent actual social engagement can. Two
recent classified practical requests suppress greetings and social small talk but
allow task-related follow-ups. Within one ambient episode, an ambient message is
never followed by another one without human input; re-engagement episodes allow up
to three unanswered spontaneous messages in total. For other outreach,
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

- Contacts start eager: unknown receptivity allows the global ceiling of three
  unanswered continuations (0094). Task-only use or low measured receptivity
  (below 35%) allows one; low initiative, a very patient character or moderate
  receptivity (below 65%) allows two.
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
of the latest human turn, except within 30 minutes of the person's latest message
in this chat (an active conversation, 0094) and for a welcome from a contact created
in the last 30 minutes. This remains a delivery boundary, not a promise to write
at 08:00. Missing/invalid zones suspend the episode without guessing. Cron checks
at most ten due rows each minute; inference, attention and queue load can delay
sending. At most six spontaneous messages per contact and thirty per account
(welcomes included; three and twelve before 0094) can be published in a rolling
24-hour window. Private messages originating from
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
The planner may propose one contextual image with its caption, even without an
image request, through [generated images](generated-images.md#contextual-framing-and-spontaneous-images-0079).
It cannot use retrieval tools, connectors, native actions, group publication or
schedule mutations. Images obey every text initiative gate and consume an ordinary
outreach slot, with at most one image attempt per source episode (migration 0079).
The caption is withheld if the image is unavailable. Text can never prove an external action happened.

**Contact details → Conversation initiative** controls only this participant's
private chat, including when the agent is shared. Both clients explain adaptive
timing, welcome messages, re-engagement, quiet hours and the unanswered limit.
Disabling cancels the current plan and any pending welcome. Re-enabling starts no
episode immediately; the next human exchange or a later re-engagement sweep does. An explicit conversational
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

Classification and optional image (or [album](generated-images.md#albums)) proposals share the existing planner call (4,400 completion tokens including
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
adjustment and optional curiosity records. Since 0094 a pending curiosity can be a reason to
start a conversation, but it cannot override a pause, task-only pattern,
unanswered-message suppression, quiet hours, consent or budget. Actual question publication records an asked status atomically.
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

## Proactive outreach (migration 0094)

The marketing promise is that contacts text first. Before 0094 an episode only
started after a human message was answered, ambient outreach required a classified
social exchange, an ignored greeting blocked social outreach indefinitely, and the
planner prompt leaned towards silence. 0094 inverts the default: contacts start
fast and insistent, then slow down on their own as outreach goes unanswered.

### Welcome messages

A contact created by [contact generation](contact-generation.md) or published by
[onboarding](onboarding.md) introduces itself once, before the person writes.
Generation publishes the contact with `contact.welcome_due_at` set to now and starts
the welcome immediately (`startWelcome`), so the message arrives within the model
call and typing pause, typically seconds. Onboarding schedules the first circle in
plan order about 70 seconds apart once the circle is published, starting the first
immediately. Manually named contacts (`POST /contacts`) and contacts joined through
[sharing](sharing.md) do not send a welcome.

`dispatchContactWelcomes` (one-minute Cron) is the fallback and starts later
onboarding welcomes as they come due. Each claim takes a ten-minute lease, with at
most three attempts (`welcome_attempts`); it registers `welcome-<contact>-<attempt>`
in `chat_workflow_instance` and starts the `welcome` `ChatWorkflow` job
(`apps/api/src/chat/welcome.ts`). The job uses the person's latest known time zone
from any of their chats, then their Updates feed. A contact created within the last
30 minutes greets even during quiet hours, because the person just created it; an
older pending welcome waits for 08:00 without consuming an attempt. Without any
known zone, it only sends within two hours of creation. It uses the character
direction, configured language/region, persona, eligible shared memories and the
stated reason for the contact (generation purpose, onboarding circle and occupation).

The welcome is one or two chat bubbles published together after a typing pause:
a hello that introduces the contact, and optionally something about it (a taste,
an opinion, what it likes to talk about). The prompt forbids opening with a
question, generic icebreakers ("what are you listening to lately?") and assistant
or onboarding phrasing; at most one light question may close the second bubble.

The welcome turn's `initiative_source_id` refers to itself, so it counts as
spontaneous outreach for budgets and adaptation. If it is ignored, greetings stay
suppressed for 24 hours, and [re-engagement](#re-engagement-after-silence) can
follow it up with a different thought. Any message in the chat, disabling
initiative, archive or clear cancels a pending welcome (triggers in 0094).
Publication rechecks the contact, setting, empty chat and claim atomically; model
selection and consent are checked when the context is built, not again at
publication. A failed attempt leaves presence to the ordinary presence expiry.

### Re-engagement after silence

Every ten minutes `dispatchInitiatives` sweeps private chats with initiative on, no
pause, no live episode and, within the last 30 days, either a human message or a
welcome, with a known time zone. The source is the latest human message, or the
welcome if the person never wrote. The base quiet time before each re-engagement,
measured from the latest message of either side, is **3 hours** with no unanswered
spontaneous message, **12 hours** after one and **48 hours** after two
(`reengagementQuiet`). After three unanswered spontaneous messages (the welcome
included) outreach waits for the person.

`reengagementFactor` adapts that base per chat: unmeasured or good receptivity
(at least 60% of measured outreach answered) keeps it, 35–60% doubles it and less
than 35% multiplies it by four; a character with initiative 8 or more is 25% faster
and one with 3 or less 50% slower. `contact.reengaged_at` spaces sweeps of a chat by
at least two hours, and an episode that ends without a message pushes the next sweep
of that chat six hours out, so a model that keeps choosing silence is not asked
repeatedly. Quiet hours and the sweep use the source's time zone, falling back to the
person's latest zone from any chat or their Updates feed (a welcome may have none).
A brand-new person with no known zone anywhere gets no follow-up to an ignored
welcome until they write or open Updates.

The sweep opens an ambient `conversation_initiative` row with `reengage = 1`, the
source above, the latest turn as anchor, a timestamp-seeded revision (Workflow IDs
are never reused) and its own three-day expiry instead of the source's seven-day
horizon. Its first review is drawn from the learned activity windows within 48
hours, starting immediately, without the ordinary ambient minimum gap. Evaluation,
quiet hours, personality gaps, rolling budgets, consent, read/typing checks and
atomic publication are those of every other episode. The planner sees
`reconnect-after-silence`, whether the person has written, the hours since their
last message and the number of unanswered messages, and is told never to mention
the silence. A welcome-sourced episode never classifies the welcome or changes the
pause permission. New human input deletes the row as before.

### Planner and policy

- Ambient sending is the default when allowed and something specific fits: follow-ups
  on what the person mentioned, an idea or take connected to their interests, a
  pending curiosity or a greeting suited to the moment. Invented news, offline
  experiences, guilt and external-action claims remain forbidden.
- `adaptivePolicy` no longer requires a social classification for ambient outreach;
  the source request must not be a boundary. Task-only chats can receive task
  follow-ups (`check-in`/`continuation`), never greetings.
- Each evaluation logs `initiative_decision` (mode, re-engagement, action, kind,
  engagement, whether sending was allowed and whether it published) and each sweep
  row logs `initiative_reengagement` (with the applied quiet hours); welcomes log
  `welcome_decision`. Logs never contain message text.

### Cost and validation

Re-engagement adds at most one planner evaluation per eligible chat every two hours,
six after an episode that ended silent (up to six reviews within an episode if the
model waits), and each welcome one
completion. The validation scope was static: API TypeScript,
`python3 scripts/checks/initiative-sql-compile.py` (also covering `welcome.ts`),
`scripts/checks/onboarding-sql-compile.py`, and the migration plus fixtures on local
workerd D1 for the self-referencing welcome insert, cancellation triggers, the
immediate welcome claim, sweep selection (including welcome-only chats) and upsert.
No live inference, Workflow run, client session or device was exercised; the opt-in
`scripts/checks/initiative.cjs` harness has not been updated for 0094. Measure the
decision logs before tuning the cadence.
