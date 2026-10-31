# Super admin panel

`apps/admin` is a Nuxt 4 SPA for Wildcard's operators, served by its own Worker,
`wildcard-admin`, separate from the web app. Super admins can:

- open or close new account registration;
- list and search every account, with its contact, agent and group counts, join
  date and approximate last activity;
- delete an account and all of its data;
- turn runtime flags on or off, with no release needed;
- see recent admin actions.

Its look comes from the [design system](design-system.md) layer in `packages/ui`,
shared with the web app: tokens, Manrope, Material Symbols, the press ripple and the
`App*` components (`AppTopBar`, `AppListGroup`, `AppSwitch`, `AppSheet`, …).
`apps/admin/app/assets/css/main.css` keeps only the admin shell, the users table and
the overview stats. Navigation is a Material 3 navigation rail, which becomes a
bottom navigation bar below 720 px. Page bars line up with the content column
(`AppTopBar contained`), and account deletion is a basic dialog (`AppSheet` with an
icon) that ignores Escape, backdrop presses and Cancel while the deletion runs.

## Access model

- **Same accounts.** Admins sign in with their normal Wildcard email and
  password. The panel never offers sign-up.
- **Roster by user ID.** Access is granted by the comma-separated
  `SUPER_ADMIN_USER_IDS` var in `apps/api/wrangler.jsonc`. It ships empty, so nobody
  has access until it is set. Emails are unverified (see
  [authentication](authentication.md)), so they never grant access. Changing the
  roster is a reviewed commit and an API release. User IDs are not secrets.
- **First admin.** Sign in to the panel with the account. The panel shows "Not a
  super admin" with that account's user ID and a copy button. Add the ID to the var,
  commit, push, and wait for the automatic API release.
- **Private entrypoint.** Admin routes are served by the API Worker's named
  entrypoint `AdminAPI` (`src/admin/app.ts`). Only a service binding that names
  that entrypoint can reach it; the public `wildcard-api` origin returns 404 for
  `/api/v1/admin/*`. Every admin request still checks the bearer session and
  the roster.
- **Narrow proxy.** The panel's proxy forwards only sign-in, sign-out and
  `/api/v1/admin/*`. It keeps the signed token in its own
  `__Host-wildcard_admin_session` cookie (`HttpOnly`, `Secure`,
  `SameSite=Strict`) and rejects cross-site state changes. Pages are
  `noindex`, cannot be framed, and every response uses `no-store`.
- **Same limits.** Sign-in shares the API's per-IP limits, and account deletion
  is limited to 10 per minute per admin.

A super admin's account is a regular Wildcard session: it expires after seven days
and is revoked by signing out. Super admins can't be deleted from the panel.
Remove the ID from the roster first.

## API

All endpoints require a super admin bearer session and are reachable only through
the `AdminAPI` binding.

| Method | Path | Behavior |
| --- | --- | --- |
| POST | `/api/v1/auth/sign-in/email`, `/api/v1/auth/sign-out` | Better Auth, same limits as the public API |
| GET | `/api/v1/admin/session` | `{ user }`. 401 without a session; 403 `NOT_SUPER_ADMIN` with `userID` for accounts not on the roster |
| GET | `/api/v1/admin/overview` | Totals (accounts, new in 7 days, contacts, groups), registration state, last 20 admin events |
| GET | `/api/v1/admin/users?q=&before=` | 50 accounts per page, newest first. `q` matches name or email; `before` is the previous page's `next` cursor |
| DELETE | `/api/v1/admin/users/:id` | Body `{ "email": "<the account's email>" }`. 202 `{ deleted: true, cleanup: "pending" }`; D1 deletion committed, external cleanup queued |
| GET | `/api/v1/admin/settings` | Every declared setting with its value, default and last change |
| PUT | `/api/v1/admin/settings/:key` | Body `{ "value": true \| false }`. Saves the value and records an event |
| GET | `/api/v1/admin/lab/contacts` | The calling admin's own contacts `{ id, name, miniApps, labApps }` for the [mini app lab](#mini-app-lab) |
| POST | `/api/v1/admin/lab/contacts/:id/mini-apps` | Body `{ apps: [{ title, spec }], replace?, timeZone? }`. Imports into the admin's own chat; returns `{ results: [{ title, ok, id?, problems? }] }` |

User rows never include password hashes, tokens or session metadata. "Contacts"
counts the account's conversations (`contact` rows). "Agents" counts the contacts
it created (`contact_agent`), including shared ones. "Last seen" is the newest
session `updated_at`. Sessions refresh at most once a day, so it is accurate to
about a day.

## Deleting an account

The dialog asks the operator to retype the account's email, and the API checks
it again. The API then:

1. In one D1 batch, records a content-free `admin_event` and deletes the `user`
   row. Foreign keys remove sessions, credentials, private contacts/turns/memories,
   schedules, tasks, documents, mini apps, connectors, onboarding and memberships.
2. Migration 0069 registers the account's `users/<id>/`, `contacts/<id>/` and
   `attachments/<id>/` R2 prefixes, plus its onboarding Workflow, in the durable
   `resource_cleanup` outbox **inside that deletion transaction**. This covers
   completed checkpoints and onboarding with no published contact. Existing
   contact/group/turn triggers queue owned group prefixes, all registered chat
   attempts/initiative workflows, generation jobs and generated media keys.
3. Returns 202 `{ deleted: true, cleanup: "pending" }`. The account is gone and its
   sessions are invalid. A `waitUntil` cleanup pass and the minute Cron drain the
   outbox with bounded concurrency, durable backoff and a final R2 sweep. Service
   failures never discard the retry plan. Acceptance does not claim immediate
   external erasure; the panel states that cleanup is queued and retried.

Cleanup calls Workflow **delete**, which stops execution and removes stored
checkpoints, rather than just terminating active instances. Onboarding and contact
creation recheck their parent after dispatch, including ambiguous create results;
if deletion won, the late instance is queued again. Portrait generation rechecks
before and after upload and durably queues a late object. Unpublished generation
portraits also have their planned prefix queued when their job is removed.

**Effects on other people.** Owned groups disappear for every member. Agents the
account created disappear for everyone they were shared with, including those
people's private chats. Migration 0069 removes messages the person authored or
requested in groups owned by others while their attribution still exists; it no
longer leaves their text/name/media behind through `SET NULL`. Other people's
messages and groups remain. Shared lists the person created, tasks they created,
were assigned, or authorized for research/monitoring, and documents they created
or last edited are removed; their revisions in other documents are removed too.
The confirmation dialog discloses these effects. Independent copies or content
another person subsequently incorporated into their own work cannot be recalled.

Audit events retain only IDs and counts, never the target's email/name. Content-free
rate/paid-usage records, platform logs/backups and completed external actions keep
their documented retention; see [chat lifecycle](chat-lifecycle.md). Deleting an
account never deletes shared Cloudflare infrastructure or unrelated users' files.

Migration 0069 requeues known account prefixes/onboarding instances from earlier
`user.delete` audit events whose account is absent. It cannot reconstruct old
attribution already erased by `SET NULL`, unregistered historical Workflow IDs,
or prefixes of previously removed groups that were never durably recorded.

### DELETE proxy correction (October 30, 2026)

Production logs showed `wildcard-admin` canceling the DELETE request because it
would never generate a response, with no corresponding AdminAPI request. The
installed Nitro Cloudflare adapter buffers only POST/PUT/PATCH; H3's raw body
reader then waits on a mock Node stream for DELETE with a body. Both admin and
web proxies now read DELETE from the original
`event.context.cloudflare.request`, including empty requests. Other methods keep
using Nitro's buffered body; local development retains H3's real Node reader.
The email confirmation, same-origin checks and service-binding allowlist remain
in force. Body read errors use the proxy's existing JSON error response.

API/admin/web types and SQL preparation can validate contracts statically; they
cannot prove end-to-end deletion. Regression cases were added for admin admission,
confirmation, D1 cascades, R2/Workflow failure/retry, unpublished onboarding/media,
and generation creation racing deletion (including lost acknowledgements). They
have not been executed for this change. Production deletion was not retried and
no account was removed during diagnosis. Verify with fictional data after release.

## Runtime settings and feature flags

Settings live in the D1 table `app_setting` (migration 0059). Each key is declared
in `apps/api/src/admin/settings.ts` with a label, description and default; a key
without a stored row uses its default. Values are booleans. `readSetting` reads D1
on every call, with no isolate cache, so a change applies to the next API request
without a release.

| Key | Default | Effect |
| --- | --- | --- |
| `registration_enabled` | `true` | When off, `POST /api/v1/auth/sign-up/email` returns 403 `REGISTRATION_CLOSED`, after the per-IP admission check. Sign-in is unaffected. iOS and web show "New accounts are not being accepted right now. Existing accounts can still sign in." |
| `voice_messages_enabled` | `false` | Contacts may reply with ElevenLabs voice messages and contact details show the Voice section. Takes effect only when `ELEVENLABS_API_KEY` is set. Delivered to clients as `features.voiceMessages` on `GET /me`. People can always send voice messages. See [voice messages](voice.md). |

To add a flag, add a definition, read it with `readSetting` where it matters, and
document it here. The panel lists it automatically. A flag that changes client behavior needs a delivery path: `GET /me` returns
`features` (currently `voiceMessages`), which both clients already revalidate. `WEB_RESEARCH_ENABLED` and
`SEMANTIC_MEMORY_ENABLED` are still Wrangler vars that require a release.

## Panel caching

`composables/useAdmin.ts` holds session-owned in-memory caches for the overview,
settings and the current user search. Navigating back shows the cached data at
once and revalidates it in the background. A transient failure keeps cached data
visible; other errors appear in a banner. Each cache has a revision counter that
rejects late responses after a newer request, a mutation, or a sign-out. Deleting
an account removes its row and refreshes the overview. Saving a setting replaces
the settings list with the server's response and refreshes the overview.
Changing the search query drops the previous results. The lab's contact list is cached the same way; an import revalidates it and the overview. Sign-out and session expiry
clear every cache. Nothing is written to browser storage.

## Mini app lab

**Lab** (`/mini-apps`) imports a bundle of generated mini app specs into one of
**your own** chats, so you can try them on a device from Contact → Mini apps
instead of asking a contact for each one. It exists to evaluate and improve the
mini app generator (`scripts/checks/mini-app-eval.mjs` writes the bundles).

- Only the calling admin's own `contact` rows are listed or written; there is no
  way to target another account.
- Each app goes through the same parsing and offline verification as
  `create_mini_app` (`prepareMiniApp`, in the browser's time zone) and must be
  state-only: `mcp` steps and remote actions are rejected, so nothing needs review
  and apps are enabled on import.
- The per-chat cap of 20 still applies and is re-checked inside each insert. Use
  two contacts for larger sets. **Replace previous lab apps** deletes only that
  chat's `lab:%` apps (with their saved state, via cascade) in the same batch.
- Rows use `lab:<uuid>` ids and no `turn_id`, so no chat bubble shows their card;
  they appear in the Mini apps list (the first bundle entry first) and in Updates
  like any app. Clearing or deleting the chat removes them.
- Each import records a `mini_app.lab_import` admin event with counts. Limit: 10
  imports per admin per minute, 1 MB per request.
- No migration, binding or secret. It is admin-only tooling, so iOS and the web app
  have no changes; they show lab apps through the existing mini app routes.

## Local development

`wrangler dev` cannot serve a named entrypoint over HTTP. To use the panel locally,
add `ADMIN_LOCAL_ROUTES=true` to the ignored `apps/api/.dev.vars`. The public app
then also mounts the admin routes. Never set this in `wrangler.jsonc`. Set
`SUPER_ADMIN_USER_IDS` for local testing in `.dev.vars` too, then:

```sh
npm run dev           # API on http://localhost:8787
npm run dev:admin     # panel on http://localhost:3001
npm run typecheck:admin
```

Infrastructure, release and rollback steps are in
[infrastructure](infrastructure.md#admin-worker).

## Verification status

The earlier panel validation predates the October 30 correction above. Current
static checks do not establish runtime deletion or external erasure. After the
automatic release, verify the following with a fictional account:

- a non-roster account sees its ID and gets 403;
- `GET https://wildcard-api…/api/v1/admin/session` returns 404 on the public origin;
- closing registration makes sign-up return 403 on iOS and web while sign-in keeps
  working;
- deleting the fictional account removes its rows and R2 objects, and the event
  appears in Overview.
