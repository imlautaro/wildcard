# Wildcard

A native iOS app and Hono API for Cloudflare Workers, with email/password
authentication backed by Better Auth and Cloudflare D1.

## Layout

```text
apps/
  api/                       # TypeScript API, managed with npm workspaces
    src/app.ts               # Hono application and auth routes
    src/index.ts             # Worker entry point
    wrangler.jsonc           # Worker configuration
  ios/
    Wildcard/                # SwiftUI app, auth client, and Icon Composer icon
    Wildcard.xcodeproj/       # Xcode project
    WildcardTests/
    WildcardUITests/
docs/
  infrastructure.md          # Reproducible provisioning and automatic releases
  authentication.md          # Auth contract, session behavior, and limitations
```

## API development

Use Node.js 24 or later and npm. From the repository root:

```sh
npm ci
npm run auth:setup:local
npm run dev
```

Wrangler serves the API locally at `http://localhost:8787`. Local setup creates an
ignored auth secret and applies D1 migrations. Register/sign in through
`/api/v1/auth/sign-up/email` and `/api/v1/auth/sign-in/email`; `/api/v1/me` requires
a signed bearer session. Unrelated paths return HTTP 404 JSON. See
[authentication](docs/authentication.md) for the contract and limitations.
Email ownership verification and password recovery are not configured yet.

```sh
npm run typecheck  # Generate Worker types and check TypeScript
npm run build      # Bundle locally using Wrangler's dry run; does not publish
```

Add feature routes in `apps/api/src` as they are implemented. Regenerate Worker
binding types with `npm run types --workspace @wildcard/api` after configuration
changes. Generated types are ignored by Git.

## iOS development

Open `apps/ios/Wildcard.xcodeproj`, or run `npm run ios` on macOS. Select the
`Wildcard` scheme in Xcode 27.1 or later. The current minimum deployment target is
iOS 27.0. For a physical device, select your own signing team and bundle identifier.

The app includes sign-up/sign-in, a signed-in account screen, Keychain session
storage, restoration on launch, and logout. It preserves the Wildcard Icon Composer
icon. Debug and Release default to the public API through `WILDCARD_API_URL`; an
independent installation must replace that setting. See the auth guide for local
simulator configuration. No contacts, conversations, or model integration exist yet.

## Infrastructure and releases

See [infrastructure setup](docs/infrastructure.md). The API uses Cloudflare Workers Builds connected to
`imlautaro/wildcard` on `main`, targeting
`https://wildcard-api.imlautaro.workers.dev`. Build command:
`npm ci && npm run typecheck`; automatic deployment command: `npm run release:ci`.
The release script requires Workers Builds, a clean checkout, the production branch,
and a matching source commit, then tags the Worker version with that commit.
Releases apply D1 migrations before publishing and initialize the runtime auth
secret on the first auth release, preserving it afterward. Commit and push to
release; do not deploy manually. Preview builds are disabled.

Follow the [working agreements](AGENTS.md), including English-only project content
and reproducible infrastructure documentation.
