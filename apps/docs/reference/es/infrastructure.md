# Infraestructura

## Corrección de IDs de Workflow de tareas

La [corrección del despachador](tasks.md#workflow-id-recovery-october-29-2026)
usa bindings D1 y `CHAT_WORKFLOW` existentes y SHA-256 de Web Crypto. No agrega
servicio, secreto, permiso, ajuste de cuenta ni migración. Las instalaciones
independientes usan aprovisionamiento existente. Publica fuente con commit y push
por pipeline API automático; nunca manualmente. El Cron de cada minuto corrige IDs
inválidos en cola atómicamente entre turnos, atención y registro de limpieza.
Verifica versión enviada, inspecciona estados técnicos de cola y confirma que
contactos afectados responden en grupos y privado. No afirmes recuperación por
comprobaciones estáticas. Evita volver al despachador anterior: nuevos IDs inválidos
derivados de tareas bloquearían atención. Los normalizados siguen legibles por
código anterior; prefiere avanzar para conservar validación y limpieza antigua.

## Recursos requeridos

| Recurso | Configuración | Propósito |
| --- | --- | --- |
| Cloudflare Worker | `apps/api/wrangler.jsonc`, `wildcard-api` | API Hono y manejador Better Auth |
| Cloudflare R2 | `CONTACT_PHOTOS`, `wildcard-contact-photos` | JPEG privados de perfil de contactos |
| Cloudflare D1 | `DB`, `wildcard-db` | Usuarios, contraseñas con hash, sesiones, esquema de verificación, límites de autenticación, contactos privados, turnos, memorias y búsqueda de historial de texto completo |
| Secreto de autenticación en ejecución | `BETTER_AUTH_SECRET` | Firma cookies y sesiones bearer nativas |
| Cloudflare Workflow | `CHAT_WORKFLOW`, `wildcard-chat`, clase `ChatWorkflow` | Generación duradera de respuestas |
| Cron Trigger | `* * * * *` en Wrangler | Recuperar huecos de despacho en cola y conciliar Workflows terminales |
| Meta Model API | `META_API_KEY` en ejecución, `META_CHAT_MODEL` / `muse-voice-transcribe-1.0` | Generar respuestas y transcribir voz con Muse Voice Transcribe |
| ElevenLabs (opcional) | Secreto de ejecución `ELEVENLABS_API_KEY` | Voces de contactos y mensajes hablados; consulta [Mensajes de voz](#voice-messages) |
| Origen público | `BETTER_AUTH_URL` | Origen canónico de autenticación, separado del secreto |
| Workers Builds | GitHub `imlautaro/wildcard`, `main`, raíz `/` | Releases automáticos desde fuente con commit y push |
| Worker web | `apps/web/wrangler.jsonc`, `wildcard-web` | App Nuxt y proxy API del mismo origen; consulta [Worker web](#web-worker) |
| Service binding | `API` → `wildcard-api` | Llamadas privadas web/API que conservan IP cliente para límites |
| Workers Builds (web) | Segundo proyecto del mismo repositorio y rama, raíz `/` | Releases web automáticos |
| Worker de administración (opcional) | `apps/admin/wrangler.jsonc`, `wildcard-admin` | Panel de superadministración; consulta [Worker de administración](#admin-worker) |
| Service binding (administración) | `API` → `wildcard-api`, entrypoint `AdminAPI` | API administrativa privada, inaccesible desde origen público |
| Workers Builds (administración, opcional) | Tercer proyecto del mismo repositorio y rama, raíz `/` | Releases administrativos automáticos |
| Worker del sitio de marketing (opcional) | `apps/site/wrangler.jsonc`, `wildcard-site` | Presentación pública, solo recursos estáticos; consulta [Worker de marketing](#marketing-site-worker) |
| Workers Builds (sitio, opcional) | Otro proyecto del mismo repositorio y rama, raíz `/` | Releases automáticos de marketing |
| Worker de documentación (opcional) | `apps/docs/wrangler.jsonc`, `wildcard-docs` | Documentación técnica (Docus, inglés y español), solo recursos estáticos; consulta [Worker de documentación](#docs-site-worker) |
| Workers Builds (documentación, opcional) | Otro proyecto del mismo repositorio y rama, raíz `/` | Releases automáticos de documentación |

No hay dependencias KV, de correo ni staging. R2 se requiere para
[fotos de perfil](profile-photos.md). El bucket de producción se creó y verificó
el 26 de octubre de 2026. Los chats requieren Workflows y acceso Meta; autenticación
y contactos pueden correr sin clave de modelo. Registro e inicio requieren D1 y
secreto; la falta de configuración falla, sin recurrir a sesiones en memoria ni
secreto de desarrollo. Consulta [autenticación](authentication.md) para API, cliente,
privacidad y limitaciones.

## Esta instalación

- Cuenta: `a9e3a97d08ec5023cbe6b97a1a25fec6`.
- Worker: `wildcard-api`.
- D1: `wildcard-db`, ID `ac55a941-27bf-4182-ac8a-8aebda43524f` (base nueva).
- Origen: `https://wildcard-api.imlautaro.workers.dev`.
- Repositorio: `imlautaro/wildcard` (ID `1434657598`), rama de producción `main`.
- Raíz de build `/`; comando `npm ci && npm run typecheck`;
  comando automático de despliegue `npm run release:ci`.
- `preview_urls` está activado para `wildcard-api`, `wildcard-web` y `wildcard-admin`
  (1 de noviembre de 2026). Solo web compila Previews de ramas; consulta
  [Previews web](#web-previews).
- Credencial existente de build: `Workers Builds - 2026-05-27 10:54`.

La base anterior se eliminó y no se reutiliza. IDs y URLs son específicos de esta
instalación; reemplázalos en otra cuenta. Ningún valor real de secreto pertenece
a Git, ajustes de build de app ni documentación.

## Watch paths de builds

Los cuatro proyectos de producción observaban `*`, disparando todos ante cualquier
cambio. El 1 de noviembre de 2026 se reemplazaron filtros del panel por includes
específicos por dependencia siguientes. Previews Base web tenía `*` separado y
se actualizó aparte con los mismos. Previews API, administración y sitio siguen
desactivadas. Las raíces permanecen `/` porque npm workspaces usa lockfile raíz
y Nuxt resuelve allí la capa compartida.

[workers-build-paths.json](workers-build-paths.json) registra configuración exacta.
Es referencia de aprovisionamiento, no opción Wrangler consumida automáticamente.
En cuenta independiente abre **Settings → Builds** de cada Worker, agrega includes,
quita `*`, deja exclusiones vacías y guarda. En web repite bajo **Previews Base**.
Conserva comandos y rama existentes de las secciones específicas siguientes.

Todos incluyen `package.json`, `package-lock.json`, `.nvmrc`, `.npmrc` y `.gitignore`.
El lockfile puede cambiar dependencias de build; `.gitignore` afecta protección de
checkout limpio del release. Se observa `.npmrc` para configuración npm futura
aunque aún no exista `.npmrc` en raíz.

| Worker | Includes adicionales |
| --- | --- |
| `wildcard-api` | `apps/api/*`, `shared/*`, `scripts/release-worker.mjs` |
| `wildcard-web` (producción y previews) | `apps/web/*`, `packages/ui/*`, `shared/*`, `scripts/release-web.mjs`, `scripts/preview-web.mjs` |
| `wildcard-admin` | `apps/admin/*`, `packages/ui/*`, `scripts/release-admin.mjs` |
| `wildcard-site` | `apps/site/*`, `packages/ui/*`, `scripts/release-site.mjs` |
| `wildcard-docs` | `apps/docs/*`, `docs/*`, `scripts/prepare-docs-reference.mjs`, `scripts/release-docs.mjs` |

La capa Nuxt sirve a web, administración y sitio; `shared/` se importa en API/web.
Migraciones y configuración/scripts/recursos de cada app quedan cubiertos por su
directorio. Un service binding no empaqueta API en web/administración; cambios solo
API no requieren build cliente. Mantén contratos compatibles al publicar por separado.
Agrega dependencias nuevas entre directorios a referencia y filtros en el mismo cambio.

Resultado esperado: solo sitio construye sitio; capa Nuxt construye web/administración/
sitio; `shared/` construye API/web; dependencias o entorno raíz construyen los cinco.
Solo `apps/docs/` construye documentación. Solo `docs/` también la construye porque
genera referencia completa de esas guías. Solo `apps/ios/`, `README.md` raíz o scripts
raíz ajenos no coinciden. Los filtros `docs/*` y del script de preparación se
añadieron al panel de producción el 2 de noviembre de 2026. Los filtros amplios por app incluyen archivos
futuros y evitan listas frágiles individuales.

Las [reglas Cloudflare](https://developers.cloudflare.com/workers/ci-cd/builds/build-watch-paths/)
usan `*` para caracteres arbitrarios, incluidas rutas anidadas; no son globs de
sistema que requieran `**`. Las exclusiones prevalecen. Cloudflare omite filtros
en pushes sin cambios, con 3,000 archivos o más, o 20 commits o más, por lo que no
pueden impedir todos los builds excepcionales.

Verificación: se inspeccionaron includes guardados y exclusiones vacías de los
cuatro proyectos de producción y previews web; sin push, build local, pruebas ni
despliegue manual para ese cambio. Disparar/omitir en un push normal futuro sigue
sin verificar. Para revertir filtros, restaura include `*` sin exclusiones en
producción/preview afectada; cambia selección de build, no código ni datos desplegados.

## Aprovisionamiento de cuenta independiente

1. Instala Node.js 24 o posterior y npm. Usa `.nvmrc` y `npm ci` desde raíz.
2. Elige cuenta Cloudflare, nombre disponible de Worker y de base. Reemplaza
   `account_id`, `name` del Worker y `vars.BETTER_AUTH_URL` en Wrangler. Cambia
   `database_name` D1 y pon `database_id` en
   `00000000-0000-0000-0000-000000000000` antes de aprovisionar. Conserva
   `binding: DB` y `migrations_dir: migrations`.
3. Autentica Wrangler en tu cuenta. El aprovisionador requiere lectura de cuenta
   y edición D1. Ejecuta `npm run infra:provision`. Lista bases, reutiliza nombre
   coincidente o crea, verifica ID y actualiza binding versionado. Repetir misma
   configuración reutiliza recurso. Rechaza reemplazar silenciosamente otro ID no
   provisional. No migra ni despliega. Revisa cuenta e IDs y haz commit/push de
   configuración.
4. Conecta repositorio a Workers Builds con integración GitHub. Elige rama de
   producción (`main` por defecto), raíz `/` y comandos anteriores. La credencial
   requiere Workers Scripts edit, D1 edit, Workflows edit y lectura de cuenta.
   Workers Scripts edit cubre listar nombres de secretos y cargar secretos de
   ejecución con versión. Usa credencial existente con alcance adecuado; no guardes
   valor en Git. Desactiva previews hasta aprovisionar staging explícitamente.
5. Elige nombre único de Workflow en `workflows[].name`; conserva
   `binding: CHAT_WORKFLOW` y `class_name: ChatWorkflow`. El release automático crea/
   actualiza Workflow y Cron de minuto desde Wrangler. Sin despliegue local separado.
   Obtén credencial Meta Model API propia con acceso Muse Spark 1.3 y Muse Voice
   Transcribe y agrega `META_API_KEY` cifrada en Worker Settings → Build → Variables
   and secrets. La credencial de build debe crear/actualizar Workflows; verifica
   permisos si se rechaza primer release.
6. El release aplica migraciones D1 versionadas primero y publica con secreto de
   autenticación según abajo. Producción no requiere migrar manualmente; revisa
   cada migración antes del push.
7. Aprovisiona bucket de fotos con sección siguiente antes de publicar cambios.
8. Reemplaza ajustes `WILDCARD_API_URL` de app/extensión de notificación iOS con tu
   origen HTTPS público. Compila/instala cliente por separado cuando corresponda.
   Publicar API no actualiza una app ya instalada.

D1 y Workers están sujetos a plan/cuotas; no habilita facturación ni cambia plan.
Hashing de Better Auth consume CPU: revisa límites del Worker antes de uso público.
Crear recursos no proporciona correo ni verificación de identidad.

## Inicialización automática de secretos y releases

`scripts/release-worker.mjs` exige Workers Builds (`WORKERS_CI=1`), rama de producción,
checkout limpio y `WORKERS_CI_COMMIT_SHA` igual a Git HEAD. Cloudflare inyecta esas
variables. No las configures localmente para eludir protección. Una instalación
independiente puede poner `WILDCARD_PRODUCTION_BRANCH` en ajustes si usa otra rama.

El release ejecuta migraciones D1 remotas e inspecciona solo nombres de secretos.
Si falta `BETTER_AUTH_SECRET`, genera 48 bytes criptográficamente aleatorios, escribe
JSON solo accesible al propietario en directorio temporal privado y carga secreto
con código mediante `--secrets-file` de Wrangler. El archivo se elimina en bloque
`finally`. Los valores nunca aparecen en argumentos ni logs. Releases posteriores
conservan secreto cifrado y firmas de sesión. Nunca se expone a iOS.

`META_API_KEY` es secreto cifrado de build y de ejecución. El release copia valor
de build al mismo temporal cuando se proporciona; si falta en entorno, conserva
clave existente. Valor vacío o ausente en ambos detiene release. Actualiza secreto
cifrado de build y envía commit autorizado para rotar. Nunca imprimas variables ni
pegues clave en chat. El usuario confirmó configurar secreto el 26 de octubre de
2026; no se inspeccionó valor ni acceso de modelos. Credencial Cloudflare solo se
usa en pipeline, y `BETTER_AUTH_SECRET` solo en ejecución. Rotaciones futuras
requieren release automático explícitamente autorizado e invalidan sesiones firmadas.
Eliminar/recrear Worker pierde secreto y exige iniciar sesión otra vez.

Publica con commit/push a rama elegida. Comprueba Workers Builds, confirma SHA e
inspecciona `workers/tag` activo contra él. Verifica `CHAT_WORKFLOW`, clase
`ChatWorkflow`, Cron de minuto y nombre de secreto `META_API_KEY` tras release de
chat. El script etiqueta cada versión con commit completo. El primer build de
conexión puede carecer de metadatos y detenerse con seguridad; un push posterior
lo dispara con metadatos. Investiga fallos; no eludas con despliegue local ni
`wrangler secret put`.

La ruta estable `workers.dev` está habilitada; URLs preview deshabilitadas. Workers
Logs y Traces tienen muestreos 1 y 0.01. Revisa cuotas/retención antes de uso público.
Las ramas preview no deben compartir base de producción. Staging requiere Worker,
D1, origen y secretos separados.

## Worker web

La [app web](web.md) es Worker separado `wildcard-web`, configurado en
`apps/web/wrangler.jsonc`. Sin D1, R2, Workflow, Cron ni secreto. Solo service binding
`API` a `wildcard-api` y `ASSETS` de estáticos agregado por Nitro al construir.
`npm run build:web` combina Wrangler versionado en `apps/web/.output/server/wrangler.json`
con `main` y `assets`; el release despliega ese archivo. Compila también
[capa de diseño](design-system.md) `packages/ui` (workspace npm extendido por
`apps/web` y `apps/admin`), por lo que raíz Workers Builds debe seguir `/`; la capa
no requiere recurso, binding ni secreto.

Aprovisionamiento (después de existir API, porque binding lo nombra):

1. En `apps/web/wrangler.jsonc`, reemplaza `account_id` y `services[0].service` si
   API tiene otro nombre. Cambia `name` si `wildcard-web` está ocupado.
2. Crea segundo proyecto Workers Builds de mismo repositorio/rama: raíz `/`, build
   `npm ci && npm run typecheck:web && npm run build:web`, despliegue
   `npm run release:web`. Usa credencial limitada a Workers Scripts edit y lectura
   de cuenta; no requiere D1, R2 ni Workflows. Para ramas consulta
   [Previews web](#web-previews); de lo contrario desactiva previews.
3. Opcional: configura watch paths para no reconstruir API con web y viceversa.
   Por ejemplo incluye `apps/web/**`, `packages/ui/**`, `package.json`,
   `package-lock.json` y `scripts/release-web.mjs` en web y excluye `apps/web/**` y
   `packages/ui/**` en API. `packages/ui` es [capa compartida](design-system.md):
   omitirla en web/administración impide publicar cambios de diseño. Verifica opción
   en panel antes de confiar. Sin ella cada push corre ambos pipelines, cada uno
   publica su Worker.
4. Haz push de commit. `scripts/release-web.mjs` aplica protecciones API (solo
   Workers Builds, rama de producción, limpio, HEAD igual a `WORKERS_CI_COMMIT_SHA`)
   y etiqueta versión con commit.

Esta instalación apunta a `https://wildcard-web.imlautaro.workers.dev`. El segundo
proyecto se conectó el 27 de octubre de 2026 con previews desactivadas y token
limitado a Workers Scripts edit y Account Settings read. Su build inicial precede
al commit web; verificación de producción sigue al primer release automático.
El origen web no requiere configuración API: proxy llama por binding y API no ve
`Origin` ni cookies del navegador.

### Previews web

Cada rama distinta de `main` puede obtener Worker Preview propio en
`https://<branch>-wildcard-web.imlautaro.workers.dev`, con `<branch>` en minúsculas,
dígitos y guiones.

- `apps/web/wrangler.jsonc` tiene bloque `previews`. `wrangler preview` rechaza
  ejecutarse sin él y no hereda bindings superiores, por lo que repite `API`.
  Desde Preview llama al despliegue **de producción** de `wildcard-api`: lee/escribe
  cuentas y datos reales y URL es pública (la app aún requiere sesión).
- `npm run preview:web` (`scripts/preview-web.mjs`) despliega
  `apps/web/.output/server/wrangler.json` con `wrangler preview`, nombre de rama y
  etiqueta de commit. Rechaza rama de producción y nunca la toca. También corre
  localmente tras `npm run build:web`.
- Workers Builds web: habilita builds de ramas no productivas, conserva comando y
  pon Preview command `npm run preview:web`. El predeterminado `npx wrangler preview`
  no encuentra Wrangler en raíz `/`, y `release:web` rechaza otras ramas que `main`.
- `nitro.cloudflare.wrangler.preview_urls` en `apps/web/nuxt.config.ts` prevalece
  sobre Wrangler; Nitro lo incorpora a configuración generada.
- Elimina Preview con `npx wrangler preview delete --name <name>` desde `apps/web`.
- API y administración no tienen `previews`. Preview API iniciaría sin secretos
  y necesitaría decidir D1/Workflows; sus proyectos no deben construir ramas Preview.

Verificación tras primer release: log muestra SHA, versión activa `wildcard-web`
tiene `workers/tag` igual y bindings `API` → `wildcard-api` y `ASSETS`. Un
`GET /api/v1/me` sin autenticar en web devuelve JSON 401, e inicio fija cookie
`__Host-wildcard_session` con `HttpOnly`, `Secure`, `SameSite=Strict`. Intentos de
dos IP deben tener límites API separados, confirmando reenvío de `CF-Connecting-IP`.

Rollback: revierte versión `wildcard-web` o elimina Worker. No guarda datos. Las
sesiones creadas desde web siguen válidas hasta vencer. Nunca cambia API, base ni
secretos. Cambios API deben servir a web e iOS; consulta [app web](web.md) para endpoints.

## Worker de administración

El [panel de superadministración](admin.md) es opcional y corre como tercer Worker
`wildcard-admin`, en `apps/admin/wrangler.jsonc`. Como web, sin D1, R2, Workflow,
Cron ni secreto. Solo binding `API` al entrypoint con nombre `AdminAPI` exportado
por `apps/api/src/index.ts` y `ASSETS` añadido por Nitro. `npm run build:admin`
escribe `apps/admin/.output/server/wrangler.json`, desplegado por release.

API necesita migración `0059_admin.sql` y variable `SUPER_ADMIN_USER_IDS` (IDs
separados por comas, no secreto). Se distribuye vacía, nadie accede hasta configurarla.
Ambos se publican por release API automático normal.

Aprovisiona después de que API publique una versión que exporte `AdminAPI`:

1. En `apps/admin/wrangler.jsonc`, reemplaza `account_id` y `services[0].service`
   si API tiene otro nombre. Cambia `name` si `wildcard-admin` está ocupado.
2. Crea tercer proyecto del mismo repositorio/rama: raíz `/`, build
   `npm ci && npm run typecheck:admin && npm run build:admin`, despliegue
   `npm run release:admin`. Credencial limitada a Workers Scripts edit y lectura
   de cuenta. Desactiva previews. Opcionalmente watch paths (`apps/admin/**`,
   `packages/ui/**`, `package.json`, `package-lock.json`, `scripts/release-admin.mjs`),
   y agrega `apps/admin/**` a exclusiones de otros (`packages/ui/**` sigue en web).
3. Haz push de commit. `scripts/release-admin.mjs` aplica mismas protecciones web
   (solo Workers Builds, producción, limpio, HEAD igual a `WORKERS_CI_COMMIT_SHA`)
   y etiqueta con commit. Si administración corre antes de release API en mismo
   push, el binding puede nombrar entrypoint inexistente. Reintenta después de que
   `wildcard-api` tenga éxito.
4. Inicia sesión en origen administrativo, copia ID de pantalla «Not a super admin»,
   agrégalo a `SUPER_ADMIN_USER_IDS` y haz push.

Considera limitar más el origen con Cloudflare Access delante de `wildcard-admin`
(opcional; no configurado en repositorio).

Verificación: versión activa `wildcard-admin` tiene `workers/tag` igual al SHA y
bindings `API` → `wildcard-api` (entrypoint `AdminAPI`) y `ASSETS`. En origen público
API, `GET /api/v1/admin/session` devuelve 404. En administración, `GET /api/v1/admin/session` sin sesión
devuelve 401 y `/api/v1/me` devuelve 404 porque proxy no lo reenvía. Iniciar sesión
establece `__Host-wildcard_admin_session`.

El proyecto de producción se conectó a `imlautaro/wildcard` el 29 de octubre de 2026:
`main`, raíz `/`, comandos anteriores, previews desactivadas, todas las rutas
incluidas, sin exclusiones, caché activa y token existente `wildcard-web-builds-scoped`
reutilizado. Sin variables ni secretos de build. Build inicial y comprobaciones
reales aún pendientes al registrar. Lista de superadministradores sigue vacía.

Rollback: elimina o revierte Worker `wildcard-admin`. No guarda datos. Vaciar
`SUPER_ADMIN_USER_IDS` y publicar API revoca acceso sin tocar panel. Código API
anterior a 0059 ignora `app_setting` y `admin_event`; revertir reabre registro
(no tenía barrera) y conserva tablas. Para restablecer ajuste elimina fila mediante
proceso normal de migración.

## Worker del sitio de marketing

El [sitio de marketing](site.md) es opcional e independiente: Worker solo de recursos
estáticos `wildcard-site`, en `apps/site/wrangler.jsonc`. Sin script, binding, D1,
R2, Workflow, Cron, secreto ni migración. `npm run build:site` corre `nuxt generate`,
prerrenderizando páginas en `apps/site/.output/public`; Wrangler sirve directorio
y responde desconocidas con `404.html`, emitido por `nuxt generate`. Compila
[capa de diseño compartida](design-system.md), por lo que raíz debe seguir `/`.

Aprovisionamiento:

1. En `apps/site/wrangler.jsonc`, reemplaza `account_id` y `name` si `wildcard-site` está ocupado.
   En `apps/site/app/utils/site.ts` pon `url` al origen público (canonical/hreflang
   para `/` y `/es`), `appUrl` a web, `repositoryUrl` a tu repositorio e `iosUrl`
   si distribuyes iPhone. Deja `repositoryPublic: false` hasta hacerlo público
   para no enlazar una página 404.
2. Crea otro proyecto de mismo repositorio/rama: raíz `/`, build
   `npm ci && npm run typecheck:site && npm run build:site`, despliegue
   `npm run release:site`. Basta credencial Workers Scripts edit y lectura de
   cuenta. Desactiva previews salvo que quieras ramas del sitio.
3. Configura [watch paths](#build-watch-paths), incluida capa y entradas raíz,
   y quita include `*` predeterminado.
4. Haz push de commit. `scripts/release-site.mjs` aplica protecciones (solo Workers
   Builds, producción, limpio, HEAD igual a `WORKERS_CI_COMMIT_SHA`) y despliega
   `apps/site/wrangler.jsonc` etiquetado. Opcionalmente adjunta dominio personalizado
   a `wildcard-site` en panel.

`nuxt generate` también enlaza `apps/site/dist` a salida; está ignorado para que
pase comprobación de limpio tras construir.

Estado (1 de noviembre de 2026): `npm run build:site` ejecutado localmente
(prerrenderizó `/`, `200.html`, `404.html`; 1.2 MB) y servido con `wrangler dev --config
apps/site/wrangler.jsonc`: `/` devolvió 200 y desconocida 404 con página propia.

Release inicial (1 de noviembre de 2026): como excepción única aprobada por propietario
porque Builds API es inaccesible con credencial local, `wildcard-site` se desplegó
manualmente con `npx wrangler deploy --config apps/site/wrangler.jsonc --tag a1a6464…`
desde checkout limpio de commit enviado `a1a6464` (versión
`356fc40b-5b76-4885-b265-897b7e3f44a9`). Sirve
`https://wildcard-site.imlautaro.workers.dev`: `/` 200, desconocidas 404, sin errores
consola a 1280 y 390 px. Los posteriores deben venir de Workers Builds: el Worker
ya está conectado en Settings → Builds con comandos anteriores (registro abajo).
Antes, un segundo release manual autorizado publicó `f87b39c` (versión
`866609e7-72bd-424d-91a4-b33857780fd6`) porque aún no existía build de `wildcard-site`;
los pushes a `main` solo producían API, web y administración.

Conexión Workers Builds (1 de noviembre de 2026): configurada en panel con conexión
GitHub existente `imlautaro/wildcard`, rama `main`, raíz `/`, build
`npm ci && npm run typecheck:site && npm run build:site` y despliegue
`npm run release:site`. Builds activos, previews desactivadas y caché activa. El
include inicial `*` se reemplazó luego por [watch paths por dependencia](#build-watch-paths),
sin exclusiones. Se seleccionó credencial `Workers Builds - 2026-05-27
10:54`; no se creó/amplió ni agregó variables/secretos. Cuentas independientes deben
elegir su credencial con permisos descritos. Cloudflare confirma conexión y que
próximo push inicia primer build. No hubo push/despliegue para validarla; primer
release automático y versión fuente sin verificar.

Rollback: revierte o elimina `wildcard-site`. No guarda datos ni otro Worker depende de él.

## Worker de documentación

El sitio técnico es opcional e independiente: Worker solo estático `wildcard-docs`,
en `apps/docs/wrangler.jsonc`. Es workspace npm `@wildcard/docs`, con
[Docus](https://docus.dev) 5.15 (capa Nuxt sobre Nuxt Content, Nuxt UI y Tailwind CSS)
y `@nuxtjs/i18n`, páginas inglesas en `apps/docs/content/en` y españolas en
`apps/docs/content/es` (árboles idénticos; excepción bilingüe aprobada a documentación
solo inglesa). Las referencias completas inglesas se generan desde `docs/*.md`;
las traducciones españolas completas se mantienen en `apps/docs/reference/es/`.
Aparecen en pestaña Referencia, con enlaces internos desde resúmenes y entre guías.
`scripts/prepare-docs-reference.mjs` corre antes de desarrollo, tipos y builds.
Rechaza revisiones españolas ausentes/obsoletas registradas en `sources.json`;
traduce guías modificadas y actualiza SHA-256 en mismo cambio. Los generados
`content/*/6.reference/` y `public/reference-assets/` se ignoran y no deben guardarse
en Git. Reinicia servidor de desarrollo tras cambiar fuentes para regenerar.

No extiende `packages/ui` ni tiene script, binding, D1, R2, Workflow, Cron, secreto
ni migración.

El índice usa `/en/reference/overview` y `/es/reference/overview`. Un `index.md`
de sección entra en conflicto con la ruta de portada localizada de Docus; por eso
el generador escribe `1.overview.md`. Las entradas versionadas de `public/_redirects`
redirigen `/en/reference` y `/es/reference` a sus páginas de índice.

El JSON de filtros se publica como página de código en
`/en/reference/workers-build-paths` y `/es/reference/workers-build-paths`, para que
Docus no convierta un enlace de recurso raíz en un archivo localizado inexistente.
Open Graph tiene un límite acotado de 60 segundos (`ogImage.security.renderTimeout`)
para generar imágenes en frío durante el prerrenderizado bilingüe más amplio.
Los errores de prerrenderizado siguen haciendo fallar el build.

`npm run build:docs` ejecuta `nuxt generate` con `nitro.preset: 'static'` (explícito
para que Workers Builds no cambie a preset de servidor Cloudflare) y prerrenderiza
`/en/**`, `/es/**`, `llms.txt`, `llms-full.txt`, Markdown bruto en `/raw/**`, sitemaps
e imágenes Open Graph en `apps/docs/.output/public`. Rastrear enlaces con
`failOnError` hace fallar enlaces internos rotos. `public/_redirects` envía `/` a
`/en`; desconocidas responden `404.html`. Funciones Docus de servidor (asistente
IA, MCP) requieren runtime y están desactivadas. Nuxt Content escribe SQLite local
en `apps/docs/.data/` (ignorado), y `nuxt generate` enlaza `apps/docs/dist` a salida
(ignorada). Docus agrega `better-sqlite3` y dependencias al lockfile raíz, instalado
por cada proyecto; `typescript` elevado a raíz pasó a 6.0.3 mientras API conserva
TypeScript 7.0.2 en `apps/api/node_modules` (pasaron tipos API/web/administración/sitio).

Aprovisionamiento:

1. En `apps/docs/wrangler.jsonc`, reemplaza `account_id` y `name` si `wildcard-docs` está ocupado.
   En `apps/docs/nuxt.config.ts`, pon `siteUrl` al origen (canonical, sitemap,
   Open Graph).
2. Crea otro proyecto del mismo repositorio/rama: raíz `/`, build
   `npm ci && npm run typecheck:docs && npm run build:docs`, despliegue
   `npm run release:docs`. Basta Workers Scripts edit y lectura de cuenta.
   Desactiva previews.
3. Configura [watch paths](#build-watch-paths) (`apps/docs/*`, `docs/*`,
   `scripts/prepare-docs-reference.mjs`, `scripts/release-docs.mjs` y entradas raíz)
   y quita `*` predeterminado.
4. Haz push. `scripts/release-docs.mjs` aplica protecciones anteriores y despliega
   `apps/docs/wrangler.jsonc` etiquetado con commit.

Verificación de referencia: ejecuta `node scripts/prepare-docs-reference.mjs` y
`node scripts/check-docs-reference.mjs` para cobertura de fuentes/traducciones,
analizar Markdown, enlaces internos y anclas sin build. Al autorizar build, abre
`/en/reference/chats`, `/es/reference/chats`, `/en/reference/groups` y
`/es/reference/groups`; comprueba pestaña Referencia, búsqueda, tablas/código largos
y enlaces de Conversaciones en escritorio/móvil. Aún no se comprobó esta UI completa
en navegador.

Verificación: `/` responde 302 a `/en`; `/en`, `/es`, una página de cada idioma y
`/llms.txt` responden 200; desconocida 404 con página propia.

Release inicial (1 de noviembre de 2026): como excepción aprobada, `wildcard-docs`
se desplegó manualmente con `npx wrangler deploy --config apps/docs/wrangler.jsonc`
desde árbol **sin commit** sobre `3ea1f3e` (versión
`d269cff6-80d1-4872-bdda-f4f40f4e6d54`, sin etiqueta); un segundo despliegue del
mismo árbol publicó `55cd665e-c3a9-4ea5-b6b6-198f6958272c` con corrección de texto.
Antes, `npm run build:docs` prerrenderizó 299 rutas, pasó comprobación de enlaces/anclas
de 70 páginas y se sirvió con `wrangler dev`. Después,
`https://wildcard-docs.imlautaro.workers.dev` respondió `/` 302 → `/en`, `/en`, `/es`,
páginas, `/llms.txt` y sitemap 200, desconocidas 404; páginas a 1440/390 px sin
desbordamiento horizontal. Workers Builds no estaba conectado para esos releases.

Conexión (2 de noviembre de 2026): `wildcard-docs` existente conectado a
`imlautaro/wildcard`, `main`, raíz `/`, comandos anteriores. Producción y caché
activas, previews desactivadas. Al conectar, includes inspeccionados:
`apps/docs/*`, `scripts/release-docs.mjs`, `package.json`, `package-lock.json`,
`.nvmrc`, `.npmrc`, `.gitignore`, sin exclusiones. La
[referencia](workers-build-paths.json) versionada exige además `docs/*` y
`scripts/prepare-docs-reference.mjs`; ambos se añadieron y guardaron en el panel
de producción el 2 de noviembre de 2026.
Extiende Docus, no `packages/ui`, por lo que cambios de capa UI no disparan docs.
Se reutilizaron conexión GitHub y credencial `Workers Builds - 2026-05-27 10:54`;
sin credenciales, permisos, variables ni secretos nuevos. Instalaciones independientes
eligen su credencial con permisos descritos. Checkout limpio y HEAD igual a `main`
remoto en `cb47e2f533f8556db905e5891f23789342cd2c9b` antes de conexión. Se inspeccionaron
ajustes guardados y previews desactivadas. Cloudflare indica que próximo push
coincidente inicia primer build. Sin push, build local, pruebas ni despliegue para
configuración; primer release y fuente siguen sin verificar.

Rollback: revierte o elimina `wildcard-docs`. Sin datos ni dependientes.

## Configuración local

```sh
npm ci
npm run auth:setup:local
npm run typecheck
npm run dev
npm run dev:web   # optional web app on http://localhost:3000, proxied to the local API
npm run dev:admin # optional admin panel on http://localhost:3001; needs ADMIN_LOCAL_ROUTES=true in .dev.vars
```

La configuración genera `apps/api/.dev.vars` ignorado y solo del propietario con
`BETTER_AUTH_SECRET` aleatorio y `BETTER_AUTH_URL=http://localhost:8787`, y aplica
migraciones pendientes, incluidas `0001_auth.sql`, `0002_contacts.sql` y
`0003_chat_turns.sql`, a D1 local Wrangler. Conserva `.dev.vars` existente. Plantilla
segura versionada en `.dev.vars.example`. D1 local se ignora bajo `.wrangler/`;
no conecta producción. No requiere login Cloudflare para emular. Para modelos
locales agrega `META_API_KEY` al ignorado; llama a Meta y puede consumir créditos.
Sin clave, envíos nuevos dan 503 pero autenticación/contactos funcionan.

`npm run db:migrate:local` aplica solo pendientes locales. `db:migrate:remote` modifica
base de producción configurada y se reserva a operaciones explícitamente autorizadas;
los releases ya lo hacen. `npm run types --workspace @wildcard/api` regenera tipos
ignorados desde Wrangler; `npm run typecheck` lo incluye. `npm run build` es ensayo
local y no publica. Sigue preferencias de pruebas/builds del repositorio.

## Mensajes de voz

Los [mensajes de voz](voice.md) necesitan `0060_voice_messages.sql` (columnas aditivas
en `contact_agent`, `contact`, `chat_turn`, `group_message`). El audio usa bucket
privado `CONTACT_PHOTOS` y registro de adjuntos existentes; sin bucket, binding ni
Cron nuevos.

- **Transcripción (requerida):** `META_API_KEY` existente. Su proyecto debe permitir
  `muse-voice-transcribe-1.0`. Corre en Workflow después de enviar; WAV se lee de R2.
- **Habla y catálogo (opcionales):** clave ElevenLabs con acceso a texto a voz
  `eleven_v4` y voces, como secreto `ELEVENLABS_API_KEY`. No está en
  `secrets.required`, por lo que releases sin ella pasan. En producción agrégala
  cifrada al proyecto Builds API; script la copia a ejecución como `META_API_KEY`
  y conserva la existente si se omite en build. Localmente en ignorado
  `apps/api/.dev.vars`. Nunca la guardes en Git.
- **Indicador del operador:** voces desactivadas hasta activar **Contact voice
  messages** (`voice_messages_enabled`) en [administración](admin.md). Activado sin
  clave sigue apagado.

Para voces del mercado, guárdalas en My Voices/colección de misma cuenta o workspace
ElevenLabs que la clave. Backend combina catálogos paginados `default` y `saved`;
clave necesita lectura de voces y texto a voz. Voice Library API requiere plan pago
elegible. Las guardadas se ofrecen a usuarios autorizados de toda la instalación.
Sin secreto, binding ni migración nuevos. Publica por commit/push automático; verifica
predeterminadas/guardadas, muestras y selección en ambos tras vencer caché servidor
de una hora y recargar catálogos. Validación real pendiente. Revertir oculta voces
solo guardadas del selector pero conserva IDs y audio; síntesis depende del acceso.
Consulta [voces](voice.md#contact-voices).

Orden: aplicar migración por release normal, configurar secreto y activar indicador.
Rollback: apagar indicador (sin release); código puede revertirse sin rollback de
datos porque columnas aditivas no usadas por anterior. Clientes antiguos muestran
mensajes de voz como texto.

El 29 de octubre de 2026 el usuario autorizó una excepción única: se cargó
`ELEVENLABS_API_KEY` de producción con `wrangler secret put` (versión `bb64b9e5`,
desde commit `1fc3526`) en lugar de variable Builds. Releases la conservan. Rota por
variable de build; no repitas carga manual sin autorización nueva.

El modelo de habla está versionado en `apps/api/src/voice/speech.ts`; cambia con
commit/push y despliegue API automático. Sin recursos/migración nuevos. Revertir
selección solo afecta respuestas nuevas; audio guardado sigue compatible. Tras
release, verifica acceso v4, voces y calidad en iOS/web; llamadas v4 sin verificar
para este cambio.

Sin verificar al implementar: llamadas ElevenLabs reales, valores `age` de catálogo,
transcripción real Meta de clips guardados y ambos clientes en dispositivos.

### Entrega informal de voz y acento (0061)

Aplica `0061_speech_accent.sql` por release API normal antes de consultar
`contact_agent.speech_accent`. Agrega preferencia compartida anulable/restringida;
filas existentes quedan null sin rellenado retroactivo. Usa mismos
`ELEVENLABS_API_KEY`, modelo v4, endpoint, formato y R2. Sin secretos, permisos,
bindings ni recursos nuevos. Código/preajustes en `shared/voice.ts` y
`apps/api/src/voice/`.

Usa commit/push; sin despliegue ni migración remota manual. API antes de selector
en clientes. Los antiguos ignoran campo aditivo y conservan preferencia en ediciones
ajenas. Revierte código sin quitar columna ni reescribir migración aplicada; audio
sigue reproducible. Volver a código previo ignora acento y ajustes guardados.

Tras publicar, verifica escritura solo creador, rechazo miembro, restablecer null,
paridad privada/grupal y audio nuevo v4 en ambos. Escucha pronunciación argentina
y voseo sin exageración; compara mensajes serios/informales con misma voz. Rechazo
del proveedor debe conservar texto. Las muestras no validan síntesis. Estas
comprobaciones, aceptación del proveedor y fidelidad siguen sin verificar.

## Migraciones, compatibilidad y verificación

`0001_auth.sql` crea tablas de usuario, sesión, cuenta, verificación y límites,
índices, restricciones únicas y cascadas foráneas. Drizzle y SQL usan milisegundos.
Es aditiva y compatible con API vacía anterior. Corre antes de cargar código;
nunca reescribas migración aplicada. Revertir Worker no deshace D1 ni recupera datos.
Revisa compatibilidad futura con Worker activo.

`0002_contacts.sql` agrega contactos privados a D1, con FK de propietario e índice
propietario/creación. Sin recurso ni credencial adicionales. Configuración local
y release automático la aplican con comandos existentes. Compatible con Worker
solo auth; revertir código no elimina contactos ni migración. Consulta
[contactos](contacts.md) para contrato, aislamiento, retención, flujo nativo y límites.

`0003_chat_turns.sql` agrega turnos privados y restricción atómica de un turno activo.
Consulta [chats](chats.md) para ciclo, límites, retención, recuperación y rollback
con instancias activas. Wrangler versiona Workflow/Cron con API. Staging requiere
nombre Workflow, Worker, base, secretos y origen iOS separados. Modelos y Workflows
consumen cuotas de cuentas; no cambia planes de facturación.

Verifica que release no tenga migraciones pendientes, `DB` use ID previsto y exista
nombre de secreto. GET sin autenticar a `/api/v1/me` devuelve JSON 401; otras rutas
conservan JSON 404. Guía auth tiene escenarios ficticios para pruebas autorizadas.
No expongas base ni secretos para validar.

Se comprobaron TypeScript, bindings generados, sintaxis release/aprovisionador y
Swift al implementar. Sin pruebas auth de ejecución ni builds locales. Reproducción
en otra cuenta y comportamiento iOS instalado siguen sin verificar.

## Referencias

- [Comandos D1 de Wrangler](https://developers.cloudflare.com/d1/wrangler-commands/)
- [Migraciones D1](https://developers.cloudflare.com/d1/reference/migrations/)
- [Configuración Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Secretos Worker](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Límites de CPU y plataforma Workers](https://developers.cloudflare.com/workers/platform/limits/)

## Web Push de navegador — migración 0085

Opcional. Agrega notificaciones sin recurso/binding Cloudflare nuevo. Aplica
`apps/api/migrations/0085_web_push.sql` (`web_push_subscription` aditiva) después de
0084. Para entregar genera par VAPID con `node scripts/generate-vapid-keys.mjs` y
configura secretos cifrados Builds `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y
`VAPID_SUBJECT` juntos; `scripts/release-worker.mjs` los reenvía. Sin ellos el
interruptor informa no configurado y nada más cambia. Rollback: elimina secretos,
conserva tabla. Detalles: [notificaciones](notifications.md#browser-web-push).
Sin verificar: entrega a servicios push reales.

## Notificaciones push de Apple

Las [notificaciones de respuesta](notifications.md) agregan APNs como servicio externo
opcional. Aprovisiona App ID/capacidad Apple, perfiles de firma y clave de proveedor
antes de configurar secretos cifrados Builds `APNS_PRIVATE_KEY`, `APNS_KEY_ID`,
`APNS_TEAM_ID` y `APNS_TOPIC`. El release los reenvía; actualiza los cuatro juntos.
Sin ellos los chats funcionan y las notificaciones pendientes vencen. Sin binding
Cloudflare nuevo. `0004_push.sql` agrega dispositivos ligados a sesión y outbox a
D1 existente; release/migración local la aplican. Workflow entrega de inmediato
y Cron reintenta. Conserva tablas aditivas al revertir. La guía cubre cuentas
Apple independientes, permisos, firma sandbox/producción, configuración privada
local, retención, staging, verificar y rollback. No se verificaron clave Apple,
configuración remota, push real ni dispositivo instalado al implementar.

## Migración de lectura y recuperación de firma push

`0005_read_state.sql` agrega `contact.last_read_sequence` con cero predeterminado.
Comandos existentes locales/automáticos la aplican antes de cargar código; sin
servicio, binding, credencial ni permiso nuevos. Conserva columna al revertir.
Respuestas existentes cuentan no leídas hasta verse; confirmarlas descarta push
en cola. El proveedor firma con Web Crypto PKCS#8/P-256 nativo en lugar del camino
incompatible PrivateKeyObject de Workers node:crypto. Secretos APNs existentes
siguen válidos. Observa `push_accepted`, `push_provider_signing_failed` o eventos
saneados `push_delivery_deferred` de estado/motivo tras release autorizado; nunca
inspecciones tokens ni contenido para verificar. Cantidades y marcas quedan en
cuenta propietaria, sin compartir. Consulta [notificaciones](notifications.md) y
[contactos](contacts.md) para clientes, contratos, límites y estado.

## Insignias y vistas previas de respuestas

Las alertas llevan nombres, texto acotado y total `aps.badge` del propietario,
según pedido del 26 de octubre de 2026. Reutiliza clave APNs, Workflow, Cron,
columna de lectura y release automático; sin recurso, migración, permiso ni secreto
nuevos. La carga se limita a 4096 bytes UTF-8 serializados; solo se acortan vistas
previas, nunca respuestas guardadas. iOS debe actualizarse para pedir permiso de
insignia, sincronizar tras leer/actualizar y borrar al cerrar sesión. Ajustes del
sistema controlan insignias y vistas en bloqueo. Verificar no debe imprimir cargas
ni mensajes en logs. Consulta [notificaciones](notifications.md) para comportamiento,
retención, límites y rollback.

## Almacenamiento privado de fotos de contacto

El binding versionado `r2_buckets` requiere bucket privado antes del siguiente
release. `wildcard-contact-photos` de producción se creó/verificó el 26 de octubre
de 2026 en cuenta configurada con Standard storage. r2.dev está desactivado, sin
dominios públicos propios. No se cambiaron/verificaron remotamente capacidades
Apple ni perfiles.

En cuenta independiente activa R2 si hace falta por configuración normal, revisa
plan y elige nombre. Actualiza `account_id` y `r2_buckets[].bucket_name` en
`apps/api/wrangler.jsonc`, conserva `binding: CONTACT_PHOTOS`. Usa Workers R2
Storage Edit para crear/metadatos; info de Wrangler consulta métricas y necesita
Account Analytics Read. La credencial automática requiere acceso al bucket además
de Workers/D1/Workflow. Sin credencial S3 R2 ni secreto de ejecución nuevo.

Desde raíz, en cuenta prevista autenticada:

```sh
npm run infra:photos -- --create  # Create the configured bucket once, then verify
npm run infra:photos             # Verify an existing bucket without creating it
```

Crear no publica Worker ni habilita público. Si informa nombre existente, verifica
con segundo comando sin recrear. Mantén r2.dev y dominios públicos desactivados.
El script no modifica configuración pública previa; verifica privacidad en panel
R2. Staging en otro bucket ligado solo a Worker/configuración separada. Aquí no
se aprovisiona staging.

Después commit/push de configuración y función juntas por pipeline. La migración
`0006_contact_photos.sql` corre antes de publicar. Verifica SHA, estado y bucket
de `CONTACT_PHOTOS`. Con comprobación autorizada de cuenta ficticia, confirma
lecturas sin autenticar 401, URL firmada alterada 404 y otro propietario sin acceso
a leer/reemplazar. No inspecciones datos privados reales para validar.

`npm run auth:setup:local` aplica todas incluidas 0006. `npm run dev` emula R2 en
`.wrangler` ignorado; no agregues `remote: true` al desarrollo local. No copia objetos
 de producción.

Firma/instala app iOS y `WildcardNotificationService` integrada con tu equipo Apple.
El ID de extensión debe extender principal; reemplaza
`com.imlautaro.Wildcard.NotificationService` en cuentas independientes. Configura
`WILDCARD_API_URL` en Debug/Release de ambos. Principal agrega
`com.apple.developer.usernotifications.communication` y declara
`INSendMessageIntent`; habilita Communication Notifications y renueva perfil si
necesario. La extensión usa punto estándar y no requiere credenciales compartidas.
Clave/topic APNs sigue referido a ID principal. No se cambió/verificó remotamente
capacidad ni perfil Apple.

Conserva bucket y columna al revertir. Eliminar/reemplazar R2 no se deshace con
Worker. Limpieza de mejor esfuerzo puede dejar huérfanos privados por fallos/crashes;
sin barrido automático. La eliminación futura de cuenta debe quitar objetos aparte
de cascadas D1. Consulta [fotos](profile-photos.md) para límites, acceso, retención,
rollback y comprobaciones físicas pendientes.

## Modelo Contributor de desarrollo

La configuración global Contributor solo del propietario del 26 de octubre quedó
reemplazada por [ajustes por cuenta](model-settings.md), pedidos el 27 de octubre
de 2026. `0028_account_model.sql` pone Estándar a todas, incluidas existentes.
Los usuarios activan Contributor explícitamente en Cuenta iOS/web. `META_CHAT_MODEL`
sigue Estándar como predeterminado sin alcance; D1 elige inferencia, no cambios
solo en panel. Consentimiento compartido es independiente. Chats MCP privados
siempre usan Estándar.

## AI Gateway opcional para gasto Spark

Aprovisiona gateway autenticado dedicado `wildcard` y proveedor personalizado de
cuenta `meta` con base `https://api.meta.ai` antes de enrutar. Binding AI versionado
es `AI`; `AI_GATEWAY_ID=wildcard` activa todas las llamadas Spark, incluidas memoria,
herramientas, programaciones y grupos. La clave sigue `META_API_KEY` existente;
binding autentica solicitudes Cloudflare automáticamente. Sin token gateway en
ejecución ni clave proveedor guardada por panel.

La configuración productiva versionada pone `AI_GATEWAY_ID=""` para restaurar
llamadas Meta directas tras HTTP 502 del gateway el 27 de octubre de 2026. Afecta
ambos por API, sin migración/secreto nuevo y conserva preferencias/consentimiento.
Las directas no aparecen en gasto gateway. Conserva gateway/logs; restaura ruta
solo tras verificar aparte y publicar configuración por commit/push automático.
Los Workflows existentes retienen versión original. Consulta
[evidencia de diagnóstico](model-settings.md#gateway-provisioning) y reintenta un
turno fallido tras publicar para verificar generación. Los fallos solo emiten
transporte y estado HTTP en logs.

Para otra cuenta, reemplaza `account_id`, IDs y orígenes D1/R2/Worker anteriores,
aprovisiona requeridos y ejecuta `npm run infra:ai-gateway -- --create`. El script
apunta a `wildcard` con variable vacía, permitiendo aprovisionar/verificar desactivado;
de otro modo usa ID configurado. Usa credenciales Wrangler en memoria o
`CLOUDFLARE_API_TOKEN` explícito; administrar requiere AI Gateway Read y Edit/Write.
Nunca muestra tokens, sobrescribe proveedor ni despliega. Sin `--create`, solo
verifica. 403 significa permisos insuficientes; usa panel según
[ajustes de modelo](model-settings.md#gateway-provisioning) o credencial con alcance
adecuado. No agregues gestión a ejecución.

Logs de cargas, caché de respuesta, reintentos y límites gateway están apagados;
autenticación activa. Las cabeceras por solicitud activan logs de metadatos sin
cuerpos originales, omiten caché, proporcionan tarifas incluidas lecturas Meta de
caché y permiten un intento. Es solo observabilidad: sin respaldo de modelo,
división de rutas, logging de prompts, guardrails, búsqueda ni facturación unificada.
Errores no pasan silenciosamente a Meta directo. Costos estimados con tarifas USD
públicas comprobadas el 27 de octubre de 2026; actualiza `chat/meta.ts` al cambiar.
ASR de voz sigue directo y excluido.

`.dev.vars.example` local pone `AI_GATEWAY_ID=` para apagar remoto. No existe
staging separado; aprovisiona gateway/proveedor/cuenta y cambia bindings para no
usar producción accidentalmente. Tipos generados con `--strict-vars false` porque
cada solicitud/trabajo copia Env generado y selecciona modelo validado dinámicamente;
bindings siguen generados.

Publica solo por commit/push autorizado y Workers Builds. Script aplica 0028 aditiva
antes; sin secreto ni despliegue manual. Verifica etiqueta, registro 403, persistencia/
permisos, ambos modelos y logs/costos sin cargas con datos ficticios bajo validación
autorizada. Trabajos en curso retienen modelo/versión. Revierte solo por automático:
conserva columna y valores, no reviertas migraciones ni borres D1/R2. Para omitir
gateway opcional vacía `AI_GATEWAY_ID` versionado y commit/push; conserva logs.
Volver directo no elimina datos enviados antes. Revertir a Contributor global
puede ignorar preferencias; revisa antes.

El 27 de octubre se crearon y vieron gateway/proveedor en panel. La credencial
Wrangler dio 403 al administrar, por lo que script no los leyó independientemente.
Ruta con binding, activación por API, análisis de uso, costos y supresión de cargas
siguen sin verificar hasta release autorizado y solicitud ficticia.

Referencias: [proveedores personalizados](https://developers.cloudflare.com/ai-gateway/configuration/custom-providers/),
[logs](https://developers.cloudflare.com/ai-gateway/observability/logging/),
[costos personalizados](https://developers.cloudflare.com/ai-gateway/configuration/custom-costs/),
[precios Meta](https://dev.meta.ai/docs/pricing-rate-limits).

## Memoria de contacto y búsqueda de historial

La [memoria](memory.md) reutiliza `DB`, `CHAT_WORKFLOW`, `META_API_KEY` y
`META_CHAT_MODEL`. Sin servicio, base vectorial, embeddings, binding, secreto,
permiso ni plan pago nuevos. La inferencia de extracción/recuperación consume
créditos Meta elegidos; índices y consultas D1 sus cuotas. Consentimiento Contributor
configurado también cubre entradas de chats de prueba del propietario. Instalaciones
independientes mantienen Estándar salvo autorización separada. Consulta
[contactos compartidos](sharing.md) y 0013 abajo para compartir y consentimiento.

`0007_contact_memory.sql` agrega tablas de memoria/cursor por propietario, FKs de
fuentes e índice SQLite FTS5 externo mantenido por triggers. Indexa archivo existente
una vez al migrar; prevé tiempo/cuota en base poblada. Extraer ocurre en lotes
Workflow acotados al conversar, no en migración. No reescribas aplicada ni dispares
rellenado masivo aparte con modelo.

En otra cuenta aprovisiona D1/Workflow primero y aplica todas con
`npm run auth:setup:local` (o `npm run db:migrate:local` si existente). Configura
secreto local solo si deseas inferencia. Release hace mismas migraciones remotas
antes de fuente con commit/push. Verifica acceso a herramientas de función Chat
Completions Muse Spark y JSON estructurado; sin cambios de clave/permisos al implementar.

Comprueba build, SHA/etiqueta, bindings DB/Workflow y migraciones tras push autorizado.
Con datos ficticios verifica recordar tras ventana reciente, palabras alternativas,
fecha/cursor, extractos/offsets, propietarios/contactos separados, mantenimiento
repetido, conflictos, eliminar contacto y fallos de memoria/proveedor. No imprimas
hechos, citas, argumentos/resultados ni cuerpos en logs. Eventos saneados:
`chat_memory_deferred`, `chat_retrieval_failed`.

Esquema aditivo compatible con anterior. Revertir conserva memorias, cursores,
índices y triggers; no borra ni revierte etiquetas. Conserva clase/binding para
instancias activas; no elimines tablas mientras nuevas puedan usarlas. Staging
requiere D1/Worker/Workflow y secretos separados.

Se hicieron tipos/bindings TypeScript, compilación SQL con EXPLAIN sobre SQLite
migrado vacío y espacios localmente. Sin builds, pruebas durante ejecución,
inferencia paga, migraciones remotas, push ni despliegue para cambio. Comportamiento
real de herramientas/JSON Estándar/Contributor e instalación independiente sin verificar.

## Presencia de contactos

Reutiliza D1 `DB`, `CHAT_WORKFLOW` y Cron de minuto; sin servicio, secreto, permiso
ni recurso nuevos. Otra instalación sigue orden/bindings anteriores.
`0008_contact_presence.sql` crea tabla por propietario, índice de vencimiento y
triggers. `0009_delayed_contact_connection.sql` los reemplaza para que trabajo en
cola preserve presencia hasta que Workflow conecte tras espera duradera de tres
segundos. Ambas antes de release. Local: `npm run db:migrate:local`. Commit/push
para misma migración remota y código; no manual en producción para implementación
sin push.

Workflow persiste Escribiendo solo al generar, luego plazo inactivo 30 segundos
tras completar/fallar por triggers D1. Espera duradera vence lease; Cron e historial
concilian vencidos. Trabajo en cola/curso tiene lease de seguridad 15 minutos,
renovado en cada intento. Detalles, campos, costo/latencia y fallos en
[chats](chats.md#persisted-contact-presence). Cron barre sin clientes. Vence condicionado
al plazo actual para que trabajos viejos no anulen actividad nueva.

Tras release autorizado verifica 0008/0009 y bindings sin cambios; con contacto
ficticio confirma que trabajo aceptado deja brevemente Fuera de línea/Últ. vez antes
de En línea → Escribiendo → En línea → Fuera de línea y lastSeenAt refleja plazo,
incluso con iOS cerrado. Reabrir lee mismo estado. Un segundo envío en ventana
inactiva debe sobrevivir vencimiento del primero. Entre propietarios aún 404.
Estas verificaciones funcionales, remotas y apariencia no se hicieron localmente.
Revertir puede dejar tabla/triggers; clientes antiguos ignoran JSON nuevo. Detén
escritores Workflow/Cron antes de rollback destructivo deliberado. No borres
contactos/historial para deshacer presencia.

### Leases de visita al chat y actividad de borrador

Reemplazado parcialmente por [orden de presencia (0045)](#presence-ordering-migration-0045):
visitar ya no conecta, por lo que comprobaciones En línea de abajo ya no aplican.

Aplica `0010_chat_visits.sql` tras 0008/0009. Agrega `chat_visit` y cambia trigger
para combinar leases atómicamente. El Workflow `wildcard-chat` y binding
`CHAT_WORKFLOW` aceptan rama `kind: visit` además de turnos/intentos. Wrangler ya
aprovisiona todo: D1, Workflow, Cron. Sin recurso, secreto ni permiso; visitar no
requiere Meta. Conserva compatibilidad de cargas al actualizar/revertir con trabajos
activos. Tipos derivan unión desde entrypoint exportado; regenera con typecheck.

Local: `npm run db:migrate:local`, luego `npm run dev` con bindings existentes.
Producción por commit/push automático, nunca manual. Cron vence presencia, elimina
visitas de más de un día y recupera despacho pendiente acotado. Las visitas duermen/
comprueban plazos actuales; borrador prolongado recae en Cron/solicitudes tras 120
ciclos. Lee [visitas](chats.md#visiting-a-chat-and-composing-a-draft) para límites,
ciclo, tiempos, metadatos y fallos.

Tras release verifica 0010 y mismos bindings. Con datos ficticios comprueba abrir
→ En línea demorado → Fuera de línea inactivo sin enviar, editar extiende, teclado
sin cambios vence, salir antes de conectar, segundo plano/cierre, sesiones múltiples
y generación superpuesta. Nunca debe mostrar agente Escribiendo ni crear turno,
modelo o push. Sin comprobar localmente. Rollback debe considerar trabajos
`kind: visit`: código anterior no entiende. Vacía/termina primero o conserva rama;
deja tablas aditivas y restaura triggers compatibles deliberadamente. No requiere
rollback de esquema para iOS existente sin actividad.

## Sonidos incluidos de mensajes y notificaciones

Usa integración APNs y recursos existentes. Incluye tres
`apps/ios/Wildcard/Sounds/*.wav` en otra instalación; grupo sincronizado los empaqueta.
Instala cliente antes de API que nombra WAV de flauta en `aps.sound`. Publica API
por commit/push autorizado y verifica build/SHA. Sin aprovisionar, migrar, secreto
ni capacidad de firma nueva. Consulta
[sonidos y verificación](notifications.md#message-sounds-october-27-2026) para archivos,
compatibilidad, rollback y pendientes.

## Mensajes programados de contactos

Las [programaciones](schedules.md) reutilizan D1, `CHAT_WORKFLOW` / `wildcard-chat`,
Cron de minuto, clave Meta y APNs opcional. Sin recurso, binding, secreto, dependencia
ni permiso Cloudflare extra. Sigue orden existente y Worker/D1/Workflow/origen iOS
separado en staging.

`0011_contact_schedules.sql` agrega tablas de programación/recibos de mutación,
columnas anulables de chat, índices de ocurrencia y triggers de cursor/cancelación.
`npm run auth:setup:local` local; commit/push autorizado aplica remoto antes de
publicar. Nunca manualmente. Handler despacha vencidos desde Cron; recuperación
existente reintenta fallos de despacho. APNs opcional: mensajes persisten sin dispositivos.

Tras release verifica 0011, bindings sin cambios, SHA/etiqueta y endpoints autenticados
de lista/cancelar. Con tareas ficticias verifica futuro/intervalos, no duplicar,
editar/cancelar pendiente, eliminar contacto, zonas horarias y notificar con app
cerrada. No se validaron tiempo real ni herramientas proveedor; solo estático.
Sin migración remota ni release en turno de implementación.

Rollback debe conservar tablas/columnas aditivas y clase Workflow existente. No
borres tablas mientras claves de chat o instancias las referencien. Antes de
volver a código sin comprobaciones de cancelación, cancela programaciones activas
y resuelve/detén trabajos programados y push pendientes; una versión antigua no
puede aplicar estas garantías. El Worker anterior no despacha nuevas programaciones,
pero Workflows iniciados siguen en su versión original. Para pausar temporalmente
sin perder datos, conserva esquema nuevo y código consciente de cancelaciones y
desactiva solo `dispatchSchedules`; recuperación de chats y Cron push deben seguir disponibles.

## Adjuntos de chats privados

Los [adjuntos](attachments.md) reutilizan bucket/binding privado `CONTACT_PHOTOS`
bajo `attachments/`; no requieren acceso público, credenciales extra ni servicio
nuevo. Otra instalación aprovisiona bucket antes de habilitar envíos, con
`npm run infra:photos` y reemplazos anteriores. `0012_chat_attachments.sql` agrega
metadatos anulables, índice de expresión y registro de objetos huérfanos. Aplica
localmente con migración normal; producción por commit/push automático. Cron de
minuto elimina hasta 20 objetos sin referencia de más de 24 horas, reintentando
fallos después; eliminar contacto revoca descarga de inmediato con limpieza diferida.
Mantén handler en otras cuentas. Política Meta configurada también cubre inferencia de archivos.

Verificar requiere instalar iOS nuevo y publicar backend. Usa imágenes/PDF ficticios,
inspecciona recuperación privada, reintentos y limpieza diferida según guía. Inferencia
real, vistas en dispositivo y limpieza remota sin verificar. Es aditivo: revertir
conserva metadatos y objetos R2 y restaura limpieza Cron compatible.

## Migración de contactos compartidos

Los [compartidos](sharing.md) reutilizan D1 `DB`, `CHAT_WORKFLOW`/`ChatWorkflow`, Cron
de minuto, R2 privado `CONTACT_PHOTOS`, autenticación y Meta. APNs opcional. Sin
recursos, bindings, credenciales de aprovisionamiento, secretos ni permisos nuevos.
`migrations_dir` existente incluye automáticamente `0013_shared_contacts.sql`.

Aplica 0001–0012 y luego 0013 con `npm run db:migrate:local` localmente. 0013 crea
`contact_agent`, `contact_invite`, `agent_attention`, `agent_presence`; agrega
membresía/consentimiento Contributor a contactos y `read_at` anulable a turnos;
rellena identidades, presencia, reclamaciones activas y lecturas históricas; reemplaza
triggers anteriores. IDs de conversación, historial privado, programaciones, marcas,
adjuntos y push permanecen. Los triggers imponen proyección de metadatos y admisión
exclusiva. `contact_presence` anterior se conserva pero deja de ser autoridad.

Las respuestas proyectan `typing` a `online` para conversaciones distintas de la que
tiene atención con turno/intento coincidente en curso. Usa `agent_presence`,
`agent_attention`, `contact`, `chat_turn` existentes; sin recurso, configuración,
secreto, migración ni esquema cliente nuevos. Publica por mismo commit/push automático.
Conectividad global, última conexión/vencimiento y cola se conservan.

Usa orden anterior y reemplaza bindings, origen, modelo, bundle/equipo iOS y APNs
opcional por cuenta. Prefiere Estándar salvo aceptación explícita del operador y
cada participante de uso de datos Contributor. Compartir/unirse informa modelo y
persiste consentimiento; miembros sin consentimiento no generan con él ni aportan
memorias a sus entradas hasta aceptar invitación nueva. Sin secretos en códigos,
logs, fuente ni documentación. Resúmenes de invitación solo en D1; códigos son
capacidades aleatorias criptográficas, con vencimiento y un uso, compartidas por usuario.

Producción: commit/push de migración, Worker, iOS y docs completos, luego Builds
migra/publica. Verifica estado final y etiqueta contra commit, sin pendientes y
bindings DB/Workflow/R2 por nombre. Nunca manualmente. Evita iniciar trabajo en
ventana de migración/release: protección de atención puede rechazar Workflow antiguo
aceptado tras relleno y antes de publicar nuevo; aparece turno fallido reintentable
con versión nueva. Turnos activos previos reciben reclamaciones y no se superponen
con generación nueva. No habilites compartir hasta verificar release. Instala iOS
con Xcode para invitaciones, consentimiento, acceso y lecturas reales. Clientes
anteriores carecen de gestión y su confirmación de eliminar creador no explica
eliminación compartida; actualiza antes.

Volver a Worker antiguo no es seguro tras compartir: no entiende propiedad de agente,
metadatos, consentimiento ni atención. Conserva esquema y usa corrección hacia delante
o versión que entienda compartir. No borres/reconstruyas ni restaures D1 aparte de
Workflows, chats privados y R2; restaurar no retira notificaciones/datos de proveedor.
Atención no tiene vencimiento temporal inseguro. Recuperar conserva reclamación
hasta confirmar Workflow terminal; pausado/no consultable puede bloquear y requiere
inspección antes de intervenir. No elimines filas para eludir instancia sin confirmar.

Validación local estática: tipos TypeScript/Swift, migraciones SQLite vacías y claves
foráneas, preparar SQL y espacios. Sin pruebas de ejecución, builds, inferencia,
migración remota, push ni despliegue. Antes de afirmar extremo a extremo usa cuentas
ficticias autorizadas: carreras de consumo, membresía, atribución/recuerdo compartido,
foto/presencia canónica, lecturas en cola frente a curso, exclusión entre ordinarios/
programados, notificaciones privadas e insignias, cancelar/quitar/recuperar al generar.
Verifica que estado ausente/pausado nunca libere atención concurrente.

## Invitaciones dirigidas por correo de cuenta

`0014_directed_contact_invitations.sql` amplía `contact_invite` con FK opcional de
cuenta destinataria, índice de bandeja y solicitud pendiente única por agente/
destinatario. Tras 0013 usa `npm run db:migrate:local`; automático aplica remoto
antes de Worker. Códigos existentes conservan destinatario null y flujo anterior.
Sin recurso, binding, permiso, secreto, proveedor de correo, SMTP ni paso nuevo.
`user` autenticado permite búsqueda exacta de correo y resuelve ID inmutable.
Recorta y compara sin mayúsculas; propiedad del buzón sigue sin verificar. Identifica
cuenta, no dueño verificado de buzón.

iOS nuevo ofrece solicitudes por correo dentro de app, bandeja aceptar/rechazar
con consentimiento, indicador en barra y actualizar máximo cada 15 segundos más
explícito/primer plano. Código sigue opcional. No envía correo ni APNs de invitación.
Dispositivos/outbox push, programaciones, memoria y cola solo se usan tras aceptar
y comenzar chat normal.

Antes de producción commit/push, espera Builds y verifica SHA, Worker y migraciones.
Instala app por Xcode. Nunca manualmente. Conserva columna/índices al corregir/
revertir; Worker consciente de compartir debe imponer destinatario al previsualizar,
insertar, consumir y reintentar. iOS antiguo no muestra dirigidas pero usa códigos.
No elimines vínculos destinatarios ni conviertas pendientes a capacidades transferibles
para evitar versión cliente.

Comprobaciones: tipos TypeScript/Swift, 14 migraciones SQLite vacías con FKs,
21 consultas compartir con EXPLAIN y espacios. Sin pruebas de ejecución, builds,
búsqueda real de cuentas, invitación, migración remota, inferencia ni release.
Funcional con ficticias autorizadas: mayúsculas de correo, inexistente/propio/ya
habilitado, duplicadas/vencidas, aislamiento de tercera cuenta, carreras aceptar/
rechazar/revocar, límites, consentimiento y actualizar/cambiar cuenta iOS. Nunca
registres correos, códigos, tokens ni chats para verificar.

## Almacenamiento de perfil de cuenta

Editar usa D1 y R2 privado `CONTACT_PHOTOS` existentes. Aplica
`0015_account_photos.sql` después de previas: agrega `user.photo_version` anulable.
Local: `npm run auth:setup:local` o `npm run db:migrate:local`; producción antes
de publicar por automático. Sin despliegue manual, binding, recurso, permiso,
secreto ni ajuste de cuenta nuevos. Otra instalación sigue D1/R2 anteriores;
staging separado. Las imágenes usan `users/<user>/<version>.jpg`; contactos conservan prefijo.

Con ficticias: editar nombre, cargar/recortar/reemplazar/quitar foto, reabrir Cuenta,
cerrar/iniciar y otro usuario sin lectura. No realizados funcional/en dispositivo.
Consulta [perfil](profile-photos.md#account-profile). Respalda metadatos D1 con R2.
Revierte por commit/push conservando columna/bucket; código anterior ignora campo.
No restaura fotos borradas/reemplazadas. Siguen limpieza de mejor esfuerzo y ausencia
de barrido huérfano.

## Conversaciones grupales

`0016_groups.sql` agrega identidad, membresía humana con consentimiento explícito
memoria/Contributor, agentes propios, invitaciones dirigidas, historial compartido,
trabajos de respuesta y memorias fundamentadas. Drizzle refleja tablas; trigger de
atención sigue SQL. D1 primero, bucket privado y Meta/Workflow después según arriba.
Reutiliza `DB`, `CONTACT_PHOTOS`, `CHAT_WORKFLOW`, `META_API_KEY`, `META_CHAT_MODEL`
y Cron. Sin servicio, secreto, permiso de recurso, dependencia ni binding nuevos.
Las rutas de fotos permiten a miembros actuales ver perfiles de otros; UI informa
visibilidad. Consulta [grupos](groups.md).

Otra cuenta usa scripts, reemplaza Wrangler, API iOS y conexión automática, y elige
Estándar salvo consentimiento Contributor de todos. Local: `npm run db:migrate:local`
tras auth; automático aplica todas antes. Fuente con commit/push primero, nunca
manual. Sin migración remota, push ni release durante implementación.

Después verifica commit/versión y migraciones y usa ficticias según guía. No se
usó dato remoto, inferencia ni dispositivo al implementar. UUID/tablas privados
compatibles; despacho considera ambos trabajos bajo bloqueo único del agente.
Para revertir pausa nuevos envíos grupales y deja terminar Workflows antes. No
quites tablas ni cambies contratos activos. Workers antiguos no recuperan trabajos
grupal; prefiere corrección compatible si pendientes. Quitar miembro/grupo no libera
reclamación anticipadamente; recuperación espera fin. Conserva tablas/mensajes al revertir.

### Contexto grupal y revisión antes de publicar

Usa `DB`, `CHAT_WORKFLOW`, credenciales Meta, elección de modelo y Cron existentes.
Sin migraciones, recursos, bindings, secretos, permisos, dependencias ni configuración
iOS nueva. En `groups/context.ts`, `groups/workflow.ts`, `groups/retrieval.ts`.
Otra instalación sigue D1 → R2 privado → Worker/Workflow y auth/Meta, reemplaza
Wrangler/conexión y obtiene consentimientos. Local con migraciones y `npm run dev`.

Cada borrador/revisión fija marca de mensaje grupal. D1 `batch()` mantiene inserción
condicional y actualización final en transacción; mensaje posterior impide publicar
hasta revisar. Cola secuencial y atención global por agente no cambian. Hasta dos
revisiones añaden modelo/D1 solo si cambia contexto; otro cambio completa espacio
sin mensaje. Cancelados/superados también pueden completar silenciosamente. Se
revisan membresía, compartir y consentimiento al publicar. Consulta
[límites y comprobaciones](groups.md#reply-rounds-and-exclusive-attention).

Workflow guarda por separado contexto acotado, respuestas individuales, resultados,
decisiones y publicación. Preparar usa paso de un minuto con dos reintentos.
Investigar máximo seis rondas y seis ejecuciones en tres minutos; luego decisión
JSON estricto sin herramientas y un intento de recuperación solo final. Pasos de
modelo tienen un reintento transitorio y un minuto; herramientas sin reintento
automático. Proveedor limitado a 45 segundos y MCP a 20. Consulta
[límites](groups.md#reply-rounds-and-exclusive-attention). Un fallo posterior reutiliza
investigación; acciones MCP inciertas siguen protegidas por registro D1. Instantáneas,
argumentos generados y resultados textuales son estado privado operativo, no logs
públicos ni memoria entre chats. Bytes quedan R2 y cargan al inferir; solo referencias
en checkpoints. Acceso operador y retención Workflow aplican como resto de ejecución.

Corrección sin recurso, binding, secreto, migración, API cliente ni paso nuevo.
Aprovisionamiento, configuración y release existentes. Sin reinstalar iOS. Ambos
muestran respuesta validada. Trabajos nuevos usan grafo nuevo; existentes ligados
a su versión. No termines/reinicies para adoptarlo. Prefiere corrección; nunca repitas
incompletos contra otro grafo ni elimines registro/aislamiento MCP. Chats activos
pueden tardar/costar más; no se midieron inferencia ni latencia reales.

Publica solo fuente con commit/push y automático, verifica etiqueta y escenarios
ficticios. Solo validación estática TypeScript/SQL; sin inferencia, migración remota,
push ni despliegue. No requiere reinstalar iOS. Mensajes y cargas compatibles.
Deja terminar activos antes de revertir; cambió grafo y no se admite repetir en
otro. Código antiguo pierde protección de frescura y política natural; prefiere
corrección compatible y conserva tablas.

Referencias: [transacciones batch D1](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch),
[idempotencia Workflow](https://developers.cloudflare.com/workflows/build/rules-of-workflows/),
y [salida estructurada Meta](https://dev.meta.ai/docs/structured-output).

### Multimedia grupal

`0017_group_media.sql` agrega `chat_group.photo_version` anulable y
`group_message.attachment_json` con JSON validado. Drizzle refleja ambos. Reutiliza
`CONTACT_PHOTOS` privado para avatares `groups/...` y archivos `group-attachments/...`,
`DB` para metadatos/consentimiento y registro, Cron para huérfanos y `META_API_KEY`
para análisis Muse y Muse Voice Transcribe. Sin cambios de orden, binding, permisos,
secretos, dependencias ni proveedor más allá de D1 → R2 privado → Worker/Workflow.

Otra instalación reemplaza cuenta/Worker, D1, R2, API iOS y conexión según arriba.
R2 privado; rutas autorizan membresía actual y solo propietarios editan identidad.
iOS reutiliza texto de propósito de micrófono y selector/recortador. Local aplica
0017 con script estándar; commit/push aplica antes de código compatible. Sin
despliegue/migración manual.

Tras release verifica etiqueta, Worker y migración y ficticias según [grupos](groups.md).
Sin migración remota, carga, transcripción, inferencia ni ejecución/dispositivo al
implementar. Aditivo, consérvalo al revertir. Clientes antiguos no muestran archivos
y limpieza vieja ignora referencias grupales; no reviertas limpieza con objetos
existentes. Prefiere corrección o conserva registro actualizado. Quitar foto es
mejor esfuerzo; puede persistir huérfana. Limpiar espera al menos 24 horas desde
registro y solo elimina sin referencia privada/grupal. Eliminar metadatos no retira
archivos/mensajes recibidos ni datos enviados a Meta.

### Metadatos de lista unificada

Resúmenes grupales devuelven `lastMessageAt` y `lastMessageSenderName` anulables,
del mensaje más reciente persistido. Índices existentes sirven consultas. Sin
migración, binding, recurso ni secreto. iOS combina con páginas privadas y comparte
fechas. Publica API por automático para prefijos; respuestas antiguas siguen
 decodificables con respaldo actividad/vista previa. Estático no establece apariencia
ni orden ante concurrencia; verifica paginación mixta, nombres, solo adjuntos y
fechas con ficticias.

### Notificaciones y lectura grupales

`0018_group_notifications.sql` agrega marca monótona por miembro, inicializa
existentes en límite actual y crea outbox duradero. Triggers inicializan futuras
membresías al unirse y distribuyen mensajes humanos/bot atómicamente a dispositivos
de otros. Drizzle refleja tabla/columna, triggers SQL. Índices D1 existentes soportan
lectura/elegibilidad; migración agrega índice de próxima fecha. No rellena alertas antiguas.

Reutiliza DB, Cron, Workflow, registro push y secretos opcionales `APNS_PRIVATE_KEY`,
`APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_TOPIC`. Clave cifrada por flujo actual de build/
ejecución. Sin recurso, binding, dependencia, capacidad Apple, topic ni secreto
nuevos. Otra instalación completa D1/Worker y firma/capacidad/secretos APNs opcionales,
reemplazando cuenta/base/topic/bundle/equipo. Sin APNs outbox reintentable hasta
vencer; no leídos y sondeo funcionan. Banners del sistema requieren permiso.

Local con script existente; producción commit/push automático aplica 0018 antes
de consultarla. Sin migración/despliegue manual aquí. Instala iOS nuevo para rutas,
lectura e insignias combinadas. Verifica commit/migración y comprobaciones ficticias
en [notificaciones](notifications.md#group-notifications). Tipos/SQL no establecen
aceptación Apple ni presentación real; no se ejercitó remotamente.

Conserva esquema y lectura al revertir. Trigger puede encolar desde Workflows
antiguos, pero Workers anteriores no entregan outbox nuevo y clientes antiguos no
confirman ni enrutan. Prefiere corrección compatible con pendientes. No borres tablas
ni restablezcas marcas. Push privados conservan carga/ruta e incluyen no leídos
grupal al calcular insignia. APNs aceptado no puede retirarse tras leer/revocar;
el remitente revalida antes y app suprime mensajes leídos conocidos mientras activa.
Alertas solo exponen contenido visible al destinatario.

## Solicitudes privadas a grupos (migración 0020)

Las [preguntas y retorno automático](group-requests.md) reutilizan `DB`,
`CHAT_WORKFLOW`, Cron, `META_API_KEY`, `META_CHAT_MODEL`. APNs opcional. Sin servicio,
recurso, binding, secreto, dependencia ni permiso nuevos. En `groups/requests.ts`,
`groups/request-results.ts`, `groups/request-access.ts`, Workflows y
`0020_group_requests.sql`, reflejado en Drizzle.

Otra cuenta aprovisiona D1/R2 privado/Worker/Workflow en orden anterior, reemplaza
Wrangler, conexión y URL iOS, obtiene Meta y consentimientos. Estándar salvo
Contributor aceptado por todos afectados. Aplica 0001–0020 localmente con comandos
existentes y `npm run dev`. Producción aplica 0020 antes por automático tras
commit/push autorizado; nunca manual.

0020 agrega confirmaciones duraderas, vínculos de procedencia, índices de recuperación
y triggers de revocación/memoria propia. Sin inferencia ni relleno histórico. Batches
guardan una pregunta/espacio objetivo y luego resultado privado. La inferencia
extra es autorización acotada y retransmisión sin herramientas; objetivo conserva
límites. Vencen a 24 horas; entrega privada espera presupuestos de conversación/atención.

Verifica fuente y migración y ficticias de guía, incluidas repetición, solicitudes
cruzadas, ambigüedad, revocar y retorno con app cerrada. Logs
`group_request_dispatch_deferred`, `group_request_push_deferred`,
`group_result_dispatch_deferred`, sin contenido. Solo tipos/esquema/SQL locales;
sin prueba, inferencia, migración remota, notificación ni release. iOS actualizado
refina UI de reintento automático; anteriores muestran flujo.

Conserva esquema/confirmaciones al revertir. Workers antiguos no manejan fuentes
grupal delegadas ni resultados privados automáticos y cambió grafo. Prefiere
corrección compatible; vacía/cancela y deja terminar activos antes de revertir por
commit/push. Eliminar grupo/objetivo cancela pendiente preservando resultados
privados entregados. Eliminar conversación fuente quita solicitudes/resultados.
Respalda D1 con procedimiento actual; sin objetos R2 nuevos.

## Publicación general en grupos (migración 0021)

La [publicación privada en grupos](group-requests.md) ahora ofrece
`send_group_message` para saludos, anuncios y declaraciones pedidos, solo con
groupID/text. `ask_agent_in_group`, ofrecida por separado, pide respuesta de un bot
y retorno privado. Las llamadas genéricas antiguas con objetivo anulable siguen
compatibles. `0021_group_posts.sql` agrega confirmaciones simples, unicidad de
publicación entre tablas y triggers de revocación/eventos de persona. Drizzle
refleja tabla. 0020 aplicada y trabajos dirigidos en curso intactos; ambas acciones
reutilizan tablas y protecciones.

Reutiliza D1, R2 privado, Worker/Workflow, modelo/credenciales Meta, Cron y APNs
opcional. Sin recursos, bindings, secretos, dependencias, permisos ni ajustes iOS
nuevos. Otra cuenta reemplaza IDs Wrangler, conexión y URL API, obtiene consentimientos
y elige Estándar salvo autorización explícita Contributor. Aplica 0001–0021 con
comandos locales antes de `npm run dev`. Producción aplica 0021 antes por automático
tras commit/push autorizado. Nunca manualmente.

Publicaciones simples guardan confirmación y mensaje juntos, usan push/no leídos
normales y no crean espacios de respuesta, trabajos en espera ni resultados privados.
Agregan una autorización acotada. Se impone una publicación por turno humano entre
ambos tipos, incluida repetición con cambio de modo. Conserva tabla/triggers al
revertir; código antiguo ignora confirmaciones simples. Prefiere corrección con
turnos privados/Workflows dirigidos activos y no cambies grafo en curso.

Solo se comprobaron TypeScript, 21 migraciones SQLite y 85 variantes SQL distintas.
Sin inferencia, prueba de ejecución, migración remota, push, notificación ni despliegue.
Tras automático verifica commit/versión y pendientes y con ficticias comprueba
publicaciones, grupo de un bot, texto literal, modo respuesta, ambigüedad, repetición
entre modos, revocar y notificar. No requiere binario iOS nuevo. Respalda D1 como
antes; sin objetos R2 nuevos.

Los diagnósticos de autorización usan misma infraestructura sin migración, secreto,
recurso, binding ni actualización iOS. La autorización ahora usa presupuesto 2,048
tokens y conserva `reasoning_effort: low`, como otras llamadas. Es techo, no instrucción
de generarlos. Finish/JSON del proveedor y permisos SQL siguen obligatorios.
`group_publication_failed` solo registra etapa (`receipt`, `access`, `context`,
`authorization`, `publication`, `confirmation`) y código saneado. `chat_tool_failed`
también nombre conocido y código saneado. Nunca excepciones crudas, cuerpos, parámetros
SQL ni texto. Confirmaciones guardadas recuperan éxito tras error de escritura/
confirmación. Antes de escribir, sin confirmación, informa no publicado; escrituras
ilegibles/inciertas mantienen desconocido. El camino de 400 tokens daba HTTP 200
y fallaba antes de guardar, sin capturar código exacto previo. Diagnóstico con
metadatos de trazas y cantidades, no contenido privado. Usa commit/push y verificación
existentes; no reintentes mensajes fallidos automáticamente tras release.

Se comprobó con inferencia sintética Meta Playground explícitamente autorizada:
misma aclaración española agotó 400 antes de decisión visible y pasó con 2,048,
567 tokens de razonamiento y 14 de salida. Modelo, esquema, razonamiento bajo y
muestreo predeterminado/no streaming constantes. Ocho comprobaciones aisladas con
modelo/base simulados verificaron cierre seguro, diagnóstico y recuperar confirmaciones.
Sin mensaje real de grupo, notificación ni transcripción privada; no se leyó/expuso
credencial. Control de cancelación con 2,048 devolvió `authorized: false`. Pasaron
TypeScript y SQL estático 21 migraciones/85 consultas. Más limitado que recorrido
de app desplegada.

La corrección posterior de selección separa herramientas sin infraestructura,
migraciones, permisos, secretos, bindings ni dependencias. Reutiliza índices D1
para máximo tres destinos exitosos recientes de últimos ocho turnos completos,
comprobando acceso siempre y excluyendo contenido antiguo. Pedidos nuevos explícitos
pueden resolver destinos recientes; confirmaciones antiguas nunca conceden autoridad
nueva. No reescribe datos privados/grupales. El prompt de memoria propia excluye
fallos transitorios de herramientas/acceso.

Los resultados normales emiten `group_publication_result` con etapa/código fijos
e indicadores publicación/respuesta; `chat_tool_summary` registra cantidades de
llamadas para identificar respuesta sin herramientas. Ninguno registra texto,
IDs destino, parámetros ni cuerpos. Distingue IDs inválidos, intención diferente
y fallo de espacio fuente de denegación real de consentimiento/acceso. No relaja
protecciones. Usa logs/retención existentes, sin recurso observabilidad ni muestreo mayor.

La comprobación optativa `node scripts/checks/group-publication.cjs` usa Node 24 y
SQLite integrado con todas migraciones, despacho/herramientas/SQL reales, registros
ficticios y dependencias modelo/push/despacho simuladas. Local, sin credenciales
ni servicios reales. Pasaron 22 casos, TypeScript y 87 variantes SQL. Siete casos
Meta Playground autorizados aparte comprobaron prompt semántico real con ficticios;
consulta [validación](group-requests.md#action-selection-and-failure-evidence).
Tras commit/push autorizado verifica automático/versión y recorrido completo
app/Meta/notificaciones con ficticias, separado de SQL aislado. Revierte con commit
compatible conservando 0020/0021 y confirmaciones/pasos activos. Sin build iOS nuevo.

## Identidad entre chats y recuperación grupal (migración 0019)

La [memoria propia y recuperación](memory.md#one-agent-identity-across-private-chats-and-groups)
reutiliza `DB`, `CHAT_WORKFLOW`, `META_API_KEY`, `META_CHAT_MODEL` y cola exclusiva.
Sin recurso Cloudflare, binding, variable, secreto, permiso, dependencia, embeddings
ni servicio nuevos. Reglas Estándar/Contributor existentes; otras instalaciones
Estándar salvo autorización separada.

Tras D1/Workflow y Meta aplica en orden con `npm run auth:setup:local` nueva local
o `npm run db:migrate:local` existente. `0019_agent_identity_memory.sql` agrega
perfil por agente, eventos duraderos con FKs, eventos de respuesta y limpieza de
membresía por triggers, FTS5 grupal y índices de membresía/eliminar fuente. Indexa
texto existente y registra metadatos históricos una vez; prevé almacenamiento/
tiempo D1. Sin inferencia. Los perfiles aprenden por lotes acotados al continuar
Workflows, priorizando respuestas nuevas; no se garantiza terminar backlog con
agente inactivo.

Publica por limpio commit/push automático; migra antes. Verifica SHA/etiqueta,
sin pendientes, continuidad de bindings y ficticias de memoria. No manual ni logs
de memoria, citas, argumentos/resultados o cuerpos. Eventos saneados nuevos:
`agent_memory_deferred`, `group_retrieval_failed`. Costo incluye extraer memoria
propia y rondas grupales opcionales. Trabajo acotado por generación; latencia/costo
a escala productiva sin medir.

Aditiva. Revertir conserva tablas/índices/triggers para seguir registrando eventos
para release futuro. Mantén binding/clase y fuentes mientras activos puedan referir;
no quites migración. Eliminar fuente hace cascada en perfiles/eventos. Revocar
acceso vuelve fuentes inelegibles al recuperar, no retira respuestas enviadas.
Staging con D1/Worker/Workflow y secretos independientes.

Pasaron TypeScript, 19 migraciones y SQL EXPLAIN locales. Sin build, prueba de
ejecución, inferencia, migración remota, commit, push ni despliegue. Proveedor
Estándar/Contributor, recuerdo funcional, carreras de revocación e instalación
independiente sin verificar.

## Almacenamiento de confirmaciones grupales (migración 0022)

Aplica `0022_group_receipts.sql` por paso automático antes de API correspondiente.
Local independiente usa `npm run db:migrate:local --workspace @wildcard/api` tras
instalar. Sin recurso Cloudflare, binding, secreto ni permiso; D1 guarda instantáneas
y trigger. Aprovisiona D1 y todas previas en orden. Nunca migres/despliegues producción
manualmente como atajo.

Insertar toma instantánea atómica de destinatarios humanos/agentes; intencionalmente
sin rellenar históricos. API comprueba membresía en agregados y cada escritura
autenticada. Clientes necesitan iOS actualizado para entrega/lectura visible; los
antiguos pueden dejar pendientes estados de todos. Backend no instala app.
Consulta [semántica, endpoints, retención y verificación](groups.md#delivery-and-read-receipts).

Verifica base independiente limpia y ejecuta comprobaciones optativas aisladas de
confirmación/publicación antes. Tras commit/push autorizado verifica etiqueta y
migraciones normalmente. Aún se requiere dispositivo con ficticias; sin migración
remota, proveedor ni despliegue en validación local. API previa puede correr dejando
aditiva; no elimines tabla/columna ni recrees historial. Evidencia histórica no se
reconstruye de membresía actual ni aceptación push.

## Energía grupal y conversación automática de bots

Aplica `0023_agent_energy.sql` aditiva por automático tras commit/push autorizado.
Otras instalaciones mismo D1, migraciones ordenadas, Workflow, Cron y modelo.
Sin IDs, recursos, secretos ni planificación cliente nuevos. Local sigue `npm ci`
y `npm run auth:setup:local`. Sin remoto ni manual. Consulta [energía](energy.md).

Inicializa saldos existentes en 50, rellena linaje de intercambios sin iniciar
históricos e instala triggers atómicos de débito/admisión. Agentes nuevos inicializan
reloj SQL. Outboxes existentes capturan publicaciones. Acceso creador se comprueba
por propiedad autenticada, independiente de roles UI cacheados; restablecer límite
12/cuenta/minuto.

Antes ejecuta optativas con ficticios de energía/publicación/confirmaciones y tipos
API. Tras push autorizado verifica build/etiqueta y 0023 aplicada; luego iOS instalado
con ficticias. SQLite local no establece D1/modelo/dispositivo productivos.

Rollback requiere migración hacia delante revisada con app revertida: elimina
`group_energy_and_continuation` y `group_energy_guard` para detener admisión/débito,
y completa respuestas `auto-` en cola solo sin reclamación. Deja que activos liberen
atención o recuperación normal; nunca borres bloqueos. Conserva columnas, linaje,
contadores, mensajes y confirmaciones. API antigua sola no basta porque triggers
encolarían turnos que no interpreta. Restaura por otra migración si reactivas.
Commit/push automático como siempre; no borres tablas ni manual.

### Profundidad de consulta de autorización grupal

D1 limita expresiones a 100. Mantén alternativas como ramas UNION ALL en lugar de
anidar predicados de publicaciones/solicitudes en árboles OR. La optativa
`node scripts/checks/group-energy.cjs` requiere Python 3 con `sqlite3` estándar y
`Connection.setlimit` (Python 3.11+) para preparar SQL real capturado con ese límite
tras migrar. Sin dependencia productiva ni binding nuevos. Verifica ramas Contributor/
Estándar junto a regresiones. Release inicial falló turno real al preparar contexto
aunque SQLite pasó con límite predeterminado mayor; regresión ahora falla esa
forma. Sentencias corregidas de contexto/inserción/completado pasaron D1 EXPLAIN
remoto sin escrituras de app ni modelos. Publica por automático; sin migración.
Fallidos no se repiten automáticamente: mensaje nuevo o reintento explícito. Calidad
y conversación posterior requieren verificar tras corrección.

### Respuestas obligatorias a aperturas públicas

Contexto grupal marca publicación pública solicitada como apertura que requiere
respuesta si no hay mensaje humano posterior. Enum estructurado solo permite
responder, o conservar/revisar en revisión; omisiones inválidas no completan
silenciosamente. Energía/acceso/topes siguen. Sin servicio, binding, secreto ni
migración; backend por automático. `group_turn_decision` solo registra acción fija
y booleano openingReplyRequired, sin cuerpos, IDs ni prompts. Optativas cubren
aperturas nuevas/repetidas, omisiones inválidas, cancelación humana posterior,
omisiones ordinarias, energía cero y publicación/repetición Workflow simulada
completa. Valida modelo real tras release; simulados no establecen calidad. Una
publicación real previa completó borrador null y omitió pese a energía: requiere
mensaje nuevo o reintento, sin repetir silencio antiguo automáticamente.

## Reacciones de mensajes (migración 0024)

Las [reacciones](reactions.md) usan D1 `DB` y Workflow existentes. Sin servicio,
binding, permiso ni secreto nuevos. Otra cuenta aplica todas ordenadas incluida
`0024_message_reactions.sql` antes de API. Local `npm run db:migrate:local` con
configuración propia. Automático migra antes. Solo fuente con commit/push, verifica
commit automático; nunca producción manual. Publica web e instala iOS correspondientes
por Xcode.

0024 aditiva: mensajes existentes sin reacciones. Crea relaciones actor/objetivo
comprobadas, FKs en cascada e índice único de expresión por actor/mensaje. Verifica
todas en instalación limpia y ficticias según guía. Sin migración remota, llamada
de ejecución/proveedor ni despliegue; estático no lo valida.

Rollback deja tabla y revierte clientes/API; conserva datos para futura corrección.
Anterior no muestra reacciones. Turnos solo con reacción tienen texto asistente
NULL y `complete`; código antiguo los cuenta como respuestas. Conserva protecciones
nuevas de texto no nulo en no leídos/push o corrige API antigua antes. No borres
mensajes para compatibilidad.

## Respuestas de mensajes (migración 0025)

Las [respuestas](replies.md) usan D1 `DB` existente, sin servicio, binding, permiso
ni secreto. Aplica todas incluida `0025_message_replies.sql` antes de API. Local
`npm run db:migrate:local` con configuración propia; automático aplica antes.
Solo commit/push y verifica fuente; no producción manual. Publica web e instala
iOS correspondientes por Xcode.

0025 aditiva: columnas anulables `chat_turn.reply_to_id`/`reply_to_side` y
`group_message.reply_to_id`, referencias `ON DELETE SET NULL` al citado. Mensajes
existentes no son respuestas. Sin migración remota, llamada de ejecución/proveedor
ni despliegue; estático/SQL local no los validan.

Rollback deja columnas y revierte clientes/API. API anterior ignora columnas y
rechaza cuerpos con `replyTo` o `replyToID` con HTTP 400; revierte clientes juntos
o corrige hacia delante. Clientes antiguos ignoran respuesta `replyTo`. No borres
columnas ni reescribas migración.

## Almacenamiento y salida de conexiones MCP

La [configuración y rollback](connectors.md#infrastructure-and-retention) usa
Worker/D1 y 0026 existentes, sin recursos ni secretos nuevos. Conserva
BETTER_AUTH_SECRET para tokens cifrados; rotar requiere reconectar o recifrado
explícito. Modelo Estándar requerido para chats aislados. Conserva salida solo
pública y sin VPC/bindings privados; comprobar DNS no impone frontera de red.
Código anterior no reemplaza filtros de privacidad con seguridad después de haber
salidas de conectores. Sigue commit/push y migración/release automático; no manual.

API debe conservar explícitamente `global_fetch_strictly_public` en flags. Fecha
reciente no lo activa sola. Enruta fetches globales por internet público, incluidas
MCP/OAuth a otro Worker de misma zona; sin él Cloudflare puede dar 1042 antes de
llegar al destino. Nunca sustituyas endpoints MCP arbitrarios por service bindings
privados. El binding web API sigue como proxy interno autenticado. Sin recurso,
secreto ni migración. Consulta [rutas fetch públicas Cloudflare](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#global-fetch-strictly-public).

Tras automático verifica flags y commit, inicia OAuth en ambos y confirma abrir
Centralita. Tipos locales o metadatos públicos no validan ruta Worker/Worker ni
flujo completo. Conserva flag en correcciones/rollback para impedir que URLs
arbitrarias eviten controles de entrada pública.

DNS MCP requiere `https://cloudflare-dns.com/dns-query` por HTTPS. Sin cuenta
proveedor, recurso, clave ni migración. Solo ve hostname/tipo públicos, no ruta
ni credenciales MCP. Ambas familias deben completar en plazo existente, máximo
16 KB por respuesta. Fallar bloquea. Diagnósticos solo etiquetas fijas de resolver/
familia/motivo y estado HTTP opcional, sin hosts/direcciones.

Workers rechaza `redirect: 'error'` estándar del navegador antes de E/S. Todas
rutas MCP usan `manual` y rechazan 3xx antes de SDK, preservando frontera de
redirección/credenciales. Respaldo Google temporal eliminado al identificar defecto.
Consulta [DNS y compatibilidad](connectors.md#dns-safety-and-runtime-compatibility).
Tras automático verifica llegar al login y diagnósticos acotados si falla; desplegar
con éxito no lo demuestra.

### Extensión OAuth MCP

El retorno debe terminar con documento HTTP 200 API antes de abrir origen web/esquema
nativo fijo. Usa nonce CSP nuevo para script/estilos fijos, no-store, no-referrer,
nosniff, sin marcos, formularios ni recursos externos. Conserva ocultar query; script
elimina consulta del historial. No restaures 302 entre orígenes ni amplíes
`form-action` a URLs posteriores. Cambio compartido sin registro, esquema, binding
ni secreto nuevos. Verifica login nuevo pasando por 200 y completando ambos; callbacks
antes bloqueados no se repiten para recuperar prueba.

Aplica 0027 tras 0026 por automático. OAuth usa D1, derivación cifrada y Cron de
limpieza existentes; sin recurso/binding ni secreto. `MCP_WEB_ORIGIN` es variable
versionada con origen web público exacto. `BETTER_AUTH_URL` debe ser HTTPS público.
Cada entorno/proveedor registra `https://YOUR_API_HOST/api/v1/mcp/oauth/callback`;
Google requiere APIs, consentimiento, elegibilidad preview y cliente Web OAuth
marcado agente IA. Usuarios configuran credenciales en Conexiones; valores no van
a fuente. Consulta [aprovisionamiento, retención, rollback y verificación](connectors.md#oauth-setup-and-lifecycle).
No guardes consultas OAuth completas en logs. App nativa registra `wildcard` para
completar navegador; Google solo recibe callback HTTPS API. Público/Bearer HTTP
local sigue; OAuth no disponible hasta entorno HTTPS público API/web. Configuración
proveedor y OAuth/navegador reales sin verificar.

API/web ponen `observability.redact_query_string = true` (soportado por Wrangler
fijado), conservando logs/trazas sin consultas en URLs capturadas. Verifica en
automático y aplica equivalente a proxies/exportaciones adicionales.

Entrypoint API importa `lib/schema-runtime` antes de otros módulos. Inicializa
Zod fijado explícitamente compartido por Better Auth (`zod`) y MCP (`zod/v4`) y
elige interpretación `jitless` para Workers. Conserva orden: primer release MCP
pasó tipos pero Cloudflare rechazó inicializar con `Class2 is not a constructor`.
0026/0027 ya aplicadas; repetir automático las conserva.

Descubrimiento automático y JSON público `/api/v1/mcp/oauth/client-metadata` usan
configuración/recursos existentes. Sin migración, secreto, binding ni registro
callback nuevos. client_id anunciado es URL pública exacta; redirect_uris solo
callback API existente. Conserva salida pública y ocultar query. Consulta
[OAuth automático](connectors.md#automatic-setup-and-centralita) para elegir proveedor,
fronteras de credenciales avanzadas y casos extremo a extremo pendientes.

### Capacidad de catálogo MCP y comprobación previa de esquemas

Worker/D1 guardan máximo 256 KB por catálogo (cuatro conexiones por contacto, ocho
contactos cacheados: unos 8 MB JSON antes de sobrecarga del framework). Descubrir
sigue máximo ocho páginas/256 herramientas, limitado a misma sesión veinte segundos
y transporte 1 MiB. Sin dependencia, recurso, binding, secreto ni migración nuevos.
Interpretar esquemas sigue sin eval; regex finitas limitan longitud/ancho de coincidencia/
combinaciones de ramas y rechazan no acotadas y referencias. Conserva límites en
instalaciones/rollback. Los catálogos se guardan atómicamente solo tras descubrimiento/
validación completos, para que fallar no reemplace aprobado con parcial. Tras automático
actualiza herramientas en ambos y confirma cantidades/permisos; no ejecutes acciones
externas solo para verificar descubrimiento. Consulta
[límites de conectores](connectors.md#execution-retries-and-limits).

### Conectores de cuenta y concesiones grupales (migración 0029)

Aplica todas las migraciones en orden hasta `0029_account_connectors.sql` mediante el pipeline
existente de publicación automática de código confirmado/enviado. No requiere recurso Cloudflare, binding,
secreto, cuenta de proveedor ni redirección OAuth nuevos. Las instalaciones independientes nuevas
usan los requisitos existentes de Worker/D1/Estándar/OAuth. Producción y staging
deben mantener bases de datos/secretos de autenticación/credenciales de proveedores separados. Conserva
BETTER_AUTH_SECRET: la migración copia bytes cifrados y su ámbito AAD inmutable original
sin descifrarlos, conserva IDs/aprobaciones de catálogo/estado OAuth y
crea solo las asignaciones originales de contactos. No crea concesiones grupales. Los conectores de
cuenta sobreviven a la eliminación del contacto. Las ejecuciones privadas conservan su clave foránea al chat; las grupales
conservan una clave a la respuesta y generación explícita de concesión. Eliminar cuenta elimina
conectores/concesiones; desconectar conserva registros históricos para proteger contra duplicados.

Ambos clientes administran ahora conectores mediante `/me/mcp` y concesiones mediante endpoints
MCP de contactos/grupos. Actualiza iOS junto a API/web. La migración se ejecuta antes de publicar el código
Worker, por lo que los endpoints antiguos de administración pueden quedar brevemente no disponibles; los clientes nativos antiguos necesitan
actualización. Verifica la migración contra copias protegidas de staging antes de producción,
incluidos flujos OAuth activos/bloqueos de renovación y preservación de credenciales. Compilar SQL estáticamente
no establece comportamiento con registros reales. Para este cambio local no se realizó migración de
producción, despliegue nuevo ni acción externa.

Los grupos se vuelven permanentemente Estándar y quedan excluidos de memoria/recuperación entre chats con
la primera concesión explícita de conector. Conserva esos marcadores tras revocar. Revertir
a 0028/código anterior a concesiones de cuenta es incompatible con la nueva propiedad de tablas
y semántica de privacidad. Prefiere una corrección hacia adelante que conserve registros, concesiones,
aislamiento y ambos registros de ejecución; restaurar copia necesita su código correspondiente y autorización
explícita de recuperación. Nunca elimines marcadores para recuperar compatibilidad. Consulta
[configuración, retención y verificación](connectors.md#account-connector-migration-and-verification).


## Memoria local de conversación

La migración `0030_conversation_memory.sql` reutiliza D1 `DB`, `CHAT_WORKFLOW` y la
credencial Meta/modelo Estándar existentes. No requiere servicio, binding, secreto, permiso de
cuenta ni aprovisionamiento nuevos. Las instalaciones independientes aplican todas las migraciones
por orden de nombre con `npm run db:migrate:local`; la publicación automática API
existente aplica las mismas migraciones versionadas remotamente antes de publicar. Producción
requiere commit/push explícitamente autorizado y luego verificar build automático,
SHA de fuente desplegado y lista de migraciones. Nunca despliegues manualmente.

La migración añade `group_local_memory` y `agent_local_memory` con claves foráneas
fuente, índices y triggers de conservación al insertar marcadores. Las tablas compartidas y
destinos de conflicto de Workers antiguos permanecen intactos. Los orígenes ya aislados se copian
localmente sin inferencia; los hechos humanos privados ya tienen almacenamiento local del contacto.
La extracción local siempre usa Estándar y conserva lotes acotados, claves, validación
de origen y reintentos de mejor esfuerzo. La capacidad local de claves es separada por audiencia.
Consulta [memoria](memory.md#conversation-local-memory-with-mcp) para propiedad y límites.

La verificación estática puede ejecutar `node scripts/checks/memory-sql-compile.cjs`; solo
prepara variantes SQL contra un esquema vacío migrado en memoria a profundidad de expresión
100. No ejecuta funciones de respuesta/extracción ni inferencia. La regresión funcional opcional
`node scripts/checks/conversation-memory.cjs` cubre recuerdo local ficticio,
audiencias separadas, Estándar, revocación, eliminación, aislamiento concurrente y
recuperación de fallos. No se ha ejecutado bajo la instrucción actual de no hacer tests.
Valida migración/triggers con datos sobre una copia autorizada de staging y
ambos clientes antes de afirmar verificación de producción. No registres recuerdos ni citas.

La migración aditiva es compatible con estructuras antiguas de tablas del Worker, pero el código
anterior detendrá otra vez la extracción local y no podrá recordar los perfiles nuevos.
Una reversión debe conservar tablas, triggers, marcadores de aislamiento, historial de eventos
y claves foráneas fuente; prefiere corregir hacia adelante. Nunca elimines stores locales ni borres
marcadores para recuperar compatibilidad. Drena Workflows activos antes de revertir código
incompatible. Solo cambio local: no se realizó migración remota ni publicación.


## Diagnóstico y recuperación de fallos de respuesta

Incidente observado, 28 de octubre de 2026: el Workflow grupal de 09:36:43–09:37:19
UTC (06:36:43–06:37:19 Argentina) alcanzó seis espacios de exploración/herramientas. Sus nombres
solicitados incluyeron cinco consultas de catálogo y un `call_mcp_tool`; la bandera técnica
de esa respuesta MCP era `isError: false`. Ambos pasos finales de decisión devolvieron
`GROUP_INVALID_DECISION` con procesamiento exitoso de respuesta, seguido de
`group-save-failure`. El Workflow posterior del mismo bot de 09:38:32–09:39:00 UTC
confirmó publicación sin paso de guardar fallo. Esto identifica la validación
de decisión final como fallo inmediato, no una caída MCP confirmada. Los diagnósticos anteriores
no identifican el campo ni estructura JSON inválidos. No se probó que recargar por sí solo
cambiara el comportamiento del backend.

La investigación leyó metadatos acotados de Workflow, códigos de decisión/banderas de consumo,
nombres/banderas de error de herramientas y booleanos de publicación; no se inspeccionaron mensajes, prosa de modelo, argumentos
ni cuerpos de resultados. La autorización administrativa de D1 rechazó una consulta agregada de cantidades
de ejecución (7403); no se devolvieron filas de aplicación.
Los metadatos del Workflow aportaron la evidencia necesaria sin esa consulta.

La recuperación reutiliza `DB`, `CHAT_WORKFLOW`, credenciales de modelo y bindings existentes;
no hay migración, servicio nuevo, secreto ni cambio de aprovisionamiento/configuración.
Las instalaciones independientes usan la configuración y comportamiento de [grupo](groups.md#failed-replies-and-response-recovery)/
[privado](chats.md#failed-replies-and-response-recovery) existentes. Los pasos privados nuevos
persisten una respuesta antes del checkpoint con guardas/outbox existentes; los grupales nuevos
guardan checkpoints de borradores recuperados y códigos de fallo saneados separados de
la ejecución externa. La recuperación solo de modelo tiene latencia/costo acotados y no puede
reintentar una acción externa. Los logs solo contienen eventos/códigos/razones de rechazo fijos.
La [guía de idempotencia de Workflows](https://developers.cloudflare.com/workflows/build/rules-of-workflows/)
aplica a repetición y publicación como antes.

Verificación estática: TypeScript API/web, parsing Swift, sintaxis de scripts, espacios
en blanco y `node scripts/checks/reply-sql-compile.cjs` (19 variantes preparadas
contra esquema vacío migrado a profundidad de expresión 100). Las regresiones opcionales
`group-completion.cjs` y `group-receipts.cjs` cubren recuperación solo de modelo,
sin repetir ejecuciones MCP, repetición, revocación de acceso, solicitudes humanas obsoletas,
identidad de origen y supresión tras responder el mismo bot. Se prepararon,
no se ejecutaron, bajo la instrucción de no hacer tests. No se realizó build local,
inferencia de producción, repetición manual, mutación remota ni publicación.

Publica solo por release automático autorizado de código confirmado/enviado; comprueba SHA de
fuente/etiquetas de versión y ambos clientes después. Las adiciones existentes a respuestas API
son opcionales/compatibles con decodificadores anteriores; no se reescriben datos. Revierte con
otro commit compatible enviado, conservando registros de ejecución, aislamiento y soporte de
Workflows activos. Los mensajes recuperados guardados siguen siendo historial ordinario; revertir
código no los borra. Prefiere drenar ejecuciones activas o corregir hacia adelante al
cambiar el grafo de pasos. Recuperación/desplazamiento en dispositivos y comportamiento real del proveedor aún
requieren verificación funcional autorizada con datos ficticios.

## Presentación Markdown de mensajes y resúmenes push

API y web comparten el renderer puro Markdown/recorrido de tokens de
`shared/messageMarkdown.ts`. Ambos workspaces fijan markdown-it y sus tipos TypeScript
en el lockfile raíz. El `npm ci` existente instala esas dependencias
para una cuenta independiente; no requiere binding, secreto, migración, servicio, permiso de
cuenta ni aprovisionamiento nuevos. Los comandos existentes de build/publicación automática
incluyen la fuente compartida por importaciones de la aplicación.

Publica los cambios API y web con el flujo normal automático de código
confirmado/enviado; instala la actualización iOS con Xcode. Los campos opcionales de vista previa simple
son retrocompatibles y los mensajes guardados sin procesar no cambian. Revertir código
no necesita migrar datos pero puede restaurar Markdown sin procesar en alertas/vistas previas. Verifica
con mensajes ficticios de bots privados/grupales en filas, citas y alertas APNs
con la app en segundo plano/cerrada; entrega real y publicación siguen sin verificarse
para este cambio local.

## Experimentos nativos de iOS

Los [experimentos nativos](native-experiments.md) añaden integraciones iOS opcionales, no un
servicio en la nube ni secreto nuevos. La migración `0031_native_actions.sql` se requiere antes de que
clientes nuevos envíen `nativeContext`. Los existentes lo omiten. Usa la configuración normal de
migraciones locales versionadas; las de producción corren solo mediante commit/push
autorizado y publicación automática existente. No publiques manualmente.
El puente nativo usa el Worker API autenticado y binding D1 existentes.
El conocimiento de recibos de acciones automáticas y estado en la app no añade servicio, binding,
secreto, migración ni capacidad Apple. Publica el soporte API opcional `automaticKinds`
y prompt revisado con el pipeline existente y luego instala
la app iOS actualizada. Los clientes antiguos siguen compatibles. Las apps nuevas recurren al
formato antiguo de capacidades si se rechaza explícitamente, pero un backend antiguo sigue indicando
al modelo pedir revisión manual. La reversión conserva todos los registros de acciones/alarmas;
nunca repitas reclamaciones en ejecución o completadas. El paso existente de tres minutos incluye
espera acotada de diez segundos por llamada automática para recibos del dispositivo,
con un máximo de seis llamadas. Verifica temporizadores en dispositivo firmado después de publicar;
publicar por sí solo no verifica UI AlarmKit ni comportamiento semántico del modelo.

Una instalación independiente necesita:

1. Su equipo de desarrollo Apple e IDs explícitos para app, Notification Service
   existente, `Wildcard.Widgets` y `Wildcard.Share`. Reemplaza todos los identificadores
   de bundle y ajustes de equipo en Xcode. Iguala versiones entre targets.
2. Un App Group, por defecto `group.com.imlautaro.Wildcard`, registrado para app principal,
   Widgets y Share. Reemplaza `WILDCARD_APP_GROUP` en ajustes Debug
   y Release del proyecto; los tres targets lo heredan. Los avatares básicos de notificación no necesitan App Group, pero el
   [prototipo remoto de temporizadores/alarmas](#remote-native-device-execution) opcional también requiere
   asignar el grupo al App ID de Notification Service y su perfil de firma.
3. Habilita App Groups y Associated Domains en el ID principal, App Groups en
   Widgets/Share. NFC Tag Reading está obsoleto y su entitlement está comentado;
   no lo habilites en instalaciones nuevas. Regenera perfiles
   de firma. Los entitlements versionados configuran las capacidades correspondientes.
   Estos archivos no registran App IDs ni cambian la cuenta de desarrollo.
4. Reemplaza `WILDCARD_LINK_HOST` por un host HTTPS que controles. Asocia
   `applinks:<host>` con la app principal. El Worker web sirve la ruta JSON pública
   `/.well-known/apple-app-site-association` con Apple Team ID + bundle ID;
   reemplaza `9CHLS2987W.com.imlautaro.Wildcard` allí para cuentas independientes.
   Sirve JSON con HTTP 200 sin redirección ni autenticación. La obtención/caché de asociaciones
   Apple y entrega workers.dev deben verificarse en dispositivo físico;
   puede usarse dominio HTTPS propio con la misma ruta y configuración correspondiente.
5. El target integrado `WildcardWidgets` incluye presentaciones AlarmKit Live Activity
   y el widget del contacto. Se conserva código obsoleto de presentaciones foco/recetas
   pero no se registra en el bundle. `WildcardShare` importa borradores
   por App Group. Las fuentes Swift compartidas participan en los tres targets;
   intents de actividad se excluyen de Share con su condición de build.
6. Conserva `NSSupportsLiveActivities`, `NSAlarmKitUsageDescription`,
   `NSRemindersFullAccessUsageDescription` en el plist de la app
   principal, más Info.plist y entitlements versionados de extensiones. El
   `NFCReaderUsageDescription` obsoleto queda comentado como referencia. No requiere permiso amplio de
   calendario ni modo de ubicación en segundo plano. Las acciones App Intent necesitan dispositivo
   desbloqueado/autenticado. El target mínimo sigue iOS 27.0; las APIs de alarma se comprueban contra el SDK Xcode instalado.
7. Instala desde Xcode con el equipo de firma configurado. Habilita experimentos por contacto
   antes de esperar entidades en Atajos, widget u hoja Compartir. Pide
   permisos del sistema solo al ejecutar explícitamente la acción correspondiente.

Las Live Activities son locales en esta versión; no se aprovisionan tokens push ActivityKit, canales
broadcast, credenciales APNs nuevas ni servicio de entrega. La configuración existente APNs
de chat sigue aplicando a notificaciones de respuesta. La lectura/escritura NFC está deshabilitada;
los Universal Links ordinarios conservan asociación HTTPS y comprobaciones de autorización.
Editar estos archivos locales no cambia capacidades de la cuenta Apple.

Reversión: conserva columna/tabla D1 aditivas y registros guardados; clientes antiguos
los ignoran. Una API antigua no acepta envíos nuevos de contexto nativo, así que deshabilita
experimentos en clientes nuevos antes de revertir API. Los elementos Calendar/Reminders
ya guardados y alarmas del sistema siguen siendo datos del sistema de la persona y no deben eliminarse
al revertir base de datos. Deshabilita experimentos/elimina widgets y Live Activities antes de quitar
capacidades de perfiles. Los borradores App Group son locales y protegidos;
cerrar sesión los borra y desinstalar/eliminar el grupo puede dejarlos no disponibles.

Las comprobaciones estáticas no validan firma, extracción de metadatos App Intent, integración de
extensiones, asociación Universal Link, NFC físico, alertas AlarmKit, solicitudes de permisos,
controles de pantalla bloqueada ni revisión App Store. Todo sigue siendo verificación en dispositivo
en la guía. No se cambió configuración de la cuenta Apple.

### Verificación de instalación actual — 28 de octubre de 2026

Se inspeccionó el portal Apple Developer del equipo `9CHLS2987W`. El App ID principal
`com.imlautaro.Wildcard` ya tenía App Groups, Associated Domains, NFC Tag Reading,
Communication Notifications y Push Notifications. Su App Group seleccionado
era `group.com.imlautaro.Wildcard`. También existían los IDs de Share y Widgets;
Xcode mostraba firma automática con el mismo equipo y perfiles administrados de desarrollo
para ambas extensiones. El perfil Widgets se creó el 28 de octubre de 2026.
Son observaciones del estado existente, no afirmación de que los entitlements
locales registren recursos por sí mismos. No se aceptó acuerdo,
creó/exportó clave de firma ni concedió permiso de dispositivo durante
esta comprobación. Aún se necesita Run en dispositivo firmado para validar integración,
metadatos App Intent, solicitudes del sistema e interacciones nativas reales.

## Iniciativa de conversación

La [iniciativa de conversación](initiative.md) reutiliza D1 `DB`, `CHAT_WORKFLOW`/`ChatWorkflow`, el Cron Trigger existente de un minuto y `META_API_KEY`. No necesita recursos, bindings, secretos, permisos de proveedor ni cambios Wrangler adicionales. La configuración APNs opcional entrega alertas iOS por el outbox existente; web no tiene push del navegador. Las cuentas independientes deben seguir primero los pasos D1/autenticación, modelo y Workflow anteriores con sus identificadores y secretos.

La migración `0032_conversation_initiative.sql` debe seguir a 0001–0031. Añade columnas de iniciativa/tiempo de lectura por participante, marcador de origen de turno de asistente, tabla/índices de planes vencidos y triggers de entrada humana/finalización/ajustes. No hay relleno de conversaciones existentes. Las respuestas nuevas inician episodios solo tras migrar; deshabilitar iniciativa elimina el plan pendiente. La declaración de `apps/api/src/db/schema.ts` refleja estas adiciones. La configuración local usa `npm ci` y `npm run db:migrate:local`; ejecuta los comandos existentes API/web.

Para producción, confirma y envía la fuente prevista a la rama configurada y deja que Workers Builds ejecute el pipeline existente de migrar antes de publicar. Nunca despliegues manualmente. Verifica SHA de fuente del despliegue automático API/web, ausencia de migraciones pendientes y bindings Cron/Workflow existentes. Usa conversaciones ficticias para verificar episodio nuevo, revisión siguiente persistida, evaluaciones finitas, cancelación de borrador desactualizado y entrega normal de historial/outbox. Los logs solo contienen códigos acotados de evento/error, nunca mensajes ni intención. En esta implementación no se realizó inferencia en vivo, migración remota ni verificación de producción.

La reversión es aditiva: despliega un Worker compatible previamente enviado por el pipeline automático y conserva migración 0032/datos. El código anterior ignora campos/tabla nuevos y no despacha iniciativa. Los Workflows de iniciativa ya activos deben terminar o cancelarse explícitamente como parte de reversión autorizada; restaurar código no retira mensajes publicados. Para suspender antes de revertir, deshabilita los ajustes de participantes afectados con el endpoint autenticado; no elimines columnas ni borres historial. Rehabilitar espera otra respuesta humana. Los juicios del modelo y comportamiento en ejecución/dispositivos requieren verificación separada.

La migración `0033_faster_conversation_initiative.sql` sigue a 0032. Reemplaza el
trigger de finalización para iniciar revisión a la hora de respuesta + 30 segundos y adelanta solo
revisiones iniciales intactas. No requiere tablas, bindings, secretos, permisos ni recursos
nuevos; la declaración del esquema no cambia. Aplícala con el comando existente de migración local
en desarrollo y por el pipeline automático de migrar antes de publicar
en producción. Conserva 0032 y 0033 aplicadas al revertir;
el código antiguo sigue imponiendo sus intervalos más largos, aunque
el trigger pueda causar revisión anterior. No reviertas la migración ni reinicies
episodios detenidos para imitar tiempos antiguos. Verifica SHA, 0033 aplicada,
vencimiento a 30 segundos, despacho normal Cron y límites conservados con datos ficticios.
`node scripts/checks/initiative.cjs` cubre cadencia y actualización aisladas con
modelo/tiempo simulados. Para este ajuste no se ejecutó migración remota ni evaluación nueva de modelo real;
publicación y validación de prompts en vivo siguen pendientes. iOS/web
reciben el mismo comportamiento con sus cachés y contrato API existentes.

### Iniciativa adaptable — migración 0065

`0065_adaptive_initiative.sql` sigue a todas las migraciones hasta 0064. Añade una
pausa conversacional por contacto, modo continuación/ambiental al plan existente
y campos de interacción/respuesta/tipo de contacto vinculados al origen en turnos. No requiere
servicio, tabla, binding, secreto, cuenta de proveedor, permiso ni Cron Trigger nuevos.
Las instalaciones independientes usan aprovisionamiento D1, modelo/autenticación, Workflow
y APNs opcional existentes con sus IDs de cuenta/recursos.
La configuración Wrangler versionada no cambia.

Desarrollo: instala con `npm ci`, aplica todas las migraciones con
`npm run db:migrate:local` y usa comandos API/web existentes y app Xcode.
API/web comparten implementación adaptable y se actualizan textos informativos de
ambos. Para validación estática usa tipos API/web, parsing del editor Swift,
`git diff --check` y `python3 scripts/checks/initiative-sql-compile.py`. El
script prepara SQL real contra esquema SQLite vacío migrado sin datos de
aplicación. El harness opcional de fixtures `node scripts/checks/initiative.cjs`
se actualizó pero no se ejecutó para este cambio; tampoco builds, llamadas reales
al modelo, interacciones dispositivo/navegador ni migraciones remotas.

Producción usa commit/push y pipeline existente automático de migrar antes de publicar,
nunca despliegue manual. Verifica 0065 aplicada, etiquetas API/web iguales
al SHA enviado y rutas existentes Cron/Workflow/APNs configuradas. La migración
0065 no rellena aprendizaje ni reinicia planes detenidos: incrementa revisiones
para invalidar borradores, conserva contadores y vencimientos y cancela
planes de contactos ya archivados. Archivar en el futuro cancela de inmediato el plan.
Clasificar empieza en la siguiente evaluación elegible de un episodio; los planes detenidos
siguen detenidos. No se adivinan retroactivamente tipos históricos de contacto.

Cada contacto tiene como máximo un plan. Las continuaciones tienen seis evaluaciones/24 horas;
las oportunidades ambientales elegibles tienen presupuesto separado de seis evaluaciones/siete días
desde la última entrada humana. Se permite como máximo un envío ambiental sin retorno
humano. Actividad/receptividad se deriva localmente a cada solicitud desde hasta 160 turnos completados
en 28 días, sin caché estadística nueva ni aprendizaje entre participantes.
Las etiquetas de retroalimentación permanecen con turnos fuente hasta borrar historial; la
pausa explícita sigue en el contacto hasta vaciar, reanudar explícitamente o cambiar ajuste apagado/encendido.
Vaciar elimina aprendizaje/pausa incluso conservando memoria factual.
No es concesión nueva para acciones nativas, conectores, grupos, investigación ni programaciones.

Usa datos ficticios para verificar adaptación de ventanas, DST/viajes/zonas desconocidas, horas
silenciosas, diferencias de personalidad y volumen, tareas ajenas tras saludos,
pausa/reanudación explícita, esperas/errores/vencimientos acotados, repetición y carreras de exclusión/archivo/
vaciado/entrada nueva durante inferencia. Comprueba que la retroalimentación de origen no entre en
recuerdos compartidos, cachés/historial/indicadores de ambos se actualicen normalmente y APNs en
un iPhone configurado. Consulta [iniciativa](initiative.md#verification) para la matriz.
El éxito estático no establece resultados en ejecución/modelo/dispositivo.

La reversión debe conservar 0065 y sus datos. El código anterior no aplica la nueva política
 de pausa o ambiental: deshabilita iniciativa de participantes afectados antes de una reversión
autorizada o corrige hacia adelante. Rehabilitar sigue
esperando entrada humana nueva. Usa solo pipeline automático confirmado/enviado;
no reviertas migraciones, borres historial ni reinicies manualmente episodios detenidos.

### Contacto proactivo — migración 0094

`0094_proactive_outreach.sql` sigue a todas las migraciones hasta 0093. Añade
`contact.welcome_due_at`, `contact.welcome_attempts` (0–3), `contact.reengaged_at`,
`conversation_initiative.reengage`, índice parcial de bienvenidas pendientes y tres
triggers que cancelan una bienvenida pendiente ante cualquier mensaje, deshabilitación de iniciativa o
archivo. No hay relleno: los contactos existentes no reciben bienvenida y los chats
silenciosos existentes pasan a ser elegibles para [retomar contacto](initiative.md#re-engagement-after-silence)
tras publicar el Worker. No requiere recurso, binding, secreto, permiso de proveedor,
Cron Trigger ni cambio Wrangler nuevos; el trabajo `welcome` corre en el
`ChatWorkflow` existente y lo despacha el Cron de minuto existente
(`dispatchContactWelcomes`); el barrido de retomar contacto corre dentro de
`dispatchInitiatives` cada diez minutos.

Aplica localmente con el comando existente (`npx wrangler d1 migrations
apply DB --local`); producción la aplica por pipeline automático antes del
Worker que lee columnas nuevas. Verifica tras publicar con eventos de log
`initiative_decision`, `initiative_reengagement` y `welcome_decision`.

La reversión conserva 0094 y datos: Workers antiguos ignoran columnas nuevas, nunca
despachan bienvenidas ni reactivación y evalúan filas `reengage` bajo la política
ambiental anterior hasta vencer (como máximo tres días). Las bienvenidas pendientes quedan
sin enviar. Corrige hacia adelante en lugar de revertir la migración.

### Creación unificada de contactos — migración 0095

`0095_contact_generation_upload.sql` sigue a todas las migraciones hasta 0094. Solo
recrea el trigger `cleanup_generation` para que eliminar un trabajo cuya entrada
eligió `photo: "upload"` ponga también en cola su foto temporal
(`contacts/<user>/generation/<job>.jpg` en el bucket existente `CONTACT_PHOTOS`) en
el outbox duradero. No requiere tabla, recurso, binding, secreto, Cron Trigger ni
cambio Wrangler. La ruta nueva `POST /api/v1/contacts/:id/photo/generate`
usa `META_API_KEY` existente (texto Muse Spark y Muse Image) y la tabla existente
`auth_rate_limit` bajo la clave `contact-photo-generate`.

Aplica localmente con `npx wrangler d1 migrations apply DB --local`; producción aplica
por pipeline automático antes del Worker que prepara subidas. Verifica
tras publicar creando un contacto con foto subida y confirmando que desaparezca la
clave temporal al aparecer el contacto. Revertir conserva 0095: un Worker antiguo
rechaza entradas `name`/`photo` (422) y nunca prepara subidas; los trabajos ya en cola
con ellas siguen publicando bajo código anterior con nombre y retrato generados.

### Citas de Para ti y temas a seguir — migración 0096

`0096_for_you_quotes_suggestions.sql` sigue a todas las migraciones hasta 0095. Añade
`home_post.quote_of` anulable (referencia `home_post(id)`, `ON DELETE SET NULL`) y
`home_feed.suggestions_json` (arreglo JSON de hasta 4.000 caracteres). Sin reconstrucción de tabla,
recurso, binding, secreto, Cron Trigger ni cambio Wrangler. El límite diario de investigación de
Para ti en código sube de 12 a 15 por persona (consulta [Para ti](updates.md#news-scan)); no cambian
los presupuestos de investigación web por cuenta y globales.

Aplica localmente con `npx wrangler d1 migrations apply DB --local`; producción lo aplica
por pipeline automático antes del Worker que escribe columnas. Verifica tras
publicar que `GET /api/v1/home` devuelva `suggestions` después de una ejecución. La reversión conserva 0096:
Workers anteriores ignoran ambas columnas y clientes anteriores ignoran `quote` y `suggestions`.

## Ejecución nativa remota en dispositivos

El [prototipo remoto de temporizadores/alarmas](native-remote.md) reutiliza Worker API, D1,
Cron y proveedor APNs configurado. No añade servicio, binding ni secreto.
Aplica la migración aditiva `0034_remote_native_actions.sql` mediante publicación automática existente de
commit/push antes de instalar clientes nuevos para uso remoto. Añade
tablas de dispositivos/concesiones remotos y campos anulables de enrutamiento/outbox/plazos
 de acciones nativas. El servidor resuelve destinos del navegador y usa un HMAC con separación de dominio del
`BETTER_AUTH_SECRET` existente como capacidad de reclamación/recibo de acción única; rotar
ese secreto invalida capacidades pendientes. Nunca expongas el secreto mismo.

Para una cuenta Apple independiente, reemplaza ajustes existentes de equipo/bundle/grupo,
habilita App Groups en el **App ID de Notification Service** y asigna el mismo grupo
que a principal/Widgets/Share. Regenera/actualiza perfiles automáticos en Xcode. Los archivos versionados
`Config/NotificationService.entitlements`, Info.plist de extensión y ajustes de target
añaden acceso App Group, descripción de uso AlarmKit y fuentes Swift compartidas; no
actualizan permisos del Developer Portal. No añadas un entitlement AlarmKit inventado.
Las notificaciones visibles y AlarmKit deben haberse permitido con la app principal
abierta. El diseño no requiere modo de fondo siempre activo, VoIP, audio en segundo plano ni concesión Critical Alerts.
La extensión usa un endpoint HTTPS aislado de reclamación y una
lista permitida local protegida hasta el primer desbloqueo; nunca recibe la sesión principal.

Aprovisiona/verifica en orden: migración D1 y publicación automática API, configuración App
Group/perfiles Apple, instalación de app nueva y extensión integrada, concesión explícita
por contacto al iPhone y luego publicación automática web/selección de destino. API
local y web usan comandos usuales; APNs/firma reales y ejecución bloqueada
requieren iPhone físico y entorno APNs correspondiente. No
envíes una alerta de producción solo para verificar metadatos o compilación.

Ejecuta el compilador SQL estático opcional con
`python3 scripts/checks/remote-native-sql.py`; migra SQLite vacío en memoria
y usa EXPLAIN, sin fixtures ni acciones nativas. Pasan localmente comprobaciones estáticas API/web y Swift
principal/extensión. Comportamiento en dispositivo, estado/firma Apple Portal,
autorización AlarmKit de extensión/identidad del cliente y latencia de recibos no están verificados.
Sigue los casos de segundo plano, cierre forzado, revocación, cuenta, vencimiento,
entrega duplicada y fallo de red de la guía antes de describir la función como
operativa en dispositivo. El prototipo no habilita acciones autónomas de iniciativa.

La reversión es otra publicación automática confirmada/enviada. Conserva 0034; los clientes
antiguos de primer plano siguen compatibles con campos anulables. El código anterior ignora
registros de outbox remoto, que vencen sin repetirse; nunca los conviertas
 en propuestas de primer plano. Revoca concesiones/listas locales antes de revertir
para apagar completamente. Revertir/revocar no cancela alarmas del sistema ya
programadas. Eliminar dispositivo/sesión elimina concesiones; los recibos históricos
conservan procedencia remota y siguen la eliminación de conversación fuente. Ningún despliegue manual
ni comando de migración de producción forma parte de este flujo.

El punto de entrada API debe conservar `import './lib/schema-runtime'` antes de importar
consumidores de entrega remota, autenticación o MCP. El inicializador carga anticipadamente constructores
Zod compartidos y deshabilita JIT. Mover un consumidor antes puede pasar TypeScript
pero fallar validación de subida Worker con `Class2 is not a constructor` en el grafo de
esquemas MCP. Una subida fallida puede seguir a migraciones exitosas; conserva migraciones
aditivas y corrige el orden de entrada con otra publicación automática commit/push.

La corrección diagnóstica de cancelación remota es solo iOS: no cambia servicio,
secreto, binding, migración ni esquema de estado remoto. Instala un binario firmado nuevo
con su extensión para usar mensajes revisados de validación y comprobación
 de permiso de programación del sistema. Siguen siendo obligatorias autorización AlarmKit principal y concesiones
remotas por contacto; nunca repitas una acción previamente cancelada. La extensión
solo registra códigos acotados de etapa/autorización/error, sin tickets ni payloads
privados. Sigue siendo necesaria validación en dispositivo real.


## Cola de mensajes consecutivos

La migración `0035_chat_message_queue.sql` añade `chat_visit.typing_at` anulable, elimina
`chat_one_active_turn_idx` y crea el índice parcial no único `chat_active_turn_idx` sobre
contacto/secuencia. Permanecen transcripciones, credenciales, permisos, reclamaciones de atención,
Workflows y limpieza de visitas existentes. No se añaden recursos, bindings, secretos ni
ajustes de cuenta. Aprovisiona primero la infraestructura D1/Workflow;
aplica todas las migraciones con la configuración local documentada para una cuenta independiente.
Migración y publicación de producción corren solo mediante pipeline automático de código
confirmado/enviado. Publica API antes de depender de envíos consecutivos en clientes.

La API aplica atómicamente el límite existente de cola de cuenta y sigue requiriendo
atención del agente antes de procesar. Las ráfagas completadas solo de usuario usan un marcador
terminal interno en lugar de reconstruir tabla de transcripciones y claves foráneas;
consulta [ritmo de chat](chats.md#consecutive-messages-and-composer-pacing). Verifica orden
de cola, vencimiento de inactividad/escritura, historial/recibos de ráfagas y aislamiento de acciones con
cuentas ficticias. Pasó compilación estática SQLite; no se realizó migración remota ni verificación
en ejecución para este cambio.

Conserva 0035 al revertir código. Restaura un commit anterior API/cliente
mediante commit/push nuevo y publicación automática tras drenar trabajo en cola
con código nuevo. Restaurar el índice único anterior requiere que ninguna conversación tenga
varias filas en cola/en ejecución; no lo recrees con la cola poblada.
Los marcadores internos históricos de agrupación requieren normalización/historial nuevos;
prefiere corregir hacia adelante a ejecutar un lector antiguo sobre esas filas.


### Protección de publicación de respuestas (migración 0036)

Aplica `0036_reply_publication_guard.sql` después de 0035. Añade `chat_turn.tools_started`
con cero por defecto y restricción booleana. Los turnos existentes en ejecución y reintentados
se marcan conservadoramente iniciados porque el código anterior podría haber
invocado herramientas. El código nuevo persiste el marcador antes de despachar herramientas. Nunca se
restablece al reintentar un resultado incierto. La comprobación de lote previa a publicar, escritura
de respuesta y encolado push corren en una transacción D1, preservando atención y
 evitando que un envío humano compita entre comprobación y publicación. Los contextos nativos
coincidentes solo pueden agruparse mientras no haya empezado herramienta/acción.

No requiere servicios, secretos, bindings ni configuración de cuenta nuevos. Las instalaciones
independientes aplican todas las migraciones versionadas con configuración local normal; producción
solo usa el pipeline automático commit/push. Publica API con 0036
antes de depender de la guarda. Ambos clientes también necesitan su presentación histórica actualizada
con marcas temporales. Conserva la columna al revertir; el código anterior la ignora,
pero pierde la protección. Prefiere corregir hacia adelante y drenar Workflows activos
antes de cambiar política de ejecución. Pasaron compilación SQLite de migración/SQL sobre esquema vacío,
TypeScript API/web y comprobación completa Swift de simulador iOS. Siguen pendientes migración remota,
UI, repetición de herramientas y verificación en ejecución de mensajes concurrentes.


### Miniapps (migración 0037)

Aplica la aditiva `0037_mini_apps.sql` después de 0036. Crea `mini_app` (especificación, huellas
 de herramientas, aprobación por revisión y últimos códigos de error de paso) y `mini_app_action`
(registro de ejecución de escrituras). Ambas se eliminan en cascada con contacto y app; eliminar un
turno solo borra `mini_app.turn_id`. No se guardan datos de conectores. No requiere servicios,
bindings, secretos ni ajustes de cuenta nuevos. Los conectores MCP se
configuran como en [conexiones MCP](connectors.md). Las instalaciones independientes
aplican todas las migraciones con configuración local normal
(`npm run db:migrate:local`); producción solo usa el pipeline automático commit/push,
que migra antes de publicar. Publica API antes de depender
de clientes: las API anteriores devuelven 404 para rutas de miniapps, mostrado como
lista vacía. Revertir es otra publicación automática. Conserva tablas aditivas; el código
anterior las ignora. Siguen pendientes migración remota y verificación en vivo.

La migración `0038_mini_app_state.sql` (después de 0037) añade `mini_app_state`. Mantiene
valores guardados de acciones locales, con versión compare-and-swap y último
ID de ejecución para confirmar el registro de acciones en la misma transacción. Se elimina en cascada
con su app. No hay servicios ni secretos nuevos. Conserva la tabla al revertir; el código
anterior la ignora, pero las especificaciones con `state` fallarían su validación.

La migración `0050_group_mini_apps.sql` (después de 0049) permite que una miniapp pertenezca a
un grupo. SQLite no puede relajar `NOT NULL`, así que reconstruye `mini_app`, `mini_app_state`
y `mini_app_action` copiando cada fila: los hijos nuevos referencian al padre nuevo
mientras se eliminan tablas antiguas y luego los renombrados repuntan claves, por lo que ninguna
cascada borra estado guardado. `contact_id` y `user_id` pasan a ser anulables y una comprobación
requiere ambos o `group_id` (en cascada con grupo, con
`tools_json = '[]'`). `reply_id` (null con su respuesta grupal) ancla la tarjeta y
`agent_id` registra al constructor. No requiere servicio, binding ni secreto. Aplícala
como cualquier migración (local `npm run db:migrate:local`; producción solo mediante
publicación automática commit/push). Reversión: el código anterior lee filas privadas sin cambios e
ignora las grupales, cuyo contacto `NULL` las vuelve invisibles a consultas privadas.
Verificado localmente en D1 workerd: app privada, estado y registros sembrados sobreviven
la migración, las claves apuntan a `mini_app` nueva y eliminar contacto
sigue actuando en cascada. Migración remota pendiente hasta publicación automática.

### Mensajes privados desde grupos (migración 0051)

Aplica la aditiva `0051_group_private_messages.sql` después de 0050. Añade
`chat_turn.origin_group_id` anulable (null al eliminar grupo) e índice parcial
para presupuesto diario de mensajes privados enviados desde grupos. No necesita servicio,
binding ni secreto; aplica como cualquier migración (local
`npm run db:migrate:local`, producción solo por publicación automática commit/push).
Reversión: código anterior ignora columna y sigue mostrando turnos como
mensajes ordinarios de asistente. Verificado en D1 local workerd: un insert protegido llega
a un miembro con chat privado y no crea nada para un miembro sin él.

### Investigación web (migración 0053)

La recuperación de citas usa el mismo `META_API_KEY` para una llamada opcional de síntesis
`/v1/chat/completions` sin herramientas después de que `/v1/responses` devuelva resultados
sin citas utilizables. No necesita servicio, secreto, binding ni migración nuevos.
Ambas llamadas comparten reserva y plazo con comprobación de acceso/consentimiento entre
ellas; una caída no permite repetir llamadas pagadas. Consulta los
[presupuestos y validación de fuentes](web-research.md) actualizados. Las cuentas independientes
deben permitir ambos endpoints Meta. Revertir elimina este respaldo sin reembolsar
intentos consumidos ni borrar informes existentes.

La [investigación web](web-research.md) reutiliza `DB`, `CHAT_WORKFLOW`, atención del agente y
el `META_API_KEY` cifrado existente. No requiere servicio, binding, bucket, dependencia ni
Cron nuevo. Las instalaciones independientes siguen primero la configuración existente D1/Meta/Workers
Builds, aplican todas las migraciones en orden y luego habilitan
`WEB_RESEARCH_ENABLED: "true"` en `wrangler.jsonc` versionado API (ya versionado).
Reemplaza IDs/orígenes de cuenta como arriba; obtén acceso Meta Responses y búsqueda
web en tu cuenta Meta. No pongas valores de claves en configuración.

La aditiva `0053_web_research.sql`, después de 0052, crea el registro acotado de reservas/borradores,
eventos de uso sin contenido y procedencia anulable de documentos. Los eventos de uso
sobreviven a eliminar padres para evitar reembolsos; contienen clave hasheada de cuenta,
ID aleatorio y fecha, vencen a las 24 horas y tienen limpieza perezosa acotada
en admisiones posteriores. Para desarrollo local, usa el secreto Meta local
ignorado existente y `npm run db:migrate:local`; buscar usa el servicio
Meta real y puede generar cargos. Este cambio no crea cuenta de staging.
Staging necesita sus propios D1, Worker, clave y destino/IDs de build.

Migración y publicación de producción solo corren por release automático de código confirmado y
enviado. No apliques migraciones remotas ni despliegues manualmente. Publica API
antes de esperar procedencia en clientes. Los antiguos la ignoran; los nuevos
aceptan investigación omitida/null desde API anteriores. No se reescriben documentos
existentes. Antes de publicar ejecuta estática API/web y
`node scripts/checks/web-research-sql.cjs`. Tras publicación autorizada verifica la
etiqueta enviada, 0053, una consulta pública ficticia, enlaces de fuentes y repetición
sin segunda reserva, y luego las comprobaciones de cliente de la guía.

Revierte con otra publicación automática; conserva esquema/datos aditivos.
Fija `WEB_RESEARCH_ENABLED` a `"false"` para dejar de ofrecer/iniciar investigación.
No cancela búsquedas ya enviadas. Los informes siguen siendo documentos
editables ordinarios. Ningún trabajo recuperador reenvía llamadas pendientes/fallidas.
Los borradores listos conservan resultado hasta publicar o eliminar padre; los recibos
completados borran el cuerpo duplicado. Eliminar documento quita procedencia y
pone null al puntero del recibo. Consulta la guía para retención, límites, enrutamiento Meta
directo, cuotas gratis compartidas Cloudflare y comportamiento no verificado. No son parte de esta implementación local cambios
remotos de recursos ni llamadas reales al proveedor.

### Documentos de chat (migración 0047)

Aplica la aditiva `0047_documents.sql` después de 0046. Crea `chat_document` (Markdown
actual, revisión, último editor, `source_id` del turno o respuesta grupal creadora),
`chat_document_revision` (últimas 50 revisiones atribuidas) y `document_mutation`
(recibos de herramientas del contacto). Los documentos se eliminan en cascada con contacto, usuario o grupo. No requiere
servicio, binding, secreto ni trigger nuevo. Aplica como cualquier migración (local
`npm run db:migrate:local`; producción solo por publicación automática commit/push)
y publica API antes de depender de clientes; API anteriores devuelven 404,
mostrado como ausencia de documentos. Reversión: código antiguo ignora tablas y el
límite de cuerpo grupal vuelve a 24 KB. Consulta [documentos](documents.md).

### Listas compartidas de tareas (migración 0046)

Aplica la aditiva `0046_tasks.sql` después de 0045. Crea `task_list`, `task`,
`task_dependency`, `task_mutation` (recibos) y `task_work` (presupuesto de turnos
de trabajo) y añade columnas anulables `task_id` a `chat_turn` y `group_message`
(`SET NULL` al eliminar). Las listas caen en cascada con contacto, usuario o grupo. No requiere
servicio, binding, secreto ni Cron Trigger nuevo: los turnos de trabajo reutilizan Cron
existente de minuto, `CHAT_WORKFLOW`, `agent_attention` y energía de grupo. Aplica como cada
migración: `npm run db:migrate:local` local y solo publicación automática commit/push
en producción. Publica API antes de depender de clientes; API antiguas
devuelven 404 en rutas de tareas, mostrado como no disponible. Revertir es otra
publicación automática: el código anterior ignora tablas/columnas, no despacha turnos
 de trabajo y deja correr turnos ya en cola como ordinarios con texto vacío,
así que drena o cancela listas abiertas antes de revertir. Consulta [tareas](tasks.md).

### Controles de tareas persistentes (migración 0054)

Aplica la aditiva `0054_persistent_task_controls.sql` después de 0053. Añade estado/generación
de ejecución, siguiente paso, evidencia, razón de bloqueo, tokens protegidos de mutación y
generaciones de recibos. Las tareas existentes empiezan activas; se conserva consumo
entre todos los ciclos registrados de asignación. Las existentes pasan a generación 1;
los recibos anteriores quedan en 0 e invalidan sus intentos bajo código nuevo.
La siguiente revisión puede reanudar tareas activas con presupuesto restante. No necesita binding, servicio, secreto, permiso de
cuenta ni Cron nuevo. `DB`, `CHAT_WORKFLOW`, modelo/clave Meta
y permisos existentes de grupo/miembro siguen siendo requisitos. Las cuentas independientes
reemplazan IDs D1/Worker como arriba; AI Gateway opcional
no cambia. Staging usa sus DB/Workflow/secreto Meta existentes.

Para configuración local, aprovisiona recursos obligatorios existentes y aplica migraciones
con `npm run db:migrate:local`; conserva secretos locales en archivos ignorados. Migraciones
 y publicación de producción solo corren por release automático limpio, confirmado/enviado.
Publica API antes de usar clientes nuevos; los antiguos ignoran campos JSON
añadidos e iOS tolera ausentes durante transición API.
No se migró base persistente local ni remota para las comprobaciones de implementación.

Comprobaciones estáticas: TypeScript API/web, tipos Swift y
`node scripts/checks/persistent-task-sql.cjs` más
`node scripts/checks/reply-messages-sql.cjs` preparan SQL contra esquema vacío migrado
sin ejercitar comportamiento. La verificación funcional autorizada
debe cubrir admisión simultánea, agotamiento del sexto turno, no reembolsos al reabrir,
pausar/reanudar/cancelar durante trabajo, dependencias completadas, revocación de consentimiento/acceso,
ediciones desactualizadas y cachés de ambos con datos ficticios. Consulta
[trabajo persistente](persistent-work.md).

Revertir es otra publicación automática. Conserva columnas/recibos aditivos;
no reviertas relleno de consumo ni elimines datos. El código anterior a 0054
no aplica pausa/generaciones y puede reiniciar contadores al reabrir.
Cancela listas abiertas y deja terminar Workflows admitidos antes de volver
a ese código; solo pausar no basta. El trabajo ya iniciado
con proveedores puede terminar y generar cargos. Preparar migraciones no verifica
repetición en vivo, carreras de pausa, modelo, UI ni migración de producción.

### Permiso de investigación de tareas (migración 0055)

Aplica la aditiva `0055_task_research.sql` después de 0054. Añade consulta exacta y campos
anulables de concedente humano, contador vitalicio no reembolsable y enlace único de tarea
más generación de ejecución en recibos de investigación. Las tareas existentes/nuevas no tienen concesión
y consumo cero. No requiere servicio, binding, Cron, credencial de proveedor,
identificador de recurso ni permiso nuevo. Conserva `DB`, `CHAT_WORKFLOW`,
`META_API_KEY`, consentimiento actual de modelo y `WEB_RESEARCH_ENABLED` existente;
`false` deshabilita admisiones humanas y de tareas. Las cuentas independientes
aprovisionan lo anterior, reemplazan IDs y configuran secretos separados
 DB/Workflow/proveedor para staging. AI Gateway opcional no cambia.

La configuración local usa `npm run db:migrate:local` completo existente;
no se migró base persistente local para este incremento. Publica API y
migración con código confirmado/enviado automáticamente y luego instala/abre
clientes nuevos. No necesita despliegue manual ni migración remota en desarrollo.
Los clientes anteriores ignoran campos añadidos del tablero y no pueden conceder investigación;
iOS tolera ausentes en transición. Consulta [permiso de investigación de tareas](persistent-work.md#public-research-permission-0055)
para flujo reproducible asignar/guardar/consulta/guardar, revocación, transmisión de consulta
pública fija, retención de recibos, presupuestos y caché de ambos clientes.

La validación estática usa tipos API/web, Swift completo de app/compartido y los existentes
`web-research-sql.cjs`, `persistent-task-sql.cjs`, `reply-messages-sql.cjs`
en `scripts/checks/`. Prepara SQL en esquema vacío con todas las migraciones
y profundidad 100; no ejercita proveedores ni comportamiento.
Verificar la publicación funcional autorizada exige confirmar etiqueta enviada,
0055 aplicada una vez, denegación predeterminada, concesión solo humana, consulta exacta, una reserva
vitalicia bajo concurrencia, límites diarios 10/100, salida del concedente de grupo,
revocación Contributor, pausa/cancelación/reanudación alrededor de llamada pagada, denegación de publicación
con generación vieja, eliminación de informe/turno sin reembolso y recuperación UI/caché en
ambos con datos ficticios. Esas comprobaciones en vivo siguen pendientes.

La reversión usa otra publicación automática: primero deshabilita `WEB_RESEARCH_ENABLED`,
revoca concesiones activas/cancela trabajo y deja terminar solicitudes admitidas. Conserva
columnas, contadores y enlaces aditivos. Código anterior a 0055 ignora concesiones;
volver elimina disponibilidad para tareas y no debe reembolsar uso.
Evita volver antes de los controles de pausa/generación 0054 sin seguir su
procedimiento. Una solicitud al proveedor ya enviada aún puede generar cargos.

### Monitores de páginas (migración 0056)

Aplica la aditiva `0056_task_monitors.sql` después de 0055. Añade URL de monitor anulable,
palabras clave, intervalo (por defecto 360 minutos), concedente, horas de vencimiento/pendiente y contador
vitalicio de turnos por cambios a `task`, más `task_monitor_state` (último texto extraído y
hashes) y `task_monitor_check` (log acotado), ambos en cascada con tarea. Las tareas existentes
no tienen monitor. No requiere servicio, binding, secreto, identificador ni permiso
nuevo: las comprobaciones corren en el Cron existente `* * * * *` (`dispatchMonitors`)
y los turnos de cambio usan `CHAT_WORKFLOW` y `META_API_KEY`. La bandera existente
`global_fetch_strictly_public` debe permanecer activa en
`apps/api/wrangler.jsonc`; impide consultar redes privadas. Cuentas independientes
y staging no necesitan nada más que los recursos obligatorios anteriores.

Configuración local usa `npm run db:migrate:local`; publica por release automático confirmado/enviado
y luego instala/abre clientes nuevos. Los antiguos ignoran campos añadidos y no
pueden añadir monitores. Validación estática: tipos API/web, tipos Swift completos,
`node scripts/checks/persistent-task-sql.cjs` (SQLite, profundidad 100; fija `SQL_OUT` para
capturar sentencias y prepararlas con `EXPLAIN` en D1 local workerd). La verificación
funcional autorizada debe confirmar 0056 aplicada una vez, ausencia predeterminada, concesiones
solo humanas, resultados base/sin cambios/con cambios en una página controlada, fallos de redirección y tipo,
filtrado de palabras, un fetch por comprobación vencida con Cron concurrentes,
3 turnos diarios y 20 vitalicios por cambios, revocación/reasignación durante fetch y UI de ambos
clientes. Siguen sin verificarse en vivo. Consulta [monitores de páginas](monitors.md).

Revertir usa otra publicación automática. Para detener comprobaciones sin cambiar código, elimina
monitores en los editores (o pausa tareas). Conserva columnas/tablas aditivas;
código anterior a 0056 las ignora, así que volver detiene silenciosamente comprobaciones y turnos por
cambios. Los turnos ya admitidos aún pueden terminar y generar costos.

### Ajustes de administración y auditoría (migración 0059)

Aplica la aditiva `0059_admin.sql` después de 0058. Crea `app_setting` (ajustes de
runtime, sin claves foráneas) y `admin_event` (auditoría solo de anexado, IDs simples para
sobrevivir a eliminar cuentas). Sin fila, cada ajuste usa su valor de código
predeterminado, así que el registro sigue abierto hasta que un superadministrador lo cierre. La nueva variable
`SUPER_ADMIN_USER_IDS` viene vacía. Validación estática: cada sentencia nueva
preparada en D1 local workerd y una cascada sembrada de eliminación de cuenta. La verificación en vivo
figura en [administración](admin.md#verification-status). Reversión: consulta
[Worker de administración](#admin-worker).

### Colaboración de tareas (migración 0058)

Aplica la aditiva `0058_task_collaboration.sql` después de 0057: `task.document_id` anulable
(null al eliminar documento), `review_rounds` (0–2) y `review_feedback`.
Sin cambios de servicio, binding, secreto ni permisos. Publica por pipeline
automático; clientes anteriores ignoran campos nuevos. Validación estática:
`node scripts/checks/persistent-task-sql.cjs` (70 sentencias) más D1 workerd
`EXPLAIN`. No verificado funcionalmente (borrador/revisión de varios contactos, rechazo de tercera ronda,
eliminación de documento, ambas UI). Reversión: código anterior a 0058 ignora
columnas; las tareas reabiertas por revisión siguen siendo tareas abiertas ordinarias.

### Clasificación semántica de memoria (migración 0057)

Aplica la aditiva `0057_semantic_memory.sql` después de 0056. Añade columnas BLOB anulables
`embedding` a `contact_memory` y `group_memory` y dos triggers que borran
vector al cambiar contenido. Sin recurso nuevo: usa el binding Workers AI requerido
existente `AI` (`"ai": { "binding": "AI" }`), cuya cuenta debe permitir
Workers AI. Modelo `@cf/baai/bge-m3`; la cuota es la asignación de neuronas de la cuenta
(10.000/día gratis, comprobado el 29 de octubre de 2026). No usa Vectorize.
La bandera versionada `SEMANTIC_MEMORY_ENABLED` en vars de `apps/api/wrangler.jsonc` viene
`"false"`; fija `"true"` y publica para activar (staging puede hacerlo independientemente).
Ejecuta `npm run types` en `apps/api` después de cambiar vars.

Local: `npm run db:migrate:local`; `wrangler dev` local llama Workers AI remoto con
tu cuenta. Publica automáticamente código confirmado/enviado; clientes no cambian.
Verificación autorizada: 0057 una vez, bandera activa en staging, recuerdo ficticio
entre idiomas sin palabras compartidas, vectores escritos una vez
y borrados al editar, cascadas de eliminación, chats aislados nunca convertidos a embeddings y
respaldo léxico al fallar AI. Aún sin verificar.

Reversión: fija la bandera a `"false"` (solo léxico desde la siguiente publicación).
El código anterior a 0057 ignora columnas. Para eliminar vectores guardados, ejecuta
`UPDATE contact_memory SET embedding = NULL; UPDATE group_memory SET embedding = NULL;`
por el proceso normal de migraciones.

## Personalidad de contactos

La [personalidad de contactos](personality.md) reutiliza D1 `DB`, clave/modelo Meta,
`CHAT_WORKFLOW` y Cron de minuto existentes. No requiere cuenta, servicio, binding, permiso,
secreto, bucket, gateway ni trigger programado adicional. El orden de creación
sigue la configuración independiente anterior: aprovisionar D1, configurar
bindings y secretos runtime/build sin confirmar valores, configurar Workers Builds
automáticos API/web y aplicar migraciones versionadas. Aprovisionar la app
 y credenciales existentes sigue siendo necesario antes de habilitar el experimento.

La migración `0039_contact_personality.sql` crea `agent_personality` y
`personality_event`, índices de consulta/vencimiento y triggers de limpieza de privacidad. Las
declaraciones Drizzle están versionadas en `src/db/schema.ts`. La migración `0040_personality_relationships.sql` añade el índice compuesto agente/persona/tiempo
para proyecciones; no rellena ni reclasifica fuentes antiguas.
El director y comprobaciones de recibos vigentes usan tablas existentes con filtros de permisos de
origen, consentimiento de modelo y aislamiento de conectores. No crea resúmenes globales libres ni
segundo registro de relaciones. Todos los agentes existentes
empiezan deshabilitados sin fila de perfil; migrar no reescribe chats ni identidades
heredadas. El Cron existente poda hasta 500 observaciones vencidas por minuto;
las conversaciones activas también podan su historial acotado. Los logs solo contienen un
evento acotado `personality_appraisal_deferred`, nunca texto de perfil ni evidencia.

Para desarrollo local, tras `npm ci` y autenticación existente, ejecuta
`npm run db:migrate:local` y comandos API y web. Usa
perfiles y fechas ficticios. Producción requiere commit y push exitoso
a la rama configurada y luego verificar ambos builds
Worker automáticos y SHA desplegado. La publicación API aplica todas
las migraciones D1 antes de publicar. No despliegues manualmente ni migres una
base de producción fuera de una tarea de publicación explícitamente autorizada.

Verificación: inspecciona valor deshabilitado, actualizaciones solo de creador y gestión 409,
hechos de calendario calculados, continuidad y ámbitos de origen, filtros de consentimiento,
limpieza al cambiar perfil,
poda por vencimiento y ambos editores. Tipos y compilación SQL no
establecen calidad del modelo, permisos en vivo, UI ni estado remoto de migraciones.
Las regresiones locales ficticias están autorizadas y documentadas en la
guía. Esta implementación no realizó migración/publicación de producción ni evaluación de
modelo en vivo.

Reversión: deshabilita perfiles afectados o revierte fuente Worker mediante publicación automática
confirmada/enviada. Conserva tablas/índices/triggers aditivos; código anterior
puede ignorarlos y los chats permanecen compatibles. Eliminarlos
borraría observaciones/perfiles y rompería clientes nuevos. Conserva 0040
y su índice al revertir director; código v1 puede ignorar campos v2
 y mantener comportamiento local anterior. Restaura API correspondiente
antes de habilitar. Los perfiles pueden recrearse, pero observaciones emocionales
borradas no son intencionalmente recuperables por esta función.

## Onboarding de cuenta

Registro y primer círculo requieren migraciones **0041_onboarding.sql** y **0049_onboarding_chats.sql**,
bucket privado existente `CONTACT_PHOTOS` y `META_API_KEY` de runtime con acceso
a **muse-spark-1.3** Estándar y **muse-image-1.0**. No requiere secreto ni cuenta
externa nuevos. Nunca imprimas el secreto; las cuentas independientes deben aportar
su clave Meta, acceso a modelos y créditos mediante la configuración cifrada
existente de secretos build/runtime. Consulta [onboarding](onboarding.md) para contrato de datos.

Orden: aprovisiona D1 y bucket R2 privado con la configuración existente,
configura secretos auth/Meta y aplica todas las migraciones localmente con
`npm run auth:setup:local` o `npm run db:migrate:local`. 0041 conserva
comportamiento de cuentas existentes y exige onboarding a registros futuros.
La configuración Wrangler API confirmada añade `ONBOARDING_WORKFLOW`, clase
`OnboardingWorkflow`, nombre `wildcard-onboarding`. La publicación automática normal
aprovisiona este Workflow junto a `wildcard-chat`; el Cron existente
recupera despachos interrumpidos. Las cuentas independientes deben reemplazar nombres Worker,
IDs D1/bucket/cuenta, URL auth, origen web y binding de servicio web API como se describió
antes. Staging usa recursos/secretos y nombres de Workflow separados; nunca debe
apuntar a D1 o R2 de producción. El Worker web no tiene bindings nuevos de almacenamiento/secretos.

`wrangler dev` local usa Workflow declarado y emulación local D1/R2; conserva
entradas ficticias y recuerda que las solicitudes reales generan uso Meta si está configurado.
No se requieren llamadas a modelos para tipos o compilación SQL estática.
Registrar permite cinco intentos por IP/minuto, pero no es un límite global de gasto
de inferencia. Los retratos usan una solicitud por contacto con reintentos acotados; una
transferencia interrumpida proveedor/almacenamiento puede repetir generación facturada.

Publica solo confirmando y enviando a la rama configurada y comprueba ambos
builds automáticos y SHA desplegado. La publicación existente API aplica
0041 antes del código, preservando orden requerido.
No despliegues manualmente ni omitas migración/publicación automática. Esta implementación no cambió recurso
remoto, migración, registro de cuenta ni despliegue.

Verifica acceso a modelos, binding Workflow nuevo, recuperación Cron, exención de cuentas anteriores,
registro real, finalización/reintento en segundo plano, retratos privados, las cinco personalidades
y miembros finales con datos ficticios primero en staging. La estática
no establece esos comportamientos. Para revertir, envía una fuente compatible
por publicación automática y cierra registro si deshabilitas configuración. Conserva
columna/tabla y contactos/grupos completados. El código antiguo
ignora la bandera nueva; revertir solo el control del cliente deja a las cuentas pendientes
entrar en la estructura anterior. Detén Workflows pendientes antes de retirar clase/binding.
Las configuraciones fallidas retienen imágenes temporales privadas R2 y planes D1 para reintentar; mantener datos
de cuenta debe incluir esas claves/filas porque no se añade TTL automático.

La actualización según edad añade `age` en `input_json` y edad/género
por contacto en `plan_json`; no requiere migración, binding ni secreto
nuevo. Los envíos nuevos exigen edad entera (1–120); actualiza ambos clientes con
API. Envíos/planes ya guardados sin esos campos siguen reintentables.
Revertir puede conservar campos JSON aditivos y fotos existentes; una API anterior
rechaza solicitudes nuevas con edad, así que deben coincidir versiones cliente/API.
Usa el mismo proceso commit/push/publicación automática; la actualización de edad no
realizó cambios remotos ni llamadas reales al modelo.

La actualización de grupo opcional/propósito añade `createGroup`, `circleType` y `occupation`
a `input_json`, conservando secretos, servicios, bindings y orden
de recursos. Aplica todas las migraciones locales como arriba. 0049 añade `contact.onboarding_chat`
(0 por defecto), fijado en 1 solo en la transacción final. La publicación automática
lo aplica antes de publicar API; actualiza iOS/web juntos.
No rellena ni reescribe contactos/planes completados. Las solicitudes
anteriores siguen aceptadas como Amigos con grupo; planes/fotos guardados quedan congelados.
Revertir con commit compatible puede conservar columna y campos
JSON; una API antigua ignora el marcador inicial de Chats y siempre crea
un grupo, así que conserva Workflow actualizado para envíos sin grupo pendientes. No
reviertas pendientes a código que ignore sus elecciones. Verifica staging
con campos ficticios trabajo/estudio, Amigos, cada estilo, ambos interruptores,
ID final null sin grupo, publicación/reintento atómicos, paginación,
cero mensajes/recuentos sintéticos y exclusión de otros contactos vacíos.
Sin inferencia en vivo, migración remota ni validación dispositivo/navegador para estos cambios.

## Mensajes sucesivos de contactos

Aplica **0042_reply_messages.sql** antes de publicar API actualizada.
Añade la columna JSON anulable de mensajes entregados a la tabla D1 existente
`chat_turn`. Conserva DB, CHAT_WORKFLOW, Cron y APNs opcional existentes;
no hay recursos, secretos, reemplazos de cuenta ni permisos nuevos.
Aprovisiona primero la infraestructura base anterior en una cuenta independiente.

Para desarrollo usa `npm run db:migrate:local` (o configuración completa
`npm run auth:setup:local`). Las publicaciones siguen el proceso automático:
confirma/envía fuente, deja a Workers Builds migrar y
publicar y verifica commit desplegado y lista de pendientes. Nunca
uses despliegue manual como solución alternativa. Este cambio no se migró ni
publicó remotamente durante implementación.

La migración es aditiva. Conserva la columna al revertir: código y clientes anteriores
siguen usando `assistant_text` unido; las filas antiguas se muestran como mensaje único en clientes
nuevos. Detén/drena Workflows nuevos en curso antes de revertir, pues el código
anterior no puede reanudar con seguridad una ráfaga parcialmente publicada. Verifica inferencia real de uno y
varios mensajes y entrega con datos ficticios tras publicar;
tipos/SQL no establecen soporte JSON del proveedor ni comportamiento en dispositivo.
Consulta [mensajes sucesivos](reply-messages.md) para contratos de entrega y caché.

El ajuste de ritmo según longitud usa los mismos bindings D1 y Workflow sin
migración, secreto, permiso ni servicio adicional. Cada texto espera
hasta 15 segundos; el Workflow guarda plazos de composición y renueva el lease
existente de presencia atendida por parte. La iniciativa privada reserva 90 segundos
de presencia para su espera acotada. Sleep no depende de un cliente abierto. La recuperación
Cron reconoce Workflows dormidos como activos, no fallidos. Confirma
y envía para publicar por Workers Builds y verifica SHA activo;
no requiere despliegue manual. Revertir conserva filas/JSON entregados; drena
Workflows en curso antes de revertir nombres de pasos. Quedan por comprobar tiempos reales,
interrupción/repetición, transiciones voz/texto e indicador Escribiendo entre partes
en conversaciones ficticias iOS/web; la estática sola no los
establece.

## Compartir texto privado en grupos

La migración `0043_group_private_sharing.sql` añade una tabla voluntaria de concesiones persona/agente/grupo
con claves foráneas de pertenencia y contacto privado, más triggers de revocación/aislamiento/
consentimiento que completan intentos grupales afectados. Reutiliza D1, FTS5 y Workflow
grupal existente; no requiere cambios de recursos, bindings, secretos ni cuentas
externas. Todas las instalaciones empiezan sin concesiones.

Las independientes siguen requisitos auth/contacto/grupo existentes y luego
aplican todo localmente con `npm run db:migrate:local`. La preparación SQL
estática está disponible con `node scripts/checks/private-sharing-sql.cjs`; compila
consultas contra esquema vacío completamente migrado sin ejecutar solicitudes del producto.
Para producción, confirma/envía fuente; publicación automática aplica
0043 antes de Worker. Nunca publiques ni migres manualmente para saltar ese
pipeline. Verifica etiqueta automática y migraciones tras publicación
autorizada y ejercita cuentas ficticias privadas/grupales como describe
[grupos](groups.md#optional-private-text-sharing).

El campo aditivo de instantánea es opcional para clientes anteriores; no pueden gestionar
el ajuste nuevo. Código API anterior no expone recuperación de historial privado, así que
revertir mediante commit confirmado/enviado puede conservar tabla/triggers sin
eliminar datos. Para apagar, revoca primero concesiones para cancelar borradores
activos; revertir solo código no puede retirar checkpoints Workflow ya en ejecución.
El texto grupal entregado y datos del proveedor permanecen.
Esta implementación no realizó migración remota, publicación ni verificación con modelo real o
 dispositivo.

## Imágenes de chat generadas por contactos

El experimento reutiliza bucket privado obligatorio `CONTACT_PHOTOS` R2, `DB`,
`CHAT_WORKFLOW`, Cron de recuperación/limpieza y `META_API_KEY` cifrado de runtime ya
aprovisionados para onboarding/chats. Sin recurso ni binding extra; el proyecto Meta de la cuenta
independiente debe tener acceso a endpoints de generación/edición
`muse-image-1.0`. Sigue orden y secretos anteriores,
reemplazando IDs de cuenta, nombres Worker, dominios e identidades bucket/base.
Las solicitudes van directo a Meta, como retratos del onboarding; el AI Gateway
Spark opcional no es necesario ni registra estas llamadas.

Aplica la aditiva `0044_generated_chat_images.sql` después de 0043. Para desarrollo
local usa Wrangler global autenticado documentado arriba y
`npm run db:migrate:local`; configura el secreto Meta local sin
confirmarlo y ejecuta API/web o apunta iOS a API local. Nunca copies
imágenes de producción a una demo. Los objetos viven bajo `generated/`
en bucket privado existente. La tabla de recibos registra una generación reservada
por respuesta, estado, versiones de referencia y metadatos, con claves foráneas
de conversación/grupo en cascada. El registro existente de adjuntos controla limpieza
R2 tras gracia de 24 horas, incluidas imágenes generadas de asistente.

Para producción, confirma/envía fuente; la publicación existente
aplica migración antes del código. Verifica Workers Builds y SHA de
fuente activo; usa cuentas ficticias para escenarios de
[imágenes generadas](generated-images.md). No despliegues ni migres producción
manualmente. Esta implementación no realizó migración remota ni verificación real de
proveedor. Revertir conserva tabla y campos JSON entregados;
no la elimines con Workflows nuevos/en cola que puedan usarla. Clientes privados anteriores
solo muestran pies; grupales anteriores soportan imágenes adjuntas. Una solicitud de
proveedor con resultado incierto no se reintenta automáticamente, tampoco tras
reversión/recuperación; un turno humano nuevo explícito puede crear otra reserva.

### Referencias de imágenes del mismo chat y descripciones internas (migración 0048)

Aplica la aditiva `0048_chat_image_references.sql` después de 0047. Crea el
`chat_image_index` interno con clave foránea inmutable al objeto de registro, digest, descripción
visual/contexto atribuido/texto de búsqueda acotados, lease y hora de actualización. Los triggers al
eliminar mensajes quitan descripciones; limpiar registro elimina filas huérfanas en
cascada. No requiere índice externo, bucket público, binding, permiso ni secreto nuevo.
El modelo Spark existente describe píxeles reales; Muse Image acepta avatares actuales
y referencias originales del mismo chat mediante su endpoint de edición.
Habilita ambas API existentes en cuenta Meta independiente; describir añade
uso Spark y latencia. Aplican reglas actuales Estándar/Contributor y aislamiento de
conectores. El paso privado permite ocho minutos para buscar, generar
e indexar; los grupales de herramientas permiten cuatro minutos, mientras HTTP de generación
sigue limitado a 150 segundos y cada descripción a 45 segundos.

La configuración independiente mantiene orden: crear D1/R2 privado, configurar
secretos existentes auth/modelos sin confirmar valores, aplicar migraciones locales
con `npm run db:migrate:local` y ejecutar API y cualquiera de los clientes.
No hay comando de relleno masivo ni importación: los turnos nuevos indexan una imagen
acotada, las generadas se describen tras crear y el historial antiguo se describe
bajo demanda al buscar. Consulta [imágenes generadas](generated-images.md) para límites exactos.

Producción requiere commit/push autorizado y Workers Builds existente
que migra antes de publicar. Verifica 0048, SHA activo
y escenarios ficticios de referencias/aislamiento/eliminación antes de depender de la
función. No se realizó migración remota, inferencia ni despliegue para
este cambio. La reversión conserva índice/tabla/triggers aditivos y JSON de referencias
mixtas: drena trabajo de imagen en curso antes de volver a código que solo entiende
referencias de perfil. No borres descripciones ni registros mientras los usen Workflows
activos. Las imágenes entregadas siguen compatibles con ambos clientes existentes.

### Orden de presencia (migración 0045)

Aplica `0045_presence_ordering.sql` después de 0044. Elimina el trigger `agent_visit_activity`,
para que visitar no conecte contactos, y añade la columna anulable
`agent_presence.typing_contact_id` (clave a `contact`, `SET NULL` al
eliminar) para escritura de seguimiento. No necesita recurso, binding, secreto ni permiso
nuevo; reutiliza D1, Workflow `CHAT_WORKFLOW` y Cron de
minuto. El Cron ya no despacha trabajos de visita; instancias heredadas `kind: visit`
terminan inmediatamente. En desarrollo ejecuta `npm run db:migrate:local` y luego
`npm run dev`. Producción: confirma/envía; la publicación automática aplica
migración antes de publicar. No despliegues ni migres a mano.

Tras release autorizado, verifica Workers Builds, SHA y
0045 aplicada; con cuentas ficticias comprueba en privado, grupos y
seguimientos: abrir deja al contacto Sin conexión/Últ. vez; enviar pasa a
En línea, luego Leído, luego Escribiendo; nunca Escribiendo antes de Leído; un seguimiento
muestra En línea y vuelve a Sin conexión si no envía nada. Solo se ejecutaron comprobaciones estáticas
TypeScript para el cambio; las de ejecución siguen pendientes.

Reversión: código anterior ignora columna aditiva. Restaurar En línea basado en visitas
requiere recrear deliberadamente el trigger eliminado desde 0013; código
anterior también vuelve a despachar visitas. Las marcas de lectura escritas antes en
el turno por esta versión siguen válidas para código anterior.

## Generación de contactos con IA

Aplica `0052_contact_generation.sql` con publicación automática normal
después de las existentes. Añade tabla de trabajos por cuenta,
índices y enlace de contacto borrado al eliminar; no requiere servicio, binding, secreto,
cuenta externa ni permiso nuevo. Aprovisiona D1 existente,
bucket privado `CONTACT_PHOTOS` R2, clave Meta Estándar y `ONBOARDING_WORKFLOW`
antes de habilitar en una cuenta independiente. Reemplaza IDs,
nombres y dominios del repositorio según instrucciones existentes. La misma clase
Workflow admite payload opcional de ID de generación y el Cron
recupera despachos. iOS y web usan la misma API firmada
y rutas privadas de imágenes. La configuración local aplica migraciones por el comando
normal y usa clave Meta en `.dev.vars` ignorado para inferencia
autorizada; la validación estática no requiere clave.

Confirma/envía para publicar automáticamente; nunca manualmente. Verifica commit
enviado, migraciones automáticas, acceso de bindings y generación ficticia
en ambos clientes tras release autorizado. No hay verificación real de
proveedor/dispositivo/navegador. Revertir puede dejar tabla aditiva;
no la elimines con instancias de generación activas. Los contactos completados
usan contratos existentes de contacto/personalidad/foto. Los clientes antiguos pueden
leerlos, pero este servidor rechaza cumpleaños menores de 18. La entrada de onboarding
sigue retenida privadamente tras configurar para personalizar generación. Los trabajos/retratos
fallidos no vencen automáticamente; consulta [retención y recuperación](contact-generation.md).


## Presencia de grabación (migración 0062)

Aplica `0062_recording_presence.sql` por migraciones D1 ordenadas existentes. Añade
`agent_presence.recording_until` anulable; no requiere servicio, binding, permiso
ni secreto. Las instalaciones independientes nuevas aplican después de 0061 con
todas las anteriores. Local: `npm run db:migrate:local`; producción
migra por publicación automática API confirmada/enviada antes de activar.
Despliega la migración API antes de usar clientes que muestren grabación.
Las filas existentes quedan null. La presencia privada conserva estado `typing`
y añade `isRecording` booleano opcional, por lo que clientes anteriores pueden
seguir decodificando y mostrar escritura. Los campos nuevos de resumen son aditivos.

El lease de síntesis se limita a dos minutos y solo actualiza el turno/intento
coincidente de atención. Limpiar compara su plazo para que una ejecución anterior
no borre un lease de reemplazo. Las fases nuevas de escritura lo reinician. Al revertir, restaura
código API/cliente anterior y conserva la columna; no se modifica
historial. Verifica texto, voz, respaldo de texto, síntesis interrumpida y
ámbitos compartido/grupal en cuenta independiente. No se realizaron estas comprobaciones de ejecución/
dispositivo.

## Ciclo de vida del chat (migración 0063)

Aplica `0063_chat_lifecycle.sql` en el pipeline D1 ordenado existente. Añade marcas de archivo, revisiones/bloqueos de vaciado de historial, tablas de recuerdos extraídos retenidos, metadatos de subidas por ámbito, seguimiento de instancias y outbox duradero con triggers de eliminación. No requiere servicio Cloudflare, bucket, secreto, binding ni permiso nuevos: reutiliza `DB`, `CONTACT_PHOTOS`, `CHAT_WORKFLOW`, `ONBOARDING_WORKFLOW` y Cron de minuto. Una cuenta independiente debe aprovisionar esos recursos obligatorios como arriba antes de aplicar todas las migraciones localmente con `npm run db:migrate:local`. Es la misma configuración necesaria de producción; aquí no se aprovisiona staging separado.

Producción migra solo mediante release automático API desde fuente confirmada/enviada. Publica API antes de depender de acciones nuevas; clientes anteriores sin revisiones no pueden enviar a un chat previamente vaciado. Las comprobaciones estáticas de binding usan API Wrangler/runtime instalada para `WorkflowInstance.delete()`. La [API oficial](https://developers.cloudflare.com/workflows/build/workers-api/#delete) elimina estado guardado y detiene ejecución; esta implementación no se limita a terminar.

Monitorea cantidades de filas `resource_cleanup` por tipo, `next_at` vencido, intentos y antigüedad, más eventos `resource_cleanup_deferred`. Los trabajos sobreviven a cascadas/fallos y reintentan sin máximo de intentos; los Workflow liberan bloqueos de vaciado y los de objetos/prefijos conservan barrido final de cinco minutos para subidas tardías. Inspecciona vaciado de cola y listados R2 en verificación ficticia; nunca interpretes un 202 como prueba de que desapareció todo recurso externo. El recolector existente de huérfanos cubre subidas heredadas/sin ámbito interrumpidas tras gracia de 24 horas. Consulta [ciclo de vida](chat-lifecycle.md) para inventario, caché, excepciones, fallos y lista de verificación.

Reversión: conserva 0063 y tablas de outbox/registro/recuerdos retenidos. Revertir eliminaría limpieza Cron y ocultaría conocimiento retenido; mantén consumidor de limpieza compatible o corrige hacia adelante antes de aceptar más eliminaciones. Las copias compatibles de restauración no pueden revivir datos eliminados intencionalmente sin recuperación autorizada separada. Solo validación estática: siguen sin verificarse fallos reales Workflow/R2, recuperación Cron, publicación/fuente y comportamiento dispositivo/navegador.

## Reproducción de voz en segundo plano en iOS

El target principal habilita Background Modes en `Wildcard.xcodeproj` y declara
`UIBackgroundModes` con `audio` en `apps/ios/Config/Info.plist`. Una instalación
independiente usa estos ajustes versionados sin servicio, binding, secreto,
migración de servidor ni entitlement adicional de aprovisionamiento. Abre el proyecto
Xcode existente e instala con tu firma para aplicar el cambio de
bundle; una publicación API/web no actualiza un bundle iOS instalado. No
interviene programador de tareas de fondo, push silencioso ni despliegue manual.

El reproductor de sesión activa audio solo al reproducir
explícitamente. La salida normal usa playback/spokenAudio; la del auricular por proximidad usa
playAndRecord/default sin abrir entrada de audio. El permiso existente de micrófono
sigue siendo necesario solo para grabar. Ambos añaden controles multimedia genéricos del sistema;
los navegadores determinan soporte de fondo y no pueden reproducir ruta de auricular.
Consulta [reproducción de voz](voice.md#background-playback-and-ear-routing) para caché/privacidad,
límites al terminar y comprobaciones físicas/navegador pendientes. Plist y tipos estáticos
solos no validan ejecución en fondo. Revertir elimina modo de fondo
audio y restaura reproducción solo en primer plano; mensajes guardados y preferencias numéricas
 de velocidad no necesitan migración. Cualquier publicación servidor/web sigue el
proceso existente de commit, push y despliegue automático.

## Protecciones de limpieza y validación local del ciclo de vida (migración 0064)

Aplica `0064_lifecycle_cleanup_guards.sql` después de 0063 por el pipeline ordenado.
Añade `resource_cleanup_scope` con clave en cascada al trabajo outbox,
índices de consulta de ámbitos, captura ambos propietarios de limpieza privada derivada de grupo,
recrea triggers de eliminación de imágenes generadas para retener ámbito antes de
cascadas, repara ámbitos pendientes de multimedia donde el registro aún los conoce
y reemplaza la copia implícita de columnas del trigger de memoria de aislamiento grupal por
columnas explícitas compatibles con embeddings de 0057. No
reescribe migraciones publicadas ni reinicia recuentos/plazos/revisiones de reintento.

Reutiliza DB, R2, bindings Workflow, Cron, permisos y secretos existentes. No
requiere servicio remoto ni ajuste de cuenta nuevo en producción ni instalación
independiente; la configuración local sigue aplicando todo con
`npm run db:migrate:local`. Migración/publicación de producción deben usar fuente confirmada,
enviada y pipeline automático API, nunca despliegue manual. Aplica
0064 antes de activar consumidor actualizado, que consulta la tabla de ámbitos.

Reproduce validación con `npm ci`, `npm run typecheck:lifecycle` y
`npm run test:lifecycle`. El [informe](chat-lifecycle-testing.md) registra 38 casos aprobados
de integración local, fallos inyectados y límites de verificación de servicios
emulados. El ejecutor necesita socket loopback y directorios temporales;
nunca usa configuración Wrangler de producción, autenticación ni datos reales.
Dependencias y scripts están versionados en workspaces y lockfile raíz.

Monitorea filas outbox y enlaces al diagnosticar vaciado pendiente. Un trabajo
enlazado a resultado privado y grupo debe terminar antes de liberar cualquier bloqueo;
los enlaces desaparecen automáticamente con el trabajo. No borres enlaces para forzar
finalización. Los trabajos existentes cuyo origen perdido no puede reconstruirse conservan su
ámbito original y siguen drenando globalmente; migrar solo repara
relaciones respaldadas por evidencia almacenada en el registro.

Reversión: conserva 0063/0064, filas y enlaces; corrige hacia adelante
o mantén consumidor compatible. Los consumidores antiguos 0063 no contabilizan
correctamente bloqueos enlazados. La actualización de base se ejercita localmente, pero
activación/fuente y comportamiento global de fallos/reintentos Cloudflare siguen
sin verificarse para estas correcciones hasta release automático autorizado.

## Recibos de reproducción de voz (migración 0066)

Aplica `0066_voice_playback.sql` por publicación automática API existente
antes de servir clientes actualizados. Añade `chat_turn.assistant_voice_listened_json`
(`{}` por defecto) y `group_voice_playback` con clave mensaje/cuenta, claves
foráneas en cascada e índice de cuenta. No requiere servicio, binding, secreto ni recurso específico
nuevo; las instalaciones independientes usan aprovisionamiento D1 y
orden hasta 0066 existentes. Local usa `npm run db:migrate:local` como siempre.

PUT autenticados idempotentes a la ruta de audio más `/listened` registran
reproducción entrante. Privados requieren `side=assistant&part=N`; grupales
verifican pertenencia actual y rechazan el clip propio del remitente. Las escrituras validan audio
y rechazan chat en vaciado; nunca infieren ni cambian recibos de lectura.
Historial y resúmenes incluyen metadatos de escucha y duración para cuenta actual.

Confirma/envía para publicar automáticamente; no migres ni despliegues producción
manualmente. Verifica commit/migración automáticos y luego comprobaciones de escucha
en [verificación de caché de voz](caching.md#voice-listening-metadata) en ambos clientes.
Aún no se realizaron esas comprobaciones para el cambio. Revertir puede conservar
esquema aditivo; clientes antiguos ignoran campos opcionales nuevos.
Los nuevos requieren API nueva para recibos entrantes persistidos. El audio existente empieza
sin escuchar porque no puede reconstruirse reproducción humana previa desde recibos de lectura.

## Aprendizaje de conversación (migración 0067)

El [aprendizaje de conversación](conversation-learning.md) reutiliza Worker API,
D1 `DB`, `ChatWorkflow`, Cron de minuto y modelo Meta seleccionado. No requiere cuenta,
recurso, binding, secreto, ámbito OAuth ni permiso de despliegue nuevo. Cada
revisión puede consumir hasta 6.000 tokens de completado con presupuestos de fuentes/cantidad/tiempo;
las respuestas usan contexto aprendido acotado sin otra inferencia. El
Cron solo elimina elementos vencidos de hasta cien perfiles sin
llamadas a modelos. Siguen obligatorios atención, consentimiento, aislamiento permanente de conectores y
límites de iniciativa privada existentes.

En cuenta independiente, sigue el orden base (D1 y bindings existentes
Worker/Workflow/Cron, autenticación, secreto Meta y clientes),
reemplaza IDs/URLs como arriba y aplica migraciones
hasta `0067_conversation_learning.sql`. Local usa el existente
`npm run db:migrate:local --workspace @wildcard/api`. Producción aplica por
pipeline automático confirmado/enviado; nunca despliegue
manual. Verifica SHA enviado, builds exitosos, etiquetas activas
y registro 0067 antes de afirmar publicación. No se realizó migración remota ni
despliegue para este cambio.

La migración aditiva añade ajustes de aprendizaje de conversación/miembro, límites inferiores de origen,
épocas revocables y `conversation_learning`, con triggers de limpieza y claves de privados/grupos/orígenes/miembros/
agentes. No copia historial al aprendizaje
ni cambia memoria factual. Las conversaciones existentes quedan habilitadas; la revisión empieza
bajo demanda en un intercambio humano directo posterior con ventana reciente acotada. En staging
usa bindings existentes separados y usuarios ficticios bajo igual configuración;
no hay omisión especial de consentimiento o aislamiento. Ambos exponen
inspección, deshabilitación y restablecimiento. Push del navegador e instalación nativa conservan
limitaciones existentes de plataforma.

Verificación: tipos estáticos API/web, parsing Swift, esquema/preparación SQL y
diff. La regresión opcional de aprendizaje está escrita pero no ejecutada;
juicios del modelo, carreras de repetición/restablecimiento en plataforma, costos, comportamiento grupo/privado
y ambos clientes requieren verificación funcional. Deshabilita aprendizaje por conversación
al diagnosticar. Prefiere corrección compatible hacia adelante; columnas/tablas aditivas
pueden conservarse al revertir. Drena/bloquea Workflows activos antes de volver a código que
rechaza nuevos metadatos internos de preguntas. No elimines 0067 ni restaures
código antiguo con supuestos de esquema no aplicado.

## Estilo de conversación con recursos existentes

El [estilo natural](conversation-style.md) usa registros existentes D1 de agente,
generación y onboarding e historial actual autorizado.
No añade binding, servicio, secreto, migración ni permiso de proveedor. Los borradores
marcados de grupo pueden usar una revisión extra de redacción acotada y sin herramientas por el
transporte Meta existente; considera latencia variable y uso del modelo.
Las cuentas independientes siguen orden existente y migraciones hasta
0067. Las instrucciones existentes Worker e iOS/web siguen iguales.

Publica solo fuente confirmada/enviada por pipeline automático; verifica
commit antes de afirmar disponibilidad. Mensajes existentes y
JSON de personalidad son compatibles con reversión. Revertir API elimina guía nueva,
mientras los acentos existentes siguen válidos. Los borradores parseados
descartan plan interno y se aceptan decisiones heredadas sin él.
La evaluación ficticia real figura en [evaluación del estilo](conversation-style-evaluation.md);
no implica operación de producción ni validación de dispositivo o sonido.

## Variedad de nombres y ajuste de actividad conversacional

Este cambio reutiliza DB, ONBOARDING_WORKFLOW, CHAT_WORKFLOW, Cron de minuto,
secreto Meta, APNs opcional y cachés. No añade migración, recurso, permiso,
ID específico ni secreto. Onboarding/creación nuevos añaden
un completado acotado Estándar de nombres antes de identidad (24 candidatos
por género; máximo 48). Siguen pasos de identidad de dos minutos y persistencia
inmutable de plan. Fallar antes de guardar puede repetir inferencia
facturable; planes/retratos guardados se reutilizan. Regenerar personalidad no
consulta nombres ni renombra existentes.

Los mínimos privados de continuación son menores y las pausas ambientales adaptables usan horas en lugar
del mínimo anterior de casi un día. Agentes ocupados y leases activos de escritura de seis segundos
se excluyen de reclamaciones Cron; las visitas pasivas ya no difieren iniciativa ni cambian
su marca de publicación. Otras demoras/errores conservan presupuestos finitos.
Todas las horas silenciosas, consentimiento, pausa explícita, límites sin respuesta y móviles de publicación
siguen vigentes. No se rellenan ni reinician planes/vencimientos detenidos.
Los grupos ganan dirección dentro de ronda y categoría interna aditiva de seguimiento,
con las mismas guardas publicación/energía/intercambio. No crea
programador para grupos inactivos. Más conversación elegible puede consumir más presupuesto
existente de inferencia/energía; cadencia/costo real no se midieron.

Una instalación independiente sigue npm/migración/Workers anteriores;
comandos locales API/web/Xcode no cambian. Publica solo fuente confirmada/enviada
por Workers Builds y verifica SHA activo; nunca manualmente. Revertir
conserva datos/columnas, planes y entregas. Drena Workflows activos
antes de revertir porque esquemas internos antiguos rechazan la nueva categoría
 de seguimiento. La verificación del ajuste cubre tipos API/web, parsing del editor
Swift, espacios y preparación SQL contra esquema vacío de 67 migraciones.
El preparador SQL de iniciativa sustituye ahora una época de aprendizaje entera estática para
la interpolación validada de 0067; nunca evalúa TypeScript. No se ejecutaron harnesses funcionales,
builds, llamadas a proveedores, migración remota ni sesiones de dispositivo/navegador.
Usa datos ficticios para diversidad de nombres, estabilidad de reintento, carreras abrir/escribir,
horas silenciosas, cadencia de personaje, curiosidad/cierre grupal, repetición, pérdida de acceso y
cambio de cuenta. Consulta guías afectadas para límites.

## Investigación conversacional — migración 0068

Aplica `0068_conversational_research.sql` después de 0067 con el proceso D1
existente. Añade `delivery` al recibo con valores conversation/document y predeterminado
document, conservando contrato de informe/eliminación de todos los anteriores. La investigación
ordinaria nueva usa conversation por defecto en código; la de tareas con consulta exacta conserva
contrato de informe. No requiere servicio, binding, secreto, permiso, cuenta de proveedor,
reemplazo de ID ni campo API del cliente nuevos. META_API_KEY,
WEB_RESEARCH_ENABLED, D1, CHAT_WORKFLOW y APNs opcional existentes bastan.

Un recibo conversacional retiene Markdown normalizado/procedencia al completar,
dentro de límites existentes de 24.000 caracteres/20 fuentes, sin crear documento
ni borrar cuerpo duplicado. Siguen autoritativas cascadas de padres/eliminación por vaciado;
no añade barrido TTL ni retención privada en disco del cliente.
El lector compartido selecciona hasta dos hallazgos completados en igual
 audiencia privada/grupo con consentimiento/modelo/secuencia actual y extractos
acotados. No llama proveedores. Modo informe conserva transacción normal de documento y
revisiones. Las listas completas Documentos solo bloquean modo documento. Reintentos,
reservas inciertas, un intento por fuente humana/tarea y 10/100 reservas móviles
por cuenta/instalación no cambian.

Instalación independiente: sigue configuración base Workers/D1/Meta, `npm ci`,
`npm run db:migrate:local`, comandos API/web y Xcode
anteriores. Confirma/envía antes de publicar; Workers Builds migra antes del
código. Verifica 0068 y SHA iguales en API/web/admin. Nunca
hagas despliegue manual. Revertir conserva columna y hallazgos; drena
Workflows de investigación primero. Código antiguo no entiende recibos conversacionales
completados y puede convertir los listos en informes, así que prefiere corrección
compatible hacia adelante o detén investigación hasta resolver reversión. No reescribe/rellena ningún recibo
ni documento histórico.

La validación registrada es estática TypeScript API, espacios y
29 variantes SQL/cantidades de parámetros contra esquema vacío de 68 migraciones a profundidad 100.
No se ejecutó migración remota, publicación, tests funcionales, build, inferencia ni sesión
 de cliente. Con conversaciones ficticias privadas/grupales comprueba intención,
sin artefactos no solicitados, reutilización de seguimientos, lista completa Documentos, repetición acotada sin
otra llamada pagada, informes de tareas/heredados, pérdida Contributor/acceso, vaciar/eliminar,
recuperación fondo/sin conexión y aislamiento. Consulta [investigación web](web-research.md).


## Limpieza de eliminación de cuentas (migración 0069)

Aplica `0069_account_cleanup.sql` después de 0068 por el pipeline ordenado API.
Añade triggers de eliminación de cuenta/onboarding, amplía limpieza de generación
a prefijos de retratos sin publicar y reencola omisiones históricas conocidas desde
IDs de auditoría sin contenido. También elimina mensajes y trabajo compartido atribuidos a la cuenta
antes de desaparecer su atribución. Consulta [alcance y límites de recuperación
administrativa](admin.md#deleting-an-account). No añade servicio, secreto, recurso,
binding, ID específico ni permiso. Las cuentas independientes
usan D1, R2 privado, ambos bindings Workflow
y Cron de minuto existentes. Aplican igual orden de aprovisionamiento, aislamiento de staging y
permisos anteriores.

Local: instala dependencias fijadas con `npm ci`, inicializa autenticación
local y aplica todas con `npm run db:migrate:local`. No ejecutes comprobaciones
locales contra bindings remotos. La estática es tipos API/admin/web y
preparar SQL de eliminación con claves habilitadas contra todas las migraciones.
La suite de ciclo de vida contiene casos ficticios nuevos de limpieza
pero no se ejecutó para este cambio. Verificación opcional autorizada:
`npm run typecheck:lifecycle` y `npm run test:lifecycle`.

Publica API, admin y web juntos confirmando/enviando a la rama
configurada y observando Workers Builds; nunca manualmente. API
aplica 0069 antes del código. Verifica builds exitosos,
SHA/etiquetas coincidentes, migración registrada y DELETE administrativo
ficticio que llegue a AdminAPI sin quedar bloqueado en proxy. Verifica confirmación
email/protección de lista y 202 pendiente, sesiones revocadas, integridad de cascadas
D1, datos ajenos intactos y luego vaciado de cola, claves R2 ausentes e
instancias Workflow inexistentes (incluidas onboarding y generación
completadas). Inyecta fallos de almacenamiento/Workflow localmente para que trabajos sobrevivan y
drenen al recuperar; enfrenta eliminación con creación/subida y confirmaciones perdidas.
Ambos proxies Nuxt usan Request original de plataforma para cuerpos DELETE porque el
adaptador Nitro instalado solo almacena POST/PUT/PATCH. iOS llama directo API.

Monitorea recuentos, intentos, vencimientos y edad de `resource_cleanup` y
`resource_cleanup_deferred`; los trabajos de trabajo/prefijos sobreviven a la cuenta eliminada y
reintentan con backoff acotado, mientras R2 usa barrido final de cinco minutos. La respuesta
es aceptación, no finalización. Acciones completadas, logs/copias de proveedores,
registros de auditoría/presupuesto sin contenido y copias independientes tienen retención separada.
No se eliminó cuenta real ni corrió limpieza de producción durante esta corrección.

Revierte código por flujo automático normal confirmado/enviado. Conserva
0069 y triggers/outbox: son aditivos y compatibles con código DELETE previo,
cuya pasada de almacenamiento de mejor esfuerzo puede superponerse con seguridad a trabajos en cola.
Clientes admin antiguos pueden describir pendientes como limpieza parcial. Revertir
no restaura contenido borrado; quitar triggers reabre las omisiones.
La recuperación histórica de huérfanos se limita a IDs/prefijos registrados; nunca
purgues todo un bucket ni Workflow compartido para compensar propiedad faltante.


## Dos preparadores grupales simultáneos (migración 0070)

Usa D1, Workflows, Cron recuperador y binding de modelo existentes; no necesita
recurso Cloudflare, secreto, permiso ni dependencia nuevos. Aplica
migraciones hasta `0070_group_publication.sql` antes de ejecutar API
nueva: local usa `npm run db:migrate:local --workspace @wildcard/api`. Para cuenta
independiente sigue orden de recursos/bindings/secretos anterior.
La migración de producción sigue como parte del release automático API tras commit y
push autorizados; no manualmente. La tabla aditiva de reservas cae en cascada
con grupos/respuestas. Historial/recibos existentes siguen compatibles. API anterior puede
ignorar tabla; drena Workflows antes de revertir para evitar mezcla
de orquestación. No elimines tabla mientras pueda correr Worker nuevo.

Verifica dos reclamaciones simultáneas por grupo, publicación según orden de preparación,
recuperación de reservas tras intentos fallidos/terminados, cascadas vaciar/eliminar,
efectos ordenados de acciones, transcripción compartida y endpoint de lectura de mensajes
con comprobación de pertenencia usando datos ficticios. Siguen límites de energía/intercambio.
La estática no establece comportamiento desplegado, latencia ni calidad;
migración/despliegue de producción y validación funcional siguen pendientes.

## Endpoint de exportación de depuración

La [exportación JSON de depuración](debug-export.md) solo web usa binding D1 API existente,
autenticación bearer `/me` y binding de servicio API/cookie httpOnly de web.
No requiere cambios de infraestructura, migración, secreto, permiso, bucket ni proveedor.
La ruta usa lista fija permitida de conjuntos/columnas y páginas autorizadas de 25 filas;
los archivos se ensamblan solo en navegador, sin almacenamiento de exportación del servidor.
Aplican configuración local y publicación automática existentes. Revertir puede quitar
ruta y UI sin esquema. Verificación de exportación en ejecución/navegador
pendiente; preparar consultas y tipos API/web solo cubre esquema/tipos.

## Coordinador de rondas grupales y presencia de investigación (migración 0071)

Usa D1, Workflows, Cron, clave y bindings existentes del proveedor; sin
recurso Cloudflare, secreto, permiso ni dependencia nuevos. Aplica migraciones versionadas
hasta `0071_group_round_planning.sql` antes de API nueva (local:
`npm run db:migrate:local --workspace @wildcard/api`; producción: release automático API
tras commit/push autorizado, nunca manualmente).

La migración es aditiva: tabla `group_round` (en cascada con mensaje disparador
y grupo), columnas anulables de planificación/borrador en `group_reply` y
`researching_until`/`researching_topic` en `agent_presence`. Ahora la API admite cuatro
turnos grupales concurrentes por grupo (`chat/dispatch.ts` y `dispatchGroup`). Una API
anterior ignora tabla y columnas; drena Workflows antes de revertir
para evitar orquestación mezclada y conserva columnas mientras pueda correr Worker nuevo.

Validación realizada: tipos estáticos API, web e iOS; cada sentencia nueva/modificada
preparada con `EXPLAIN` en D1 workerd tras aplicar todas las migraciones;
llamadas reales de coordinador e investigación a Contributor. No verificado:
latencia desplegada, comportamiento en dispositivo, intercalados concurrentes de Workflow y calidad
entre idiomas. Consulta [grupos](groups.md#round-coordinator-migration-0071),
[chats](chats.md#responsive-orchestration-2026-10-30) e
[investigación web](web-research.md#announced-research-and-grounded-answers-migration-0071).

## Investigación grupal dividida (migración 0072)

`0072_split_group_research.sql` reconstruye la tabla hoja `web_research` (nada
la referencia) para quitar UNIQUE de `group_source_id`, añadiendo índice parcial
único en `group_reply_id` y normal en `group_source_id`; copia filas
sin cambios. Sin recurso, secreto ni binding nuevos. Aplica por release
automático API (local: `npm run db:migrate:local --workspace @wildcard/api`).
Validado localmente aplicando 0001–0071, sembrando recibos privado y grupal,
aplicando 0072, insertando segundo recibo para igual mensaje y comprobando
recuentos, `pragma_foreign_key_list` y cascada desde `group_message`. Reversión:
API anterior aún funciona pero permitiría máximo un recibo
por mensaje solo por su esquema de IDs; no recrees la antigua restricción UNIQUE
con filas de varios recibos por mensaje.


## Vistas previas de enlaces (migración 0073)

`0073_link_previews.sql` añade la tabla compartida de caché `link_preview`. Las imágenes usan
bucket R2 existente `CONTACT_PHOTOS` bajo `link-previews/`; el Cron de
minuto elimina filas/imágenes vencidas. Las consultas salientes dependen de la bandera
`global_fetch_strictly_public`. Sin recurso, secreto, binding
ni permiso nuevos. Aplica por release automático API (local:
`npm run db:migrate:local --workspace @wildcard/api`). Reversión: API antiguas ignoran
tabla; objetos `link-previews/` pueden eliminarse con ella. Consulta
[vistas previas](link-previews.md).

## Feed Novedades (migración 0074)

`0074_home_feed.sql` añade `home_feed` (una fila por persona: estado, revisión
protectora, vencimiento, briefing, progreso), `home_topic`, `home_card` (JSON validado),
`home_research` (registro de búsquedas y hallazgos de Novedades) y `mini_app_usage`. Todas
caen en cascada con cuenta; temas/tarjetas también ponen null al contacto
si se elimina. Es aditiva: API anteriores ignoran tablas y el campo
`readOnly` registrado ahora en catálogos MCP nuevos es ignorado por código anterior.

Configuración: variable versionada `HOME_FEED_ENABLED` de `apps/api/wrangler.jsonc`
(`"true"` en esta instalación). `"false"` detiene curaciones nuevas y devuelve
`enabled: false`; apps y agenda siguen funcionando. Las ejecuciones reutilizan `CHAT_WORKFLOW`
(`kind: 'home'`), Cron existente `* * * * *` (`dispatchHome`), `DB` y
`META_API_KEY` cifrado; búsquedas de Novedades también respetan `WEB_RESEARCH_ENABLED` y comparten
presupuestos diarios web. Sin servicio, binding, secreto, bucket ni permiso
nuevo. Independientes y staging no necesitan nada más que recursos
anteriores; la curación usa endpoints Meta chat y Responses (búsqueda web)
ya necesarios para chats e investigación.

Local: `npm run db:migrate:local --workspace @wildcard/api`, fija
`HOME_FEED_ENABLED` en `wrangler.jsonc` (o sobrescribe en `.dev.vars`) y abre Novedades.
Las ejecuciones llaman API Meta real y pueden costar. Publica solo por
release automático API confirmado/enviado; publica API antes de clientes
(antiguos sin pestaña Novedades; nuevos contra API antigua muestran error de carga
solo allí).

Validación realizada: estática API/web/iOS; migraciones 0001–0074 sobre D1 local
temporal workerd con sentencias nuevas ejecutadas con parámetros; una curación
local completa con Contributor. Consulta [Novedades](updates.md#verification) para
pendientes.

Reversión: fija `HOME_FEED_ENABLED` a `"false"` por otra publicación automática para
detener gasto inmediatamente (ejecuciones activas terminan tarjeta actual). Conserva
 tablas; eliminar filas `home_card`/`home_topic` solo vacía feeds y eliminarlas
requiere publicar código que ya no las lea.

## Actividad de reacciones en vistas previas de chats — migración 0090

Aplica `apps/api/migrations/0090_reaction_activity.sql` después de 0089. Añade tres
columnas anulables a `message_reaction`: `created_at` (hora de fijación/cambio) y
`contact_id` o `group_id` propietario (sin clave foránea; la fila ya cae con su
mensaje), rellena columnas de conversación para reacciones existentes desde su
mensaje y crea índices parciales `(contact_id, created_at)` y
`(group_id, created_at)`. Aditiva: las heredadas mantienen `created_at = NULL` y
nunca aparecen como actividad. Orden: API que escribe columnas debe
publicarse con la migración (release automático migra antes del
Worker); clientes antiguos ignoran `lastReaction` de lista. Sin recurso,
binding, variable ni secreto nuevos. Local: `npm run db:migrate:local --workspace @wildcard/api`.
Validado en D1 temporal local workerd; aún no aplicado a staging ni producción.
Reversión: publica código que ignore columnas y consérvalas. Consulta
[vistas previas](chats.md#chat-list-previews).

## Mensajes programados para otro participante — migración 0089

Aplica `apps/api/migrations/0089_private_message_schedules.sql` después de 0088. Añade
`contact_schedule.recipient_user_id` anulable, índice parcial y dos triggers
que cancelan una programación activa si su destinatario sale del contacto compartido o elimina
su cuenta. No hay clave foránea deliberadamente: una cascada borraría programaciones
que los turnos despachados del propietario aún referencian y bloquearía eliminar. Aditiva:
las filas existentes quedan `NULL` y siguen escribiendo al propietario. No importa orden
de publicación; clientes anteriores ignoran campos `recipientUserID`/`recipientName`.
Las imágenes con `send_private_message` reutilizan `CONTACT_PHOTOS` y registro
 de adjuntos; sin recurso, binding, variable ni secreto nuevos. Local:
`npm run db:migrate:local --workspace @wildcard/api`. Validado en D1 local
workerd (entrega, despacho repetido, compartir revocado, eliminar destinatario/propietario); aún no
aplicado a staging ni producción. Reversión: publica código que ignore columna y
consérvala; una API anterior despacharía programación destinataria pendiente como mensaje
ordinario al propietario, así que cancela programaciones activas destinadas a otros antes de revertir. Consulta
[Programaciones](schedules.md#messages-for-another-participant).

## Mensajes privados desde comentarios — migración 0088

Aplica `apps/api/migrations/0088_home_comment_private_message.sql` después de 0087. Añade
`chat_turn.home_comment_id` anulable (comentario de Para ti después del cual el contacto escribió
ese mensaje por sí mismo; sin clave foránea, los comentarios vencen con publicación) e índice parcial
único que limita a un mensaje por comentario. Aditiva: filas existentes
quedan `NULL` y clientes que ignoran la bandera `privateMessage` siguen mostrando el
mensaje. No importa orden de publicación. Sin recurso, binding, variable ni secreto nuevos. Local:
`npm run db:migrate:local --workspace @wildcard/api`. Validado en D1 local workerd;
aún no aplicado a staging ni producción. Reversión: publica código que ignore columna
y consérvala. Consulta [Novedades](updates.md#private-messages-from-comments).

## Respuestas de chat a publicaciones de Para ti — migración 0087

Aplica `apps/api/migrations/0087_chat_home_post.sql` después de 0086. Añade dos columnas
anulables a `chat_turn`: `home_post_id` (publicación de Para ti respondida; sin clave
foránea, publicaciones vencen) y `home_post_json` (instantánea JSON pequeña, válida y de hasta
2.000 bytes). Aditiva: las filas existentes quedan `NULL`. Publica API antes de clientes que
envían `homePost`, porque API anteriores rechazan campos desconocidos. Sin recurso,
binding, variable ni secreto nuevos. Local: `npm run db:migrate:local --workspace @wildcard/api`.
Validado en D1 local workerd; aún no aplicado a staging ni producción. Reversión:
publica código que ignore columnas y consérvalas. Consulta
[Novedades](updates.md#continue-in-chat).

## Publicaciones de Novedades — migración 0086

Aplica `apps/api/migrations/0086_home_posts.sql` después de 0085. Añade `home_post`
(en cascada con cuenta y tema; contacto y publicación respondida quedan null)
y `home_comment` (comentarios y respuestas, en cascada con publicación), y copia
cada fila actual `home_card` a `home_post` como publicación sin texto. Las respuestas a comentarios
corren como instancias `home-comment` del `CHAT_WORKFLOW` existente. Aditiva: una
API anterior ignora tabla y ambos clientes usan `cards` si falta `posts`,
así que pueden publicarse en cualquier orden. Sin recurso,
binding, variable ni secreto nuevos. Local: `npm run db:migrate:local --workspace @wildcard/api`.
Publica solo por release automático API. Validado en D1 temporal local
workerd (consulta [Novedades](updates.md#verification)); aún no aplicado a staging ni producción.
Reversión: publica código que ignore `posts`; conserva tabla (eliminarla solo quita
historial de timeline, las tarjetas siguen en `home_card`).

## Encuadre contextual e iniciativa de imágenes — migración 0079

Aplica `0079_initiative_images.sql` después de todas hasta 0078. Añade
`generated_initiative_image`, recibo descartable de proveedor con clave única de turno
fuente (en cascada), estado, versiones de referencia y metadatos inmutables
 de adjunto. Limita intentos espontáneos a uno por episodio de iniciativa
privada, independiente del recibo existente de respuesta directa.
Usa DB, bucket privado CONTACT_PHOTOS, META_API_KEY,
acceso Muse Image generación/edición, descripciones Spark, CHAT_WORKFLOW y Cron ya requeridos.
Sin binding, secreto, permiso, ajuste de cuenta ni servicio nuevos.

En cuenta independiente sigue orden anterior reemplazando IDs de cuenta,
bucket, base, Worker y dominio. Usa `npm ci`, secretos locales existentes
y `npm run db:migrate:local`, luego comandos API/web o
ajuste API local iOS. Usa datos ficticios. Producción aplica la aditiva
solo por commit/push y publicación automática; verifica build y
SHA activo antes de funcional. Este cambio local no implica migración,
solicitud de modelo ni despliegue de producción.

El planificador tiene 3.400 tokens de completado; generar imágenes recibe un paso Workflow
de cuatro minutos sin reintentos automáticos y renueva reclamación por cinco minutos.
Límites HTTP y bytes siguen los de imágenes generadas. Los recibos fallidos, pendientes
o inciertos suprimen repetir llamadas, incluso tras repetición.
Las imágenes sin usar siguen gracia de 24 horas del registro; las entregadas usan
metadatos de asistente y cachés existentes. Revertir por una revisión compatible previamente
enviada conserva tabla y JSON; no retira
imágenes entregadas. Deshabilita iniciativa de participantes antes de revertir si
hace falta. Verifica matriz ficticia de [imágenes generadas](generated-images.md).

## Álbumes generados por contactos — migración 0082

Aplica `0082_generated_image_albums.sql` después de todas hasta 0081. Añade
`group_message.attachments_json` anulable (arreglo JSON comprobado) para
álbumes de dos o tres imágenes y recrea triggers 0048 de eliminación de
`chat_image_index` para cubrirlas. Las tablas de recibos no cambian:
los recibos de álbum guardan arreglos en columnas existentes y filas anteriores siguen
legibles. Usa DB, bucket privado CONTACT_PHOTOS,
META_API_KEY, acceso Muse Image generación/edición, descripciones Spark, CHAT_WORKFLOW
y Cron ya requeridos. Sin binding, secreto, permiso, ajuste ni servicio
nuevo. `imageSearch` opcional depende de que la cuenta disponga de herramienta Muse Image `enable_image_search`;
su disponibilidad, costo y latencia no están
verificados.

En cuenta independiente sigue orden anterior y usa
`npm run db:migrate:local` para desarrollo con datos ficticios. Producción
aplica solo por commit/push y release automático;
verifica estado de build y SHA activo antes de funcional. El presupuesto
 del planificador de iniciativa es ahora 4.400 tokens. Revertir a revisión
anterior enviada conserva columna; consulta compatibilidad en
[imágenes generadas](generated-images.md#albums) sobre imágenes 2–3 del álbum y
limpieza de huérfanos tras revertir.


## Delegación de dispositivos de contacto compartido — migración 0083

Requiere configuración nativa remota anterior: migraciones D1 hasta
0082, cuentas autenticadas compartiendo contacto, registro APNs/sesión iPhone
vigente, permiso AlarmKit, notificaciones visibles y extensión firmada App Group
existente. No añade servicio, binding, secreto, entitlement Apple ni
ID de cuenta. Las independientes usan su configuración
Wrangler/D1/APNs y reemplazos Apple App Group/topic documentados
bajo [ejecución nativa remota](#remote-native-device-execution).

Aplica `apps/api/migrations/0083_delegated_remote_native.sql` después de anteriores.
Crea `native_remote_delegate`, vista vigente `native_remote_access` y
`native_action.remote_grant_id` anulable. La clave compuesta en cascada vincula delegación a
concesión existente del propietario; eliminar destinatario también actúa en cascada. SQL sigue
[semántica D1 de claves foráneas](https://developers.cloudflare.com/d1/sql-api/foreign-keys/).
Desarrollo usa `npm run db:migrate:local` y comandos API/web
existentes; usa cuentas y teléfonos ficticios. Redactar este cambio no ejecuta migración
local ni de producción.

Producción o staging independiente usan igual migración/configuración ordenadas
con ajustes D1/APNs/Apple de esa cuenta. Confirma/envía
cambios a rama configurada; Workers Builds aplica migraciones
antes de publicar API y publica automáticamente web desde ese
commit. Verifica ambos releases y SHA; nunca manualmente.
Instala iOS actualizado para selector remoto y controles. El
esquema de comando y lista local de extensión no cambian, así que el binario de ejecución
remota previamente operativo sigue compatible con delegación nueva.

Sigue [flujo de concesión y matriz](native-remote.md#allow-a-shared-contact-participant).
Comprueba conceder/revocar como propietario, solicitudes de temporizador/alarma y voz desde chat
iOS/web del delegado, rechazo sin permiso, pertenencia al mismo agente, identidad
vieja de concesión tras revocar/rehabilitar, participante/sesión eliminados y entrega bloqueada.
Usa recibos y estado real del iPhone; aceptación API/APNs no prueba programación.
Estas comprobaciones siguen pendientes salvo registro separado de ejecución.
Esquema/tipos estáticos no contactan producción ni establecen
comportamiento de dispositivos.

Revertir es publicación automática confirmada/enviada de API/web previas.
Conserva 0083 aditiva y filas; código antiguo no usa acceso
delegado y rutas antiguas conservan acceso de cuenta propia. No desmigres ni
reescribas historial. Antes de volver a avanzar, revoca explícitamente delegaciones que
no deban seguir activas. Alarmas ya programadas sobreviven revocación
y reversión y deben gestionarse en iPhone. Revocar bloquea reclamaciones futuras;
una operación ya reclamada aún puede terminar.

## Mensajes privados de contactos compartidos — migración 0084

Requiere instalación existente D1, contactos compartidos autenticados y Workflow de
chat privado con migraciones 0001–0083. No requiere servicio, dependencia, binding, secreto,
permiso, entitlement APNs ni recurso nuevos. Las independientes
conservan IDs D1, clave Meta, rama y ajustes opcionales Apple
anteriores. Polling web funciona sin APNs; notificaciones iOS con app cerrada
requieren clave/registro de dispositivo existentes. Staging usa sus
Worker/D1/Meta/Apple existentes, no recursos de producción.

Aplica `apps/api/migrations/0084_private_contact_messages.sql` después de 0083. Añade
`chat_turn.is_private_relay` (cero por compatibilidad) y recibos indexados
con un turno fuente principal y referencias anulables de destino. Eliminar fuente
elimina recibo en cascada; vaciar/eliminar destino deja referencias null y conserva
protección de repetición. El texto entregado no se retira al terminar compartir.
Los lotes D1 confirman atómicamente mensaje/recibo/outbox; consulta
[Cloudflare D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch).
No añade servicio externo de entrega ni cola propia.

Para instalar independiente nuevo ejecuta `npm ci`, autenticación local,
migraciones ordenadas y comandos existentes. Una local existente usa
`npm run db:migrate:local`. La redacción no ejecutó migraciones persistentes locales/remotas.
Producción publica por commit/push a rama configurada y luego
Workers Builds automático de migración/API/web. Verifica comprobaciones y SHA
 enviado; nunca manualmente. Clientes existentes reciben turnos ordinarios
 de asistente; instala build iOS nuevo solo para texto de ayuda de compartir.

Sigue la [matriz ficticia de verificación](sharing.md#cache-and-verification).
La estática está completa; semántica del modelo, recorridos y push
siguen sin verificarse. Revierte solo automáticamente por código confirmado/enviado. Conserva
esquema y recibos aditivos. API anterior no envía este tipo y
su push carece de guarda nueva: drena/cancela filas outbox de retransmisión sin enviar
antes de revertir esa ruta, o prefiere corregir hacia adelante deshabilitando herramientas
privadas y conservando comprobaciones de notificación `privateRelayAllowed`. No desmigres,
borres recibos ni repitas solicitudes humanas antiguas. El historial entregado sigue legible
por clientes antiguos compatibles.

### Reparación de respuestas/historial de retransmisión privada

La reparación solo requiere instalación existente de 0084;
no hay esquema, recurso, binding, dependencia, secreto ni ajuste de modelo nuevo.
Las instalaciones independientes producción/staging usan su configuración D1/Meta/Workflow
 y publicación automática normal confirmada/enviada. Lee recibos
antiguos de inmediato; no necesita relleno ni reescritura. iOS/web comparten
API y protocolo, así que no necesita recompilar nativo.
La consulta nueva de recibos es interna de herramientas, no endpoint HTTP.

`private_relay_result` y `private_relay_failed` usan Workers Logs existentes con
códigos acotados resultado/etapa sin contenido ni IDs de conversación. Verifica
[casos de respuestas y recibos](sharing.md#reply-references-and-authoritative-send-history)
con cuentas ficticias. La estática no prueba semántica del modelo ni entrega de
notificaciones. Revertir usa release automático confirmado/enviado conservando
0084, recibos y guardas push existentes. Una versión anterior
continúa entregando pero pierde referencias corregidas y fundamentación por recibos;
prefiere corregir hacia adelante si hay que ajustarlo. Nunca repitas solicitudes reales
pasadas para validar un release.

## Stickers

Los [stickers](stickers.md) añaden migración `0091_stickers.sql` (`sticker`, `sticker_photo_check`, dos
triggers de eliminación) y no binding, bucket ni secreto nuevos. Requisitos y recursos:

- **Obligatorios**: `DB`, bucket privado `CONTACT_PHOTOS` existentes (objetos de biblioteca bajo
  `users/<user>/stickers/` y `contacts/<owner>/<agent>/stickers/`, cubiertos por barridos existentes
  de cuenta/agente; copias de mensajes usan registro normal `attachments/`) y
  `META_API_KEY`.
- **Modelos Meta con esa clave**: `sam-3.1` (Responses API, segmentación), `muse-image-1.0`
  (`/v1/images/edits`, retratos expresivos del contacto) y `muse-spark-1.3` (nombrar
  sujeto en una frase y comprobación facial de foto). Disponibilidad de `sam-3.1` para una clave
  no verificada fuera de la medición de `docs/stickers.md`; sin él,
  crear stickers falla 502/503 y el resto del chat no se afecta.
- **Dependencias npm nuevas** (`apps/api`, versiones exactas en lockfile raíz): `@meta-sam/parser`,
  `jpeg-js`, `upng-js` (+ `@types/upng-js`). Todas JavaScript puro y corren en runtime
  Worker con `nodejs_compat`; se ejercitaron en Node con API SAM real, aún no
  en Worker desplegado.
- **Orden**: aplica 0091 (`npm run db:migrate:local` o publicación automática para
  producción), publica API y luego clientes. API sigue funcionando para clientes anteriores,
  que muestran sticker como PNG ordinario sin pie y no pueden crear/enviar stickers.
- **Costo y límites**: un recorte es una solicitud SAM (más una Spark si "person" no encuentra
  nada); un sticker propio del contacto añade comprobación facial por versión y una edición Muse Image.
  Por cuenta, 6 recortes y 30 guardados por minuto; por contacto, 3 stickers propios por minuto.
- **Reversión**: conserva migración, tablas y objetos. Worker antiguo ignora tablas; eliminarlas
  pierde bibliotecas. Los mensajes mantienen copias propias de bytes en cualquier caso.
- **Desarrollo local**: aplica migraciones, fija `META_API_KEY` en `apps/api/.dev.vars` ignorado
  (llamadas consumen créditos) y usa fotos ficticias. Sin verificar: release de producción y
  recorte en Worker desplegado.

## Controles de privacidad (migración 0093)

La [privacidad](privacy.md) añade `0093_privacy_controls.sql`: `user.contacts_share` y
`contact.keep_private` (INTEGER 0/1, 0 predeterminado) y trigger
`contact_keep_private_revokes_group_sharing`. Sin binding, bucket, secreto ni servicio nuevos.

- **Orden**: aplica migración (`npm run db:migrate:local` o release automático para
  producción), publica API y clientes. API lee columnas nuevas en consultas de memoria,
  así que no debe correr antes. Clientes anteriores ignoran campos nuevos y
  no muestran controles; reglas del servidor (audiencia grupal, pertenencia del lector) aplican a todos.
- **Datos**: no se rellena nada. Cuentas existentes empiezan con controles apagados, conservando
  uso compartido actual salvo las tres fugas corregidas de la guía.
- **Reversión**: conserva columnas. Worker anterior las ignora (sus consultas vuelven a
  audiencias previas más amplias); borrarlas pierde ajustes.
- **Verificación local**: `npm run test:memory-isolation` en `apps/api` ejecuta tests de audiencia
  en D1 local workerd con filas ficticias; sin red ni modelos.
