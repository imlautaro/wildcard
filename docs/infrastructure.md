# Infrastructure

## Required resources

| Resource | Configuration | Purpose |
| --- | --- | --- |
| Cloudflare Worker | `apps/api/wrangler.jsonc`, `wildcard-api` | Hono API and Better Auth handler |
| Cloudflare R2 | `CONTACT_PHOTOS`, `wildcard-contact-photos` | Private contact profile JPEGs |
| Cloudflare D1 | `DB`, `wildcard-db` | Users, hashed passwords, sessions, verification schema, auth rate limits, private contacts, conversation turns, contact memories, and full-text history search |
| Runtime auth secret | `BETTER_AUTH_SECRET` | Signs cookies and native bearer sessions |
| Cloudflare Workflow | `CHAT_WORKFLOW`, `wildcard-chat`, class `ChatWorkflow` | Durable reply generation |
| Cron Trigger | `* * * * *` in Wrangler | Recover queued dispatch gaps and reconcile terminal workflows |
| Meta Model API | Runtime `META_API_KEY`, `META_CHAT_MODEL` / `muse-voice-transcribe-1.0` | Generate replies and Muse Voice Transcribe dictation |
| Public origin | `BETTER_AUTH_URL` | Canonical auth origin, separate from the secret |
| Workers Builds | GitHub `imlautaro/wildcard`, `main`, root `/` | Automatic releases from committed and pushed source |

There are no KV, email service, or staging dependencies. R2 is required for
[contact profile photos](profile-photos.md). The production bucket was created and verified on October 26, 2026. Chats require
Workflows and Meta access; auth and contacts can run without a model key.
Registration and login require D1 and the secret; missing configuration fails
rather than falling back to in-memory sessions or a development secret. See
[authentication](authentication.md) for the API, client, privacy, and limitations.

## This installation

- Account: `a9e3a97d08ec5023cbe6b97a1a25fec6`.
- Worker: `wildcard-api`.
- D1: `wildcard-db`, ID `ac55a941-27bf-4182-ac8a-8aebda43524f` (new database).
- Origin: `https://wildcard-api.imlautaro.workers.dev`.
- Repository: `imlautaro/wildcard` (ID `1434657598`), production branch `main`.
- Build root `/`; build command `npm ci && npm run typecheck`;
  automatic deployment command `npm run release:ci`.
- Preview branch builds and version preview URLs are disabled.
- Existing build credential: `Workers Builds - 2026-05-27 10:54`.

The previous project's database was deleted and is not reused. These IDs and URLs
are installation-specific; replace them when configuring an independent account.
No actual secret value belongs in Git, app build settings, or documentation.

## Independent account provisioning

1. Install Node.js 24 or later and npm. Use `.nvmrc` and `npm ci` from the root.
2. Choose a Cloudflare account, an available Worker name, and database name.
   Replace `account_id`, Worker `name`, and `vars.BETTER_AUTH_URL` in Wrangler.
   Change the D1 `database_name` and set its `database_id` to
   `00000000-0000-0000-0000-000000000000` before provisioning a new installation.
   Preserve `binding: DB` and `migrations_dir: migrations`.
3. Authenticate Wrangler in your account. The provisioner needs account read and
   D1 edit permissions. Run `npm run infra:provision`. It lists databases in that
   account, reuses a matching name or creates it, verifies its ID, and updates the
   versioned binding. Re-running against the same configuration reuses the same
   resource. It refuses to silently replace a different non-placeholder database
   ID. It neither migrates nor deploys the Worker. Review the chosen account and
   resulting IDs, then commit and push the configuration.
4. Connect your repository to Cloudflare Workers Builds using its GitHub
   integration. Select the production branch (`main` by default), root `/`, and
   the build/deploy commands above. The deployment credential needs Workers
   Scripts edit, D1 edit, Workflows edit, and account read permissions in your account. Workers
   Scripts edit covers listing Worker secret names and uploading runtime secrets
   with a version. Select an existing suitably scoped credential; do not commit
   its value. Disable preview builds until staging is explicitly provisioned.
5. Choose a unique Workflow name in `workflows[].name` for this installation;
   preserve `binding: CHAT_WORKFLOW` and `class_name: ChatWorkflow`. The automatic
   Worker release creates/updates this Workflow and its minute Cron Trigger from
   Wrangler configuration. No separate local workflow deployment is needed.
   Obtain your own Meta Model API credential with Muse Spark 1.3 and
   Muse Voice Transcribe access and add
   `META_API_KEY` as an encrypted secret in Worker Settings → Build → Variables
   and secrets. The build credential must be allowed to create/update Workflows;
   verify its permissions if the first automatic release is rejected.
6. The automatic release applies versioned D1 migrations first, then publishes the
   Worker with an auth secret as described below. There is no manual migration
   requirement for production releases; review each migration before pushing.
7. Provision the photo bucket using the section below before releasing these
   changes.
8. Replace the iOS app and notification extension `WILDCARD_API_URL` build settings with your public HTTPS origin.
   Build/install the client separately when desired. API releases do not update an
   already installed iOS application.

D1 and Workers are subject to the selected account's plan/quotas; the feature does
not enable billing or change plans. Better Auth password hashing consumes CPU, so
check the account's Worker CPU limits before public use. No email delivery or
identity verification is provided by creating these resources.

## Automatic secret initialization and releases

`scripts/release-worker.mjs` requires Workers Builds (`WORKERS_CI=1`), the production
branch, a clean checkout, and `WORKERS_CI_COMMIT_SHA` equal to Git HEAD. These system
variables are injected by Cloudflare. Do not set them locally to bypass the guard.
An independent installation can set `WILDCARD_PRODUCTION_BRANCH` in the build
settings if it uses another production branch.

The release runs remote D1 migrations and inspects only Worker secret names. If
`BETTER_AUTH_SECRET` does not exist, it generates 48 cryptographically random bytes,
writes an owner-only JSON file in a private temporary directory, and uploads the
secret with the code using Wrangler's `--secrets-file`. The file is removed in a
`finally` block. Secret values never appear in arguments or application logs.
Subsequent releases preserve the existing encrypted auth secret and session
signatures. The secret is never exposed to iOS.

`META_API_KEY` is an encrypted build secret and an encrypted runtime secret. The
release copies the build value into the same temporary upload file when supplied;
if absent from the build environment, it preserves an existing runtime key. An
empty build value or missing key in both locations stops the release. Update the
encrypted build secret and push an authorized commit to rotate the model key.
Never print environment values or paste the key into chat. The user confirmed
configuring the encrypted build secret on October 26, 2026; its value and model
access were not inspected. The Cloudflare credential is used only by the pipeline,
while `BETTER_AUTH_SECRET` is used only at runtime.
Future secret rotation must use an explicitly authorized automatic release; it
invalidates existing signed sessions. Deleting/recreating the Worker also loses
its runtime secret and requires users to sign in again.

Release by committing and pushing to the selected branch. Check Workers Builds,
confirm the source SHA, and inspect the active Worker version's `workers/tag`
against that SHA. Verify `CHAT_WORKFLOW`, the `ChatWorkflow` class, the minute
Cron Trigger, and the runtime secret name `META_API_KEY` after the chat release.
The script tags every version with the full source commit.
The first repository-connection build may lack source metadata and stop safely;
a subsequent Git push triggers a build with metadata. Investigate a failed
pipeline; do not bypass it with a local deployment or `wrangler secret put`.

The stable `workers.dev` route is enabled; preview URLs are disabled. Workers Logs
and Traces are configured with sampling rates 1 and 0.01. Review quotas/retention
before public use. Preview branches must not share this production database.
Separate Worker, D1, origin, and secret configuration is required for staging.

## Local setup

```sh
npm ci
npm run auth:setup:local
npm run typecheck
npm run dev
```

Local setup generates an ignored, owner-only `apps/api/.dev.vars` containing a
random `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL=http://localhost:8787`, and applies
all pending versioned migrations, including `0001_auth.sql` and
`0002_contacts.sql`, and `0003_chat_turns.sql`, to Wrangler's local D1. Existing `.dev.vars` files are
preserved. A safe template is versioned as `.dev.vars.example`. Local D1 state is
ignored under `.wrangler/`; these commands do not connect to production bindings.
No Cloudflare login is required for local emulation. For local model calls, add
`META_API_KEY` to that ignored file; calls use Meta and may consume credits. Without
it, new sends return 503 while auth/contacts still work.

`npm run db:migrate:local` reapplies only pending local migrations. The separate
`db:migrate:remote` command modifies the configured production database and should
be reserved for explicitly authorized operations; releases already perform it.
`npm run types --workspace @wildcard/api` regenerates ignored binding/runtime types
from Wrangler; `npm run typecheck` includes it. `npm run build` is a local dry run
only and does not publish. Follow the repository's build/test preferences.

## Voice transcription

[Voice dictation](voice.md) reuses the existing Worker and `META_API_KEY`; it adds
no resource, binding, migration, or new credential name. The Meta project must
permit `muse-voice-transcribe-1.0`. Its route forwards bounded WAV audio to Meta
without storing audio in D1/R2. Local setup and automatic releases use the same
commands and secret handling described above. Independent accounts need model
access in addition to the existing Cloudflare permissions. No key or model
permission change was performed during implementation; runtime model access is
unverified. The additive route can be rolled back without a schema rollback.

## Migrations, compatibility, and verification

`0001_auth.sql` creates the user, session, account, verification, and rate-limit
tables, indexes, unique constraints, and foreign-key cascades. Timestamps in the
Drizzle schema and SQL use milliseconds. It adds new tables and is compatible
with the prior empty API. The migration runs before code upload; never rewrite
an applied migration. Worker rollback does not undo D1 changes or recover deleted
data. Review future migrations for compatibility with the currently active Worker.

`0002_contacts.sql` adds private contacts to the same D1 database, with an owner
foreign key and an owner/creation-time index. No additional resource or credential
is required. Local setup and automatic releases apply it with the existing
migration commands. It is compatible with the auth-only Worker; rolling code back
does not delete contacts or undo this migration. See [contacts](contacts.md) for
the API contract, isolation, retention, native flow, and verification limits.

`0003_chat_turns.sql` adds private turns and an atomic one-active-turn constraint.
See [chats](chats.md) for lifecycle, limits, retention, failure recovery, and
rollback with active Workflow instances. Wrangler versions the workflow binding
and Cron Trigger alongside the API. For staging, use a separate Workflow name,
Worker, database, build secrets, and iOS origin. Model calls and Workflows consume
the selected accounts' quotas; this change does not alter billing plans.

Verify that the automatic release has no pending migrations, the `DB` binding uses
the intended ID, and the runtime secret name exists. An unauthenticated GET to
`/api/v1/me` must return 401 JSON; unrelated paths retain the 404 JSON response.
Refer to the auth guide for functional scenarios using fictional data when tests
are authorized. Do not expose database contents or secrets to validate setup.

TypeScript, generated bindings, release/provisioner syntax, and Swift types were
checked during implementation. No runtime auth tests or local builds were run.
Independent-account reproduction and installed iOS behavior remain unverified.

## References

- [D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/)
- [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Workers CPU and platform limits](https://developers.cloudflare.com/workers/platform/limits/)

## Apple push notifications

[Reply notifications](notifications.md) add APNs as an optional external service.
Provision the Apple App ID/capability, signing profiles, and provider key before
configuring encrypted Workers Builds secrets `APNS_PRIVATE_KEY`, `APNS_KEY_ID`,
`APNS_TEAM_ID`, and `APNS_TOPIC`. The automatic release forwards them to runtime;
all four must be supplied together when updating. Without them chats continue
working and pending notifications expire. No new Cloudflare binding is needed.
`0004_push.sql` adds session-bound devices and a reply outbox in existing D1;
production release/local migration commands apply it. The Workflow attempts
immediate delivery and the existing Cron retries it. Preserve additive tables
on rollback. The setup guide covers independent Apple accounts, permissions,
sandbox/production signing, private local configuration, retention, staging,
verification and rollback. No Apple key, remote configuration, real push,
or installed-device behavior was verified during implementation.

## Read-state migration and push signing recovery

`0005_read_state.sql` adds `contact.last_read_sequence` with default zero. Existing
D1/local migration and automatic release commands apply it before uploading code;
no new service, binding, credential, or account permission is required. Keep the
column on code rollback. Existing replies initially count as unread until viewed;
read acknowledgements also discard queued push entries for those replies. The
provider signs using native Web Crypto PKCS#8/P-256 instead of the incompatible
Workers node:crypto PrivateKeyObject path. Existing encrypted APNs secrets remain
valid. Observe `push_accepted`, `push_provider_signing_failed`, or sanitized
`push_delivery_deferred` status/reason events after an authorized automatic release;
never inspect device tokens or conversation contents for verification. Read counts
and markers stay in the owner account and do not enable sharing. See
[notifications](notifications.md) and [contacts](contacts.md) for client updates,
API contracts, rollback limits, and verification status.

## Icon badges and reply previews

Reply alerts now carry contact names, bounded reply text and an owner-wide
`aps.badge` count, as requested on October 26, 2026. This reuses the APNs key,
Workflow, Cron, D1 read-state column, and automatic release process; no additional
resource, migration, account permission, or secret is needed. Payloads are capped
at 4096 serialized UTF-8 bytes; only notification previews are shortened, never
stored replies. iOS must be updated to request badge permission, synchronize the
icon after reads/foreground refresh, and clear it at sign-out. Existing system
notification settings still control badges and lock-screen previews. Verification
must not print notification payloads or message contents in logs. See
[notifications](notifications.md) for behavior, retention, limits, and rollback.

## Private contact photo storage

The versioned `r2_buckets` binding requires an existing private bucket before the
next automatic release. The production bucket `wildcard-contact-photos` was created and verified on
October 26, 2026 in the configured account, with Standard storage. Its r2.dev
access is disabled and it has no public custom domains. Apple account capabilities
and provisioning profiles have not been changed or verified remotely.

For an independent account, first activate R2 in that account if necessary using
its normal account setup, review its plan, and choose the bucket name. Update
`account_id` and `r2_buckets[].bucket_name` in `apps/api/wrangler.jsonc`, preserving
`binding: CONTACT_PHOTOS`. Use a credential with Workers R2 Storage Edit for
creation and access to bucket metadata; Wrangler's info command also queries
bucket metrics and needs Account Analytics Read. The automatic deployment
credential needs access to the chosen R2 bucket in addition to its existing
Workers/D1/Workflow permissions. No R2 S3 credential or new runtime secret is used.

From the repository root, in the intended authenticated account:

```sh
npm run infra:photos -- --create  # Create the configured bucket once, then verify
npm run infra:photos             # Verify an existing bucket without creating it
```

Creation does not publish the Worker or enable public access. If creation reports
an existing name, verify that resource with the second command rather than
recreating it. Keep r2.dev and custom public domains disabled. Existing public
bucket settings are not modified by this script; verify privacy in the R2
dashboard. Keep staging in a different bucket and bind that name only in a
separate staging Worker/configuration. No staging resources are provisioned here.

Then commit/push the versioned configuration and feature together through the
existing automatic pipeline. Migration `0006_contact_photos.sql` applies before
Worker publication. Verify the release source SHA, migration status, and the
`CONTACT_PHOTOS` binding's intended bucket. With an authorized fictional-account
check, verify that unauthenticated photo reads return 401, signed URL tampering
returns 404, and another owner cannot read or replace the photo. Do not inspect
private real account data to validate storage.

`npm run auth:setup:local` applies all migrations, including 0006. `npm run dev`
emulates the R2 binding locally in ignored `.wrangler` state; do not add
`remote: true` for local photo development. Production object data is not copied.

Sign and install both the iOS app and its embedded `WildcardNotificationService`
with your own Apple team. The extension bundle ID must extend the main app's ID;
replace `com.imlautaro.Wildcard.NotificationService` for independent accounts.
Set `WILDCARD_API_URL` in Debug and Release on both targets. The main app adds
`com.apple.developer.usernotifications.communication` and declares
`INSendMessageIntent`; enable Communication Notifications for its App ID and
refresh its provisioning profile as needed. The extension uses the standard
notification service extension point and does not require shared credentials.
Existing APNs key/topic configuration continues to refer to the main app ID.
No Apple capability/provisioning change was performed or verified remotely.

Keep the R2 bucket and additive column when rolling back code. R2 deletion and
replacement are not reversed by a Worker rollback. Cleanup is best effort, so
storage failures/crashes may leave private orphan objects; there is no automatic
orphan sweep. Future account deletion must remove its objects separately from D1
cascades. See [profile photos](profile-photos.md) for API limits, access lifetime,
retention, rollback, and the unverified physical-device checks.

## Development Contributor model

On October 26, 2026, the owner explicitly approved Contributor mode for this
single-user development installation, including its existing test conversations,
after learning that Meta may use submitted prompts, history, and responses to
train future models. This approval does not extend to a future public or multi-user
installation. The deployed Worker uses the production pipeline/branch but is
currently the owner's development backend; there is no separate staging Worker.

`vars.META_CHAT_MODEL` in `apps/api/wrangler.jsonc` selects
`muse-spark-1.3-contributor`. The Workflow passes that value to the existing Meta
Chat Completions call with reasoning effort `low`. Only `muse-spark-1.3` (Standard)
and `muse-spark-1.3-contributor` (Contributor) are accepted; an absent value defaults
to Standard, and an invalid value stops generation. There is no automatic model
fallback or change to existing messages. Future requests include the existing
bounded conversation history as before. Completed replies are not regenerated.
In-flight Workflow instances can finish on their original code/version.

The model selector is public configuration, not a secret. Reuse the existing
`META_API_KEY` with access to the selected model; no new credential, Cloudflare
resource, permission, schema, or migration is required. No existing conversations
were read or exported to configure this change. No paid inference was triggered
for verification; actual Contributor request success remains unverified.

For an independent installation, set `META_CHAT_MODEL` to `muse-spark-1.3` unless
its operator has explicitly chosen Contributor's data use. For local development,
Wrangler reads the configured variable; an explicit `META_CHAT_MODEL` in ignored
`.dev.vars` overrides it. The example documents both choices. Before using real
private data or opening the app to other users, prefer Standard through the versioned configuration and an authorized automatic commit/push release. If retaining Contributor, the sharing flow requires explicit agreement from creator and recipient; the original single-user approval never supplies recipient consent.

To return to Standard, set the Wrangler variable to `muse-spark-1.3`, update any
local override, commit/push, and verify the live version's source tag and
`META_CHAT_MODEL` binding. No manual deploy or dashboard-only variable update is
needed. A code/config rollback changes future generation only and does not undo
content already submitted to a provider. Keep existing D1/R2 data when changing
models. Voice transcription remains on `muse-voice-transcribe-1.0`.

Reference: [Meta models and Contributor data use](https://dev.meta.ai/docs/models).

## Contact memory and history search

[Contact memory](memory.md) reuses `DB`, `CHAT_WORKFLOW`, `META_API_KEY`, and
`META_CHAT_MODEL`. No new service, vector database, embedding model, binding,
secret, account permission, or paid plan is required. Model inference for memory
extraction and retrieval rounds consumes the selected Meta account's credits;
D1 index storage and queries consume its existing quotas. The configured
Contributor consent also applies to extraction inputs from the owner's test chats.
Independent installations should keep the Standard-model default unless separately
authorized. See [shared contacts](sharing.md) and migration 0013 below for the later sharing extension and explicit participant consent.

Migration `0007_contact_memory.sql` adds owner-scoped memory/cursor tables, source
foreign keys, and a SQLite FTS5 external-content index maintained by triggers.
It indexes the existing conversation archive once during migration; allow time
and quota for this on a populated database. Memory extraction itself happens
in bounded Workflow batches as conversations continue, not in the migration.
Do not rewrite an applied migration or trigger a separate bulk model backfill.

For an independent account, provision the existing D1 and Workflow resources
first, then apply all versioned migrations through `npm run auth:setup:local`
(or `npm run db:migrate:local` for an existing local setup). Configure the existing
Meta secret locally only when inference is intended. The automatic release runs
the same migrations remotely before uploading committed and pushed code. Verify
that the account permits Muse Spark Chat Completions function tools and structured
JSON output; no key or permission changes were made for this implementation.

Check the automatic build status, source SHA/version tag, existing DB/Workflow
bindings, and pending migration list after an authorized push. With fictional
data, functional verification should cover recall after the recent window has
expired, search by alternate words, date/cursor filtering, source excerpts and
offsets, separate owners/contacts, replayed maintenance, conflicting updates,
contact deletion, and memory/provider failures. Do not print facts, quotes, tool
arguments/results, or provider bodies in logs. Sanitized events are
`chat_memory_deferred` and `chat_retrieval_failed`.

The schema is additive and compatible with the prior Worker. Code rollback keeps
memories, cursor state, search indexes, and synchronization triggers intact; it
does not delete data or reverse source-commit tagging. Keep the existing Workflow
class/binding for active instances; do not drop these tables while newer instances
may still reference them. Staging must use a separate D1/Worker/Workflow and secrets.

Static TypeScript/binding checks, SQL compilation with EXPLAIN against an empty
migrated SQLite schema, and whitespace checks were performed locally.
No application builds, runtime tests, paid inference, remote migrations, push, or
deployment were performed for this change. Real Standard/Contributor tool and
structured-output behavior and independent-account installation remain unverified.


## Contact presence

Presence reuses the required D1 `DB`, `CHAT_WORKFLOW`, and minute Cron Trigger;
no additional Cloudflare service, secret, account permission, or resource is
needed. Independent installations follow the existing D1/Workflow provisioning
order and bindings above. Migration `0008_contact_presence.sql` creates the
owner-scoped table, expiry index, and turn triggers. Migration
`0009_delayed_contact_connection.sql` replaces those triggers so queued work
preserves presence until the Workflow connects the agent after a durable
three-second wait. Both run before the automatic release.
Use `npm run db:migrate:local` for local development. Commit and push to let the
existing release pipeline apply the same migration remotely and publish code.
Do not apply it manually to production for an unpushed implementation.

The Workflow persists Typing only for generation, then an idle deadline 30 seconds
after completion/failure through D1 triggers. A durable sleep expires the lease;
the minute Cron and history reads also reconcile overdue records. Queued/running
work has a 15-minute safety lease, refreshed at each generation attempt. Details,
API fields, polling costs/latency, and failure behavior are in [chats](chats.md#persisted-contact-presence).
Cron still sweeps presence with no connected clients. Expiry is conditional on the
current deadline so late old jobs cannot override newer activity.

Verification after an authorized release: check migrations 0008/0009 and unchanged D1,
Workflow/Cron bindings; with a fictitious contact confirm accepted work changes
the existing Offline/Last seen state persists briefly before
Online → Typing → Online → Offline and lastSeenAt reflects the deadline, including
with iOS closed. Reopen the chat and confirm it reads that same server state.
Sending a second message during the idle window must survive the first job's
expiry. Cross-owner requests must still return 404. This functional verification,
remote migration, release, and device appearance have not been performed locally.
Rollback code can leave the additive table/triggers in place; older clients ignore
the new JSON fields. Stop Workflow/Cron writers before any deliberate destructive
schema rollback. Do not drop contacts or chat history to undo presence.


### Chat visit and draft activity leases

Apply migration `0010_chat_visits.sql` after 0008/0009. It adds `chat_visit` and
updates the presence trigger to compose reply/visit leases atomically. The same
`wildcard-chat` Workflow and `CHAT_WORKFLOW` binding now accept a `kind: visit`
branch as well as existing turn/attempt jobs. The versioned Wrangler configuration
already provisions everything required: D1, the Workflow and the minute Cron.
No new resource, secret or permission is required; visit activity does not require
Meta inference. Keep generation payload compatibility when upgrading or rolling
back while jobs exist. Worker types derive the union payload from the exported
Workflow entry point; regenerate them with the existing typecheck command.

For local setup, run `npm run db:migrate:local` then `npm run dev` with the existing
bindings. For production use commit/push and the automatic migration/release
pipeline. Do not manually deploy. The Cron expires presence, removes visit leases
older than one day and recovers bounded pending visit dispatch. Active visit jobs
sleep/check at current deadlines; prolonged drafting eventually relies on Cron
and request reconciliation after 120 cycles. Read [visit behavior](chats.md#visiting-a-chat-and-composing-a-draft)
for endpoint limits, lifecycle, timing, activity metadata and failure handling.

After an authorized release, verify 0010 applied and the same Workflow/Cron bindings
remain. Use fictitious data to check open → delayed Online → idle Offline without
sending, edits extending Online, unchanged open keyboards expiring, leaving before
connection, background/termination expiry, multiple sessions, and overlap with
real generation. Visit activity must never show agent Typing or create a turn,
model request or push. These functional/device checks have not been run locally.
Rollback must account for active `kind: visit` jobs: older pre-visit code does not
understand them. Drain/terminate visit jobs first or retain the compatible branch;
leave additive tables in place, and restore compatible turn triggers deliberately.
No schema rollback is needed for the existing iOS client, which sends no activity.


## Bundled message and notification sounds

The message-sound update uses the existing APNs integration and resources. Include
all three `apps/ios/Wildcard/Sounds/*.wav` files in an independent installation;
the synchronized Xcode app group packages them automatically. Install the updated
client before releasing the API payload that names the flute WAV in `aps.sound`.
Release the API only through an authorized commit/push and verify its automatic
build/source SHA. No resource provisioning, migration, new secret, or signing
capability is required. See [message sound behavior and device verification](notifications.md#message-sounds-october-27-2026)
for filenames, compatibility, rollback, and checks that remain unverified.

## Scheduled contact messages

[Schedules](schedules.md) reuse the existing D1, `CHAT_WORKFLOW` / `wildcard-chat`,
minute Cron Trigger, Meta provider key, and optional APNs delivery. Independent
installations need no additional resource, binding, secret, dependency, or
Cloudflare permission. Follow the existing provisioning order and separate
Worker/D1/Workflow/iOS origin for staging.

Migration `0011_contact_schedules.sql` adds schedule and mutation-receipt tables,
nullable chat columns, occurrence indexes, and cursor/cancellation triggers.
`npm run auth:setup:local` applies it locally; an authorized commit/push release
applies it remotely before publishing. Never apply a manual deployment.
The exported handler now dispatches due schedules from the existing minute Cron;
the existing chat recovery path retries durable jobs whose Workflow dispatch fails.
APNs is optional: generated messages still persist without enrolled devices.

Verification after an authorized release: confirm migration 0011, unchanged
DB/Workflow/Cron bindings, automatic source SHA/version tag, and the authenticated
schedule list/cancellation endpoints. Use fictitious tasks to verify future and
interval scheduling, no duplicate occurrences, editing/cancelling pending work,
contact deletion, time zones, and app-closed notifications. Real-time behavior
and real provider tool calls have not been validated in this implementation turn;
only static checks were performed. No remote migration or release was performed.

Rollback must retain the additive tables/columns and existing Workflow class.
Do not drop schedule tables while chat foreign keys/Workflow instances refer to
them. Before rolling back to code without cancellation checks, cancel active
schedules and settle/stop pending scheduled Workflow jobs and push deliveries;
an older Workflow version cannot enforce this change's cancellation guarantees.
The old Worker does not dispatch new schedules, but already-started Workflows
may continue on their original version. For a temporary pause without data loss,
retain the new schema and cancellation-aware code and disable only
`dispatchSchedules`; contact chat recovery and push Cron must remain available.


## Private chat attachments

[Chat attachments](attachments.md) reuse the existing private `CONTACT_PHOTOS` R2
binding and bucket under `attachments/`; no public access, extra credentials, or
new service provisioning is required. Independent installations must provision
the existing photo bucket before enabling attachment sends, using the same
`npm run infra:photos` setup and account replacements documented above. Migration
`0012_chat_attachments.sql` adds nullable turn metadata, an expression index,
and an orphan-object registry. Apply locally through the normal D1 migration
command; production applies it through the automatic commit/push release pipeline.
The existing minute Cron now also removes up to 20 unreferenced objects older
than 24 hours, retrying failures later; contact deletion revokes download access
immediately, with deferred byte cleanup. Keep this handler enabled in independent
accounts. The configured Meta model/data policy applies to file inference too.

Verification requires installing the new iOS app plus releasing the backend. Use
fictional images/PDFs, inspect private retrieval, retries, and deferred cleanup as
described in the attachment guide. Real inference, device previews, and remote
cleanup remain unverified. The schema is additive: code rollback must preserve
attachment metadata and R2 objects, and restore compatible Cron cleanup.

## Shared-contact migration

[Shared contacts](sharing.md) reuse all existing required resources: D1 `DB`,
`CHAT_WORKFLOW`/`ChatWorkflow`, the minute Cron, private R2 `CONTACT_PHOTOS`, auth,
and Meta configuration. APNs remains optional for push delivery. There are no new
resources, bindings, provisioning credentials, secrets, or account permissions.
The existing `migrations_dir` automatically includes `0013_shared_contacts.sql`.

Apply migrations 0001–0012 first, then 0013, using `npm run db:migrate:local` for
local development. Migration 0013 creates `contact_agent`, `contact_invite`,
`agent_attention`, and `agent_presence`; adds agent membership/Contributor consent
columns to contacts and nullable `read_at` to turns; backfills identities, presence,
active attention claims, and historical reads; and replaces the old presence
triggers. Existing conversation IDs, private history, schedules, read watermarks,
attachments, and push records remain in place. Metadata projection and exclusive
processing admission are enforced by triggers. The old `contact_presence` table
is retained but is no longer authoritative for the new Worker.

Presence responses project `typing` to `online` for conversations other than the
one holding the agent's attention for a matching running turn/attempt. This uses
the existing `agent_presence`, `agent_attention`, `contact`, and `chat_turn`
tables; no new resource, configuration, secret, migration, or client schema is
needed. Release this API change through the same commit/push automatic pipeline.
The global connectivity, last-seen/expiry storage, and queue are preserved.

Use the earlier independent-account creation order and account-specific binding,
origin, model, iOS bundle/team, and optional APNs replacements. Prefer Standard
unless the operator and every participant explicitly accept Contributor data use.
The share/join flow discloses that model and persists member consent; existing
members without Contributor consent cannot generate with that model or contribute
memories to its inputs until accepting a new invitation. No secrets belong in
codes, logs, source, or documentation. Invitation digests live only in D1; codes
are cryptographically random, expiring, one-use capabilities shared by the user.

For production, commit and push the complete intended migration, Worker, iOS,
and documentation changes, then let Workers Builds apply the remote migration
and publish automatically. Verify its final status and source SHA tag against
the pushed commit, no pending D1 migrations, and DB/Workflow/R2 bindings by name.
Never deploy manually. Avoid initiating work during the migration/release window:
the database attention guard may reject an old-code Workflow accepted after
backfill but before the new Worker is published; it will surface as a failed
turn that can be retried with the new version. Existing pre-migration active
turns receive claims and cannot overlap new participant generation. Do not enable
sharing until the matching Worker release is verified. Install the updated iOS
app with Xcode to expose invitation, consent, access management, and real read
receipts. Older installed clients lack consent/access management and their
creator-deletion confirmation does not explain shared deletion; update clients
before using sharing.

Rollback to an older Worker is not safe once sharing is enabled: it does not
understand agent-wide ownership, metadata, consent, or attention. Keep the additive
schema and use a forward fix or an explicitly sharing-aware rollback version.
Do not drop/rebuild tables or restore D1 independently of live Workflows, private
conversations, or R2; a restore does not recall notifications/provider data.
Attention has no unsafe time-based expiry. Recovery retains a claim until the
recorded Workflow is confirmed terminal; a paused or unqueryable Workflow can
block the agent and requires inspection before intervention. Do not delete
attention rows to bypass an unconfirmed running instance.

Local validation for this change is static: TypeScript and Swift type checks,
empty-schema SQLite migration/foreign-key diagnostics, SQL preparation, and
whitespace checks. No runtime tests, builds, inference, remote migration, push,
or deployment were performed. Before end-to-end claims, use authorized fictional
accounts to verify invitation consumption races, membership authorization, shared
memory attribution/recall, canonical photo/presence, queued versus running reads,
exclusive processing across ordinary/scheduled messages, private notifications
and badge totals, and cancellation/removal/recovery during generation. Verify
that a missing/paused instance status never unlocks concurrent attention.

## Directed invitations by account email

Migration `0014_directed_contact_invitations.sql` extends the existing D1
`contact_invite` table with an optional recipient-account foreign key, an inbox
index, and a unique pending request per agent/recipient. Apply it after 0013 via
`npm run db:migrate:local` for local work; the existing automatic commit/push
release applies the same migration remotely before publishing the Worker.
Existing codes retain null recipients and remain usable through their prior flow.
No new resource, binding, account permission, secret, email provider, SMTP service,
or provisioning step is required. The existing authenticated `user` table supplies
exact email lookup and resolves the immutable recipient account ID. Emails are
trimmed and compared case-insensitively; mailbox ownership verification remains
unconfigured. This identifies an account, not a verified mailbox owner.

The updated iOS client offers email-based in-app requests, a recipient inbox with
accept/decline and consent, a toolbar indicator, and foreground refresh bounded
to one fetch every 15 seconds plus explicit refresh/foreground entry. The earlier
invitation-code flow remains optional. No email or invitation APNs alert is sent.
The existing reply push devices, outbox, schedules, memory, and attention queue
are used only after membership is accepted and normal chat work begins.

Before production use, commit/push the intended changes, wait for Workers Builds,
and verify its source SHA, live Worker, and no unapplied D1 migrations. Install
the updated app with Xcode. No manual deployment is permitted. Keep the additive
recipient column and indexes if fixing/rolling back code; use a sharing-aware
Worker that enforces recipient binding on preview, insertion, consumption, and
acceptance retry. An older iOS client cannot display directed requests, but can
continue using invitation codes. Do not remove recipient bindings or convert
pending requests into transferable capabilities to work around client versioning.

Static checks for this extension: TypeScript/Swift types, all 14 migrations on an
empty SQLite schema with foreign keys enabled, 21 sharing queries prepared with
EXPLAIN, and whitespace validation. No runtime tests, builds, production account
lookup, real invitation, remote migration, inference, or release were performed.
Functional verification should use authorized fictional accounts for email case
matching, nonexistent/self/already-authorized recipients, duplicate/expired
requests, isolation from third accounts, accept/decline/revoke races, membership
limits, consent, and iOS refresh/account switching. Never log account emails,
invitation codes, session tokens, or chat contents for verification.

## Account profile storage

Account editing uses the existing D1 database and private `CONTACT_PHOTOS` R2
bucket. Apply `0015_account_photos.sql` after the existing migrations: it adds
nullable `user.photo_version`. Local installations use `npm run auth:setup:local`
or `npm run db:migrate:local`; production applies it before publishing through
the existing automatic commit/push release. No manual deployment is required.
No new binding, resource, permission, secret, or account-specific setting is added.
Independent installations follow the existing D1 and private R2 provisioning
steps; staging must use separate resources. Account images use
`users/<user>/<version>.jpg`, while contact images retain their existing prefix.

Verify with fictional accounts: edit a name, upload/crop/replace/remove a photo,
reopen Account, sign out/in, and confirm another account cannot read the photo.
These functional and device checks have not been performed for this change.
See [account profile behavior](profile-photos.md#account-profile). Back up D1
metadata with its R2 objects. Roll back code through commit/push while retaining
the additive column and bucket; older code ignores the field. Deleted/replaced
images are not restored by a code rollback. Best-effort object cleanup and the
absence of an orphan sweeper remain unchanged.


## Group conversations

Migration `0016_groups.sql` adds group identity, human membership with explicit
memory/Contributor consent, owned agent membership, directed invitations, shared
message history, reply jobs and grounded memories. The Drizzle schema mirrors the
new tables; the attention-required trigger remains SQL-managed. Provision existing
D1 first, then the existing private photo bucket and Meta/Workflow configuration
as described above. Groups reuse `DB`, `CONTACT_PHOTOS`, `CHAT_WORKFLOW`,
`META_API_KEY`, `META_CHAT_MODEL` and the minute Cron. No new service, secret,
resource permission, dependency or binding is needed. Group photo routes permit
current co-members to read each other's existing profile photos; the consent UI
explains this change in visibility. See [group setup and API](groups.md).

For independent accounts use the existing provisioning scripts, replace the
account-specific Wrangler, iOS API and automatic build connection settings, and
choose Standard unless every member explicitly accepts Contributor data use.
Run `npm run db:migrate:local` for local development after configuring auth; the
standard automatic release applies all D1 migrations before publishing. Source
must be committed and pushed first. Never run a manual deployment. This change
has not been migrated remotely, pushed or released as part of implementation.

After automatic publication, verify its source commit/version and migration state,
then use fictitious accounts for the group checks in the guide. No remote data,
model inference or device verification was used during implementation. Existing
private-chat UUIDs and tables remain compatible; dispatch now considers both job
types under one agent lock. If rolling back, pause new group submissions and let
active group Workflows finish before reverting code. Do not remove additive tables
or change in-flight Workflow payload contracts. Older workers do not recover group
jobs; a compatible forward fix is preferable while jobs are pending. Removing a
member/group does not release an in-flight agent claim early; recovery waits for
Workflow termination. Retain tables on code rollback to preserve stored messages.


### Group media

Migration `0017_group_media.sql` adds nullable `chat_group.photo_version` and
JSON-validated `group_message.attachment_json`. The versioned Drizzle schema mirrors
both. It reuses the private `CONTACT_PHOTOS` bucket for `groups/...` avatars and
`group-attachments/...` files, `DB` for metadata/consent and the attachment-object
registry, the existing minute Cron for orphan file cleanup, and `META_API_KEY` for
both Muse chat file analysis and Muse Voice Transcribe. No provisioning order,
binding, account permission, secret, dependency or provider setting changes are
needed beyond the existing D1 → private R2 → Worker/Workflow setup.

Independent installs follow the existing provisioning and replace account/Worker,
D1, R2, iOS API and automatic build connection values as documented above. Keep
R2 private; file/photo routes authorize current group membership and only owners
can edit group identity. iOS reuses its existing microphone purpose string and
picker/cropper configuration. Local setup applies 0017 via the standard migration
script. Commit/push triggers the automatic release, which applies 0017 before
publishing the compatible code; no manual deployment or migration is needed.

After release verify the pushed source tag, active Worker and migration state,
then use fictitious accounts to exercise the media checks in [groups](groups.md).
No remote migration, file upload, transcription, inference or runtime/device
verification was performed during this implementation. The schema is additive;
retain it during rollback. Old group clients cannot display files and old cleanup
code ignores group references, so do not roll back the attachment cleanup while
group file objects exist. Prefer a forward fix or retain the updated registry
cleanup. Group photo removal is best effort; orphan photos may persist. File
cleanup waits at least 24 hours after registration and deletes only objects with
no remaining private or group message reference. Deleting group metadata does not
retract files/messages already received by a member or data already sent to Meta.
