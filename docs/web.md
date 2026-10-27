# Web app

`apps/web` is a Nuxt 4 single-page app that runs as its own Cloudflare Worker,
`wildcard-web`. It uses the same API as the iOS app and adds no API routes,
migrations, or data. The API Worker stays the only owner of D1, R2, Workflows,
and every credential.

## Architecture

```text
Browser ──same origin──▶ wildcard-web (Nuxt/Nitro, cloudflare_module preset)
                          ├─ static SPA assets (Workers static assets, ASSETS binding)
                          └─ /api/v1/** proxy ──service binding API──▶ wildcard-api
```

- **Session token.** Sign-in and sign-up go through the proxy. It takes the signed
  Better Auth token from `set-auth-token`, stores it in an `httpOnly`, `Secure`,
  `SameSite=Strict` cookie (`__Host-wildcard_session` in production builds), and returns only
  `{ user }`. It drops the unsigned `token` field from the body and the upstream
  `Set-Cookie`. Page JavaScript never sees the token.
- **Rebuilt requests.** Each proxied request is rebuilt from an allowlist:
  `Accept`, `Content-Type`, `Authorization` (from the cookie), and the inbound
  `CF-Connecting-IP`. Browser cookies, `Origin`, and Fetch Metadata never reach Better
  Auth, so its cookie-based origin checks don't apply. The client IP is forwarded so
  the API's per-IP auth rate limits stay per user. With the public `workers.dev` URL
  instead of the service binding, every web user would share one rate-limit bucket.
  Whether the service binding preserves that header is not verified yet; see
  [verification](#verification-status).
- **Allowed responses.** Only `Content-Type`, `Content-Length`, `Content-Disposition`,
  `Retry-After`, and `X-Content-Type-Options` are forwarded. Every proxied response is
  `Cache-Control: no-store`.
- **Cross-site protection.** Non-GET requests with a foreign `Origin`, or with
  `Sec-Fetch-Site` other than `same-origin`, get a 403. Paths with dot segments or
  encoded separators get a 404.
- **Expiry.** A 401 on an authenticated request clears the cookie. A successful
  `GET /api/v1/me` refreshes the cookie lifetime (7 days, matching the API session).
  Sign-out always clears the cookie, even when the API is unreachable.
- `ssr: false`: the app is private and behind sign-in, so server rendering would add
  cookie forwarding without any benefit.

## Features

Matching iOS:

- Email/password sign-up and sign-in, account name and photo, sign-out.
- Unified chat list of contacts and groups, ordered by latest message, with unread
  counts, sender prefixes, and an unread count in the tab title.
- Contacts directory with search, create, rename, photo (centered square JPEG,
  512 px, under 512 KB), delete, and leaving a shared contact.
- Private chats with persisted history, earlier pages, optimistic sends with
  idempotent UUIDs, reply retry, read receipts, Online/Typing/Last seen presence,
  activity leases (`open`/`typing`/`leave`, with no draft text), and image/PDF
  attachments up to 5 MB.
- Contact sharing: invite by account email or by code, revoke invitations, remove
  participants, join by code, and accept or decline received invitations. Shared-memory
  and Contributor consent are explicit, with the iOS disclosure text.
- Groups: create with consent, chat with sender names/avatars and attachments,
  reply progress and retry, invite by email, add your own contacts, member invite
  permissions, remove members/contacts, leave or delete.

Not in the web app yet:

- **Voice dictation.** The API accepts only mono 16-bit 16 kHz WAV. `MediaRecorder`
  produces WebM/Ogg, so this needs client-side resampling and WAV encoding.
- **Push notifications.** Delivery is APNs-only. Web Push would need new API storage
  and VAPID keys.
- **Scheduled messages** (list/cancel), private-to-group requests, group photo
  editing, and the group "Confirm consent for future messages" action.
- **Interactive photo cropping.** Photos are center-cropped.

Polling replaces push while the tab is visible: every 15 s for the chat list, 2 s
for a chat with a pending reply or typing contact, and 8 s (private) or 6 s (group)
otherwise. Returning to the tab refreshes immediately.

## Caching

The web cache follows the [caching guide](caching.md#web-app). In short:
session-owned memory caches only, reset on sign-out, expiry, or account change, and
nothing private written to browser storage.

## Local development

```sh
npm ci
npm run auth:setup:local
npm run dev          # API on http://localhost:8787
npm run dev:web      # Web on http://localhost:3000
```

In `nuxt dev` the proxy calls the API over HTTP at `runtimeConfig.apiOrigin`
(default `http://localhost:8787`, override with `NUXT_API_ORIGIN`). Production
builds never use that URL; without the `API` service binding they return 503.
In `nuxt dev` the cookie is named `wildcard_session` and is not `Secure`.

```sh
npm run typecheck:web  # nuxt prepare + vue-tsc (static only)
npm run build:web      # local production build into apps/web/.output; does not publish
```

`vue-tsc` can't load the TypeScript 7 compiler the API uses, so
`apps/web/scripts/typecheck.mjs` runs it with an aliased TypeScript 6
(`typescript6`). Generated `.nuxt/` and `.output/` are ignored by Git.

## Release

The web Worker has its own Workers Builds project. See
[infrastructure](infrastructure.md#web-worker). Commit and push to release; never
deploy manually.

## Verification status

Checked locally on October 27, 2026, with fictional accounts and no Meta key (sends
return 503, so no model replies were generated):

- `npm run typecheck:web`, `npm run typecheck`, and `npm run build:web` pass.
- The built Worker ran under `wrangler dev` with the generated
  `.output/server/wrangler.json`, using the `API` service binding to a local
  `wildcard-api`. Through it: the SPA shell and security headers; 401 without a
  session; sign-up and sign-in set `__Host-wildcard_session` with `HttpOnly`,
  `Secure`, `SameSite=Strict`, and a 7-day max age; the body omits `token`; sign-out
  expires the cookie; cross-site `Origin`/`Sec-Fetch-Site` writes get 403; contact
  create/list/rename; photo upload and download (identical bytes, `no-store`); chat
  history, activity `open`, and the send error path; sharing invitation codes; group
  create, messages, image attachment round trip, and read state.
- A headless Chrome run of the built Worker passed 18 UI checks: sign-in redirect,
  sign-up, the session cookie is hidden from `document.cookie`, contact creation, a
  failed send keeps Retry and Edit, Edit restores the draft, rename, sharing consent
  gating and code creation, group creation, adding your own contact, a group send,
  the unified list, dark mode, the mobile single-column layout with no horizontal
  overflow, sign-out, and sign-in again. No JavaScript exceptions occurred.
- `npm run dev:web` proxies to the local API over HTTP with a plain `wildcard_session`
  cookie. Node's `fetch` adds `Sec-Fetch-Mode`, so the dev path sends the local API
  origin to satisfy Better Auth; production builds never take that branch.

Not yet verified: model replies, PDF attachments in a browser, photo selection
through the file picker, interactive cross-account sharing/invitations, session
expiry over time, rate-limit behavior and `CF-Connecting-IP` forwarding on the real
Cloudflare network (locally the binding connects, but every request comes from the
same address), and the deployed `wildcard-web` Worker, which has not been released.
The web app does not yet acknowledge group delivery receipts (`PUT /groups/receipts`)
the way iOS does.
