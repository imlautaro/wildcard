# Web research

Ask a contact a focused public-information question, for example: "Research the
current Cloudflare Workflows free limits and save a report with official sources."
The contact can call `research_web({ query, title })`. The API sends that question
to Meta Responses with `web_search`, then saves the report in this chat's existing
[documents](documents.md). Chat Completions still handles the conversation.

Both iOS and web show **Web research** and a cited-source count on the document
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
  research subrequest receives only the bounded question and fixed instructions;
  it receives no chat history, attachments, memories or connector tools.
- Research uses the turn's Spark Standard/Contributor mode, subject to current
  access and Contributor consent. Ownership, current group membership,
  shared-memory consent, all-member Contributor consent, active attempt and agent
  attention are checked before the provider call and during publication. Changing
  away from Contributor prevents a Contributor result from being published by
  that in-flight turn.
- Private reports stay in that participant's chat. Group reports are visible to
  every current group member. Research adds no cross-chat retrieval or connector
  permissions. Reports are untrusted evidence and cannot authorize external writes.

## Budgets and receipts

Implementation defaults in `apps/api/src/research/model.ts`:

| Limit | Default |
| --- | --- |
| Research requests | One per human message, shared across group contacts; one per authorized task lifetime |
| Rolling 24-hour account / installation limit | 10 / 100 reservations |
| Question / title | 600 / 200 UTF-16 code units |
| Responses output | 4,096 tokens including reasoning |
| Built-in tool calls | At most 3 through `max_tool_calls` |
| Provider deadline / response body | 60 seconds / 256 KiB |
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

The paid POST has no transport retry. A crash after reservation can leave a
`pending` outcome; retries return uncertainty without sending another search for
that message. A `failed` result is also not retried. A completed, grounded response
becomes a `ready` draft. Publication creates the document, revision 1 and `complete`
receipt in one transaction with a current-access guard. A ready draft can resume
publication without another paid call. Admission rejects an already full document
list before paying for research. If the list fills during research, it blocks publication;
clearing space allows a later same-message retry to publish the saved draft.
There is no independent background publisher.

Completed receipts point at the original document. Retries do not overwrite its
edits. Deleting that document sets the pointer to null; the original message
cannot recreate it. Budget denial returns without a provider call. Errors and
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
exactly matches a result of a completed search in the same response. Matching
preserves paths, query strings and fragments; a common domain alone is not enough.
Bare URL text, code, image URLs and raw HTML anchors do not count as Markdown
citations. Retrieved hits without a matching link remain retrieved-only. If Meta skips
search, returns no citations, refuses, truncates or times out, no research document
is published. Cited sources take priority over merely retrieved sources. Each
output section gets links from those accepted citations; commentary-phase messages
are excluded from the saved report. The immutable
source panel preserves titles/URLs and the cited/retrieved distinction. Source-page
content and search snippets are not stored separately. Citation correctness and
coverage depend on Meta; citations are not independent verification.

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
until publication or parent deletion. Publication clears the duplicate result
body; original provenance stays with the document until deletion, across edits.
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

Live Meta research, citation quality, billing, uncertain-outcome replay, concurrent
budget admission, model/consent changes while running and client presentation
require functional verification with fictional inputs after an authorized release.
On both clients verify card → report → sources → back/reopen, empty lists,
refresh/offline recovery, concurrent edits, deletion, access loss and account
switching. Static checks do not establish these behaviors.
