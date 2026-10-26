# Infrastructure

## Current scaffold

The API uses Hono on Cloudflare Workers, with configuration in
`apps/api/wrangler.jsonc`. The native iOS app is independent and has no API origin
configured. The deployment target is a fresh Worker named `wildcard-api`,
connected to the new `imlautaro/wildcard` repository. No database, Workflow, KV
namespace, R2 bucket, runtime secret, or external model service is required.
The archived installation and its data are not reused. There are no migrations or stored server data to preserve or roll back.

The Worker has no routes. All requests return a JSON 404; unexpected application
errors return a generic JSON 500. Error logs contain an event name only, with no
request bodies or credentials.

## Local setup

1. Install Node.js 24 or later and npm. The root `.nvmrc` selects Node.js 24.
2. Run `npm ci` from the repository root to install the locked dependencies.
3. Run `npm run typecheck` to generate runtime/binding types from Wrangler and
   check TypeScript. `apps/api/worker-configuration.d.ts` is generated and ignored.
4. Run `npm run dev`; Wrangler runs locally on port 8787 without Cloudflare login
   or remote bindings. Visiting any path should return HTTP 404 and
   `{"error":"Not found"}`.
5. When desired, `npm run build` bundles the Worker locally into ignored `dist/`
   using `--dry-run`; it does not create or publish a remote Worker.

No environment variables or secrets are required. Future local credentials belong
in ignored `apps/api/.dev.vars`; document their names and provide a safe example
when a feature needs them. Add bindings in the versioned Wrangler configuration
and regenerate types; do not hand-write the generated `Env` interface.

## Automatic hosting in an independent account

Reproduce the Workers Builds integration as follows:

1. Choose a Cloudflare account and an available Worker name. Replace
   `name: wildcard-api` in Wrangler if needed. Replace the installation-specific `account_id` with your own account ID.
   The current installation targets account `a9e3a97d08ec5023cbe6b97a1a25fec6` and
   origin `https://wildcard-api.imlautaro.workers.dev`. No database ID or credential
   is stored in the configuration. Keep future staging resources separate.
2. With deployment authorization, connect the repository to Cloudflare Workers
   Builds using its GitHub integration. Grant access to this repository and select
   `main` as the production branch. Use the repository root as the build root.
3. Select a build credential scoped to the chosen account with Workers Scripts
   edit permissions and account read access. No D1, KV, R2, or external API
   permissions are needed. Select the account explicitly in the build settings
   (`CLOUDFLARE_ACCOUNT_ID` if the credential has access to multiple accounts).
   Keep the deployment token in Cloudflare's credential configuration, never Git.
4. Use `npm ci && npm run typecheck` as the build command. Configure
   `npm run release:ci` only as the automatic deployment command in Workers Builds. Do not run it locally. Disable preview
   branch deployments until a separate staging setup is deliberately configured.
5. Commit and push intended changes. Inspect the automatically triggered build,
   confirm its source SHA matches the pushed commit, and verify the deployed
   Worker's version metadata against that commit. The public origin will be
   `https://<worker-name>.<account-subdomain>.workers.dev`; every path should
   currently return the JSON 404 described above. A failed build must be repaired
   in the automatic workflow, not bypassed by manual deployment.

The configuration enables the stable `workers.dev` route, disables version preview
URLs, and enables Workers Logs and Traces with sampling rates of 1 and 0.01.
Workers plan quotas and observability retention/usage limits apply; this scaffold
does not enable billing or change an account plan. No paid storage or model
service is required. Review the account's limits before hosting public traffic.

The release command is implemented in `scripts/release-worker.mjs`. It requires
`WORKERS_CI=1`, `WORKERS_CI_BRANCH=main`, an unmodified checkout, and
`WORKERS_CI_COMMIT_SHA` matching Git HEAD. Workers Builds injects these system
variables; do not set them locally to bypass the checks. A fork may set the build
variable `WILDCARD_PRODUCTION_BRANCH` if it chooses another production branch.
The release tags the Worker version with the complete source SHA. If the first
repository-connection build lacks source metadata, it intentionally stops; a
subsequent Git push triggers a build with commit metadata. Do not manually deploy.

The integration uses an existing Workers Builds deployment credential selected in
Cloudflare. It is not copied into the repository or runtime. The API currently
needs no runtime secrets. Future build-time credentials and runtime secrets must
be documented separately;
there is no secret-transfer mechanism yet. Rollback through Cloudflare must target
a previously pushed version, and resource/data compatibility must be reviewed
when persistence is introduced. There is no staging installation at present.

## Verification status

Static TypeScript validation, generated Worker types, the Xcode project plist,
and byte-for-byte preservation of tracked iOS files during relocation were checked.
No local builds or tests were run. Cloudflare Workers Builds runs the configured
installation, type check, and release remotely.

On October 26, 2026, Workers Builds was connected to `imlautaro/wildcard`
(repository ID `1434657598`), production branch `main`, root `/`, with preview
builds disabled. The selected existing credential is
`Workers Builds - 2026-05-27 10:54`. No new token or runtime secret was created.
The connection build uses the commands documented above; pushes trigger subsequent
automatic releases.

Independent-account setup and installed iOS behavior have not been verified.
Deployment completion must be confirmed from the automatic build and matching
version tag before reporting the public API as live. Follow the development checks
above when validating a fresh installation; local type checking alone does not
confirm a production release.

## References

- [Hono on Cloudflare Workers](https://hono.dev/docs/getting-started/cloudflare-workers)
- [Workers TypeScript and generated types](https://developers.cloudflare.com/workers/languages/typescript/)
- [Workers Builds Git integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/)
- [Workers configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
