# Conversation style evaluation — October 30, 2026

The published API implementation at `1feb2a0` reproduced the reported problem
with fictional data: four of five replies in a fresh group named the human in
their greeting. One also returned the social question in singular address. The
existing classifier had correctly identified a group-wide message, but that
direction did not reliably survive final wording. This was a semantic failure
despite the earlier static checks passing.

## Scope and method

`scripts/checks/conversation-style-live-eval.mjs` bundles the real private reply,
group context/preparation/completion, parsers and guarded publication functions.
All migrations run against ephemeral SQLite with fictional users, contacts,
histories, permissions and groups. Workflow checkpoints and batch transactions
have local adapters. Learning is disabled in these fixtures to isolate the style
variables. The final API changes apply equally to iOS and web.

Only real Meta chat completions may leave the process. The model is Standard
`muse-spark-1.3`, with the production completion options. Other network operations
are blocked. Voice-on scenarios use a fictional ElevenLabs configuration only to
activate the actual voice prompt; no speech synthesis is attempted. Keys are read
through the existing ignored development configuration without printing them.
Reports omit authorization headers and provider reasoning fields.

The investigation used 664 successful provider calls across 74 scenario executions
and 22 distinct scenarios, including baseline, intermediate failures and final
repetitions. An initial sandbox network attempt failed without a provider response
and is excluded. The broad final matrix completed 20 scenarios; eight sensitive
cases were then repeated twice with optional wording review, followed by another
five-agent voice-on greeting against the current source. No production database,
conversation, app account, notification or deployment was used.

Cases, compiled harnesses, request/usage records and raw transcripts are stored
outside Git. Source commit, tracked diff hash and fixture hash are recorded per
run. Report cohorts distinguish intermediate and final behavior rather than
claiming that every attempted variant passed. Actual output was inspected; the
model's categorical delivery labels are not treated as a semantic pass.

## Findings across the six concerns

| Concern | Observed result |
| --- | --- |
| Repeated names | The published fresh greeting named the human in 4/5 replies. Five final greeting rounds, including voice on/off, produced 24 messages with no human-name mentions or reflexive return questions. Silence remained valid for other reply slots. Private casual samples also avoided habitual vocatives. |
| Regional wording | Argentine singular and plural forms were natural with voice off and with the original generation-country fallback. Changing the explicit accent to Mexico or Spain changed the corresponding address forms; the Spain plural used its distinct regional forms. Country did not become a biography or obligatory slang quota. |
| Poetic identity | A legacy poetic profile with high verbosity answered practical product questions directly, without unrelated lyrical imagery. A later explicit request for a short metaphor still produced one. |
| Group awareness | Only the addressed contact answered the directed case; the other two skipped. A sufficient factual answer stopped duplicate explanations. The last participant answered their own part without asking again after visible human/bot answers. The shared game case retained one artifact and later contacts reused it. |
| Adaptive length | Final casual private contributions were 7–15 words. One private sequence moved from 4 words for a social reply to 182 words for a requested explanation, then 25 words for the requested two-line summary. Group greetings were usually one short sentence; requested technical explanations retained examples and useful detail. |
| Distinct writing | The reserved contact used conventional capitalization, punctuation and dry short observations. The expressive contacts used lowercase openings or written laughter in casual text. These patterns stayed recognizable across three turns. Six voice-on casual replies containing written effects were ineligible for synthesis and stayed as text; ordinary plain prose remains voice-eligible. |

The final repeated sensitive cohort performed five optional wording reviews:
four revised the prose and one kept a legitimate question about the topic to
discuss. Both repetitions of directed conversation kept the individual answer
available. The last confirmation greeting needed no wording-review inference.
This is a narrow observed sample, not a guarantee that every future message will
have the right style or that every useful group question must use plural address.

## Corrections and limits

Final private wording now reinforces sparse names, useful depth and natural
regional language after long context or tool results. Groups additionally reuse
the current trigger's audience category, consider peer name repetition, choose
categorical delivery metadata and apply shared-work guidance during evidence
gathering. A flagged group draft can receive one extra tool-free wording review;
its extra latency and model usage are intentional and bounded. Review cannot
replay tools or create new participation, and normal publication guards remain.
Failed optional reviews checkpoint the original useful draft rather than retrying
inference on replay.

Speech eligibility now excludes emoji, flags, obvious repeated-letter effects and
supported written-laughter patterns, preserving the exact message as text instead
of synthesizing its spelling. This does not rewrite messages or alter voice IDs.
The checks do not establish the actual accent or sound of an ElevenLabs voice.

Local regression results: 14 style/parser/fitness checks, 28 personality checks,
16 group completion/review checks and 22 publication checks passed (80 total).
The completion checks cover review replay, failed review after an executed MCP
tool, access loss before inference and preservation of prepared media without
sending its storage key to the reviewer. Older fixture dependencies and message
shapes were updated to current contracts; the directed-cadence test now explicitly
identifies its intended recipient instead of relying on a removed group fallback.
No production authorization rule was relaxed to make those tests pass.

API/web TypeScript, harness syntax, SQL EXPLAIN for 19 statements against all 67
migrations at expression depth 100, and `git diff --check` passed. No application
build, simulator/browser/device session, Cloudflare durability test or acoustic
evaluation was performed. The corrective iteration remains local until separately
committed, pushed and automatically released. Existing messages are unchanged.

## Reproduction

Run only with explicit authorization for real provider calls. Keep fictional
dialogue fixtures and generated reports outside the repository. The external JSON
contains `humans` (fixture IDs `owner`, `alice`, `bob`), up to five `agents` with
English identity descriptions, and `scenarios`. Each scenario supplies `id`,
`kind` (`private` or `group`), `inputs` and an English evaluation rubric. Optional
fields cover visible history, selected agents, voice prompting, accent, generation
country and personality off. Inputs can select responders and interleaved visible
messages; none of this grants access to real accounts.

```sh
node scripts/checks/conversation-style-live-eval.mjs \
  --cases /path/outside-repository/fictional-cases.json \
  --out /path/outside-repository/style-results \
  --call-limit 220
```

Use `--source-ref 1feb2a0` for the prior published code, `--only` to select scenario
IDs, and `--repetitions 2` for fresh repeated fixtures. The default source is the
working tree. The provider-call ceiling applies per invocation. Credentials must
stay in the environment or ignored API development variables, never in fixtures
or command arguments.
