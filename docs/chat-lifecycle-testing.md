# Lifecycle regression validation

On October 29, 2026, `npm run test:lifecycle` passed **38 tests, zero failures**.
`npm run typecheck:lifecycle` also passed for the application and the fixture Worker.
The suite uses the real Hono routes, signed fictional sessions, every ordered D1
migration, and the real cleanup/dispatch/memory code inside local workerd through
Miniflare. D1, R2 and Workflow bindings are local implementations; the tests do not
replace SQL with canned responses or replace successful Workflow deletion with a
no-op. Sleeping, paused and completed fixture instances execute a checkpoint
before their stored state is deleted.

On October 30, 2026, three additional account-cleanup regression cases were
added, covering the actual admin route's roster/email checks and pending response,
shared/private data removal, R2/Workflow failure recovery, unpublished generation
assets, and onboarding/generation creation racing account deletion (with and
without a lost acknowledgement). The fixture exposes AdminAPI only with a fixed
fictional super admin and uses no production credentials. The fixture/application
types and JavaScript syntax pass static checks; these added runtime cases have
**not been run**. The 38-test result above is historical and does not validate
migration 0069. The Nuxt DELETE body fix additionally needs verification through
the deployed adapter or an explicitly authorized local production-adapter run.

## Reproduce

From the repository root, with the supported Node.js version and npm:

```sh
npm ci
npm run typecheck:lifecycle
npm run test:lifecycle
```

Validation used Node.js 26.13.0, the locked Miniflare 5.20261023.0-beta and esbuild
0.28.2 versions already supplied by the project's Wrangler toolchain. They are
explicit API development dependencies so the runner does not depend on incidental
transitive package resolution. No Cloudflare login, project secret, provider key,
real account or persistent database is required.

The runner bundles `apps/api/tests/lifecycle.worker.ts` in memory and creates
unique temporary D1/R2/Workflow persistence directories under the OS temporary
folder. A second temporary database checks the upgrade from migration 0063.
Fictional identities use `example.test`; a fixed local-only signing secret creates
fixture sessions. External outbound fetches return 503. `finally`/test teardown
disposes the runtime and removes temporary storage. The fixture Worker is not
referenced by any Wrangler configuration and is never a production entrypoint.
A sandbox may require permission to bind a loopback port; that does not require
remote Cloudflare access.

## Bugs reproduced and corrected

| Regression | Reproduced behavior | Correction |
| --- | --- | --- |
| Scheduled private history | Clear returned 500 and rolled back because `chat_turn.schedule_id` still referenced a schedule deleted earlier in the D1 batch. | Delete private turns before schedules in the same atomic batch. |
| Generated image ownership | A generated-only clear reported complete although its delayed object deletion job belonged to the deleted turn ID. | Migration 0064 captures conversation scope before cascades, uses stored attachment keys and repairs recoverable queued scopes from the upload registry. |
| Lost Workflow create acknowledgement | A clear drained the original job, then a successful remote create whose response was lost left an unregistered instance running. | Recheck registration on the failure path too; re-enqueue and delete late instances, including initiative jobs. Retain the original conversation scope for failed late deletion. |
| Failure overwriting a newer enqueue | An older failed deletion applied backoff to a new revision of that resource's cleanup request. | Compare job revision on failure updates as well as success acknowledgement. |
| Group-derived private results | Group clear erased a private result row but reported complete while that result's private Workflow/media cleanup remained pending. | Durable `resource_cleanup_scope` links associate jobs with both conversations. Scoped cleanup, pending state and clear locks use every associated scope; job deletion cascades links. |
| Isolated group memory | Enabling isolation on a group with extracted memories failed with “9 columns but 10 values” after the shared table gained embeddings. | Recreate the isolation trigger with explicit columns, preserving local memory's exclusion of embeddings. |

Migration `0064_lifecycle_cleanup_guards.sql` is additive. Published migration 0063
and the earlier memory migration remain unchanged. These corrections apply to
both iOS and web through their existing API contract; no client-only workaround
or permission relaxation is involved.

## Exercised behavior

- Private/group clearing with memory kept or removed; actual subsequent memory
  reads, shared-memory and Contributor consent, connector isolation, author
  removal, retention bounds, and preservation of unrelated conversations.
- Creator versus member deletion, group owner/member/outsider authorization,
  archive isolation/reversal, and preservation of read watermarks.
- Cascades through messages, FTS, facts/self memory and embeddings, generated image
  indexes/receipts, schedules, tasks/dependencies/work, monitors/checks, research,
  Markdown documents/revisions, mini apps/state/actions, mutation receipts, MCP
  execution receipts, native proposals/grants and push deliveries.
- Registered image/voice/generated objects, late writes after the first sweep,
  still-referenced objects, failed R2 deletion, failed prefix listing, and a
  205-object prefix requiring multiple pages without skipped keys.
- Workflow deletion failures followed by recovery; attention/clear locks;
  checkpointed sleeping, paused and completed instances; private/group generation
  checkpoints; saved onboarding identity cleanup and obsolete portraits.
- Success/failure of old cleanup revisions racing newer enqueues; capped backoff
  after 50 failures without dropping the job; duplicate clear replay after new
  history; stale sends; simultaneous clears with different memory choices.
- Private/group dispatch and initiative creation racing source removal, including
  lost acknowledgements, failed deletion of the late instance, and subsequent
  recovery under its original conversation.
- Group-derived private media/workflows and simultaneous clears holding/releasing
  both conversation locks. Queue-drain assertions include cleanup links and
  `PRAGMA foreign_key_check`.
- Upgrade of a populated 0063 outbox to 0064 without resetting retry counts,
  revision numbers or retry deadlines.

Faults are injected only in the fixture Worker as binding proxies around actual
local R2/Workflow calls. Expected `resource_cleanup_deferred` and
`initiative_dispatch_deferred` logs during failure cases do not indicate suite
failure. To avoid waiting five minutes/an hour, the runner first asserts the
stored retry deadlines, then explicitly makes fixture jobs due for the next
cleanup pass. It checks the production cleanup consumer rather than duplicating
its deletion logic in the test.

## Limits

This is executable local integration evidence, not verification of globally
running Cloudflare services. Cloudflare describes
[local Workflows as emulated](https://developers.cloudflare.com/workflows/build/local-development/)
and documents [Miniflare testing](https://developers.cloudflare.com/workers/testing/miniflare/).
The suite does not make paid model calls, deliver APNs, run native alarms, drive
iOS/Nuxt UI, or exercise provider/network failures against production. It invokes
the same cleanup function used by Cron with controlled due jobs; it does not wait
for real cloud Cron scheduling. Device/browser cache/viewer behavior, production
Workflows/R2 consistency and any existing production leftovers require separate
verification. No real data was read, modified or deleted for these tests.
