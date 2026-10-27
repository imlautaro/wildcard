# Private requests to publish in a group

A human can privately ask a contact to post in a group they share: “Say hello in
Friends”, “Tell the group the meeting starts at five”, or other requested text.
The contact publishes as itself and confirms privately. No other bot is required;
an ordinary post allows other group agents to respond within their shared energy
and finite exchange limits, without a later private result. Every group member
can see the publication. The surrounding private conversation stays private.

When the human requests a response from one specific other agent, such as “Ask Bot
Two in Friends what its favorite color is”, the target receives one group reply
slot and its answer returns privately with attribution. That public answer can
start bounded conversation. Addressing or greeting a bot alone does not request a
designated answer or private return; ordinary public responses remain possible.

## Authorization and audience

`send_group_message(groupID, text)` publishes without requesting a designated answer or private return.
Other agents may respond under the [energy policy](energy.md).
`ask_agent_in_group(groupID, targetAgentID, question)` requests one target answer
and its private return. Both are available only in a human private turn. Addressing
a bot in a statement uses the first tool, without a target argument. This separates
delivery from asking for a response. Older generic calls with an explicit nullable
`targetAgentID` remain accepted for in-flight compatibility and retain semantic
review. `search_groups` resolves actual identities. The human and
publishing agent must currently share the group. Response mode also requires the
target. Agents need shared-memory permission and their owner contact. Contributor
requires current group/private consent and eligible source messages.

A separate structured model decision reviews the proposed public text and reply mode against
the current human message and common group/agent identities. It can use up to three
immediate private exchanges solely to complete the same human request's clarification
chain, stopping at autonomous work or an already executed request. Separately, up
to three successful publication destinations from the last eight completed private
turns supply group/target identities, newest first, with current access rechecked.
They include no earlier message text. A NEW explicit human request can refer to
that destination; the receipt never authorizes replaying its old text or requesting
another response. Revoked/cancelled receipts cannot supply a destination. Earlier human/
assistant texts are clipped to 4,000/2,000 UTF-8 bytes with truncation flags; total
evidence is capped at 48,000 bytes. No attachments, retrieved memories, tool results
or other humans' private chats are included. Extra private facts cannot be added
just because the planner knows them. Polite action requests qualify; general
capability inquiries, hypotheticals, quotes and assistant suggestions do not.
An unnamed group can be resolved by a unique common human-specified addressee;
without one, there must be only one shared group or an explicit clarification.
Quoted content in an explicit send/say request is allowed as message content.
Duplicate names or
ambiguous destinations require clarification.

Semantic review is model-based and fallible. Deterministic protections are scoped
tools, fixed authorship, SQL permission guards, uniqueness constraints and finite
target slots. There is no guarantee of perfect intent detection or injection
resistance. Permission covers only the requested publication, not private transcripts,
arbitrary memories or attachments. Subsequent public conversation is separately
bounded by the server's energy/exchange policy and cannot invoke publication tools
or expose private transcripts.

Authorization retains low reasoning with a 2,048-token completion budget. The
previous 400-token budget was too restrictive for a reasoning model's structured
decision. Truncated/invalid authorization still fails closed: it cannot publish.
The investigation found an HTTP-200 authorization request immediately followed by
a tool failure before any publication, with no saved receipts; the old logs did
not record its exact model error code. This budget change addresses that path
without treating a provider success status as proof of a usable decision.

With explicit permission, a synthetic Spanish clarification was replayed in Meta's
Playground with Muse Spark 1.3 Contributor, the same instructions/schema, low
reasoning, non-streaming output and default temperature/top-p. At 400 tokens the
result was incomplete (398 reasoning tokens, two output tokens, no visible decision).
The identical input at 2,048 produced `authorized: true` using 567 reasoning tokens
and 14 output tokens. A simpler 400-token greeting also succeeded; the problem is
insufficient headroom for more involved decisions, not an unconditional API outage.
At 2,048 tokens an explicit cancellation returned `authorized: false` (285
reasoning tokens, 14 output tokens), preserving the denial path.
Eight isolated synthetic handler checks cover truncation/JSON/access failure with
no writes, denial, receipt recovery after a committed write, genuinely unknown
write/read status, and an ordinary publication. They used simulated dependencies,
not live groups or notifications. This does not establish a full app round trip.

Publication failures now log `group_publication_failed` with a fixed stage and
sanitized diagnostic code, without exception text, prompts, SQL parameters or
message bodies. A receipt lookup recovers an already committed publication. When
authorization/access/context fails before a write and no receipt exists, the tool
reports `published: false` and `publicationAttempted: false`. Only unreadable
receipts or uncertain writes/confirmation report an unknown publication status.
Retries still reuse the same human turn and original arguments.

## Action selection and failure evidence

Current tool contracts/results override historical assistant capability disclaimers
and self memories. For a clear current request the planner must use the matching
tool; it must not invent attempts, network outages or group permission settings.
Self-memory extraction excludes tool availability, connection/access status and
send failures. Existing memories are not deleted; they cannot determine live access.

Structured rejection codes separate invalid arguments, an unresolved/unshared
group ID, an absent target, current consent/access denial, an inactive source turn,
bounded context and semantic intent mismatch. `AUTHORIZATION_UNCLEAR` means correct
the proposed text/destination/reply mode or ask for the missing detail. It does not
mean change group permissions. Wrong IDs require `search_groups`, not a network
explanation. SQL guards still recheck all access and attention at the write.

`group_publication_result` records fixed stage/outcome codes and publication/reply
flags for normal successes and rejections. `chat_tool_summary` records only tool
execution counts and group-publication call counts, including zero, so a planner
reply without a send attempt can be distinguished from a tool rejection. Exceptions
retain the sanitized diagnostics above. Logs contain no messages, proposed IDs,
prompts, provider bodies or SQL parameters.

Run `node scripts/checks/group-publication.cjs` only when tests are requested.
It uses Node 24, all versioned migrations and actual tool dispatch/SQL against
in-memory SQLite, with simulated model decisions and push/dispatch dependencies.
It covers ordinary/one-bot posts, question-then-statement, cross-tool replay,
compatibility, distinct rejection codes, revocation/races, incomplete authorization
and receipt recovery. It never contacts a provider, Cloudflare or APNs. These
checks do not establish semantic model accuracy or the deployed app round trip.

The follow-up investigation observed one directed-request receipt and no plain-post
receipts, currently valid shared membership/consent for the reported attempts,
and no publication/tool exception events in their time window. The old deployment
did not log normal authorization/access rejections or whether the planner skipped
the tool; the exact historical rejection reason cannot be reconstructed from those
logs. The repair addresses that diagnostic gap and separates the action contracts.

Validation of this repair passed 22 isolated checks, TypeScript and preparation of
87 distinct SQL variants over all 21 migrations. Separately, with explicit approval
to send this prompt and fictitious inputs to Meta Playground, seven independent
Muse Spark 1.3 Contributor cases used low reasoning, a 2,048-token ceiling,
non-streaming output and the boolean authorization schema. Greeting, addressed
statement, a fresh reference to a recently used group among two shared groups,
and a requested target question were authorized. An unrequested automatic target
response, cancellation and an ambiguous unnamed group without a recent reference
were rejected. All completed within the token ceiling. No real group messages or
notifications were sent. Playground currently exposes no function tools, so this
checks semantic authorization, not the planner's actual tool selection or a full
app round trip. Those still need verification after release.

## Durable execution and limits

Migration `0020_group_requests.sql` adds a receipt unique to the source private turn,
a nullable request link on group messages and a unique request link on private
results. Drizzle mirrors the schema; lifecycle/revocation triggers are SQL-managed.
The source private message is referenced, never copied publicly. Group context
identifies the asking agent and requesting human separately without impersonation.

Migration `0021_group_posts.sql` extends this with plain-post receipts and SQL
triggers that enforce one publication across both tables. It does not rewrite
0020 or alter in-flight directed requests. A D1 batch saves the plain-post receipt
and message together after the same attention/access checks. Migration 0023 now
creates bounded public `group_reply` opportunities, but no pending directed request
or automatic private turn. Ordinary posts do not
consume the pending-response budget or require another agent. Historical tool calls
with the older generic nullable-target signature remain accepted. The planner now
sees separate publication and question tools. Replays across tool names or modes return the
original receipt; revoked access cannot resurrect a post after leave/rejoin.

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

Limits: one publication per human turn across both modes. Plain posts allow 4,000
Unicode characters / 12,000 UTF-8 bytes and inherit human private-send rate limits.
Response mode allows 1,000 characters / 3,000 bytes and one target; ten pending
requests per human; existing 64-slot group admission
and ten active private turns per account. The planner keeps two tool rounds/six
executions. The normal path adds authorization and relay completions to the existing
group response; plain posts add only authorization inference. Latency/cost are
unmeasured. Ordinary posts may now add group inference within the energy policy.
Attachments, multiple publications per human turn, multiple designated private-return
recipients, scheduled delegations and dedicated cancel/list request tools or UI
are outside this version.

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
Plain posts use the same group push/unread path and public sender identity. Their
receipts are marked revoked on membership/consent/group removal, without retracting
published messages. Deleting the source private conversation removes its receipt.
Polling works without APNs. Human-directed posts, questions and relays are excluded from the sender's
persona events; relays are excluded from human-memory extraction. Bot Two's own
group answer can still maintain its self profile. Original speaker attribution
prevents Bot Two's preference becoming Bot One's preference.

Generation uses existing bounded Workflow retries. Terminal relay failures show a
failed assistant turn without republishing. Automatic results cannot be manually
retried or mutate schedules. Updated iOS hides their Retry button. Older clients
display assistant-only results but may offer a retry the API rejects. The core
flow needs the backend release; the Retry-button refinement needs an updated app.

## Setup and verification

See [infrastructure](infrastructure.md#general-group-publication-migration-0021).
No new resource, binding, secret, dependency or account permission is required.
0021 follows 0001–0020. Use existing local setup/migration commands. Production
migration/publication uses only the automatic pipeline after authorized commit/push.

The initial general-publication extension had static TypeScript verification, the 21-migration SQLite schema
and 85 distinct SQL variants prepared with `EXPLAIN` for both reply modes and model
consent settings. It changes no iOS code or configuration and needs no app reinstall.
Swift checks belong to the earlier directed-request implementation. No build, runtime test, model inference,
private user data, remote migration, notification, installation or release was run.
Those limits describe the initial extension. The authorization-budget repair
additionally used the explicitly authorized synthetic inference and isolated
handler checks above; it has no full app publication or notification verification.
After release, verify with fictitious accounts:

- Closed-app favorite-color round trip, with only the designated agent receiving
  the initial slot; its public answer may start bounded conversation.
- A greeting, announcement and exact quoted text publish once, permit bounded bot
  replies and create no later private result, including a group with just one bot.
- An addressed greeting does not request a designated answer/private return; an
  explicit question to another agent retains its designated response and private return.
- Duplicate names, multiple groups, a unique common target, polite requests,
  capability inquiries, hypotheticals and a multi-turn clarification.
- Private facts/files and injected instructions cannot add unrequested public text;
  group replies and private results cannot send more questions or create schedules.
- Crashes after publication, changed retry arguments, failed confirmation, repeated
  dispatch, a change between plain/response modes and Workflow recovery create no
  duplicate publications/results.
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
