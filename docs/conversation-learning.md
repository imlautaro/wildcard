# Conversation learning

Private chats and groups share audience-local conversational learning through the
API. Each agent learns separately about each human in each conversation. Replies
on iOS and web use the same observations, behavioral adjustments and optional
curiosities. This augments [factual memory](memory.md), [personality](personality.md)
and private [initiative](initiative.md); it does not rewrite the shared character,
merge people, enable group outreach, or grant tools additional authority.

## Silent review

An existing `ChatWorkflow` performs one best-effort review after a completed direct
human exchange, after factual/self-memory maintenance and before releasing attention.
It continues when the app closes. Group reviews also cover completed reply decisions
that intentionally skip speaking. Schedules, task turns, private group-result
deliveries, initiative messages and bot-triggered group exchanges do not start
reviews. There is no always-running model, idle-history sweep, new Workflow binding
or additional inference Cron. An idle conversation needs another human exchange to
retry a deferred review or accumulate new evidence.

The first review needs three eligible human messages. Later reviews need fresh
human input and at least one hour since the previous successful review; fewer than
four fresh messages defer until six hours have elapsed. Every attempted inference
has a persisted fifteen-minute cooldown, including failures and replay. These are
bounded implementation defaults, not a daily conversation quota or learned routine.
The attempt is claimed by revision before inference; the existing exclusive agent
attention serializes its ordinary work. Maintenance failures never fail a saved reply.

Each review reads at most sixteen eligible human messages from the past 28 days
and this agent's actual responses. Private bursts include `MESSAGE_BATCHED` human
messages; artificial/autonomous turns are excluded. Groups supply only the current
human's own messages and the reviewing agent's published replies to those messages,
including delivered burst parts. Other humans and bots are not training sources
for that relationship. Human and assistant text is clipped to 850 UTF-8 bytes each;
files, tool outputs and external pages are not loaded. Already-published text and
voice transcripts use their normal source boundaries. Up to twelve existing local
factual memories with original human quotes help retire already-answered questions;
foreign/shared-audience facts are not imported into this review.

The current job's selected model is used, capped at 6,000 completion tokens.
Prior state, at most 21 items, is bounded; new model JSON is limited to 18,000 bytes,
and the prompt asks for fewer than 12,000. Exact evidence quotes are validated against
supplied human/assistant text or the same prior item's validated evidence. One event
can produce only tentative conclusions; supported labels need distinct human sources.
These are fallible observations, never psychological diagnoses or proof of feelings,
availability or rejection. Logs use generic event names without source text.

## Stored knowledge and questions

Migration **0067** adds one `conversation_learning` row per audience/agent/human,
with source-linked JSON and compare-and-set review metadata:

- Up to eight observations about interests, conversational mode, tone or preferences.
- Up to three small reversible adjustments to the bot's own behavior, including
  repetition, each describing a behavior and how to reassess its usefulness.
- Up to ten optional questions with purpose, suitable opportunities, situations to
  avoid, and pending/asked/answered/dismissed status. Grounded answers are retained
  with the question; durable user facts continue through ordinary factual memory.

Observations/questions expire after thirty days; adjustments after fourteen.
Rewording unchanged evidence does not renew an item. Actual question publication
renews that question's thirty-day record. Expired items are excluded immediately;
the existing minute Cron physically removes expired JSON items from at most one
hundred profiles per run, without inference. Watermarks survive an empty profile,
so expiry does not cause old history to be reprocessed immediately.

Generation receives up to five observations, one adjustment and ten question records,
without source quotes. It is instructed to answer the current request first, preserve
its character and judgment, and ask at most one relevant optional question when there
is conversational space. Practical urgency, sensitive disclosures, closure, ordinary
factual memory and explicit corrections take precedence. Boredom/social invitations
can welcome a playful unexpected question; pending questions alone never justify
unsolicited contact. Contribution and useful brevity matter, not engagement duration.

Private, group and initiative generation may return internal `learningQuestion`
metadata containing an existing question key and an exact quote from the generated
message. The publication transaction marks it asked only when that quote actually
exists in a published message. Failed drafts and undelivered burst tails do not count;
replay does not append evidence or renew it again. Metadata is never visible prose.
Later silent reviews reconcile spontaneous answers, corrections and refusals.
Asked/answered/dismissed records survive reviewer omission until expiry; a retained
asked question cannot simply return to pending. Semantic equivalence, topic matching,
when to ask, and whether an answer resolves a question remain model judgments.
Recent actual history and factual memory must suppress repetition even if the model
omits metadata or a review is deferred. This is not a guarantee of naturalness.

## Audience, consent and lifecycle

There is no cross-chat lookup or export into shared factual/self memory. Shared
contacts remain one agent with their configured identity, but learned interaction
patterns stay local to each person and audience. A private preference is not silently
turned into a group question. Existing shared factual memory and explicitly permitted
private-history tools retain their separate rules.

Every read checks current ownership/membership, agent membership, shared-memory
consent, clearing state and model eligibility. Contributor cannot consume a
Standard-derived profile. A new Contributor review starts without Standard-derived
items and uses only eligible group source messages. Connector-isolated audiences
remain Standard and local; introducing isolation clears earlier derived state.
Permission/isolation/epoch checks run before and after inference and at the guarded
write. Source IDs must still exist. Removal of a source message discards its
audience's derived profiles; changing group consent, learning participation, group
membership or removing an agent conservatively invalidates group learning. A new
member also invalidates the group projection rather than extending a stale audience.

Both clients expose **Conversation learning** from contact/group details. Each human
can inspect only learning about themselves, separated by agent, including evidence,
tentative labels, question status and answers. They can correct preferences in chat,
switch **Learn from my messages**, or **Reset learning about me**. The switch is
independent of private initiative and shared character ownership; a group owner
cannot inspect another person's learning through these endpoints.

`GET /contacts/:id/learning` and `GET /groups/:id/learning` return
`{ enabled, profiles: [{ agentID, agentName, reviewedAt, items }] }`.
`PUT` accepts only `{ enabled: boolean }`; `DELETE` resets that human's derived
profiles while preserving the enabled setting. Both mutations advance the learning
epoch and a source-sequence floor, so earlier messages are not immediately relearned.
They do not delete chat text or ordinary factual memory. Settings default enabled,
using the existing conversation permissions. Upgrade performs no eager history scan;
the next successful human exchange can review the bounded recent window.

Private/group publication checks the captured learning epoch. Reset, disable or an
audience change during generation prevents stale learned text from publishing or
continuing a burst. Private turns without a published message finish interrupted;
group turns finish failed rather than holding attention. Private initiative discards
stale drafts under its existing review policy and publication guards. Legacy
checkpoints without learning metadata remain compatible because they contain no
new learned context. Published messages keep their normal history/delivery behavior.
Clear chat removes learning even when factual memories are retained. Account/contact/
group/member/agent removal cascades; client caches are invalidated on confirmed loss.

## Cache and verification

The API sets `Cache-Control: no-store` on learning responses. iOS uses the existing
session-owned `NavigationSnapshotCache` (eight snapshots per audience store), renders
loaded and empty results immediately and revalidates on entry/refresh. Web uses an
eight-entry session map with a thirty-second freshness window, deduplicated reads,
background revalidation and explicit Refresh. Mutation revisions reject older reads;
transient failures retain usable data. Both clients drop snapshots on history removal,
access loss and account changes. Neither writes these snapshots to disk or introduces
history polling. See [cache behavior](caching.md#conversation-learning).

Static checks passed for API/web types, Swift parsing, all 67 migrations, 23 learning
SQL variants and 80 reply-publication SQL variants at expression depth 100, plus
whitespace and regression-script syntax. The opt-in `node scripts/checks/conversation-learning.cjs` authors fictional
SQLite scenarios for evidence validation, reset races, source deletion, isolation,
model boundaries, attributed group learning and question-publication replay. It has
not been executed. No tests, builds, real inference, remote migrations or device
validation have been performed for this feature.

Before claiming live conversational quality, validate headphones/music opportunities,
task-only exchanges, boredom, closure, spontaneous answers, ignored questions,
distinct contact personalities, correction and expiry, independent group/private
behavior, pending-reset publication and connector/model revocation with fictional
data. Verify both clients' navigation, refresh, offline recovery and account switching.
See [reproducible setup and rollback](infrastructure.md#conversation-learning-migration-0067).
