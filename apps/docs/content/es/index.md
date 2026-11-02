---
seo:
  title: Documentación técnica de Wildcard
  description: Arquitectura, servicios de Cloudflare, desarrollo local, configuración y releases de Wildcard, una app social de contactos con IA construida sobre Cloudflare Workers.
---

::u-page-hero
#title
Documentación técnica de Wildcard

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
  to: /es/getting-started/local-development
  variant: outline
  icon: i-lucide-terminal
  ---
  Ejecutarlo en local
  :::
::

::u-page-section
#title
Qué encontrarás aquí

#features
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
  icon: i-lucide-key-round
  to: /es/getting-started/environment-variables
  ---
  #title
  Variables de entorno

  #description
  Cada binding, variable y secreto por Worker, cuáles son obligatorios y qué pasa cuando falta alguno.
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
