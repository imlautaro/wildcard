# Web research

A contact can research an unfamiliar public topic to understand what a person is
talking about and continue the conversation. `research_web({ query, title })` now
defaults to conversational delivery: Meta Responses performs the bounded search,
and the findings return as evidence to the ordinary Chat Completions reply. No
document, report card or separate notification is created. Asking the contact to
look something up or get familiar with it does not itself request a deliverable.

When the person actually requests a saved report or other lasting write-up, the
contact uses `research_web({ query, title, delivery: "document" })`. That mode saves
the report in the chat's existing [documents](documents.md). The choice is semantic
model direction backed by an explicit tool mode, not a keyword classifier or a
universal guarantee about inferred intent. Authorized autonomous task research
keeps its exact-query report contract.

For document delivery, both iOS and web show **Web research** and a cited-source count on the document
card. Open it to read the report and expand its source panel: query, check date,
links, and whether each source was cited or only retrieved. Provenance refers to
revision 1; editing a report does not recheck its claims or update its original
sources. Opening a link is a human action. Documents keep their usual editors.

Ordinary human requests support bounded research. [Persistent task work](persistent-work.md#public-research-permission-0055)
also supports one exact public query authorized in the task editor, with explicit
pause/revoke controls. Monitors, semantic memory and broader grants remain future work.

## Scope and permissions

- Offered in ordinary private human turns and initial group replies to an actual
  human message, plus explicitly authorized task turns (see below). Absent from
  schedule turns, initiative, ordinary bot triggers,
  directed group requests, draft reviews and response recovery.
- Connector-isolated private chats and groups cannot use research, even after a
  connector is removed. This first increment keeps their data away from public
  search. Existing MCP execution and local-memory rules are unchanged.
- Queries must be self-contained public questions. Prompts forbid sending secrets,
  connector results, private transcripts, memories or personal details to search.
  This is model guidance, not a semantic data-loss-prevention classifier. The
  search subrequest receives only the bounded question and fixed instructions;
  it receives no chat history, attachments, memories or connector tools. An optional
  tool-free synthesis additionally receives only returned public search hits.
- Research uses the turn's Spark Standard/Contributor mode, subject to current
  access and Contributor consent. Ownership, current group membership,
  shared-memory consent, all-member Contributor consent, active attempt and agent
  attention are checked before the provider call and during publication. Changing
  away from Contributor prevents a Contributor result from being published by
  that in-flight turn.
- Private findings/reports stay in that participant's chat. Group findings/reports
  are available only within that group, with current source-author/member consent. Research adds no cross-chat retrieval or connector
  permissions. Reports are untrusted evidence and cannot authorize external writes.

## Budgets and receipts

Implementation defaults in `apps/api/src/research/model.ts`:

| Limit | Default |
| --- | --- |
| Research requests | One per human message, shared across group contacts; one per authorized task lifetime |
| Rolling 24-hour account / installation limit | 10 / 100 reservations |
| Question / title | 600 / 200 UTF-16 code units |
| Provider calls per reservation | One search POST, plus at most one tool-free synthesis POST when citations are unusable |
| Output per provider call | 4,096 tokens including reasoning |
| Built-in tool calls | At most 3 through `max_tool_calls` |
| Shared operation deadline / body per provider call | 60 seconds total / 256 KiB each |
| Saved report / source index | 24,000 UTF-16 code units / 20 sources |

Research consumes one of the existing six tool executions. It does not increase
normal private/group tool budgets. Its group step allows two minutes for the
provider call and D1 work, inside the existing evidence deadline.

A guarded D1 `INSERT SELECT` atomically reserves the request and checks rolling
budgets. The unique key is independent of attempt and query; group replies share
the human source message's key. Failed, pending and uncertain attempts all consume
their reservation. A content-free `web_research_usage` event is recorded in the
same transaction, with a random ID, hashed account key and timestamp. It survives
parent deletion so deleting a chat/account cannot refund budget. Events expire
from admission after 24 hours; up to 200 expired events are pruned during each
subsequent admission. If no more admissions occur, old events remain stored until
one does. No query, source or report content is retained in that usage table.

Neither paid POST has a transport retry. A crash after reservation can leave a
`pending` outcome; retries return uncertainty without sending another search for
that message. A `failed` result is also not retried. A completed, grounded response
becomes a `ready` draft. Conversation delivery completes that receipt under the
current-access guard and retains the normalized findings, returning them directly
to the contact. Document delivery creates the document, revision 1 and `complete`
receipt in one transaction. Either ready result can resume its delivery without
another paid call. Only document delivery is subject to the document-list ceiling,
both at admission and publication; a full document list does not prevent ordinary
conversational research. If a document list fills during research, clearing space
allows a later same-message retry to publish that saved document draft.
There is no independent background publisher.

Delivery mode is immutable once reserved. Completed conversational receipts return
the same stored evidence on replay, including to another currently authorized
contact in the same human group round, without another search or artifact.
Completed document receipts point at the original document. Retries do not overwrite
its edits or convert its delivery mode. Deleting that document sets the pointer to
null; the original message cannot recreate it or reclassify it as inline findings. Budget denial returns without a provider call. Errors and
uncertainty are returned to the contact for its ordinary chat response; research
adds no separate job screen or retry button.

Failed operations are reported separately from pending or uncertain reservations.
`RESEARCH_FAILED` explains when the provider did not complete a search or did not
return usable URL citations; no report is saved in either case. Older
`MODEL_RESEARCH_UNGROUNDED` receipts cannot distinguish those two conditions. New
operations record `MODEL_RESEARCH_NO_SEARCH` or `MODEL_RESEARCH_NO_CITATIONS`.
The research instructions explicitly request `web_search` even for familiar,
historically stable questions. Meta only supports automatic tool selection, so
this instruction cannot guarantee a search; validation still rejects ungrounded
answers. See [Meta tool selection](https://dev.meta.ai/docs/tool-calling).
A new human message has an independent attempt, subject to daily limits. A failed
task still has only its original lifetime attempt. No failed or uncertain operation
is automatically retried, and no raw provider response is logged or retained.

October 29 diagnosis: the production receipt aggregate contained two failures with
`MODEL_RESEARCH_UNGROUNDED`. This confirms rejection by grounding validation, not
whether the missing element was a completed search or a citation. The instruction
and error-reporting changes remain unverified with live inference.

There is no pause/resume contract for an in-flight HTTP search. Lost access
prevents publication; a request already sent may still be billed. Disable
`WEB_RESEARCH_ENABLED` in a future automatic release to stop offering/starting new
research. This does not recall calls or delete reports. Task research additionally
checks a human-supplied exact query, its grantor and the current execution generation;
see [task permissions](persistent-work.md#public-research-permission-0055).

## Sources, storage and cost

The parser requires a completed Responses result, at least one completed
`web_search_call`, a bounded answer and a usable citation. A citation can be a
provider `url_citation` annotation or a parsed Markdown link whose normalized URL
matches a result of a completed search in the same response. Explicit bare URLs
are recognized as links too. A report may upgrade a retrieved default-port HTTP
URL to HTTPS; downgrades and non-default-port upgrades are rejected. Matching
preserves hosts, paths, query strings and fragments; a common domain alone is not
enough. Code, image URLs and raw HTML anchors do not count as citations. Search
hit URLs remain the saved provenance, including their original scheme. The prompt
asks for complete Markdown links copied exactly from search results, rather than
guessed canonical paths or homepages. Retrieved hits without a matching link remain retrieved-only. If Meta skips
search, returns no citations, refuses, truncates or times out, no research document
is published. Cited sources take priority over merely retrieved sources. Each
output section gets links from those accepted citations; commentary-phase messages
are excluded from the saved report. The immutable
source panel preserves titles/URLs and the cited/retrieved distinction. Source-page
content and search snippets are not stored separately. Citation correctness and
coverage depend on Meta; citations are not independent verification.

If completed search hits exist but no usable citations can be parsed, the operation
may make one additional **tool-free Chat Completions synthesis** call. It receives
only the public question and at most 20 returned source URLs/titles with bounded
snippets, not chat history, memory, task notes or the original ungrounded draft.
Current access, task generation and model consent are rechecked before admission.
Both calls share the 60-second deadline and the existing durable reservation;
replays never repeat either call. This can increase inference cost per operation,
but never runs another search or refunds an attempt. Failure remains failed or
uncertain under the existing receipt rules.

The synthesis schema uses sections with numeric source IDs from the returned list.
The server validates each ID, rejects model-authored links, and constructs citation
URLs from the search hits. It records `synthesisCalls: 1` and combined token usage
in provenance when usage is available. Search hits without snippets permit only
source discovery; the instructions require that limitation to be explicit. A report
can be preliminary and need further work. Contacts are instructed to read the
saved report and its limitations before describing the outcome. This fallback
does not establish that a source supports every claim or that pages were read.

Client renderers escape HTML and suppress remote Markdown images. Source-panel
URLs accept credential-free HTTP(S) domain links, rejecting literal IPs and
localhost/local names. The Worker never fetches those links. Domain validity is
not a trust or availability guarantee.

Migration `0055_task_research.sql` adds task grant/counter fields and a unique task
link plus execution generation on each task research receipt. Consumption remains
on the task if the original chat turn, receipt, report or granting account is deleted.
The query/grant/counter share task retention; research receipts retain existing
parent cascades. No backfill or new service is required.

Migration `0053_web_research.sql` adds `web_research`, `web_research_usage` and nullable
`chat_document.research_json`. Ready drafts retain normalized Markdown/provenance
until delivery or parent deletion. Document publication clears the duplicate
result body; original provenance stays with the document until deletion, across
edits. Conversational completion retains one normalized Markdown/provenance body
(up to the existing 24,000-character/20-source limits) in the receipt until its
parent chat turn, group source/reply, contact, agent or account is deleted. Clear
chat removes source-linked findings even when factual memory is retained. There
is no additional private client disk copy, global knowledge store or automatic
conversion of research into shared factual memory.
Existing revision retention stays at 50. Receipts keep query/title/model, status
and safe failure code until parent deletion. There is no new retention sweeper.

Responses uses `store: false`, no previous response ID, direct authenticated Meta
requests and manual redirects. It reuses `META_API_KEY`. Logs contain only the
`web_research_failed` event and a safe code, never payloads or provider exceptions.
This path does not currently route through AI Gateway. Provenance records reported
input/output tokens and completed search call items, which are not a billable
query count or cost estimate. Failed calls may incur unrecorded usage.

Checked October 29, 2026: Meta lists search at $2.50 per 1,000 queries plus model
tokens. Request/tool ceilings are not a monetary cutoff. Workflows Free currently
includes 3,000 steps/day, 100,000 requests/day shared with Workers, 10 ms CPU per
invocation and 1 GB-month storage. Existing traffic and D1/R2 use share account
quotas. No new Cloudflare service is created; free operation is not guaranteed.

Sources: [Meta search](https://dev.meta.ai/docs/search-grounding),
[Responses schema](https://dev.meta.ai/docs/api-reference/responses/schemas),
[Meta pricing](https://dev.meta.ai/docs/pricing-rate-limits),
[Workflows pricing](https://developers.cloudflare.com/workflows/reference/pricing/).

## Cache and validation

Research uses existing session-owned document list/detail caches and chat polling.
Metadata travels with the snapshot: no separate source fetch, persistent client
cache or search-on-open. Cached empty results, background revalidation, request
deduplication, stale-response rejection, mutations, LRU limits, confirmed access
loss and account reset follow [document caching](caching.md#chat-documents).
Source metadata has the same lifetime as its document. Refresh never reruns search.

Static preparation: `node scripts/checks/web-research-sql.cjs` compiles SQL and binding arities for private/group,
Standard/Contributor guards and statements against an empty schema with all
migrations at D1's expression-depth limit. It executes no feature
behavior and reads no data. API/web TypeScript and iOS Swift typechecks also apply.

October 29 follow-up diagnosis: one authorized live request using the production
code and the public RSS/Atom question returned HTTP 200/completed, three completed
search calls (9, 11 and 10 hits), and seven URL strings in the final answer, but
empty annotation arrays. The annotation-only parser rejected it. Only structural
counts were printed; the raw response was not saved and no document was published.
The Markdown/retrieved-hit compatibility fix was implemented afterward; a second
live request and end-to-end publication have not been verified.

Later that day, the user authorized up to three additional public RSS/Atom requests
and offline parser checks. The first request passed the previous parser only via
a secondary source: the official RSS hit used HTTP while the report used HTTPS,
and several other links were replaced with homepages or alternative RFC paths.
Replaying it with the new matcher also recognizes the official RSS source. The
second request passed with the updated prompt and matcher. The third request,
using the final matcher, failed correctly: the model supplied official IETF URLs
absent from all returned search hits, with empty annotations. The citations claimed
retrieval that the returned evidence did not establish. Do not treat this change
as a reliable end-to-end research fix or relax matching to accept those links.
Public provider output
was saved temporarily outside the repository for offline diagnosis; credentials,
private chat history and encrypted reasoning were excluded. No documents were
published by these diagnostic calls.

`node scripts/checks/research-response.cjs` covers 23 offline cases, including
structured citations, Markdown/reference/bare links, HTTP upgrades, downgrade and
port rejection, exact path/query/fragment matching, commentary, retrieved-only
answers, guessed official URLs absent from search hits, incomplete searches, code,
images, HTML and unsafe hosts. API TypeScript
also passes. These checks do not establish production document publication.

The user then authorized up to three more requests for explicit-source synthesis.
One synthesis call on the previously rejected public response passed. A fresh
full operation used two calls (search plus synthesis) and passed with 20 returned
sources, 15 cited by validated IDs. The resulting report explicitly disclosed empty
snippets, missing evidence and preliminary status. Six additional offline cases
cover synthesis admission, token aggregation, valid IDs, invalid/missing IDs and
model-authored links. No production report was created; end-to-end database
publication and iOS/web presentation still need verification after release.

Live Meta research, citation quality, billing, uncertain-outcome replay, concurrent
budget admission, model/consent changes while running and client presentation
require functional verification with fictional inputs after an authorized release.
On both clients verify card → report → sources → back/reopen, empty lists,
refresh/offline recovery, concurrent edits, deletion, access loss and account
switching. Static checks do not establish these behaviors.

## Conversation-local findings — migration 0068

`0068_conversational_research.sql` adds only the receipt's `delivery` column. Its
default is `document` so existing pending/ready/complete receipts preserve their
original report and deletion contracts. New ordinary requests default in code to
`conversation`; task research stays `document` and accepts no model-authored query
or delivery override. Mode selection does not add a provider call, refund a budget,
change grounding checks, relax consent or extend tool availability. Internal search
output remains a structured research briefing; the conversation model uses it as
evidence instead of forwarding its formatting or creating an unsolicited artifact.
General document guidance also distinguishes a requested deliverable from context
needed for ordinary conversation.

Later replies can receive the two most recent completed conversational findings in
this same private participant/agent chat or current group. Each context excerpt
contains at most 5,500 Markdown characters (beginning and end when clipped), the
public query, original check date and up to three cited source links. Clipping is
explicit; the model must preserve uncertainty and cannot assume omitted evidence.
Private queries enforce contact/user/agent identity and sequence. Groups enforce
current author/viewer membership and memory consent, replying-agent membership,
shared-agent availability, current Contributor eligibility and source sequence.
Connector-isolated scopes return no such context; Standard processing excludes
Contributor findings. Evidence never crosses private participants or private/group
boundaries, and old dates do not establish current facts. This is bounded reuse,
not a claim of permanent learning, complete knowledge or independent fact checking.

The shared API provides the same behavior to iOS/web with their existing messages,
Markdown source links, polling, delivered-part caches and Typing. Conversational
research adds no document list mutation, report badge, client endpoint, countdown,
extra notification or source-panel fetch. Explicit reports retain the existing
source panel/editor/cache contract. Refresh, navigation and replay never trigger
another paid search automatically.

Static verification for this refinement: API TypeScript, whitespace and preparation
of 29 research SQL variants/binding arities against all 68 empty migrations at
expression depth 100. No functional harness, build, model call, remote migration,
release or device/browser session was run. Verify with fictional data: unfamiliar
references vs explicit reports, follow-up evidence reuse, no unsolicited document
or long briefing, full document list, group sharing without duplicate search,
consent/model changes while running, pending/failed/ready replay, legacy deleted
reports, clear/delete, offline navigation and account changes. Semantic intent and
natural replies require live-model evaluation; static checks do not establish them.
