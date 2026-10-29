# Agentic execution limits

Observed October 29, 2026, before widening autonomous tools. These are implementation
defaults, not guarantees of model quality or a financial spending cap.

| Work | Existing execution boundary | First research increment |
| --- | --- | --- |
| Private human reply | Three tool rounds, six executions; one optional mini-app repair round, still six executions | One bounded research operation shares the six slots |
| Scheduled private reply | Two rounds, six executions; no external actions | No web research |
| Private task work | Three rounds, six executions; no MCP/native/group publication | May edit saved reports, cannot research |
| Initial group draft | Six evidence rounds, six executions, 180-second evidence deadline | Human triggers can research; one reservation across the whole source round |
| Group reviews / bot triggers | Existing constrained review/reply rules | No new research capability |
| Task dispatch | Six work turns per assignment cycle, 30 per contact per rolling day; 30-minute reviews | Unchanged |
| Initiative | Existing bounded model review and silence cadence | No research tools |

The group evidence deadline controls admission of new steps; a step already
admitted can finish after it. Private inference preparation still has its existing
eight-minute Workflow timeout and retries. These are not per-job token budgets.

Existing task/document mutation receipts, MCP reservation ledgers, image receipts,
agent attention and publication guards remain in place. A new research receipt
reserves before its paid POST and keeps uncertain outcomes from being retried.
Its separate atomic usage ledger survives content deletion, enforcing 10 requests
per account and 100 per installation per rolling day. See
[research budgets and retention](web-research.md#budgets-and-receipts).

Task/list cancellation and current ownership/membership checks remain available.
They do not provide a universal stop button for already-started tools. Research
has a 60-second provider deadline, no HTTP retries, current-access checks and a
versioned feature flag for future admissions. Lost access prevents publication;
already-sent provider work may still be charged. No per-job pause/resume UI or
external write grants are introduced.

Before the persistent-work increment, define a durable objective, next step,
evidence, completion/blocking conditions, per-job permissions and consumption,
user-visible pause/cancel, and current-access checks between every background
step. Start with read tools. Task work must not inherit arbitrary human chat
permissions. Account/installation research limits do not replace those controls.

Verification remains static until authorized live checks: TypeScript, Swift and
SQL preparation cannot prove replay behavior, live consent revocation, cost,
research quality or client presentation. No runtime tests, builds, real inference,
remote migrations or deployment are part of this local increment.
