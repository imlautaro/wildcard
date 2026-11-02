# Account model settings and AI Gateway

[Web research](web-research.md) preserves the human turn's Standard/Contributor
selection and current consent checks, using direct Meta Responses requests with
`store: false`. It does not currently pass through AI Gateway, so dashboard gateway
estimates omit its tokens and search fees. Successful document provenance records
reported token counts and completed search-call items; these are not billing totals.

Requested October 27, 2026: close new account registration, let each existing
account choose Muse Spark 1.3 Standard or Contributor from Account on iOS/web,
and observe estimated Spark spending in Cloudflare AI Gateway.

## Account contract

`GET /api/v1/me` and profile mutations return `user.chatModel` as
`muse-spark-1.3` or `muse-spark-1.3-contributor`. Additive migration 0028 adds a
constrained `user.chat_model` column, defaulting all accounts to Standard.
It does not read/export conversations or create/delete accounts.

`PUT /api/v1/me/model` accepts exactly `chatModel` and optionally
`contributorConsent`. Contributor requires `contributorConsent: true` each time it
is saved. Unsupported models, unknown fields or absent Contributor acceptance
return 422; absent/invalid bearer session returns 401. The endpoint updates only
the authenticated account; supplying another account ID is unsupported. The stored
Contributor selection records continued acceptance until changed back to Standard.
No client caches authorize processing or grant sharing permissions.

Both clients show the same model options and disclosure: Contributor allows Meta
to use submitted messages, files, context and responses to train models; Standard
does not. Changing to Standard affects future processing, not data already sent.
Users can later select Contributor again with explicit acceptance. There is no
per-account administrator assignment. The admin flag `contributor_only`
([admin](admin.md#runtime-settings-and-feature-flags)) processes every account
with Contributor while it is on, without changing any saved choice; when it is
turned off each account's own selection applies again. While it is on, both
clients show Chat model as Contributor with a note instead of the picker.

Each private/group reply Workflow checkpoints its account model at the start and
keeps it through retries and publication. Private replies, autonomous schedules
and private group-result deliveries use the conversation's account. Group replies
use the human source author/requester, including bot exchanges descended from
that human; they do not use the bot owner's preference. Missing/deleted requesters
fall back to Standard. Contact-memory extraction uses the source account's current
selection, including when another participant's job refreshes that memory. Agent
self-memory and group extraction use their reply job's model. All Spark calls,
including extraction and group-post validation, share the gateway integration.

Already-started jobs keep their checkpointed model; changing a setting does not
cancel or regenerate them. Existing Worker versions may finish under their former
code. A new group reply job in an ongoing exchange reads the requester's selection
when that job starts. There is no automatic downgrade/fallback for an invalid
model or missing provider access.

## Sharing and MCP

Model selection and shared-memory consent are separate. Selecting Standard does
not revoke previous Contributor sharing consent or erase shared memories: another
participant may still process shared data with Contributor when existing sharing
permissions allow it. Conversely, selecting Contributor never grants consent on
behalf of a contact recipient or group participant. Existing request, retrieval,
membership, publication and consent checks remain enforced for Contributor.
Contact and persona memory sent to Contributor must belong to the processing
account or have explicit contact Contributor consent. Being the contact creator
alone grants no exception for another account's job. A creator's explicit
Contributor acceptance in the contact invitation flow is now recorded on their
own contact row; no historic creator consent is invented or backfilled. Group
memory retrieval identifies the human processing account separately from the
agent owner's contact used to locate the shared agent.
Groups with missing required consent continue to reject/stop Contributor replies;
users can choose Standard or explicitly update that group's consent.

Sends refused for missing consent return 403 with a `code` that both clients
localize instead of the English `error`: `CONTACT_CONTRIBUTOR_CONSENT_REQUIRED`
(private chat with a shared contact accepted without Contributor consent; the fix
is a new invitation accepted with consent) and `GROUP_CONTRIBUTOR_CONSENT_REQUIRED`
(group message while any member lacks it). The group body adds
`selfConsentMissing` and `membersMissing`, and the group chat offers **Members**,
where each person gives their own consent. Both bodies add `contributorOnly`, and
the message then notes that the admin flag is on. A reply that fails later
because consent changed mid-job still shows the generic failure, and skipped
proactive messages are not reported.

MCP-isolated private contact chats always use Standard, regardless of Account,
and retain their permanent shared-memory isolation. Do not infer that granting
MCP access permits Contributor processing or public/group disclosure.

## Gateway provisioning

Follow [infrastructure setup](infrastructure.md#optional-ai-gateway-for-spark-spending)
for bindings, account replacements and automatic releases. The gateway is optional
for independent installations. The checked-in production configuration temporarily
disables it with `AI_GATEWAY_ID=""` after gateway failures on October 27, 2026.
Spark requests use the existing direct Meta path; account selection, MCP Standard,
consent checks and client caches are unchanged. Gateway spending metrics do not
cover direct calls. Preserve the gateway and its existing logs.

Production Workflows exhausted generation retries with
`MODEL_TEMPORARILY_UNAVAILABLE`; gateway metadata showed HTTP 502, zero tokens,
and 4–10 ms duration. A diagnostic through the remote AI binding with fictional
text and an invalid provider key reproduced gateway error 2006, while a direct
Meta request with the same invalid key returned the expected HTTP 401. Changing
the gateway endpoint to either relative-path form did not resolve the error.
These checks locate the failing gateway route; they do not establish its internal
cause or verify authenticated inference. No real provider key or chat content was
used in the diagnostic. Failed model requests now log only transport and HTTP
status, never request/response bodies or credentials.

Release the bypass through the normal commit/push and automatic deployment flow.
Then retry a failed turn from either client and check its Workflow generation step.
Re-enable `AI_GATEWAY_ID=wildcard` only after separately verifying the gateway
route, both selected models, tool responses and payload-free metrics. Re-enabling
also requires a normal versioned automatic release; no schema migration is needed.

In Cloudflare's target account, open **AI → AI Gateway → Create a custom gateway**.
Use ID `wildcard`, require authentication, disable Collect Logs by default, disable
response cache, retries, rate limits and spend limits. Leave Workers AI on Standard
billing. Do not buy credits or configure Unified Billing for this integration.
Under **Custom providers**, create `Meta` with slug `meta` and base URL
`https://api.meta.ai`. When using the management API, set `enable: true`.
Provider-specific paths append `/v1/chat/completions`. The binding's universal
request uses provider `custom-meta` and that fixed official endpoint.

Alternatively run `npm run infra:ai-gateway -- --create` with an existing credential
having AI Gateway Read/Edit permissions in your account. Without `--create`, the
script only verifies; it does not modify existing gateways/providers. It refuses
provider URL drift and targets `wildcard` when routing is disabled, otherwise the
configured gateway ID. It reports permission errors without printing credentials.
An insufficient Wrangler OAuth scope does not mean the account is logged out;
the dashboard can provision without creating any runtime token.

The `AI` binding authenticates automatically. Keep `META_API_KEY` in existing
encrypted build/runtime secrets; it is forwarded to Meta through the requested
Cloudflare intermediary, not stored via the gateway's Provider Keys UI. Local
emulation should set `AI_GATEWAY_ID=` in ignored `.dev.vars` for direct calls, or
explicitly opt into a provisioned remote gateway. No new runtime secret is needed.

## Spending and retention

The gateway receives the inference traffic to forward it. Per-request
`cf-aig-collect-log-payload: false` suppresses stored raw request/response bodies
while retaining provider/model/status/token/cost/duration metrics. No names,
emails, account IDs, contact IDs or custom user metadata are added. Default
Collect Logs is off as an additional safeguard for other callers. Logs are still
enabled for this integration's metadata with `collectLog: true`.

Response caching is bypassed; one gateway attempt is allowed. Existing bounded
Workflow retries continue, and each actual provider attempt can incur cost. A
gateway failure is not retried directly against Meta. No guardrails, fallback,
model routing, provider search, or caching features are enabled by this change.

Public rates checked October 27, 2026, in USD per million tokens:

| Model | Input | Cached input | Output |
| --- | ---: | ---: | ---: |
| Standard | 1.25 | 0.15 | 4.25 |
| Contributor | 0.10 | 0.002 | 0.20 |

`cf-aig-custom-cost` supplies per-token rates, including provider cache reads.
These are estimated provider costs, not a billing statement or account balance.
They require the gateway to parse Meta's usage response correctly. Credits,
negotiated prices, taxes and Cloudflare's own log/service charges can differ.
Update `apps/api/src/chat/meta.ts` when rates change. Direct Muse Voice Transcribe
ASR is billed by audio duration and is excluded from gateway Spark totals.
See [Meta pricing](https://dev.meta.ai/docs/pricing-rate-limits),
[custom costs](https://developers.cloudflare.com/ai-gateway/configuration/custom-costs/)
and [payload-free logs](https://developers.cloudflare.com/ai-gateway/observability/logging/).

## Cache and verification

The account profile is held in the existing session-owned memory store, including
the model. iOS revalidates on Account entry; web revalidates in the background on
mount with a deduplicated request, retaining usable cached data on failure. Saves
apply the returned account synchronously. Web fences older profile reads and
updates cached list/group Contributor flags without discarding conversation
drafts or pending IDs. iOS cancels older group-detail reads, invalidates secondary
sharing snapshots, and refreshes lists/invitations; group details revalidate on
reopen. The existing bounded caches, eviction and account-change reset remain in
force. No model preference is stored in unprotected client disk storage.

API/web typechecks, complete iOS Simulator Swift typechecking with the project’s
actor/macro settings, all 28 migration scripts on an empty in-memory schema,
EXPLAIN compilation of the three new account/model SQL statements, provisioning
script syntax and diff checks passed. The consent follow-up also passed API
typechecking and EXPLAIN compilation of all four persona-memory SQL statements. These do not prove runtime behavior. After authorized release, verify signup returns 403 for old clients,
existing sign-in still works, preferences persist across devices/accounts, and a
user cannot change another account. Check both model IDs in gateway logs with
fictional messages, tool turns, schedules, group bot replies and extraction;
confirm token costs/cache reads and absent prompt/response payloads. Check missing
shared consent and revoked membership, MCP Standard, queued/in-flight changes,
reopen/offline/empty states, pending send preservation, and account switching.
No inference or device verification was performed during this implementation.


MCP-isolated conversations also force Standard for local human/persona extraction,
including contact maintenance started by another account's job. Their local memory
remains available only in its source private chat/group and never becomes shared
Contributor input. See [local memory](memory.md#conversation-local-memory-with-mcp).

## Account layout

Account shows **Chat model** as a row with the current choice (Standard or
Contributor). It opens a sheet listing both options with a one-line summary, the
Contributor consent switch when switching to Contributor, and Save; the full data-use
explanation is behind the sheet's info button. Same behavior on iOS and web; see
[contacts](contacts.md#contact-details-layout) for the shared settings pattern.
