# Agentic execution limits

Updated October 29, 2026, with persistent task controls and exact-query task research. These are implementation
defaults, not guarantees of model quality or a financial spending cap.

| Work | Existing execution boundary | Research boundary |
| --- | --- | --- |
| Private human reply | Three tool rounds, six executions; one optional mini-app repair round, still six executions | One bounded research operation shares the six slots |
| Scheduled private reply | Two rounds, six executions; no external actions | No web research |
| Private task work | Three rounds, six executions; no MCP/native/group publication | One lifetime research attempt with a human-saved public query; current generation checked between model/tool steps |
| Initial group draft | Six evidence rounds, six executions, 180-second evidence deadline | Human triggers can research; one reservation across the whole source round |
| Assigned group task | Existing task/evidence budgets; current source and generation checks | Same human-saved exact-query grant and one lifetime reservation |
| Group reviews / ordinary bot triggers | Existing constrained review/reply rules | No new research capability |
| Task dispatch | Six work turns per task lifetime, 30 per contact per rolling day; 30-minute reviews | Persistent controls retain consumption and expose pause/block states |
| Initiative | Existing bounded model review and silence cadence | No research tools |
| Review loop (`request_changes`) | Reopens a finished blocker at most twice per task; reopened work spends the owner's normal work turns | No new capability |
| Page monitor change turn | Task turn tools; 20 per task lifetime, 3 per task per day, inside the 30 daily contact task turns | No new research; checks themselves call no model |

The group evidence deadline controls admission of new steps; a step already
admitted can finish after it. Private inference preparation still has its existing
eight-minute Workflow timeout and retries. These are not per-job token budgets.

Existing task/document mutation receipts, MCP reservation ledgers, image receipts,
agent attention and publication guards remain in place. A new research receipt
reserves before its paid POSTs and keeps uncertain outcomes from being retried.
One reservation may cover a search POST plus one tool-free synthesis POST when
the search response has hits but no usable citations. Synthesis rechecks current
access, receives only the public query and returned hits, and uses validated source
IDs rather than model-authored URLs. Both calls share the 60-second deadline;
each allows 4,096 output tokens. This raises potential inference cost per attempt.
Its separate atomic usage ledger survives content deletion, enforcing 10 requests
per account and 100 per installation per rolling day. See
[research budgets and retention](web-research.md#budgets-and-receipts).

Task/list cancellation and current ownership/membership checks remain available.
[Persistent work controls](persistent-work.md) add human pause/resume, recorded next
steps/evidence and a blocked reason. An execution generation prevents stopped
work from continuing after resume; it does not interrupt a step already started.
Research has a 60-second provider deadline, no HTTP retries, current-access checks
and a versioned feature flag for future admissions. Lost access prevents publication;
already-sent provider work may still be charged. No external write grants are
introduced. The task work-turn budget is durable; it is not an exact token or
monetary budget.

The persistent-work foundation uses task titles as objectives, notes for completion
conditions, nextStep/evidence/result for progress and an explicit blockedReason.
Task public research now has an exact-query human grant, a lifetime counter and
a consumption receipt before admission. Broader background tools still require
separate per-job permission and receipts.
Task work must not inherit arbitrary human chat permissions. Account/installation research limits do not replace those controls.

[Page monitors](monitors.md) (0056) are the first background outbound read the Worker
performs on a person's behalf: one `GET` of a human-saved public URL, at most five per
Cron run, without redirects, cookies or account data. They grant no write or other
external action.

[Semantic memory ranking](memory.md#semantic-ranking-migration-0057) (0057, off by
default) reorders already-authorized memories; it grants no new access or tools.

Verification remains static until authorized live checks: TypeScript, Swift and
SQL preparation cannot prove replay behavior, live consent revocation, cost,
research quality or client presentation. No runtime tests, builds, real inference,
remote migrations or deployment are part of this local increment.
