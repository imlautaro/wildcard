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

Each generation attempt allows two tool rounds and six executions, then makes a
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
the API's existing size limit. Assistant replies are excluded as factual evidence.
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
