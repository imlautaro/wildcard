# Working agreements

- Write all project code, identifiers, team-authored strings, documentation,
  comments, and commit messages in English.
- Keep the native app in `apps/ios` and the Worker API in `apps/api`. JavaScript
  dependencies use npm workspaces and the root lockfile.
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
