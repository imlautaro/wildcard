# Contact memory

An agent has a shared memory space formed from its participants' attributed facts.
Each participant retains at most 64 facts and a separate extraction cursor; a
four-person agent has at most 256 candidates. Existing single-person contacts
remain isolated until invitation creation and acceptance explicitly approve
sharing. See [shared contacts](sharing.md) for consent, attribution, access,
removal, exclusive attention, and migration 0013. Raw history and attachments
remain private per conversation; shared memory includes its content and source
quote. No public memory-editing endpoint or comprehensive erasure UI is included.

## Reply context and tools

Private human turns can also [publish requested text in a shared group](group-requests.md),
with separate authorization. Ordinary posts need no recipient; an explicit request
for another agent's response retains its correlated private return. This is the
only group write capability, exposed as separate post/question tools; group replies retain read-only tools.
Human-directed posts, delegated questions and private relays do not create persona-memory events for
their sender, and automatic relays are excluded from human-memory extraction.
Live tool definitions/results determine capabilities and access. Self-memory
extraction excludes transient connection, permission and send-failure claims;
historical disclaimers cannot override current tool capabilities.
The target's own group answer remains eligible for its own self profile. Group
retrieval preserves the original speaker rather than copying another bot's
preference into the asking bot's identity.

`chat/context.ts` assembles the contact instructions, current UTC time, selected
memories, recent completed turns, and current user message. It loads at most eight
previous turns with a 12,000-byte UTF-8 budget. If the latest turn alone exceeds
that budget, each side gets a clipped excerpt; older turns are omitted. The model
is told that context is partial and can consult original messages. Current
messages keep the existing API's 4,000-code-point limit.

Automatic retrieval compares up to 12 normalized query words from the current
message and latest user message with source names, stored keys, content, and source quotes.
Matching memories and preferences are ranked by lexical matches and then recency;
up to eight candidates are packed into less than 3,800 UTF-8 bytes. Preferences
can be included without a keyword match. This is lexical retrieval, not semantic
or embedding search, and it may miss synonyms or language changes. The budgets
are byte limits, not claims about the provider's exact tokenizer or an 8,000-token
context. JSON escaping, instructions, current input, and tool schemas add overhead.

The model has three internal, read-only function tools:

| Tool | Behavior |
| --- | --- |
| `search_memories(query)` | Search current facts, preferences, decisions, and pending commitments, including their sources |
| `search_messages(query, from?, to?, before?)` | FTS5 word/prefix search of completed turns, with optional inclusive Unix-millisecond dates and exclusive sequence cursor; up to four dated snippets |
| `get_conversation_excerpt(turnID, offset?)` | Requested turn first, with up to two neighboring turns per side; clipped user/reply texts expose Unicode-character offsets for later portions |

Queries are capped at 256 UTF-8 bytes and converted to quoted normalized words;
callers cannot supply FTS operators or SQL. History search sorts by newest matching
sequence, with a cursor for older results. Snippets are always marked incomplete.
Source excerpts clip each side to 600 UTF-8 bytes; use `nextUserOffset` or
`nextAssistantOffset` to inspect later portions of that source turn. Whole-result
packing may omit neighbors and reports truncation. Private history searches exclude the current turn and future sequences in that conversation. Memory search can also retrieve completed facts from other participants of the same agent, attributed by source user ID/name. Tools cannot access other agents, other participants’ raw transcripts/schedules, the internet, external services, or modify memory data. Missing/foreign source IDs return
the same generic not-found result.

Each private generation attempt allows three tool rounds (two for scheduled turns) and six executions, then makes a
final model request with tool definitions omitted. Meta Chat Completions only
accepts `tool_choice: auto`; the implementation never sends unsupported `none` or
`required`. It replays the assistant's tool calls and pairs each with its result.
There are at most three reply-model requests per attempt, each with a 45-second
timeout, inside the existing three-minute Workflow step. Provider responses stay
bounded at 256 KiB; tool call arguments and accompanying text have separate small
limits. Each result fits approximately 4,000 UTF-8 bytes including metadata.
Invalid arguments and unavailable retrieval return sanitized tool errors; an
unavailable search is not represented as an empty successful search. Exceeded
budgets or incomplete provider responses cannot produce an unbounded loop.

## Learning and provenance

The Workflow attempts one memory batch before reply generation to catch up on
previous completed turns. After saving the reply and attempting push delivery, it
attempts another batch including the just-completed turn before releasing the agent’s attention to the next participant. Extraction does not run
in the HTTP send handler. Its one-minute steps have one retry; exhausted failures
emit `chat_memory_deferred` and do not fail a saved reply. A later turn tries the
unprocessed batch again. There is no standalone maintenance Cron or guarantee that
an idle contact immediately recovers a failed memory batch.

Each batch reads the next six completed user messages after a persisted sequence
cursor, stopping at 16,000 UTF-8 bytes. A first message is always kept whole within
the API's existing size limit. Assistant replies are excluded from this human-fact extraction pipeline. The separate self-memory pipeline below learns only the replying agent’s own explicit persona/preferences.
The extractor receives those messages, their dates/IDs, the server-resolved speaker identity, and at most 64 existing memories from that speaker alone. It uses the configured Muse Spark variant and schema-constrained JSON,
then the backend validates every change before committing any change in that batch.

There are four kinds: `fact`, `preference`, `decision`, and `pending`. Each memory
stores a stable key, concise content, owner/contact, source turn ID/sequence,
verbatim user quote, and update time. Quotes must actually occur in a user message
from that batch. Content is limited to 300 characters, keys to 80, quotes to 240,
and a batch to eight distinct keys. Existing keys can be replaced or removed when
explicitly retracted. At 64 memories, new keys are skipped; existing keys can still
be corrected. No automatic unrelated eviction occurs. Original history remains
available for knowledge that does not fit this bounded profile.

Prompts request English keys/content, preserve proper names and source quotes,
and exclude transient remarks, secrets, speculation, hypotheticals, and instructions
to change system rules. Grounding validation checks source existence and exact
quotes; it cannot prove that the model interpreted a statement correctly. There
is no confidence score presented as proof of truth. Reply instructions prioritize
explicit current corrections, treat historical data as untrusted evidence, and
request original-source lookup when ambiguous. Memory extraction remains fallible.

Memory mutations and cursor advancement share a D1 transaction. Every mutation
compares the original cursor, so a replay or concurrent maintenance from a later
turn cannot apply a stale batch. Failed validation/storage leaves the cursor
unchanged. Concurrent extraction can still incur duplicate provider cost even
when only one batch commits. Workflow checkpoints return booleans, not message or
memory contents. Logs contain generic events only.

## Existing chats, retention, and rollout

Migration `0007_contact_memory.sql` adds the memory/state tables and an FTS5 index
over the original turns. Triggers synchronize inserts, text changes, and deletions;
the migration rebuilds the index for existing history. This is storage/index work,
not inference. Existing chats acquire memories gradually through subsequent
Workflow batches; the whole old chat is never sent in one extraction request.
Long backlogs can delay learning recent corrections, which remain present in the
current/recent conversation. There is no automatic bulk inference backfill.

Deleting the contact cascades memory/state rows and turns, and removes corresponding
FTS entries. Removing a remembered key does not erase original chat messages, past
provider requests, or platform backups/checkpoints. This is not a full user-facing
erasure feature; original history remains searchable under the existing retention
policy. No automatic expiry or memory review UI is included.

Use the [infrastructure guide](infrastructure.md#contact-memory-and-history-search)
for independent-account setup, local/automatic migrations, permissions, verification,
and rollback. No additional resources, credentials, or embedding calls are needed.
Model extraction and tool rounds add cost; this version bounds context and work,
but has not been benchmarked as cheaper for every message, especially short chats.

Static TypeScript, generated bindings, SQL compilation (12 statements using
EXPLAIN against an empty migrated SQLite schema), and whitespace validation were
performed.
No builds, runtime tests, live tool calls, paid extraction, remote migrations, push,
or deployment were run. Runtime recall, isolation, concurrency, FTS behavior on D1,
and provider compatibility must be verified with fictional data when authorized.

## References

- [Meta function calling](https://dev.meta.ai/docs/cookbook/tool-function-calling)
- [Meta structured output](https://dev.meta.ai/docs/cookbook/structured-output)
- [D1 FTS5 support](https://developers.cloudflare.com/d1/sql-api/sql-statements/)
- [D1 transactional batches](https://developers.cloudflare.com/d1/worker-api/d1-database/)


Consented group messages can contribute attributed memories to the same agent. Private-chat memory selection also considers grounded group memories while both the source user and agent remain in the source group. Group replies receive selected shared memories, never raw private transcripts. See [groups](groups.md) for consent, revocation, model switching and limits.


## One agent identity across private chats and groups

Migration `0019_agent_identity_memory.sql` adds a separate `agent_memory` profile,
keyed by stable agent ID and memory key. Human facts keep their existing attributed
stores. An agent's own explicit preferences and persona choices belong to the agent,
regardless of which private chat or group produced the reply. Other agents retain
separate identities. A bot statement is evidence of what it said, not verification
of facts about a human or the outside world.

SQL triggers record one `agent_memory_event` with a source foreign key whenever a
private reply completes or a bot group message is saved. This happens in the reply
transaction, including replies saved by an older Worker during rollout. Existing
completed replies receive metadata events in chronological order; migration does
not call a model. Before generation and after saving a reply, the Workflow attempts
one bounded self-memory batch while holding the agent's existing exclusive attention.
The batch takes at most four newest eligible unprocessed replies, up to 6,000 UTF-8
bytes per reply and 12,000 bytes combined. Older backlog is processed on subsequent
turns; newest replies take priority so recent preferences need not wait behind it.

The extractor receives only this agent's replies and existing self profile. It is
instructed to exclude human/other-agent facts, quotations, roleplay, hypotheticals,
credentials, secrets, external-world claims and invented physical biography. It
returns at most eight distinct keys with exact quotes; validation checks both the
supplied excerpt and original saved reply. Each agent retains at most 64 keys;
new keys beyond that cap are skipped, existing keys can be updated. Profile writes
and event acknowledgements use one D1 batch. A processed-event guard makes replay
idempotent; source ordering prevents an older extraction overwriting a newer key.
Invalid extraction/storage leaves events pending. Failures log only
`agent_memory_deferred`, keep the saved reply successful, and are retried by a later
private/group Workflow. No idle-agent recovery Cron or guaranteed immediate
extraction is introduced. Extraction remains model-dependent and fallible.

Every reply receives a query-ranked self profile capped at 6,000 UTF-8 bytes and can
use `search_self_memories(query)` for up to eight profile entries in a bounded
result. Private `search_memories` can also return agent-attributed self memories.
Self preferences may be recalled by that same agent in its other private chats or
groups; raw private replies never enter group context or another agent's tools.
Private source participant/model consent and current group source membership/model
consent are rechecked on reads and writes. Removing the agent from a source group
cascades that source's self memories/events through a membership-removal trigger. Source deletion cascades its events and
profile entries; this does not erase already delivered messages or provider data.
There is no automatic unrelated eviction or new user-facing memory editor.

## Group identities and observed statements

Private reply context now includes a bounded page of shared groups/current member
identities and relevant original group statements, with stable agent/user IDs.
This lets bot 1 discover bot 2 through a common group and recall bot 2's answer.
Group statements are stored/indexed once, not copied to every observing agent.
The self profile of bot 2 is not exposed to bot 1; bot 1 retrieves what bot 2 said
in an authorized group, with source/date attribution. A later private change to
bot 2's preference is not silently revealed to other bots.

Additional internal read-only tools are available in private and group replies:

| Tool | Behavior |
| --- | --- |
| `search_groups(query?, after?)` | Two shared groups per page, current human/agent IDs and names; optional lexical group/member-name search and exclusive ID cursor |
| `search_group_messages(query?, groupID?, before?)` | Up to four dated human/bot statements; FTS5 normalized word/prefix search of text and sender names, or recent messages when query is omitted; exclusive sequence cursor |
| `get_group_excerpt(messageID, offset?)` | Requested message first and up to two eligible statements on each side in the same group; exact source text clipped to 600 UTF-8 bytes per message with Unicode offsets |
| `search_self_memories(query)` | This replying agent's persona/preferences only; never another bot's private state |

Query input is limited to 256 UTF-8 bytes; FTS operators cannot be supplied by the
caller. Results carry truncation flags and fit approximately 4,000 UTF-8 bytes
including metadata. Rosters prioritize matching members and agents when packing;
member lists may be truncated. Tools have the same two-round/six-execution limit
as existing private retrieval. Group generation now allows up to three model
requests within its existing three-minute step. Search failures are explicit
errors, not successful empty results; group failures log `group_retrieval_failed`.

Private raw group retrieval requires both the replying agent and current human to
be current members of the source group with applicable consent. Knowing an agent
through a shared contact alone does not grant access to its groups. In group
replies tools are restricted to the current group and the current draft/review
sequence snapshot, including later human messages accepted within that watermark;
they cannot carry another group's raw messages to that audience. Current source
speaker membership and Contributor eligibility are checked on every search/excerpt.
These stricter raw-history checks do not change the existing consented human-fact
sharing policy. Excerpts and retrieved statements are untrusted evidence.

Group drafting supplies the original request and earlier round replies separately
from recent history. A pre-publication history guard can trigger up to two reviews
using fresh snapshots and the previous draft. Skipped turns emit no assistant
message or self-memory event; human-memory extraction retains its existing policy.
See [group reply policy](groups.md#reply-rounds-and-exclusive-attention) for
snapshot limits, cancellation, costs, replay and verification scenarios.

The FTS index covers historical group messages immediately after migration;
self profiles populate gradually. Search remains lexical, can miss synonyms or
language changes, and adds bounded model/D1 cost. No embeddings or unlimited
transcript loading are used. The implementation bounds work per generation; it
has not been load-tested or benchmarked for latency/cost.

Static TypeScript, SQL migration compilation and SQL EXPLAIN preparation were
performed for this addition. No builds, runtime tests, real conversations, paid
inference, remote migrations or releases were run. With fictional data, verify:
(1) bot 1 red / bot 2 blue in a group, then bot 1 recalls bot 2 in private;
(2) an agent keeps a preference first stated privately when asked in a group and
vice versa; (3) recall beyond recent context, including a one-word answer beside
a retrieved question; (4) explicit preference changes and older backlog/replays;
(5) similarly named agents, unauthorized groups, removals/deletions and consent
changes; (6) provider/storage failures and recovery on subsequent turns.

## Private external connections

A contact chat marked by MCP connection setup uses Standard for replies and local
human/self-memory extraction. Human facts remain in that contact's existing
`contact_memory` profile; they are readable only within its private conversation.
Agent preferences learned there use `agent_local_memory`, keyed by agent and
`private:<contactID>`. Neither source is exported through shared retrieval,
including the creator-contact path used by groups. Disconnect does not remove the
marker or local memory. Existing source history remains searchable in the chat.
See [connections](connectors.md).

## Account-selected extraction model

Contact-memory extraction resolves the source account’s preference, even when another participant’s job refreshes it. Group and agent-self-memory work uses the reply job’s selected model. Existing Contributor eligibility filters and MCP memory isolation remain. Account Standard does not revoke separate shared-data Contributor consent.

See [model settings](model-settings.md) for the API, shared consent, cache behavior,
AI Gateway spending and pending runtime/device verification.

## Contributor account isolation

With per-account selection, a contact creator no longer has an implicit
Contributor exemption for other accounts’ memory retrieval/extraction. Foreign
contact/persona sources require explicit contact Contributor consent; the
processing account can submit its own bounded history. The creator’s explicit
acceptance in the contact invitation flow is saved on their own contact row.
Existing rows are not granted new consent automatically. Group processing
distinguishes its human requester from the agent owner’s lookup contact.
See [model settings](model-settings.md#sharing-and-mcp).


## Conversation-local memory with MCP

Migration `0030_conversation_memory.sql` restores bounded persistent memory for
MCP-isolated private chats and groups without exporting connector-derived context.
Recent-history limits and original-message search remain unchanged. There is no
new embedding service, unlimited transcript loading, or full-chat summary.

Private human extraction keeps the existing six-message/16,000-byte batch, source
quotes, cursor transaction and 64-key limit, but forces Standard even if a different
account's job triggers maintenance. It reads its own existing keys for correction;
shared/group readers continue rejecting the source contact's permanent marker.

For an isolated group, human facts use `group_local_memory`, keyed by group,
agent, source user and memory key, with up to three facts per human source and
64 keys per agent/user/group. Shared extraction still writes only `group_memory`.
Read/write checks verify source group, human membership/consent and bot membership.
A group becoming isolated during extraction cannot commit to shared storage.
Existing isolated group history is not bulk-extracted; future completed reply jobs
perform their normal best-effort human extraction. Failed group extraction retains
the existing Workflow retry behavior; no new background backfill is introduced.

Agent self extraction uses `agent_local_memory` for marked conversations, with
64 keys per agent/audience and the existing four-reply/12,000-byte batch limits.
Its event acknowledgements and mutations remain atomic. Shared self extraction
never consumes isolated events. Local reads require the matching private owner or
current group membership and Standard. The local profile overrides an identical
shared persona key only in that audience; up to 64 local plus 64 eligible shared
candidates feed the existing 6,000-byte profile packing budget. Shared profiles
are never overwritten by a local preference.

`search_self_memories` follows the server-resolved current audience.
`search_group_memories(query)` retrieves lexical matches from shared group facts
and, within a Standard group job, its own local human facts. The normal eight-match
selection and bounded result packing remain; it cannot enumerate another isolated
group's memories. Recent group context selects at most eight human memories from
local and eligible shared candidates. Group local human reads respect the draft's
sequence watermark. No raw external tool results are added to human-fact extraction;
agent self extraction remains limited to explicit persona/preferences, not summaries
of external data. Original conversation search is the fallback for such details.

The migration copies existing shared-profile rows with already-isolated sources
into the matching local store, without inference. Marker-insert triggers preserve
existing knowledge locally when a conversation first becomes isolated. Original
shared rows remain excluded by source checks. No local data is promoted after
connector revocation. Source deletion cascades local rows; removed group members
or bots lose access through current membership checks. Memory remains best effort,
not a comprehensive erasure or editable-memory feature.

Both iOS and web use this API behavior and explain local memory retention in the
connector grant confirmation. No new payload, client memory cache or endpoint is
required. See [infrastructure](infrastructure.md#conversation-local-memory) for
migration/release/rollback and [caching](caching.md#conversation-local-agent-memory)
for cache and device verification.

Static verification: API/web TypeScript, Swift parsing, migration/SQL preparation and
whitespace checks. The opt-in `node scripts/checks/conversation-memory.cjs` uses
fictional data and simulated inference; it was authored, not executed. Tests,
builds, real inference, remote migration and device behavior remain unverified.

## Personality observations

The [personality experiment](personality.md) stores transient categorical events
with source references in a separate relation. Relationship continuity projects
those observations across eligible contexts into per-recipient acting directions,
without exporting private causes or adding a shared narrative. Connector
conversations retain their local isolation. Shared self-memory extraction excludes
mood, anger at someone, perceived rejection, trust/relationship assessments,
missed greetings, current age and birthday-today status. These are not durable
identity facts and must not be exported to another audience. Configured identity
and current calendar facts take precedence over inconsistent historical self
statements. User factual memory and conversation transcripts retain their existing
rules; saving personality settings only clears personality observations.

## Explicit private text access in a group

A participant can optionally grant one agent access to their own private text
history in one group through **Group details → Discuss my private chats**. The
agent can then answer about temporary remarks such as today's meal even when no
fact was extracted. This does not change existing shared-memory consent or expose
another participant's raw transcript. Group instructions and live SQL access checks
use the same authorized source roster. Connector-isolated private chats stay
excluded. See [group permissions and revocation](groups.md#optional-private-text-sharing).
