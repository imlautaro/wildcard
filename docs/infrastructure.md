# Infrastructure

## Required resources

| Resource | Configuration | Purpose |
| --- | --- | --- |
| Cloudflare Worker | `apps/api/wrangler.jsonc`, `wildcard-api` | Hono API and Better Auth handler |
| Cloudflare D1 | `DB`, `wildcard-db` | Users, hashed passwords, sessions, verification schema, auth rate limits, private contacts, and conversation turns |
| Runtime auth secret | `BETTER_AUTH_SECRET` | Signs cookies and native bearer sessions |
| Cloudflare Workflow | `CHAT_WORKFLOW`, `wildcard-chat`, class `ChatWorkflow` | Durable reply generation |
| Cron Trigger | `* * * * *` in Wrangler | Recover queued dispatch gaps and reconcile terminal workflows |
| Meta Model API | Runtime `META_API_KEY`, model `muse-spark-1.3` | Generate private conversation replies |
| Public origin | `BETTER_AUTH_URL` | Canonical auth origin, separate from the secret |
| Workers Builds | GitHub `imlautaro/wildcard`, `main`, root `/` | Automatic releases from committed and pushed source |

There are no KV, R2, email service, or staging dependencies. Chats require
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
   Obtain your own Meta Model API credential with Muse Spark 1.3 access and add
   `META_API_KEY` as an encrypted secret in Worker Settings → Build → Variables
   and secrets. The build credential must be allowed to create/update Workflows;
   verify its permissions if the first automatic release is rejected.
6. The automatic release applies versioned D1 migrations first, then publishes the
   Worker with an auth secret as described below. There is no manual migration
   requirement for production releases; review each migration before pushing.
7. Replace both iOS `WILDCARD_API_URL` build settings with your public HTTPS origin.
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
