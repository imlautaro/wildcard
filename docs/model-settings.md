# Account model settings and AI Gateway

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
administrator assignment UI.

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
Groups with missing required consent continue to reject/stop Contributor replies;
users can choose Standard or explicitly update that group's consent.

MCP-isolated private contact chats always use Standard, regardless of Account,
and retain their permanent shared-memory isolation. Do not infer that granting
MCP access permits Contributor processing or public/group disclosure.

## Gateway provisioning

Follow [infrastructure setup](infrastructure.md#optional-ai-gateway-for-spark-spending)
for bindings, account replacements and automatic releases. The gateway is optional
for independent installations; the checked-in production configuration enables it.

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
provider URL drift and reports permission errors without printing credentials.
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
script syntax and diff checks passed. These do not prove runtime behavior. After authorized release, verify signup returns 403 for old clients,
existing sign-in still works, preferences persist across devices/accounts, and a
user cannot change another account. Check both model IDs in gateway logs with
fictional messages, tool turns, schedules, group bot replies and extraction;
confirm token costs/cache reads and absent prompt/response payloads. Check missing
shared consent and revoked membership, MCP Standard, queued/in-flight changes,
reopen/offline/empty states, pending send preservation, and account switching.
No inference or device verification was performed during this implementation.
