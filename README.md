# Wildcard

A native iOS app and a Hono API scaffold for Cloudflare Workers.

## Layout

```text
apps/
  api/                       # TypeScript API, managed with npm workspaces
    src/app.ts               # Hono application; no routes yet
    src/index.ts             # Worker entry point
    wrangler.jsonc           # Worker configuration
  ios/
    Wildcard/                # SwiftUI app, SwiftData model, and Icon Composer icon
    Wildcard.xcodeproj/       # Xcode project
    WildcardTests/
    WildcardUITests/
docs/
  infrastructure.md          # Local setup and future hosting configuration
```

## API development

Use Node.js 24 or later and npm. From the repository root:

```sh
npm ci
npm run dev
```

Wrangler serves the API locally at `http://localhost:8787`. No routes are registered;
every path currently returns HTTP 404 with `{"error":"Not found"}`. There is no
authentication, database, model integration, or connection from the iOS app yet.

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

The app currently contains the SwiftUI/SwiftData starter and the Wildcard Icon
Composer app icon. Moving the project into `apps/ios` preserves its relative paths.

## Infrastructure and releases

See [infrastructure setup](docs/infrastructure.md). The API uses Cloudflare Workers Builds connected to
`imlautaro/wildcard` on `main`, targeting
`https://wildcard-api.imlautaro.workers.dev`. Build command:
`npm ci && npm run typecheck`; automatic deployment command: `npm run release:ci`.
The release script requires Workers Builds, a clean checkout, the production branch,
and a matching source commit, then tags the Worker version with that commit.
Commit and push to release; do not deploy manually. Preview builds are disabled.

Follow the [working agreements](AGENTS.md), including English-only project content
and reproducible infrastructure documentation.
