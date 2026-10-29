# Working agreements

- Write all project code, identifiers, team-authored strings, documentation,
  comments, and commit messages in English.
- Keep the native app in `apps/ios`, the Nuxt web app in `apps/web`, and the Worker
  API in `apps/api`. JavaScript dependencies use npm workspaces and the root lockfile.
- Every requested product change must be implemented in both the iOS app
  (`apps/ios`) and the web app (`apps/web`) in the same change, with matching
  behavior, copy, and caching rules, and with both clients' guides updated
  (`docs/web.md` plus the affected feature guides). Ship a change to only one client
  only when the user explicitly scopes it that way, or when a platform limitation
  prevents it; document that limitation in the affected guide and in `docs/web.md`
  (for example, APNs push).
- Do not copy implementation, assets, configuration, credentials, or Git history
  from the archived project. Implement new features in this repository.
- Do not run tests or builds unless the user asks. Static validation is allowed.
- Every service or infrastructure change must include versioned configuration and
  updated `docs/infrastructure.md`, README links, and affected setup guides so an
  independent account can reproduce the complete project. Document prerequisites,
  permissions, resource creation order, bindings, account-specific replacements,
  secrets without values, local development, migrations, automatic release,
  verification, and rollback/data compatibility as applicable. Distinguish required
  and optional resources and production from staging; state unverified steps.
- Never commit credentials, generated files, or local Xcode user settings.
- Production releases must use automatic deployment from committed and pushed
  source. Never run a manual deployment. Verify the automatic release and its
  source commit; investigate failures instead of bypassing the pipeline.

## Cache by default

- Design every network-backed feature with a session-owned cache before wiring
  its views. Reuse loaded data synchronously on navigation, including empty results;
  reserve blocking loaders for the first load. Revalidate in the background and
  keep usable content visible through transient failures and cancellation.
- Reuse the existing conversation stores, `NavigationSnapshotCache` for secondary
  resource snapshots, and `PrivateImageCache` for private images. Do not introduce
  view-local downloads or a parallel image cache. Image keys must include account
  isolation, access context, resource identity, and a version or immutable ID.
- Document freshness, explicit refresh, mutation updates/invalidation, request
  deduplication, stale-response rejection, pagination, memory/disk budgets and
  eviction. Preserve pending submissions and idempotency IDs across navigation.
- Invalidate affected data on deletion, confirmed access loss and account changes;
  reject late responses. Cached permissions never replace server authorization.
  Persist private data only with an explicit retention/protection decision; use
  the existing protected image disk cache for image bytes.
- Include cache behavior and device verification steps in the affected feature
  guide and `docs/caching.md`. Any exception must document why caching is unsuitable.
  Check reopen/back navigation, empty states, refresh, offline/failure recovery,
  mutations, access revocation, and account switching within the authorized
  validation scope. Do not claim device behavior from static checks alone.
