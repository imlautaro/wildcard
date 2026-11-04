---
seo:
  title: Wildcard Docs
  description: Arquitectura, servicios de Cloudflare, desarrollo local, configuración y releases de Wildcard, una app social de contactos con IA construida sobre Cloudflare Workers.
---

::u-page-hero
#title
Wildcard Docs

#description
Cómo se construye y se opera Wildcard: una API Hono sobre Cloudflare Workers con D1, R2 y Workflows, una app web en Nuxt 4, una app iOS en SwiftUI y un panel de super admin, todo en un monorepo con npm workspaces.

#links
  :::u-button
  ---
  color: primary
  size: xl
  to: /es/getting-started/introduction
  trailing-icon: i-lucide-arrow-right
  ---
  Comenzar
  :::

  :::u-button
  ---
  color: neutral
  size: xl
  to: /es/self-host/deploy
  variant: outline
  icon: i-lucide-server
  ---
  Self-host
  :::
::

::u-page-section
#title
Ten tu propio Wildcard

#description
El botón Deploy to Cloudflare copia el repositorio en tu cuenta de GitHub y publica la API y la app web en tu cuenta de Cloudflare. Además de las cuentas de Cloudflare y GitHub, solo necesitas una clave de la Meta Model API, y no hace falta editar nada del repositorio.

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
  to: /es/self-host/deploy
  variant: outline
  trailing-icon: i-lucide-arrow-right
  ---
  Leer la guía
  :::
::

::u-page-section
#title
Qué encontrarás aquí

#features
  :::u-page-feature
  ---
  icon: i-lucide-server
  to: /es/self-host/deploy
  ---
  #title
  Self-host

  #description
  Despliega tu propia instalación en tu cuenta de Cloudflare con un botón y luego agrega el panel de administración, dominios propios y la app de iPhone.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-network
  to: /es/getting-started/architecture
  ---
  #title
  Arquitectura

  #description
  Cinco Workers, una base de datos D1, un bucket R2 privado, Workflows durables y un Cron de cada minuto. Cómo un mensaje se convierte en una respuesta.
  :::

  :::u-page-feature
  ---
  icon: i-simple-icons-cloudflare
  to: /es/cloudflare/overview
  ---
  #title
  Servicios de Cloudflare

  #description
  Workers, D1, R2, Workflows, Cron Triggers, Workers AI, AI Gateway, service bindings, static assets y Workers Builds.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-terminal
  to: /es/getting-started/local-development
  ---
  #title
  Desarrollo local

  #description
  Node.js 24, `npm ci`, una D1 local con todas las migraciones y los servidores de desarrollo de la API, la web, el admin, el sitio y la documentación.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-layout-grid
  to: /es/apps/api
  ---
  #title
  Aplicaciones

  #description
  El Worker de la API, las apps Nuxt web y de administración, la app iOS, el sitio de marketing y la capa de UI compartida.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-rocket
  to: /es/operations/releases
  ---
  #title
  Releases

  #description
  Releases automáticos desde `main` mediante Workers Builds, scripts de release con protecciones, migraciones de D1 y rollback.
  :::
::
