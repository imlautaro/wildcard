# Working agreements

- Write project code, identifiers, comments, commit messages, source copy, and
  internal documentation in English. Spanish translations in the established
  localization resources and published documentation are required exceptions;
  keep English as the source language. Follow `docs/localization.md`.
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

## Keep related surfaces current

- Treat implementation and its affected translations, documentation, and public
  claims as one change. Before editing, identify the affected surfaces; before
  finishing, review the final diff and search for references to changed names,
  behavior, configuration, and removed features. Apply this to additions, fixes,
  renames, removals, and service changes. Complete related updates in the same
  change without waiting for a separate request.
- Update only surfaces whose content or behavior is affected. An internal refactor
  need not change documentation or marketing when their existing descriptions
  remain accurate. Do not add filler edits, duplicate every technical detail on
  every surface, or turn the marketing site into a feature changelog.

### Localization

- New or changed team-authored interface copy in iOS, web, and the marketing site
  must ship in English and Spanish together, including accessibility labels,
  validation, empty/error states, dialogs, and affected extensions or widgets.
  Reuse the existing localization mechanisms; do not hardcode display copy or
  treat the English fallback as a completed Spanish translation.
- Update `apps/web/i18n/locales/en/` and `es/`,
  `apps/site/i18n/locales/en.json` and `es.json`, and the affected iOS target's
  `.xcstrings` catalogs as applicable. Renames and removals must also update
  references and obsolete entries. Preserve matching placeholders, plural rules,
  locale-aware formatting, and consistent terminology across clients.
- Respect the scope and exclusions in `docs/localization.md`: admin remains
  English only, and user/model content and currently excluded server text do not
  acquire a translation requirement through this rule. Changes to localization
  behavior or scope must update that guide.

### Documentation and infrastructure

- Update the affected feature guides in `docs/`, `docs/web.md`, and README when a
  change makes their behavior, limitations, setup, or links inaccurate. Review
  the corresponding published guides in `apps/docs/content/en/` and `es/` and
  update both languages whenever their coverage is affected. The published site
  includes curated overviews and full reference guides generated from `docs/*.md`.
  Keep the full Spanish translations in `apps/docs/reference/es/` and their source
  SHA-256 entries in `sources.json` current in the same change. Run
  `node scripts/prepare-docs-reference.mjs` to refresh ignored reference pages;
  never edit or commit generated `content/*/6.reference/` files.
- For new, changed, or removed services, bindings, secrets, migrations, release
  inputs, or operational requirements, apply the reproducible infrastructure rule
  above and update affected published setup/operations guides in both languages.
  Include cleanup or upgrade steps when needed; never document secret values.
- Describe implemented behavior and distinguish available functionality from
  experiments, planned work, and unverified behavior. Remove obsolete instructions
  and fix affected links rather than leaving conflicting guidance.

### Marketing

- Review `apps/site` and `docs/site.md` when a change affects an advertised
  capability, core behavior, availability, platform support, privacy/consent
  promise, or installation requirement. Update affected copy, animated scenes,
  examples, links, and metadata in English and Spanish so they match the product
  and feature guides. Remove or revise claims about removed or restricted features.
- A new feature needs marketing changes only when it affects the site's existing
  claims or fits its established scope. Do not advertise planned or unverified
  behavior as available or imply broader permissions than the product grants.

### Completion review

- Check affected locale keys, placeholders, plurals, catalogs, and documentation
  links. When web/site translations change, run the static checker
  `node scripts/check-locales.mjs` (optionally scoped to the affected app).
  Follow the existing validation policy; do not run tests or builds solely because
  this checklist exists or claim visual/device verification from static checks.
- Briefly report related updates and validation in the handoff. If a surface was
  plausibly affected but needed no edit, explain why; disclose any remaining gap
  instead of presenting the change as complete. Keep this review proportional to
  the task rather than repeating a full checklist for every change.

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
