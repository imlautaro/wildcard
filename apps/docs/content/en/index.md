---
seo:
  title: Wildcard Docs
  description: Architecture, Cloudflare services, local development, configuration and releases of Wildcard, a social app of AI contacts built on Cloudflare Workers.
---

::u-page-hero
#title
Wildcard Docs

#description
How Wildcard is built and operated: a Hono API on Cloudflare Workers with D1, R2 and Workflows, a Nuxt 4 web app, a SwiftUI iOS app and a super admin panel, all in one npm workspaces monorepo.

#links
  :::u-button
  ---
  color: primary
  size: xl
  to: /en/getting-started/introduction
  trailing-icon: i-lucide-arrow-right
  ---
  Get started
  :::

  :::u-button
  ---
  color: neutral
  size: xl
  to: /en/self-host/deploy
  variant: outline
  icon: i-lucide-server
  ---
  Self-host it
  :::
::

::u-page-section
#title
Run your own Wildcard

#description
The Deploy to Cloudflare button copies the repository into your GitHub account and releases the API and the web app to your Cloudflare account. Besides Cloudflare and GitHub accounts, you only need a Meta Model API key, and nothing in the repository needs editing.

#links
  :::u-button
  ---
  color: primary
  size: xl
  to: https://deploy.workers.cloudflare.com/?url=https://github.com/imlautaro/wildcard
  icon: i-simple-icons-cloudflare
  ---
  Deploy to Cloudflare
  :::

  :::u-button
  ---
  color: neutral
  size: xl
  to: /en/self-host/deploy
  variant: outline
  trailing-icon: i-lucide-arrow-right
  ---
  Read the guide
  :::
::

::u-page-section
#title
What you will find here

#features
  :::u-page-feature
  ---
  icon: i-lucide-server
  to: /en/self-host/deploy
  ---
  #title
  Self-host

  #description
  Deploy your own installation to your Cloudflare account with one button, then add the admin panel, custom domains and the iPhone app.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-network
  to: /en/getting-started/architecture
  ---
  #title
  Architecture

  #description
  Five Workers, one D1 database, a private R2 bucket, durable Workflows and a minute Cron. How a message becomes a reply.
  :::

  :::u-page-feature
  ---
  icon: i-simple-icons-cloudflare
  to: /en/cloudflare/overview
  ---
  #title
  Cloudflare services

  #description
  Workers, D1, R2, Workflows, Cron Triggers, Workers AI, AI Gateway, service bindings, static assets and Workers Builds.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-terminal
  to: /en/getting-started/local-development
  ---
  #title
  Local development

  #description
  Node.js 24, `npm ci`, a local D1 with every migration, and the API, web, admin, site and docs dev servers.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-layout-grid
  to: /en/apps/api
  ---
  #title
  Applications

  #description
  The API Worker, the web and admin Nuxt apps, the iOS app, the marketing site and the shared UI layer.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-rocket
  to: /en/operations/releases
  ---
  #title
  Releases

  #description
  Automatic releases from `main` through Workers Builds, guarded release scripts, D1 migrations and rollback.
  :::
::
