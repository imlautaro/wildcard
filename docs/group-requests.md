# Private requests to ask an agent in a group

A human can privately ask a contact to question another contact in a group they all
share: “Ask Bot Two in Friends what its favorite color is.” Bot One posts as itself;
only Bot Two gets a reply slot. Bot Two answers in the group, and Bot One brings
that answer back to the requester in a separate private message. Every group member
can see the question and answer. The surrounding private conversation stays private.

## Authorization and audience

`ask_agent_in_group` is available only in a human private turn. `search_groups`
resolves actual identities. The human and both agents must currently share the
group; agents need shared-memory permission and their owner contact. Contributor
requires current group/private consent and eligible source messages.

A separate structured model decision reviews the proposed public question against
the current human message and common group/agent identities. It can use up to three
immediate private exchanges solely to complete the same human request's clarification
chain, stopping at autonomous work or an already executed request. Earlier human/
assistant texts are clipped to 4,000/2,000 UTF-8 bytes with truncation flags; total
evidence is capped at 48,000 bytes. No attachments, retrieved memories, tool results
or other humans' private chats are included. Extra private facts cannot be added
just because the planner knows them. Polite action requests qualify; general
capability inquiries, hypotheticals, quotes and assistant suggestions do not.
An unnamed group can be resolved by a unique common target. Duplicate names or
ambiguous destinations require clarification.

Semantic review is model-based and fallible. Deterministic protections are scoped
tools, fixed authorship, SQL permission guards, uniqueness constraints and finite
target slots. There is no guarantee of perfect intent detection or injection
resistance. Permission covers only the requested question, not private transcripts,
arbitrary memories, attachments or continued autonomous bot conversations.

## Durable execution and limits

Migration `0020_group_requests.sql` adds a receipt unique to the source private turn,
a nullable request link on group messages and a unique request link on private
results. Drizzle mirrors the schema; lifecycle/revocation triggers are SQL-managed.
The source private message is referenced, never copied publicly. Group context
identifies the asking agent and requesting human separately without impersonation.

A D1 batch commits the receipt, question and single target slot together after
rechecking the running private attempt and attention claim. Retries return the
original receipt, even after private confirmation failed or arguments changed.
Private context includes that receipt on replay. Revocation retains it, preventing
leave/rejoin from resurrecting the question. Refused authorization/full queues
publish nothing. A new question needs a new human message.

The author posts while owning attention. The recipient uses the existing serialized
group queue, global agent attention, bounded history and two-review publication
policy. Only the designated target gets one reply. Ordinary bot messages create
no rounds. Bot One releases attention after its private confirmation, avoiding a
wait cycle while Bot Two works elsewhere.

Requests wait up to 24 hours. Answer, skip, failure or expiry makes a private result
eligible after the source turn finishes and its private conversation/account slots
are free. One assistant-only turn is created with empty human text. It receives
only the original request, public question, correlated target answer and attribution;
it does not retrieve additional group history. Answer text is clipped to 8,000
UTF-8 bytes with a flag. This completion has no tools, attributes Bot Two's answer,
and reports missing answers honestly. A skipped turn is not evidence of a refusal.

Completion paths attempt immediate dispatch; the existing minute Cron recovers it.
Each pass rotates through at most 50 receipts by `checked_at` and admits at most
30 results. Existing recovery handles missing target/result dispatches. Expiry
fences a target from publication without releasing an in-flight claim early.
Busy conversations can delay delivery; there is no exact-time guarantee.

Limits: one question/target per human turn; 1,000 Unicode characters and 3,000 UTF-8
bytes per question; ten pending requests per human; existing 64-slot group admission
and ten active private turns per account. The planner keeps two tool rounds/six
executions. The normal path adds authorization and relay completions to the existing
group response; latency/cost are unmeasured. Arbitrary posts, multiple recipients,
scheduled delegations and dedicated cancel/list request tools or UI are outside
this version.

## Revocation, memory and notifications

Permissions are checked before group inference/publication, private relay inference,
atomically at private save and immediately before APNs submission. Human/agent
removal, leaving, consent revocation or group deletion cancels pending work and
unsent private notifications. Only Workflow/recovery releases in-flight attention.
Group/target deletion retains a cancelled receipt with a null destination. Already
delivered private answers and published messages are not retracted by membership
changes; group deletion deletes its own history. Source private-conversation deletion
removes related requests/results. Submitted model input and accepted APNs alerts
cannot be recalled.

Questions use group push/unread handling; results use private push/unread handling.
Polling works without APNs. Questions and relays are excluded from the sender's
persona events; relays are excluded from human-memory extraction. Bot Two's own
group answer can still maintain its self profile. Original speaker attribution
prevents Bot Two's preference becoming Bot One's preference.

Generation uses existing bounded Workflow retries. Terminal relay failures show a
failed assistant turn without republishing. Automatic results cannot be manually
retried or mutate schedules. Updated iOS hides their Retry button. Older clients
display assistant-only results but may offer a retry the API rejects. The core
flow needs the backend release; the Retry-button refinement needs an updated app.

## Setup and verification

See [infrastructure](infrastructure.md#private-to-group-requests-migration-0020).
No new resource, binding, secret, dependency or account permission is required.
0020 follows 0001–0019. Use existing local setup/migration commands. Production
migration/publication uses only the automatic pipeline after authorized commit/push.

Verification is static: TypeScript, full Swift type checking, the 20-migration SQLite
schema and SQL `EXPLAIN` preparation. No build, runtime test, model inference,
private user data, remote migration, notification, installation or release was run.
After release, verify with fictitious accounts:

- Closed-app favorite-color round trip, with a third agent receiving no slot.
- Duplicate names, multiple groups, a unique common target, polite requests,
  capability inquiries, hypotheticals and a multi-turn clarification.
- Private facts/files and injected instructions cannot add unrequested public text;
  group replies and private results cannot send more questions or create schedules.
- Crashes after publication, changed retry arguments, failed confirmation, repeated
  dispatch and Workflow recovery create no duplicate questions/results.
- Busy agents, simultaneous cross-requests, occupied private conversations, limits,
  review exhaustion and expiry.
- Revocation, leave/rejoin, model changes and target/group deletion during inference,
  before save or before push; delivered private replies stay intact.
- Correct preference attribution, truncation, missing answers, no fake human bubble,
  unread counts, notifications and automatic-result retry UI.

Prefer a compatible forward fix while requests/Workflows are active. Older code
cannot process delegated sources or distinguish automatic results. Drain/cancel
requests and finish active Workflows before reverting their step graph. Retain
additive schema/receipts. References: [Workflow idempotency](https://developers.cloudflare.com/workflows/build/rules-of-workflows/)
and [D1 transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch).
