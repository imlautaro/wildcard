# Email and password authentication

The API uses Better Auth 1.7.13, the Drizzle SQLite adapter, and Cloudflare D1.
The native client stores a signed bearer session in Keychain. This is a new
implementation in this repository; the archived installation and its data are
not used.

## API contract

All paths are relative to the configured API origin:

| Method | Path | Body / behavior |
| --- | --- | --- |
| POST | `/api/v1/auth/sign-up/email` | `{ "name": "Demo User", "email": "demo@example.com", "password": "a-long-example-password" }` |
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
verification, OAuth, account sharing, and account deletion are not configured.
Passwords must contain 8–128 characters and are hashed by Better Auth's password
implementation; plaintext passwords are never stored. Sessions expire after seven
days and are refreshed after one day of activity. There is no stateless JWT or
cross-user shared memory in this setup.

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

The app opens a native sign-in/sign-up form, validates missing fields, shows
request errors, and prevents repeated submissions while a request is in flight.
Registration asks for name, email, and password. The signed-in screen shows account
details and sign-out. On launch the app loads its Keychain token and fetches `/me`.
An expired session clears the token. Network/server/Keychain failures preserve the
saved session and offer retry instead of treating an outage as logout.

Keychain uses `WhenUnlockedThisDeviceOnly`; tokens are not placed in UserDefaults
or SwiftData. Logout revokes the remote session before removing the local token;
if the network fails, it displays an error and allows retry. Passwords stay only in
transient form state and are cleared after submission or a mode change. The app
contains no backend secret, database credential, or password hashing code.

Both Debug and Release default to `https://wildcard-api.imlautaro.workers.dev` via
`WILDCARD_API_URL`, exposed in the generated Info.plist as `WildcardAPIURL`.
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
