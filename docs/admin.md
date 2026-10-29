# Super admin panel

`apps/admin` is a Nuxt 4 SPA for Wildcard's operators, served by its own Worker,
`wildcard-admin`, separate from the web app. Super admins can:

- open or close new account registration;
- list and search every account, with its contact, agent and group counts, join
  date and approximate last activity;
- delete an account and all of its data;
- turn runtime flags on or off, with no release needed;
- see recent admin actions.

It uses the web app's Material 3 tokens, Manrope, Material Symbols and press
ripple. Navigation is a Material 3 navigation rail, which becomes a bottom
navigation bar below 720 px.

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
| DELETE | `/api/v1/admin/users/:id` | Body `{ "email": "<the account's email>" }`. Returns `{ deleted, storage: "complete" \| "partial" }` |
| GET | `/api/v1/admin/settings` | Every declared setting with its value, default and last change |
| PUT | `/api/v1/admin/settings/:key` | Body `{ "value": true \| false }`. Saves the value and records an event |

User rows never include password hashes, tokens or session metadata. "Contacts"
counts the account's conversations (`contact` rows). "Agents" counts the contacts
it created (`contact_agent`), including shared ones. "Last seen" is the newest
session `updated_at`. Sessions refresh at most once a day, so it is accurate to
about a day.

## Deleting an account

The dialog asks the operator to retype the account's email, and the API checks
it again. The API then:

1. Reads the account's queued or running chat workflows and the groups it owns.
2. In one D1 batch, records an `admin_event` and deletes the `user` row. Foreign keys
   cascade through sessions, credentials, contacts, chat turns, memories, schedules,
   tasks, documents, mini apps, connectors, onboarding and group memberships.
3. Attempts immediate termination of pending private chat workflows. Migration
   0063 also enqueues registered private/group/initiative workflows, generated
   contact jobs and published onboarding-contact checkpoints for durable deletion
   through the [chat lifecycle outbox](chat-lifecycle.md). An account onboarding
   job with no published contacts is still outside that contact-trigger coverage;
   its real behavior after account removal remains unverified.
4. Deletes R2 objects under `users/<id>/`, `contacts/<id>/` and `attachments/<id>/`,
   plus `groups/<group>/` and `group-attachments/<group>/` for groups the account
   owned. If any prefix fails, the response reports `storage: "partial"` and logs
   `admin_user_storage_cleanup_partial`; the account stays deleted. Remaining
   unreferenced chat attachments and generated images are registered in
   `chat_attachment_object`, and `cleanAttachments` removes them after 24 hours.

**Effects on other people.** Groups the account owned are deleted for every member,
along with all their messages. Agents it created disappear for everyone they were
shared with, along with those people's chats with them. Messages it sent in groups
owned by others stay in those groups with no author (`user_id` set to null), but
keep their text and the stored `sender_name`. The dialog states these
consequences. Audit events store only the deleted account's ID and counts, never
its email or name.

The cascade, with a shared agent, an owned group, a membership in another
person's group and a reply to the deleted user's message, was checked on local
workerd D1. There were no foreign-key violations, and the results matched the
list above. R2 cleanup and workflow termination have not been exercised against
real bindings.

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
Changing the search query drops the previous results. Sign-out and session expiry
clear every cache. Nothing is written to browser storage.

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

Static checks only: API, admin and web typechecks, the iOS Swift typecheck, and all
new SQL prepared on local workerd D1, including the cascade above. The panel has
not been built or run, and neither the `AdminAPI` binding nor the R2 cleanup has
been exercised. After the first release, verify the following with a fictional
account:

- a non-roster account sees its ID and gets 403;
- `GET https://wildcard-api…/api/v1/admin/session` returns 404 on the public origin;
- closing registration makes sign-up return 403 on iOS and web while sign-in keeps
  working;
- deleting the fictional account removes its rows and R2 objects, and the event
  appears in Overview.
