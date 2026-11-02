# Email and password authentication

The API uses Better Auth 1.7.13, the Drizzle SQLite adapter, and Cloudflare D1.
The native client stores a signed bearer session in Keychain. This is a new
implementation in this repository; the archived installation and its data are
not used.

## API contract

All paths are relative to the configured API origin:

| Method | Path | Body / behavior |
| --- | --- | --- |
| POST | `/api/v1/auth/sign-up/email` | `{ "name": "New member", "email": "demo@example.com", "password": "a-long-example-password" }`; starts required onboarding |
| POST | `/api/v1/auth/sign-in/email` | `{ "email": "demo@example.com", "password": "a-long-example-password" }` |
| GET | `/api/v1/auth/get-session` | Current session or null; accepts signed bearer authentication |
| POST | `/api/v1/auth/sign-out` | `{}`; revokes the current session |
| GET | `/api/v1/me` | Signed bearer required; returns `{ "user": { "id", "name", "email", "emailVerified" } }` or HTTP 401 |

Successful registration/sign-in returns the user in JSON and a signed session in
`set-auth-token`. Native clients must save that header, not the unsigned token in
the JSON response, and send it unchanged as `Authorization: Bearer <token>`.
Cookies are disabled in the iOS client's ephemeral URLSession. The API requires
signed bearer tokens, uses database-backed sessions, and disables session cookie
caching so revocation is checked against D1.

Only the auth routes listed above are exposed. Password change/reset, email
verification, sign-in OAuth, account sharing, and account deletion are not configured.
Passwords must contain 8–128 characters and are hashed by Better Auth's password
implementation; plaintext passwords are never stored. Sessions expire after seven
days and are refreshed after one day of activity. There is no stateless JWT or
stateless profile cache in this auth setup. Contact shared memory is documented separately.

**Email addresses are unverified.** Registration does not establish ownership of
an address. Do not use this email as a verified identity or enable private sharing
based solely on it. Email verification and password recovery require a separately
configured delivery service and documented callbacks before they can be offered.
No mail provider, domain, or external account is changed by this feature.

## Abuse controls and privacy

Auth bodies are limited to 16 KiB. Atomic D1 upserts enforce per-minute, per-IP,
per-endpoint fixed-window limits: five sign-ups, ten sign-ins, thirty sign-outs,
and 120 session reads. Only Cloudflare's `CF-Connecting-IP` header is used for
remote client identification; local requests share a fallback bucket. Rate limit
rows use a hashed IP/path/window key, not the raw address. Expired rows are removed
in bounded batches during subsequent auth requests. Limits are shared across
isolates, fail closed on database errors, and return HTTP 429 with `Retry-After`.
The library's in-memory limiter is disabled in favor of this persistent admission.
Users behind the same public IP share these limits; a window boundary can allow
two adjacent windows' allowance in a short interval.

Auth and account responses use `Cache-Control: no-store`. Application logs use a
generic event name rather than credentials, request bodies, or provider errors.
Better Auth may persist session IP/user-agent metadata in D1. Users, password
hashes, and sessions persist in the account's D1 database; access and retention
follow that installation's administrative controls. There is no user-facing account
deletion or automatic account-retention policy yet. Deleting a user row cascades
its sessions and credential accounts, and should only be done with authorization.

## Native app

The app uses a native navigation bar above a centered, scrollable sign-in
form with two-line bold Manrope titles, neutral light/dark backgrounds, labeled
rounded inputs with icons, password visibility, and a blue glass prominent button.
Inline field messages and borders indicate validation errors; request errors appear
in a separate banner. The mode switch stays in the navigation toolbar, and repeated
submissions are blocked while a request is in flight.
Registration asks for name, email, and password. The signed-in root has Chats
and Account tabs, defaulting to Chats. Account shows the current name/email and
photo, with avatar/name editing menus directly on that screen. Confirmed changes
save immediately; email remains read-only. It retains the existing sign-out flow.
A single navigation stack wraps the tab view. The plus button opens Contacts,
with creation/join actions and an alphabetical directory. Editors push over the
whole tab layout, with native Back navigation and the selected tab preserved on return. Navigation and contact
state reset for a different signed-in user. Contacts use authenticated, private D1
storage; see [contacts](contacts.md) for creation, listing, renaming, deletion,
pagination, and session-expiry handling. There are no sample contacts or chat
messages. The signed-in shell refreshes contacts periodically while active;
see [caching](caching.md) for polling and cache behavior.

iOS uses `Wildcard/WildcardLaunch.storyboard` through the explicit
`UILaunchStoryboardName = WildcardLaunch` entry in `Config/Info.plist` in both Debug
and Release. The synchronized app group includes the storyboard as a resource.
Automatic empty launch-screen generation is disabled. The native screen uses the
same `AccentColor` background as SwiftUI and the white `WildcardLaunchIsotype.png`
bundle resource, with an approximately 105.66 × 100 point aspect-fit image centered in the safe area. The blue background
covers the entire screen in both appearances; sharing the assets and alignment
avoids a color, size, or position jump when SwiftUI takes over.

After native launch, the app displays a full-screen `#045DE3` splash with the white Wildcard
mark centered at 105.66 × 100 points while loading its Keychain token and fetching
`/me`. SwiftUI uses the vector `WildcardLaunchMark`; the native launch uses direct-bundle PNG
renditions of that same source, exported from the supplied `isotype.svg`. See [app branding](branding.md). Light and dark modes
use the same blue background. There is no artificial delay; restoration selects
the signed-out, signed-in, or retry screen as soon as it completes.
These launch changes were checked statically (storyboard XML, asset references,
constraints, plist, and project configuration), without a build or simulator run.
Verify the transition on device after installing the updated app in light/dark
mode and supported orientations.

An expired session clears the token. Network/server/Keychain failures preserve the
saved session and offer retry instead of treating an outage as logout.

Keychain uses `WhenUnlockedThisDeviceOnly`; tokens are not placed in UserDefaults
or SwiftData. Logout revokes the remote session before removing the local token;
if the network fails, it displays an error and allows retry. Passwords stay only in
transient form state and are cleared after successful authentication or a mode change. The app
contains no backend secret, database credential, or password hashing code.

Both Debug and Release default to `https://wildcard-api.imlautaro.workers.dev` via
`WILDCARD_API_URL`. The explicit `WildcardAPIURL` key in `Config/Info.plist`
references `$(WILDCARD_API_URL)` so Xcode expands it into the built app. Custom
`INFOPLIST_KEY_*` build settings alone do not add this key to the app plist.
An independent installation must replace this build setting in both configurations.
Release only accepts HTTPS. Debug also accepts HTTP for loopback hosts; for local
simulator development override the Debug setting to `http://localhost:8787` and
allow local networking in that Debug configuration's App Transport Security
settings if required by the device/OS. Physical devices need a reachable HTTPS
origin; their loopback address points to the device itself.

## Setup and validation

Follow [infrastructure setup](infrastructure.md) before running the client.
`npm run auth:setup:local` generates an ignored local secret without printing it
and applies local migrations. It preserves an existing `.dev.vars` file, which
must define both `BETTER_AUTH_URL` and `BETTER_AUTH_SECRET`.

Static checks are `npm run typecheck`, `node --check scripts/release-worker.mjs`,
and Swift syntax/type checking. No runtime auth tests or iOS builds were run during
implementation. With fictional accounts, future authorized verification should
cover registration, duplicate registration, wrong password, invalid/unsigned/expired
tokens, session restoration, logout revocation, offline retry, Keychain failures,
rate limits, and preserving a session across automatic releases. Do not treat
syntax checks as proof of device behavior or an end-to-end auth test.

Sources: [Better Auth email/password](https://better-auth.com/docs/authentication/email-password),
[signed bearer plugin](https://better-auth.com/docs/plugins/bearer), and
[Drizzle adapter](https://better-auth.com/docs/adapters/drizzle).

## Editing the current profile

The bearer-only `/api/v1/me` endpoint returns nullable `photoVersion` alongside
the existing user fields. `PATCH /api/v1/me` accepts only a validated `name`.
Photo reads/replacements/removals use `/api/v1/me/photo`, restricted to the current
account. Email, password, session ownership, and verification state cannot be
changed through these routes. The general Better Auth endpoint allowlist remains
unchanged. See [account profile](profile-photos.md#account-profile) and
[infrastructure](infrastructure.md#account-profile-storage) for migration 0015
and private storage reproduction.

External account OAuth for [MCP connections](connectors.md#oauth-setup-and-lifecycle)
is separate from signing in to Wildcard. It requires an existing signed Wildcard
session and never creates a Wildcard account or changes the signed-in identity.

## Registration, onboarding and account model

Registration reopened on October 28, 2026, superseding the October 27 closure.
The public auth allowlist and Better Auth permit email registration, with an
atomic per-IP limit of five attempts per minute. Both clients offer account
creation and route new accounts through [onboarding](onboarding.md). `GET /me`
and profile mutations include `user.onboardingRequired`. Migration 0041 exempts
existing accounts and requires setup for future accounts. Clients reload `/me`
after authentication instead of trusting Better Auth's narrower response shape.

Super admins can close registration at runtime from the [admin panel](admin.md)
(`registration_enabled`, no release needed). While it is closed, sign-up returns
HTTP 403 `REGISTRATION_CLOSED` after the per-IP admission check, and both clients
show "New accounts are not being accepted right now. Existing accounts can still
sign in." The create-account option stays visible, because the clients don't
read settings yet. Sign-in is never affected. Super admins can also delete
accounts; see [deleting an account](admin.md#deleting-an-account) for what the
cascade removes.

Account includes a Standard/Contributor selector with explicit Contributor
acceptance. `GET /me` and profile mutations include `user.chatModel`;
`PUT /me/model` saves the authenticated account only. See [model settings](model-settings.md)
for model selection, sharing consent, MCP Standard, cache behavior and background
jobs. Onboarding uses the account's effective model (Standard or Contributor). No real registration or live inference was executed while implementing
this change.
