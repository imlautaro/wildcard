# App web

Los builds automáticos usan los [watch paths específicos por dependencia](infrastructure.md#build-watch-paths)
registrados en [workers-build-paths.json](workers-build-paths.json). Mantén la raíz
`/` e incluye la capa Nuxt compartida `packages/ui/*` junto con esta app y los
archivos raíz que intervienen en el build. Web también observa `shared/*` y ambos
scripts de release/preview; aplica rutas idénticas por separado a Production y a
Previews Base cuando está habilitado.

El trabajo de tareas usa el despachador compartido de atención del servidor, incluida
la [recuperación de IDs de Workflow](tasks.md#workflow-id-recovery-october-29-2026).
La corrección también se aplica a iOS. El sondeo existente en primer plano actualiza
los indicadores de trabajo después de la recuperación; no cambian el contrato API,
la duración de caché ni las reglas de invalidación. La recuperación de trabajo
pendiente real y la presentación en navegador/dispositivo requieren verificación
después del release. Las generaciones de tareas detenidas sin respuesta usan la
presentación existente de turno fallido y el código `GENERATION_INTERRUPTED` en
ambos clientes; se conserva el estado de la tarea.

La [identidad visual de la app](branding.md) usa el logo proporcionado con fondo en
inicio de sesión y registro, además del favicon proporcionado en web y administración.
Los favicons usan un parámetro de versión de contenido para actualizar cachés antiguas
del navegador. Estos recursos públicos se incluyen independientemente de los datos
de cuenta; no hacen falta cambios de caché de sesión. iOS usa recursos PNG directamente
del paquete para el inicio nativo y el vector equivalente en SwiftUI; consulta la
[actualización del inicio nativo y verificación en dispositivo](branding.md#native-launch-resource-refresh).
Este aspecto del inicio del sistema no tiene equivalente en el navegador.

La [investigación web](web-research.md) está disponible mediante solicitudes humanas
comunes de chat, con los mismos límites y permisos de iOS. Por defecto produce
hallazgos conversacionales sin documento para que el contacto pueda seguir un tema
desconocido y continuar el chat. Solo un informe duradero solicitado usa la entrega
en documento. Ambos clientes reutilizan hallazgos recientes acotados dentro de la
misma conversación autorizada; ninguno descarga datos ocultos de investigación ni
ejecuta búsquedas al navegar. Se requiere la migración 0068. Los fallos de comprobación
de fundamento se informan por separado de operaciones pendientes o inciertas. Las
tarjetas de documentos muestran **Investigación web** y cantidades de fuentes citadas;
el visor de pantalla completa despliega consulta original, fecha de comprobación y
enlaces a fuentes citadas/recuperadas. Ambos clientes aceptan metadatos de fuentes
de anotaciones del proveedor o enlaces Markdown/directos del informe que coincidan
con resultados de búsqueda completados. Más allá de la coincidencia exacta de URL,
solo se permite pasar de HTTP a HTTPS con puertos predeterminados; las URLs originales
de los resultados permanecen en la procedencia. Los resultados sin enlace quedan
solo como recuperados. Si faltan citas, una síntesis opcional sin herramientas usa
IDs de fuentes validados y enlaces construidos por el servidor. Los informes
preliminares revelan evidencia insuficiente; ambos clientes los muestran mediante
las mismas vistas y cachés de documentos. La procedencia pertenece a la revisión 1
incluso después de editar. Comparte las cachés existentes de documentos y la
actualización cada cinco segundos, sin búsquedas al abrir ni descarga separada.
Los enlaces de fuentes se abren cuando una persona pulsa. Los turnos ordinarios
de bots, programados o aislados por conectores no pueden investigar. Las tareas
asignadas pueden usar una consulta pública exacta autorizada por una persona;
consulta [trabajo persistente](persistent-work.md#public-research-permission-0055).
La presentación en navegador y la investigación funcional siguen sin verificarse.

`apps/web` es una app de página única Nuxt 4 que se ejecuta como su propio Worker
Cloudflare, `wildcard-web`. Usa la misma API que la app iOS y no agrega rutas API,
migraciones ni datos. El Worker API sigue siendo el único propietario de D1, R2,
Workflows y todas las credenciales.

La eliminación de cuentas por un operador usa la cascada API compartida y la limpieza
externa duradera descritas en [administración](admin.md#deleting-an-account)
(migración 0069). iOS y web pierden acceso mediante comprobaciones existentes de
sesión y borran sus cachés de sesión al confirmarse la pérdida. Los grupos compartidos
supervivientes de otras personas se actualizan mediante el sondeo existente; el
contenido copiado de forma independiente sigue siendo suyo. La acción administrativa
solo está disponible en el panel de operadores. El proxy web también lee DELETE
directamente de la Request Cloudflare original para evitar que se bloquee el cuerpo
Node simulado sin buffer de Nitro; iOS nativo llama directamente a la API y no requiere
cambios de transporte. Tanto las solicitudes DELETE vacías como las que contienen
JSON necesitan verificación durante la ejecución después del release. No se agrega
caché ni persistencia local.

## Arquitectura

```text
Browser ──same origin──▶ wildcard-web (Nuxt/Nitro, cloudflare_module preset)
                          ├─ static SPA assets (Workers static assets, ASSETS binding)
                          └─ /api/v1/** proxy ──service binding API──▶ wildcard-api
```

- **Token de sesión.** El inicio de sesión y registro pasan por el proxy. Toma el
  token firmado de Better Auth de `set-auth-token`, lo guarda en una cookie `httpOnly`,
  `Secure`, `SameSite=Strict` (`__Host-wildcard_session` en builds de producción) y
  devuelve solo `{ user }`. Descarta el campo sin firma `token` del cuerpo y el
  `Set-Cookie` del servidor de origen. El JavaScript de página nunca ve el token.
- **Solicitudes reconstruidas.** Cada solicitud del proxy se reconstruye desde una
  lista permitida: `Accept`, `Content-Type`, `Authorization` (desde la cookie) y el
  `CF-Connecting-IP` entrante. Las cookies del navegador, `Origin` y Fetch Metadata
  nunca llegan a Better Auth, por lo que sus comprobaciones de origen basadas en
  cookies no se aplican. La IP del cliente se reenvía para mantener los límites de
  autenticación por IP de la API por usuario. Con la URL pública `workers.dev` en
  lugar del service binding, todos los usuarios web compartirían un límite. Aún
  no se verificó si el service binding conserva esa cabecera; consulta
  [verificación](#verification-status).
- **Respuestas permitidas.** Solo se reenvían `Content-Type`, `Content-Length`,
  `Content-Disposition`, `Retry-After` y `X-Content-Type-Options`. Toda respuesta del
  proxy es `Cache-Control: no-store`.
- **Protección entre sitios.** Las solicitudes no GET con `Origin` ajeno o
  `Sec-Fetch-Site` distinto de `same-origin` reciben 403. Las rutas con segmentos
  de punto o separadores codificados reciben 404.
- **Vencimiento.** Un 401 en una solicitud autenticada borra la cookie. Un
  `GET /api/v1/me` exitoso renueva la duración de la cookie (7 días, igual que la
  sesión API). Cerrar sesión siempre borra la cookie, incluso si la API no responde.
- `ssr: false`: la app es privada y requiere inicio de sesión, por lo que renderizar
  en servidor agregaría reenvío de cookies sin beneficio.

## Funciones

En paridad con iOS:

- Registro e inicio de sesión con correo/contraseña, nombre y foto de cuenta, cierre de sesión.
- Lista unificada de chats de contactos y grupos, ordenada por mensaje más reciente,
  con cantidades de no leídos y prefijos de remitente. El `<title>` del navegador
  siempre es **Wildcard**, incluidos inicio de sesión, chats, documentos, miniapps
  y actualizaciones de no leídos. Aparece cuando cargan ambas fuentes; si falla una,
  las filas disponibles siguen visibles con Reintentar. Los fallos transitorios
  durante el sondeo en segundo plano mantienen las filas cargadas sin avisos
  (consulta [caché](caching.md#transient-failures-during-background-revalidation)).
  El último mensaje propio muestra su confirmación (y **Tú:** en grupos), proyectada
  desde la conversación abierta cuando es más reciente que el resumen del servidor.
- Directorio de contactos con búsqueda, creación, cambio de nombre, foto (JPEG
  cuadrado recortado manualmente, 512 px, menos de 512 KB), eliminación y salida de
  un contacto compartido.
- Chats privados con historial persistido, páginas anteriores, envíos optimistas
  con UUID idempotentes, reintento de respuestas, confirmaciones (reloj mientras
  envía, dos marcas al aceptarse, con color cuando el agente lo lee), presencia
  En línea/Escribiendo/Últ. vez en el orden del servidor entregado → en línea → leído
  → escribiendo, leases de actividad (`open`/`typing`/`leave`, sin texto de borrador,
  que nunca conectan al contacto) y adjuntos de imágenes/PDF de hasta 5 MB, agregados
  con el clip, pegando o arrastrando archivos desde Finder/escritorio a la página
  del chat (chats privados y grupos; consulta [adjuntos](attachments.md#drag-and-drop)).
- **Documentos** (`/contacts/:id/documents/:documentID`, `/groups/:id/documents/:documentID`,
  `DocumentScreen`): visor, editor Escribir/Vista previa, revisiones, conflictos y
  eliminación; tarjetas dentro de la burbuja de respuesta del remitente y pestaña
  Docs en detalles, como iOS. Consulta [documentos](documents.md).
- **Tareas** (`/contacts/:id/tasks`, `/groups/:id/tasks`, `TaskBoard`), abiertas desde
  la barra del chat (solo mientras tiene una lista activa, consulta
  [abrir Tareas](tasks.md#opening-tasks)) o los detalles, como iOS. Un contacto en
  un turno de trabajo muestra una fila «Trabajando en “…”» en el chat y la cabecera;
  el tablero marca las tareas del contacto en progreso como **Trabajando** mientras
  la ejecución está activa. Ambos clientes también muestran siguiente paso, evidencia,
  motivo de bloqueo y consumo de turnos de trabajo, con **Pausar trabajo**,
  **Reanudar trabajo** y **Cancelar tarea** en el editor. Pausar, reasignar o reabrir
  conserva el presupuesto. Las actualizaciones reemplazan la caché de tablero de
  sesión existente. La página de chat actualiza esa caché cada 20 segundos para
  decidir si mostrar el botón de barra. Consulta [trabajo persistente](persistent-work.md)
  y [tareas](tasks.md#seeing-the-work).
- **Compartido en este chat** en detalles de contacto (`/contacts/:id/edit`) y de
  grupo (`/groups/:id/members`): pestañas Multimedia y Docs (`ChatMediaTabs`).
  Consulta [adjuntos](attachments.md#shared-in-this-chat).
- En chats privados y grupos, pulsar fuera del campo de mensaje le quita el foco
  y permite cerrar el teclado móvil. Se conservan borradores, adjuntos, destinatarios
  de respuesta e historial en caché sin solicitud de red. iOS cierra el teclado al
  tocar el historial y conserva el cierre interactivo por desplazamiento. Sigue
  pendiente la verificación móvil/en dispositivo.
- [Respuestas citadas](replies.md) en chats privados y grupos, desde el botón de
  respuesta al pasar el puntero/tocar o **Responder** en el selector de mantener
  pulsado/clic derecho. Las citas desplazan y resaltan el original, y el objetivo
  de respuesta se conserva con el borrador en la caché de sesión. iOS también ofrece
  deslizar para responder; la app web no tiene gesto de deslizamiento.
- Compartir contactos: invitar por correo de cuenta o código, revocar invitaciones,
  quitar participantes, unirse por código y aceptar o rechazar invitaciones recibidas.
  El consentimiento de memoria compartida y Contributor es explícito, con el texto
  informativo de iOS.
- Grupos: crear con consentimiento, chatear con nombres/avatares y adjuntos, progreso
  y reintento de respuestas, invitar por correo, agregar contactos propios, permisos
  de invitación de miembros, quitar miembros/contactos, salir o eliminar. Las etiquetas
  de remitente usan el mismo color estable que iOS (FNV-1a del ID de grupo y la
  identidad del remitente sobre la paleta iOS, tintas oscuras en claro y tonos claros
  en oscuro). Las [confirmaciones de entrega y lectura](groups.md#delivery-and-read-receipts)
  coinciden con iOS: un mensaje propio muestra reloj hasta aceptarse, y luego Enviado,
  Recibido y Leído según `receiptState` agregado. La app web confirma el historial
  descargado como recibido solo mientras el grupo es visible, marca mensajes ajenos
  como leídos cuando al menos la mitad de la fila está en pantalla en una pestaña
  visible, confirma vistas previas de Home con `PUT
  /groups/receipts` y actualiza mensajes propios antiguos con `GET
  /groups/:id/receipts`. Los reconocimientos se deduplican para que el sondeo de un
  segundo permanezca dentro de las 120 escrituras por minuto de la API.
- **Energía de grupo**, solo para el creador, en el editor de contacto: puntos sobre
  capacidad, barra naranja con cinco puntos o menos, hora de próxima recarga y
  **Restablecer energía a 50**. Consulta [energía](energy.md).

Las fotos de cuenta y de contactos propios existentes abren **Recortar foto** antes
de cargarse. Arrastra para reposicionar, pellizca o usa el control de zoom 1–4× y
confirma con **Usar foto**. La guía circular coincide con el avatar; las flechas del
teclado también reposicionan. **Cancelar** o Escape conserva la foto existente sin
solicitud. Las fuentes permanecen solo en memoria y se descartan al cerrar, navegar
o cambiar de cuenta. Consulta [edición de fotos web](profile-photos.md#web-editing)
para codificación y comprobaciones pendientes en navegador. iOS conserva su recortador
nativo; este cambio se limita a web.

Aún no están en la app web:

- **Mensajes programados** (lista/cancelación, incluida la etiqueta de destinatario
  «Para <nombre>» de los mensajes programados para otro participante; crearlos o
  cancelarlos desde chat), solicitudes privadas a grupos, edición de foto del grupo
  y acción «Confirmar consentimiento para mensajes futuros» del grupo.

Las notificaciones del navegador (Web Push) están disponibles; consulta
[Notificaciones del navegador](#browser-notifications). El sondeo cubre la pestaña
visible con la misma cadencia que el sincronizador de sesión iOS: listas y conversación
abierta cada segundo, energía cada cinco segundos mientras está abierto el editor,
e invitaciones cada 15 segundos. Volver a la pestaña actualiza de inmediato. Las
solicitudes nunca se superponen: el siguiente ciclo espera al anterior. Las marcas
de no leídos pasan por una cola de sesión (una adaptación de `ReadAcknowledgementQueue`)
que sobrevive a la navegación, combina hasta la secuencia más alta y reintenta en
el ciclo de la lista.

## Caché

La caché web sigue la [guía de caché](caching.md#web-app). En síntesis: solo cachés
en memoria propias de la sesión, restablecidas al cerrar sesión, vencer o cambiar
de cuenta, sin escribir datos privados en almacenamiento del navegador.

## Diseño

La app web sigue Material 3 en lugar de la apariencia de iOS. El usuario limitó
este cambio al cliente web: iOS conserva su diseño SwiftUI nativo, y comportamiento,
texto y caché mantienen paridad entre clientes. Manrope sigue siendo la tipografía
 de ambos.

- **Capa de sistema de diseño.** Desde el 30 de octubre de 2026, tokens, estilos de
  componentes, onda al pulsar, registro de íconos, Manrope y componentes Vue `App*`
  compartidos están en la capa Nuxt `packages/ui`, que extienden web y administración.
  [docs/design-system.md](design-system.md) es el catálogo: tokens, personalización
  Wildcard sobre Material 3, todos los componentes, reglas de espaciado, capas de
  estado, íconos y cómo ampliar el sistema. `app/assets/css/main.css` conserva solo
  las superficies propias de web (estructura de chat, lista de chats, conversación,
  herramientas nativas, miniapps, tareas y documentos) y no usa capas, para prevalecer
  sobre la capa.
- **Plantillas.** Páginas y componentes usan componentes de la capa (`AppButton`,
  `AppIconButton`, `AppTopBar`/`PageBar`, `AppListGroup`, `AppListItem`, `AppSwitch`,
  `AppTextField`, `AppSearchField`, `AppNotice`, `AppEmptyState`, `AppLoading`,
  `AppChip`, `AppMenuItem`, `AppSheet`, `AppSelect`, `InfoButton`) en lugar de marcado
  de clases manual y espaciado en línea. Los elementos interactivos exclusivos de
  web (filas de chat, botones de enviar del compositor, controles de miniapps)
  activan la onda con `data-ripple`.
- **Formularios.** `AppSelect` reemplaza todo `<select>` nativo: una lista de menú
  Material que sigue el patrón WAI-ARIA de combobox solo de selección (flechas,
  Home/End, búsqueda al escribir, Escape, pulsación externa). Su variante `outlined`
  tiene `label` flotante; `plain` ocupa una fila de ajustes cuyo `<label for>` está
  fuera, y `tonal` es la píldora compacta del dispositivo remoto. El menú se
  teletransporta con posición fija, se abre hacia arriba cerca del borde inferior
  del área visible y se cierra al desplazar la página o cambiar el tamaño. Las listas
  de más de diez opciones (países, idiomas, acentos) agregan búsqueda arriba del menú:
  el foco pasa a ella, escribir en el disparador cerrado inicia la búsqueda, la
  coincidencia ignora mayúsculas y acentos, flechas y Enter siguen eligiendo, y
  desplazamiento/cambio de tamaño (como el teclado en pantalla) reposicionan el
  menú en lugar de cerrarlo. La lista de voces de contacto agrega la misma búsqueda
  con más de diez voces. iOS coincide mediante `SearchablePicker` (un `Picker`
  nativo hasta diez opciones; de lo contrario, hoja con búsqueda) y una lista de
  voces con búsqueda. Están pendientes las comprobaciones en navegador y dispositivo
  de los campos de búsqueda (teclado, lectores de pantalla, teclados móviles).
- **Hojas e información.** `AppSheet` es el modal para ajustes con opciones o
  detalles: un `<dialog>` que es tarjeta centrada en pantallas anchas y hoja inferior
  hasta 600 px, cerrado con Escape, su botón de cierre o una pulsación del fondo;
  los menús `AppSelect` abiertos dentro se teletransportan al diálogo para verse
  encima. `InfoButton` reemplaza párrafos al pie con un ícono que abre la explicación
  en un `AppSheet`. Las filas que abren hojas usan `.button-row.opens` (chevron)
  con `.row-value` final; los interruptores usan `.toggle-label` para ícono inicial
  y botón informativo. Los equivalentes iOS son `.sheet` con `presentationDetents`,
  `InfoButton` (popover) y `SheetRow`. Pantallas con este patrón en ambos clientes:
  [detalles de contacto](contacts.md#contact-details-layout),
  [Cuenta](model-settings.md#account-layout), Conexiones (consulta Conexiones MCP
  más abajo), [detalles de grupo](groups.md#membership-and-consent) y
  [Personalidad](personality.md). Las casillas que no son interruptores se renderizan
  como casillas Material; usa `.check-row` para consentimiento junto a su texto e
  interruptores (`.toggle`) para ajustes de efecto inmediato. Las filas de dos líneas
  usan `.two-line` con una línea de apoyo `.small`. `.search-field`, `.chip`,
  `.code-box`, `details` y `.actions-row` (botones alineados al final) cubren los
  patrones restantes de página.
- **Diseño.** Por encima de 860 px, un panel lateral de navegación expandido
  (`NavSidebar.vue`) ocupa el borde izquierdo con **Chats** (insignia del total no
  leído), **Para ti** (insignia de publicaciones nuevas, ícono Feed) y **Cuenta**.
  Cada fila coloca ícono a la izquierda, etiqueta a la derecha y cualquier insignia
  no leída al final; la fila activa tiene una píldora de todo el ancho. El panel mide
  224 px. Entre 861 y 1100 px se contrae a una barra de íconos de 80 px (sin título
  ni etiquetas, insignias sobre el ícono) que se expande a 224 px sobre el contenido
  al pasar el puntero o enfocar con teclado, sin mover el panel; las pantallas táctiles
  mantienen la barra. Cada página se abre en un panel redondeado junto a ella, al
  estilo Threads/X. La sección Chats (`/chats`, conversaciones, grupos, Contactos,
  nuevo contacto/grupo, invitaciones y unirse) agrega la lista de chats como segunda
  columna entre el panel lateral y el de contenido; Para ti y Cuenta (incluidas
  Conexiones y Experimentos nativos) usan todo el panel y la barra permanece visible.
  Los botones Volver en las raíces de sección aparecen solo por debajo de 860 px.
  `/` no tiene página: todos los diseños van a `/chats`. La lista de chats permanece
  montada (oculta) fuera de Chats para conservar selección de Archivados, desplazamiento
  y sondeo. Por debajo de 860 px se oculta el panel lateral, las páginas reemplazan
  la lista y un botón de menú a la izquierda del título Chats abre un desplegable
  con **Para ti** y **Mi cuenta** (el botón Feed de cabecera también abre Para ti);
  el popover automático nativo se cierra al pulsar fuera, con Escape, al navegar o
  al seleccionar. Este cambio de navegación es explícitamente solo web; iOS conserva
  sus pestañas nativas. El diseño anterior de barra se comprobó localmente con una
  API simulada el 1 de noviembre de 2026 a 1440, 1000 y 390 px (claro y oscuro);
  pasó la comprobación de tipos. Las comprobaciones locales previas del 30 de octubre
  de 2026 verificaron Chats, Contactos y Cuenta en escritorio, Volver restaurando
  Archivados y Chats/Contactos a 390 px. No se volvieron a comprobar restauración de
  desplazamiento con historial poblado, modo oscuro, recuperación sin conexión ni
  cambio de cuenta.

Verificación (29 de octubre de 2026): pasa `npm run typecheck:web`. Un entorno de
Chrome sin interfaz con el `main.css` real, Material Symbols reales y marcado
representativo se comprobó en claro, oscuro y área de 390 px; allí se ejercitó el
plugin de onda con eventos sintéticos de mouse y tacto (pulsación, desactivado,
cancelación por desplazamiento, toque rápido, limpieza). No se ejecutó la app: las
páginas contra la API real, dispositivos táctiles reales y build de producción aún
no están verificados visualmente. `AppSelect` se compiló desde su SFC y montó con
Vue en Chrome sin interfaz; pasan 22 comprobaciones de interacción (estado ARIA,
selección por teclado, opciones desactivadas, búsqueda al escribir, Escape, pulsación
externa, etiqueta externa, valores `null`, ubicación hacia arriba y cierre al desplazar
el contenedor). Los diseños de detalles de grupo, conexiones e incorporación se
comprobaron como marcado estático en claro y oscuro.

## Desarrollo local

```sh
npm ci
npm run auth:setup:local
npm run dev          # API on http://localhost:8787
npm run dev:web      # Web on http://localhost:3000
```

En `nuxt dev`, el proxy llama a la API por HTTP en `runtimeConfig.apiOrigin`
(predeterminado `http://localhost:8787`, se anula con `NUXT_API_ORIGIN`). Los builds
de producción nunca usan esa URL; sin el service binding `API` devuelven 503. En
`nuxt dev`, la cookie se llama `wildcard_session` y no es `Secure`.

```sh
npm run typecheck:web  # nuxt prepare + vue-tsc (static only)
npm run build:web      # local production build into apps/web/.output; does not publish
```

`vue-tsc` no puede cargar el compilador TypeScript 7 usado por la API, por lo que
`apps/web/scripts/typecheck.mjs` lo ejecuta con TypeScript 6 mediante alias
(`typescript6`). `.nuxt/` y `.output/` generados están ignorados en Git.

## Release

El Worker web tiene su propio proyecto Workers Builds. Consulta
[infraestructura](infrastructure.md#web-worker). Haz commit y push para publicar;
nunca despliegues manualmente.

## Estado de verificación

Comprobado localmente el 27 de octubre de 2026 con cuentas ficticias y sin clave
Meta (los envíos devuelven 503, así que no se generaron respuestas del modelo).
Estas comprobaciones se repitieron para la actualización en paridad con los commits
iOS `7f3ed3a`–`d68dc5f`:

- Pasan `npm run typecheck:web`, `npm run typecheck` y `npm run build:web`.
- El Worker compilado se ejecutó en `wrangler dev` con el archivo generado
  `.output/server/wrangler.json`, usando el service binding `API` a `wildcard-api`
  local. Mediante él: estructura SPA y cabeceras de seguridad; 401 sin sesión;
  registro e inicio establecen `__Host-wildcard_session` con `HttpOnly`, `Secure`,
  `SameSite=Strict` y máximo de 7 días; el cuerpo omite `token`; cerrar sesión vence
  la cookie; escrituras entre sitios con `Origin`/`Sec-Fetch-Site` reciben 403;
  crear/listar/renombrar contactos; cargar y descargar foto (bytes idénticos,
  `no-store`); historial, actividad `open` y ruta de error de envío; códigos de
  invitación para compartir; crear grupo, mensajes, ida y vuelta de adjunto de imagen
  y estado de lectura.
- Una ejecución del Worker compilado en Chrome sin interfaz pasó 29 comprobaciones
  UI: redirección al inicio de sesión, registro, cookie oculta a `document.cookie`,
  creación de contacto, envío fallido conserva Reintentar y Editar, Editar restaura
  el borrador, renombrar, requisito de consentimiento al compartir y creación de
  código, creación de grupo, agregar contacto propio, envío de grupo, lista unificada,
  modo oscuro, diseño móvil de una columna sin desbordamiento horizontal, cierre de
  sesión y nuevo inicio. Con una segunda cuenta ficticia en un grupo: el color del
  remitente coincide con la paleta iOS para esa identidad; un mensaje visible ajeno
  pasa a Leído y se borra su cantidad no leída; un mensaje propio pasa Enviado →
  Recibido → Leído (con color) a medida que la otra cuenta confirma; Home muestra
  **Tú:** con la confirmación Leído; Energía de grupo muestra 50 / 50 y Restablecer
  funciona; la segunda cuenta no ve contactos de la primera. No hubo excepciones
  JavaScript ni respuestas 429 (4 escrituras de confirmaciones de grupo, 10
  confirmaciones de vistas previas y 4 marcas de lectura en toda la ejecución).
- `npm run dev:web` usa el proxy a la API local por HTTP con una cookie común
  `wildcard_session`. El `fetch` de Node agrega `Sec-Fetch-Mode`, así que la ruta
  de desarrollo envía el origen API local para satisfacer a Better Auth; los builds
  de producción nunca toman esa rama.

Aún sin verificar: respuestas del modelo y confirmaciones privadas de lectura
(necesitan ejecutar el modelo), puesta al día de grupos con más de 50 mensajes
perdidos, adjuntos PDF en navegador, arrastrar archivos desde Finder en Chrome,
Safari y Firefox, selección de fotos mediante selector de archivos, vencimiento de
sesión con el tiempo y comportamiento de límites y reenvío de `CF-Connecting-IP`
en la red Cloudflare real.

## Mensajes de voz

Los mensajes de voz entrantes de grupo muestran el avatar del remitente a la izquierda,
con el mismo espacio de fila y agrupación de mensajes consecutivos que el texto,
en paridad con la ubicación de avatar en filas de texto normales de iOS. El avatar
dentro de la burbuja permanece a la derecha y se convierte en control de velocidad
durante la reproducción. Ambas fotos reutilizan la caché existente de fotos de miembros.
Sigue pendiente la verificación visual en ambos clientes; consulta
[verificación de burbujas de voz](voice.md#voice-bubble-presentation-and-verification).

Los mensajes cargados ahora continúan al navegar entre chats y en pestañas ocultas.
Los navegadores compatibles exponen un título genérico Mensaje de voz, la foto del
remitente (o un avatar neutral de persona) y controles Media Session para reproducir,
pausar, detener, buscar y controlar posición/velocidad. Los clips propios usan la
foto de cuenta; los de grupo usan al remitente específico, no la foto de grupo. La
ilustración reutiliza la caché privada de imágenes existente, manteniendo fijada la
URL de objeto activa hasta detener la reproducción. Cargar la ilustración no demora
el audio. Grabar detiene la reproducción; la pérdida conocida de acceso, vaciar/eliminar
y restablecer la cuenta borran audio y metadatos del sistema. Cerrar la pestaña o
navegador termina la reproducción, y la suspensión del navegador/SO puede interrumpir
el audio en segundo plano. iOS también permite reproducción nativa con pantalla
bloqueada y un margen inicial de 300 ms en el teléfono, con salida al auricular
según proximidad. Los navegadores no pueden acceder confiablemente a ese sensor ni
elegir el auricular superior, por lo que web mantiene la salida del sistema y la
reproducción inmediata. Consulta [reproducción en segundo plano](voice.md#background-playback-and-ear-routing)
para ciclo de vida, propiedad de caché y verificación pendiente en navegador/dispositivo.

Durante la reproducción, el avatar del remitente pasa a ser un botón de velocidad
que recorre **1x → 1.5x → 2x → 1x**. Actualiza el audio actual de inmediato y restaura
el avatar al pausar o terminar. El reproductor compartido inicia a la velocidad
elegida los mensajes privados/de grupo posteriores, clips pendientes y muestras del
catálogo. Una preferencia numérica validada y aislada por cuenta persiste en
localStorage entre recargas e inicios de sesión de este navegador; si el almacenamiento
está bloqueado, usa memoria de sesión. Otros dispositivos/navegadores y pestañas
activas no sincronizan este ajuste. Restablecer la cuenta detiene la reproducción
y borra la selección en memoria. Consulta [velocidad de reproducción](voice.md#playback-speed)
para ciclo de vida, caché y comprobaciones pendientes en dispositivo/navegador.

Las respuestas nuevas usan una entrega conversacional y estabilidad moderada.
Detalles de contacto → **Voz → Acento del habla** permite al creador elegir una
preferencia regional compartida, incluida Argentina, o el predeterminado de la voz;
los miembros la ven de solo lectura. Se aplica al audio privado y de grupo nuevo
en ambos clientes y orienta la redacción regional del idioma correspondiente en
texto, incluso con voz desactivada. La API requiere la migración 0061. Es una
preferencia de acento independiente de la nacionalidad; la fidelidad del proveedor
es de mejor esfuerzo. La voz existente sigue seleccionada y los botones de muestra
siguen reproduciendo la grabación original. Consulta
[entrega informal](voice.md#casual-delivery-and-speech-accent-0061). El selector se
renderiza desde el store de contactos de sesión, guarda por el flujo de mutación
existente e inserta/actualiza la respuesta del servidor, conservando la selección
anterior si falla. Se aplican las reglas existentes de restablecimiento de sesión,
invalidación por pérdida de acceso y revalidación; no se agrega caché, borrador
persistido ni solicitud al proveedor. La reproducción en navegador y la calidad
del acento siguen sin verificarse para este cambio.

El selector de voz del contacto usa el mismo catálogo de backend que iOS: voces
predeterminadas de ElevenLabs más voces guardadas en la colección de la cuenta de
la instalación, con paginación y eliminación de IDs duplicados. Se aplican la caché
de sesión y la API de selección existentes. Después de agregar una voz del mercado,
deja vencer la caché de servidor de una hora e inicia una sesión web nueva para
recargar la lista. Consulta [voces de contacto](voice.md#contact-voices) para
configuración, visibilidad en toda la cuenta y verificación pendiente en dispositivo/navegador.

Las respuestas de contactos usan síntesis ElevenLabs `eleven_v4` en el servidor,
compartida con iOS. Solo las respuestas nuevas usan el modelo seleccionado; el audio
existente y las muestras del catálogo conservan sus bytes originales e identidad
de caché. La generación real v4 y la calidad al escuchar siguen sin verificarse para
este cambio de modelo. Consulta [mensajes de voz](voice.md).

El ajuste exclusivo de iOS de las esquinas del compositor usa un radio fijo de
22 puntos mientras el campo crece entre líneas en chats privados y grupos (consulta
[chats](chats.md)). El pedido se limitó a iOS; los estilos del compositor y el
comportamiento de caché web no cambian.

Los compositores privados y de grupo muestran un micrófono en lugar del botón de
enviar cuando el borrador está vacío y sin adjunto, como iOS
([mensajes de voz](voice.md#web)): mantén pulsado para grabar y suelta para enviar,
desliza a la izquierda para cancelar, arriba para bloquear (Eliminar o Detener),
o pulsa Espacio/Enter en el micrófono para una grabación bloqueada.
`useVoiceRecorder.ts` graba con `MediaRecorder` y renderiza el clip mediante un
`OfflineAudioContext` como WAV PCM mono de 16 bits a 16 kHz, enviado con el mensaje;
no se transcribe nada antes de enviar. `VoiceMessage.vue` reproduce burbujas con
botones simples de reproducción, barras de amplitud real que siguen el audio y
avatares dentro de la burbuja (el propio a la izquierda, remitentes entrantes a la
derecha) en chats privados y grupos, incluidos clips pendientes. Las barras son
menores (3–22px de alto, hasta 2.2px de ancho), centradas con reproducir/pausar y
avatar. Un control circular sobre las barras y un input de rango de 44px de alto
permiten buscar con tacto, puntero y teclado incluso antes de reproducir; el audio
pausado sigue pausado. Las burbujas visibles analizan el audio por la caché existente,
comparten descargas con reproducción y conservan muestras reducidas en las mismas
entradas. Consulta [caché y verificación de forma de onda](voice.md#voice-bubble-presentation-and-verification).
Carga audio de la caché solo en memoria de `useVoiceAudio.ts` (32 MiB por sesión),
el menú de mensaje ofrece **Ver transcripción** y la página del contacto muestra
**Voz** cuando `features.voiceMessages` está activado. El flujo de dictado (transcribir
a un borrador editable) se elimina de web. La verificación en navegador está pendiente;
consulta [mensajes de voz](voice.md#web-limitations-and-verification).

## Notificaciones del navegador

Cuenta tiene un interruptor **Notificaciones del navegador** (solo web; iOS ya usa
APNs). Activarlo pide permiso al navegador, registra `/sw.js` y suscribe con la clave
VAPID pública de la API (`GET /api/v1/push/web-key`), luego guarda la suscripción en
la sesión actual (`PUT /api/v1/push/web-device`). Desactivarlo o cerrar sesión la
elimina (`DELETE`). La aceptación se recuerda por cuenta en este navegador
(`localStorage` `wildcard.webPush.<userID>`), por lo que iniciar sesión de nuevo la
registra silenciosamente si el permiso sigue concedido. Un permiso bloqueado
inhabilita el interruptor con una explicación.

`apps/web/public/sw.js` solo maneja `push` y `notificationclick`; no almacena nada
en caché ni intercepta solicitudes. Cada push muestra una notificación titulada
con el contacto o grupo (las de grupo anteponen el remitente); una por conversación
(`tag`, reemplazada y alertada de nuevo por el mensaje siguiente). Pulsar enfoca
una pestaña existente y la dirige al chat, o abre una. El push también avisa a las
pestañas abiertas que actualicen las listas de chats.

El título de pestaña muestra `Wildcard (N)` mientras hay mensajes no leídos
(`99+` por encima de 99), con el mismo total de la insignia iOS. El sondeo se pausa
en pestañas ocultas, por lo que una pestaña oculta con sesión también actualiza las
listas cada 30 s (el navegador puede limitarlo más) y con cada push.

Límites: las notificaciones no llevan foto de contacto ni insignia; un navegador
cerrado por completo solo las recibe si su servicio push entrega mientras el SO lo
permite (Safari exige agregar el sitio al Dock/pantalla de inicio en iOS). La API
debe tener los secretos VAPID opcionales ([notificaciones](notifications.md#browser-web-push));
sin ellos, el interruptor informa que no están configuradas. No se verificó en un
navegador real ni contra un servicio push en este cambio: solo se comprobaron el
cifrado (vector de prueba RFC 8291), los tipos y la preparación SQL.

## Sonidos de mensajes

La web reproduce los mismos sonidos en primer plano que iOS
([notificaciones](notifications.md#message-sounds-october-27-2026)), con copias de los
mismos archivos Mixkit atenuados en `public/sounds`. La reproducción web aplica
+28 dB (ganancia aproximada de 25.12), elevando los picos individuales medidos de
unos -41 dBFS a -13 dBFS. Los niveles iOS y los WAV fuente no cambian:

- Un mensaje saliente aceptado por el servidor en el chat o grupo visible y una
  respuesta recién completada en la conversación visible reproducen el pop. El
  sonido de respuesta espera 250 ms para que la burbuja se haya renderizado, como iOS.
- Un mensaje entrante nuevo de otra conversación, detectado por el sondeo de listas
  (aumento de no leídos, último mensaje ajeno), reproduce la campanilla.
- Solo suenan mensajes completados mientras la pestaña estuvo visible. Las pestañas
  ocultas, primera carga de conversación, envíos fallidos o reintentados y mensajes
  ya anunciados permanecen silenciosos; el estado se borra al cerrar sesión. El push
  del navegador usa el sonido de notificación del SO; web no reproduce audio en
  segundo plano.

`useMessageSounds.ts` conserva la conversación visible (`useVisibleConversation`
en las páginas de chat y grupo), el intervalo de visibilidad y un conjunto acotado
de IDs anunciados, solo en memoria. La app raíz instala manejadores de confianza
para soltar puntero y teclado que crean/reanudan un AudioContext compartido
sincrónicamente durante la activación del usuario, antes de cargar de forma
asíncrona. Esto sigue los [requisitos de reproducción automática del navegador](https://developer.chrome.com/blog/autoplay/#web-audio).
Dos buffers públicos decodificados se almacenan durante la vida de la app raíz
(menos de 1 MiB a la frecuencia incluida), con deduplicación de cargas en curso;
los resultados de descarga/decodificación fallidos se expulsan para reintentar.
No entran credenciales ni audio privado en esta caché. Desmontar cierra el contexto
y descarta los buffers. No se agrega solicitud de función separada ni caché de disco.
La caché HTTP existente sirve los WAV incluidos sin cambios.

Las pestañas ocultas detienen sonidos e invalidan eventos pendientes; restablecer
la cuenta también detiene reproducción y borra deduplicación. Un evento nuevo vuelve
a comprobar generación de cuenta, visibilidad, destino y contexto después de
decodificar y omite cargas demoradas más de 1.5 segundos. Un contexto bloqueado o
suspendido omite ese evento; un gesto posterior puede reanudar audio sin reproducir
alertas antiguas. El mismo sonido se reinicia en lugar de superponerse a sí mismo;
pop y campanilla pueden superponerse. La audibilidad real sigue sin verificarse:
comprueba una sesión nueva, activación por mouse/tacto/teclado, envío/respuesta/otra
conversación, eventos rápidos, transiciones oculto/visible, cierre de sesión,
recuperación de cargas sin conexión, silencio del sitio y volumen de salida del SO
en Chrome y Safari.

## Reacciones de mensajes

Consulta [reacciones de mensajes](reactions.md) para el selector compartido iOS/web,
identidad de actor y mensaje, herramientas del agente, permisos, reintentos de
mutación, frescura de caché de sesión y verificación. Las reacciones usan la
sincronización existente de conversación y no agregan mensajes no leídos ni push.
Los botones de respuesta/reacción al pasar el puntero y el selector flotan sobre
la conversación en lugar de ocupar espacio debajo del mensaje (`MessageReactions.vue`;
el selector se teletransporta a `body` con posición fija). El selector anterior de
un panel se comprobó en una maqueta estática de Chrome sin interfaz con el CSS real;
el menú actual de dos paneles (consulta
[menú de mensaje](#chat-list-context-menu-and-message-menu-2026-10-30)) y la app real
no están verificados visualmente.

## Respuestas de mensajes

Consulta [respuestas de mensajes](replies.md) para las acciones Responder compartidas
iOS/web, cargas de citas, validación de objetivo, contexto de agente, comportamiento
de caché y verificación. Las respuestas son mensajes comunes que llevan un mensaje
anterior citado; no agregan un tipo nuevo de solicitud, store ni notificación.

## Conexiones MCP

**Cuenta → Conexiones** configura una vez conectores Streamable HTTP públicos/Bearer/OAuth
y administra esquemas y aprobaciones de herramientas. En iOS y web enumera servidores
como filas con su estado («3/5 herramientas» o «Necesita autorización»); una fila abre
una hoja con URL, acceso, Autorizar/Configurar OAuth, Activar todas, Actualizar
herramientas, interruptores de herramientas con búsqueda (descripción y esquema de
entrada de cada una detrás de un botón informativo) y Desconectar. **Explorar biblioteca
de conectores** abre una hoja categorizada con búsqueda de servidores oficiales con
logos; elegir uno completa y bloquea endpoint y modo de acceso del mismo formulario
(consulta [biblioteca de conectores](connectors.md#connector-library)). Las filas de
conectores creados desde un preajuste muestran su logo. **Agregar servidor personalizado**
abre el formulario manual en una hoja; el texto de uso de datos que cubre el
consentimiento permanece junto a su interruptor, mientras las demás explicaciones
están detrás de botones informativos. Actualizar se hace arrastrando en iOS y con
botón de ícono en web. Detalles de contacto → Conexiones es una lista simple de
asignación para conectores de esa cuenta. Detalles de grupo → Conexiones permite a
cada propietario/persona que agregó un bot concederle explícitamente sus conectores
asignados en ese grupo. Cualquier miembro humano puede solicitar entonces herramientas
activadas; las respuestas son visibles para todos. No se infiere acceso grupal de
una asignación privada. Conceder acceso aísla permanentemente el chat privado o el
grupo completo de la memoria compartida y fuerza Estándar. Los hechos humanos
persistentes y preferencias de bots continúan localmente en ese chat o grupo, como
iOS. Ambas confirmaciones de concesión explican la retención de memoria local y la
exclusión de otros chats. No cambian las cargas existentes de respuesta/historial
ni las cachés de sesión. Se conservan las restricciones de publicación privada y
creación de programaciones. Consulta [conexiones](connectors.md) para consentimiento,
permisos y verificación pendiente.

Las conexiones OAuth usan los mismos permisos y aislamiento de iOS, con ida y vuelta
al proveedor a página completa y ruta de retorno `/mcp/oauth-complete`. La pestaña
solo guarda IDs de flujo/contacto/conexión/usuario en sessionStorage, elimina el
fragmento de prueba de finalización antes de completar y usa el proxy existente
con cookie de sesión. Las credenciales del proveedor permanecen cifradas en la API.
Volver a autorizar borra aprobaciones anteriores. Configura `MCP_WEB_ORIGIN` en la
API y registra su URI callback HTTPS mostrada con el proveedor; la ruta de finalización
web no es el URI de redirección del proveedor. Consulta el
[ciclo de vida OAuth](connectors.md#oauth-setup-and-lifecycle) y la verificación pendiente.

La configuración OAuth ahora descubre emisor/alcances y registro automático de
cliente a partir de la URL MCP. Las anulaciones técnicas y credenciales estáticas
están en **Ajustes avanzados de OAuth (opcional)** en web e iOS. Los proveedores que
admiten documentos de metadatos de cliente usan el documento público de metadatos
API; otros pueden usar DCR. Google sigue como excepción de cliente registrado manual.
Consulta [configuración automática](connectors.md#automatic-setup-and-centralita)
para inspección pública de metadatos Centralita y verificación restante del flujo real.

Web e iOS muestran el mismo error API de etapa de configuración y referencia de
diagnóstico. Disponibilidad DNS, rechazo de direcciones públicas y fallos de
configuración de proveedor tienen mensajes distintos; los errores permanecen en
estado UI transitorio, fuera de la caché de conexión. Los operadores pueden encontrar
el registro saneado correspondiente en Workers Logs. El indicador explícito
`global_fetch_strictly_public` de la API habilita llamadas públicas a Workers de la
misma zona, como Centralita. Esta corrección compartida del backend no requiere
migración de caché del cliente. Después de la publicación automática, verifica abrir
la autorización del proveedor y volver en ambas plataformas; una comprobación estática
no demuestra una ejecución OAuth completa. Consulta
[diagnóstico de configuración de conexión](connectors.md#troubleshooting-connection-setup).

Ambos clientes comparten la comprobación segura DNS Cloudflare y el rechazo de
redirecciones de la API. La API usa el modo manual de redirección compatible con
Workers y rechaza respuestas 3xx antes de que el SDK pueda seguirlas. El resolvedor
alternativo temporal se eliminó tras identificar el modo de redirección no admitido
como defecto de ejecución. Las comprobaciones siguen limitadas a la solicitud y
sin caché; las instantáneas de conexión y navegación OAuth pendiente conservan su
comportamiento. Consulta [seguridad DNS](connectors.md#dns-safety-and-runtime-compatibility)
para información del proveedor, diagnósticos seguros y verificación de producción/dispositivo.

El callback del proveedor ahora devuelve un documento HTTP 200 sin caché antes de
abrir la ruta de finalización web o el esquema personalizado nativo. Un script con
nonce elimina la consulta code/state del historial y reemplaza el documento con el
destino de retorno fijo; un enlace escapado **Continuar a Wildcard** cubre la navegación
automática bloqueada. Esto termina la cadena de redirección del formulario del
proveedor e impide que su política `form-action` bloquee el origen web separado o
el esquema iOS. La página solo lleva la prueba de un uso y el ID de flujo. El estado
pendiente de sesión, la eliminación de fragmentos, validación de cuenta/generación,
permisos de herramientas y aislamiento no cambian. Inicia una autorización nueva
tras un retorno bloqueado: el callback anterior ya consumió su vínculo de navegador.
Ambos clientes usan esta corrección API compartida. Consulta
[ciclo de vida OAuth](connectors.md#oauth-setup-and-lifecycle).

## Modelo de cuenta y registro cerrado

El registro se reabrió el 28 de octubre de 2026. Los superadministradores pueden
cerrarlo de nuevo durante la ejecución desde el [panel administrativo](admin.md).
Mientras esté cerrado, el formulario de registro web muestra el mismo mensaje de
iOS, asignado desde HTTP 403 de `auth/sign-up/email` en `utils/api.ts`.

Ambos clientes ahora solo inician sesión de cuentas existentes. Cuenta ofrece
Muse Spark 1.3 Estándar/Contributor, con la misma aceptación y divulgación explícitas
Contributor en iOS/web. El perfil de sesión existente almacena la preferencia en
caché y web la revalida en segundo plano al montar Cuenta. Guardar el modelo actualiza
el perfil y los indicadores de lista/grupo en caché y descarta lecturas anteriores
sin borrar borradores ni envíos pendientes.

Consulta [ajustes de modelo](model-settings.md) para API, consentimiento compartido,
comportamiento de caché, gasto AI Gateway y verificación pendiente de ejecución/dispositivo.
La configuración API compartida omite temporalmente AI Gateway tras fallos HTTP 502
en producción. Web e iOS conservan modelo elegido, comprobaciones de consentimiento,
mensajes en caché y reintentos; las llamadas directas a Meta no aparecen en las
métricas de gasto del gateway. Publica por el pipeline automático y reintenta un
turno fallido para verificar la generación; esta configuración del servidor no
requiere actualizar el cliente.

## Catálogos grandes de herramientas MCP

Web e iOS comparten el descubrimiento de hasta 256 herramientas en ocho páginas
remotas, con presupuesto de catálogo guardado de 256 KB y transporte de 1 MiB por
sesión de veinte segundos. Los patrones comunes acotados de fecha/mes/UUID se validan
con una comprobación previa restringida de regex finitas; regex inseguras y referencias
siguen bloqueadas. Las actualizaciones completas validadas reemplazan la instantánea
de sesión y conservan solo aprobaciones de huellas sin cambios. Las fallidas mantienen
la instantánea anterior. El descubrimiento no activa permisos. Ambos clientes muestran
cantidades cargadas/activadas y búsqueda local de herramientas; la consulta es
transitoria y no entra en la caché de catálogo. El modelo puede buscar/paginar su
lista de herramientas autorizadas de 24 KB. Consulta
[límites y seguridad](connectors.md#execution-retries-and-limits).

Ambos clientes ofrecen **Activar todas las herramientas** por conexión con una sola
confirmación que cubre todo el catálogo cargado, incluidas herramientas ocultas por
búsqueda. Un PATCH atómico aprueba el conjunto exacto de huellas revisado; catálogos
obsoletos/cambios concurrentes fallan sin aprobación parcial. Se requiere autorización
OAuth antes de activar. Los catálogos vacíos o ya totalmente activos deshabilitan la
acción. La invalidación existente de mutación y una recarga de metadatos actualizan
la instantánea de sesión; no se ejecutan herramientas durante la aprobación y las
futuras/modificadas siguen desactivadas. Consulta
[aprobación masiva y verificación](connectors.md#connect-and-authorize).

Las operaciones de conexiones de Cuenta usan `/me/mcp`; contactos y grupos exponen
endpoints explícitos de asignación. La caché de catálogo de Cuenta admite hasta
dieciséis catálogos de 256 KB; las listas de acceso almacenan hasta ocho listas de
contacto/grupo sin esquemas. Toda mutación invalida lecturas anteriores; cambiar de
cuenta y revocar contacto invalidan los metadatos de acceso afectados. El contenido
en caché permanece visible durante revalidación/fallos. Los nuevos inicios OAuth
guardan `account` como alcance de retorno; se acepta el retorno antiguo de contacto
pero solo se completa mediante la ruta autenticada de cuenta. Ambas plataformas
requieren actualizaciones para la migración 0029; quedan pendientes verificación de
migración en staging y de ejecución/dispositivo. Consulta
[migración y verificación](connectors.md#account-connector-migration-and-verification).

Cuenta usa `pages/account/index.vue` junto a `account/connections.vue`, por lo que
Conexiones se renderiza como página propia sin requerir un contenedor de página anidada.

## Finalización del análisis de grupo

Web e iOS usan el pipeline API de respuesta grupal en dos fases: investigación acotada
con herramientas seguida de una decisión JSON validada por separado y sin herramientas.
La recuperación de formato reutiliza investigación guardada en lugar de repetir
acciones externas. No se requieren UI, ruta, carga, sondeo ni comportamiento de
caché nuevos; ambos clientes conservan IDs de turnos pendientes y muestran la respuesta
final del servidor o el estado de fallo existente. Consulta
[límites de generación y estado de validación](groups.md#reply-rounds-and-exclusive-attention)
y [comportamiento de caché](caching.md#group-generation-checkpoints).
Después de un release automático autorizado, verifica un análisis MCP ficticio de
varios pasos, reabrir/navegar atrás durante generación, recuperación sin conexión,
revocación de acceso y cambio de cuenta en ambos clientes. La validación real/en
navegador/dispositivo está pendiente.

## Presentación de respuestas fallidas

Los fallos de grupo aparecen directamente debajo del mensaje fuente y nombran al
bot, como iOS; no queda un pie separado. Las instantáneas de grupo llevan `sourceID`,
`sourceSequence` y `attempt` opcionales; la API omite fallos resueltos por una respuesta
posterior del mismo bot, con segunda comprobación local contra mensajes cargados.
Los avisos privados de fallo también desaparecen tras una respuesta posterior del
asistente. Los mensajes en caché siguen utilizables mientras se actualizan las
instantáneas de respuesta. Ambos clientes aplican el mismo texto **Reintentar respuesta**
y desactivación durante trabajo actual a los avisos grupales. Actualiza API y clientes
juntos; a las instantáneas API antiguas sin IDs fuente no se les asignan anclas
inventadas. Consulta [recuperación de grupo](groups.md#failed-replies-and-response-recovery)
y [recuperación privada](chats.md#failed-replies-and-response-recovery). No se agrega
endpoint cliente, almacenamiento persistente ni permiso.

## Markdown en respuestas de bots

Las respuestas privadas del asistente y los mensajes de grupo con remitente agente
usan el componente compartido `MessageMarkdown`. Su renderizador markdown-it desactiva
HTML sin procesar, no carga imágenes Markdown y solo permite enlaces HTTP/HTTPS/mailto.
Memoriza el HTML para el texto actual del mensaje montado; no guarda la salida
renderizada en la caché de conversación. El texto humano permanece literal; las
vistas previas de lista/citas de bots usan texto plano del Markdown analizado, como
iOS. API y web importan el mismo renderizador/recorrido de tokens de
`shared/messageMarkdown.ts`; la salida calculada queda local a la vista montada.
El contrato de formato esencial, comportamiento nativo iOS, reglas de caché y
verificación visual pendiente están documentados en
[Markdown de mensajes de bots](chats.md#bot-message-markdown). La API agrega campos
opcionales de vista previa plana y limpia los cuerpos push de bots antes de truncar;
el texto original y la frescura de caché no cambian. No se requiere servicio ni
infraestructura nueva. Instala dependencias con el flujo existente `npm ci` de la raíz.

## Experimentos nativos de iOS

El [prototipo remoto de temporizadores/alarmas](native-remote.md) agrega
**Temporizadores y alarmas** a los detalles del contacto. Su hoja enumera los teléfonos
que puedes usar y, para un iPhone propio, un interruptor por participante actual
del contacto compartido en **Quién puede enviar a tu iPhone** (migración 0083);
desactivarlo solo elimina su permiso. El chat no tiene control de dispositivo:
las personas simplemente lo piden y el contacto [elige el teléfono](native-remote.md#choosing-the-phone).
La delegación requiere la autorización existente del propietario para el iPhone y
expone solo temporizadores/alarmas habilitados. El registro nativo de dispositivos
sigue requiriendo iOS; web puede administrar permisos y solicitar ejecución remota.
Consulta [contrato de delegación y verificación con dos cuentas](native-remote.md#allow-a-shared-contact-participant).
Después de activar **Recibir temporizadores y alarmas** en iPhone, pide una acción
en chat. El servidor toma una instantánea de teléfonos permitidos por mensaje;
el navegador no envía dispositivo. La entrega usa una alerta APNs visible y la
extensión de notificación, sin que la implementación requiera tocar ni desbloquear
el teléfono. Quedan por verificar en dispositivo físico compatibilidad durante la
ejecución, firma, cuenta regresiva del sistema y visibilidad de la app principal.
Esto no habilita acciones autónomas.

Una confirmación remota Cancelado significa que el iPhone rechazó una solicitud
reclamada antes de programarla, no que el navegador la cancelara. La extensión iOS
actualizada proporciona un motivo específico en la notificación visible del iPhone
e informa por separado errores reales de programación AlarmKit. Las confirmaciones
web y su caché no cambian; actualizar solo web no cambia la ejecución de la extensión.
Se requieren solicitudes nuevas después de instalar el binario corregido; las
cancelaciones antiguas nunca se repiten.

Las últimas 20 confirmaciones de operaciones remotas aparecen junto a sus mensajes
fuente. Confirman la programación, no el estado actual en vivo del temporizador.
Web puede revocar acceso; volver a conectar iOS actualiza permisos existentes sin
restaurar los revocados. Las listas de dispositivos, resultados vacíos y confirmaciones
usan cachés de sesión acotadas; la frescura de cinco segundos reutiliza sondeo del
chat y detalles de contacto. Los envíos pendientes capturan zona horaria y UUID.
La actualización explícita omite frescura, las solicitudes se deduplican, los fallos
transitorios conservan contenido y los cambios de sesión/acceso/contacto borran
estado y rechazan resultados tardíos. Las mutaciones de permisos actualizan el
permiso en caché de inmediato, rechazan lecturas anteriores y revalidan. Los
participantes no reciben controles para administrar permisos del iPhone ajeno.
No se agrega persistencia privada ni cuenta regresiva inventada en navegador.

Las confirmaciones se renderizan como etiquetas centradas con glifo de tipo e ícono
de estado coloreado según resultado (confirmado, en espera, sin confirmar/desconocido,
fallido, inactivo). iOS muestra el mismo texto de estado informado por dispositivo
para confirmaciones remotas. **Iniciativa de conversación** en la página del contacto
usa el interruptor estándar y **Experimentos nativos** se enumera junto a **Conexiones**
en Cuenta.

Las herramientas en primer plano de iPhone siguen ejecutando temporizadores/alarmas
automáticamente por defecto; otras herramientas requieren aceptación y Calendario/
recordatorios por ubicación conservan revisión. El navegador no puede ejecutar
frameworks Apple por sí mismo ni leer una cuenta regresiva iPhone en vivo. Sus
confirmaciones de dispositivo vinculado solo confirman operaciones. El contexto
nativo local sigue siendo exclusivo de iOS; web envía un `remoteDeviceID` elegido y
el servidor resuelve los tipos autorizados. No cambia el respaldo existente ante
API antigua para la indicación opcional `automaticKinds` del iPhone. Ajustes remotos,
migración y extensión requieren API/app actualizadas.

AlarmKit, EventKit, App Intents y la extensión para compartir iOS no tienen equivalente
de ejecución local en navegador. La guía web describe sus requisitos de plataforma;
sus ajustes y caché de confirmaciones de temporizadores/alarmas remotos se describen
arriba. Los permisos nativos por tipo y vinculación explícita siguen controlados en
iOS. Desde el 30/10/2026, la guía web y los controles iOS ya no ofrecen NFC, sesiones
Focus, recetas guiadas ni respuestas habladas. Su fuente se conserva desactivada;
la API filtra listas antiguas de capacidades y bloquea propuestas/reclamaciones
nuevas para tipos retirados. Los mensajes de voz del chat no cambian. Las confirmaciones
nativas históricas siguen legibles. No cambian las capacidades restantes ni las
cachés de navegador; verifica la guía al navegar y las herramientas nativas conservadas
en un iPhone firmado.

La entrada Cuenta y el directorio nativo de contactos iOS comparten la ruta raíz de
navegación, incluidas aperturas de herramientas y navegación Volver. Esto corrige un
problema exclusivo de iOS por el que las herramientas de un contacto podían abrirse
detrás de un directorio presentado directamente. La guía web no tiene una pila nativa
de herramientas de contacto y no requiere cambio equivalente de ruta; no cambian
sus cachés de sesión ni navegación del navegador.

En iOS, la entrada por contacto está en **Detalles del contacto → Experimentos
nativos**, al tocar nombre/avatar en el chat. Está disponible para contactos
existentes propios y compartidos; no hay botón separado de herramientas nativas
en la barra de chat. Esta entrada específica del dispositivo no agrega herramientas
nativas ejecutables al cliente web.

`/native/contact?agentID=<uuid>` es el respaldo del navegador para Universal Links
de contacto. Usa el directorio de contactos de sesión existente y membresías aceptadas
para resolver el agente, nunca el ID de contacto del remitente. Se aplican actualización,
deduplicación de solicitudes y restablecimiento de cuenta existentes; no se agrega
caché paralela de enlaces nativos. Un enlace no concede acceso ni acepta invitación.
Las visitas sin sesión inician sesión y reabren el enlace. La ruta pública de asociación
Apple, del lado del servidor, omite la autenticación SPA y solo contiene metadatos
públicos Team/App ID. Consulta [infraestructura](infrastructure.md#native-ios-experiments).

## Contexto temporal de conversación

Web e iOS comparten [contexto fechado de respuestas](chats.md#temporal-conversation-context)
y reconocimiento opcional según personalidad de regresos, pausas y preguntas
pendientes. Las respuestas privadas usan la zona horaria del turno humano actual;
las grupales usan fechas visibles del grupo sin adivinar mañana/noche local de los
miembros. Las solicitudes actuales prevalecen sobre saludos o preguntas sociales
antiguas. No hay UI, temporizador de navegador, ajuste, solicitud ni caché nuevos:
el sondeo normal de historial y los stores de sesión existentes muestran las
respuestas. Siguen pendientes las comprobaciones de reabrir/volver, actualizar,
recuperación sin conexión y calidad del modelo descritas en la guía de chat. Las
oportunidades posteriores de conversación nueva usan la política adaptativa separada
 de iniciativa descrita abajo.

## Iniciativa de conversación

La lectura, escritura y pausas de inactividad de respuestas privadas comparten con
iOS el [manejo de plazos vencidos](chats.md#failed-replies-and-response-recovery)
del servidor. Una actualización de memoria o generación lentas no pueden hacer que
esas pausas soliciten un momento pasado. Cachés de conversación, sondeo y reglas
de reintento manual no cambian; verifica un mensaje corto después de una actualización
lenta de memoria en ambos clientes tras el release API.

Los contactos privados usan el mismo [planificador adaptativo de iniciativa](initiative.md)
del servidor que iOS, incluso con el navegador cerrado. Detalles de contacto ofrece
el mismo interruptor de Iniciativa de conversación y ayuda para propietarios y
participantes de contactos compartidos: seguimientos opcionales y conversaciones
posteriores, tiempos influidos por personalidad y respuestas, supresión de saludos
ignorados y pausas explícitas. La caché de contactos de sesión existente aporta el
ajuste inicial; actualizaciones en segundo plano y respuestas de mutación lo actualizan,
y protecciones de generación rechazan lecturas tardías y cambios de sesión. Los
mensajes aparecen mediante sondeo normal de conversación/lista y cambios de no leídos;
el push del navegador sigue no disponible. Se requieren migraciones hasta 0065 y
release API. Verifica reabrir, actualizar, recuperación sin conexión/fallos, revocación
de acceso compartido y cambio de cuenta con cuentas ficticias; quedan pendientes
comprobaciones visuales/durante ejecución.

Las primeras revisiones de continuación vencen a los 30 segundos, con umbrales de
personalidad/receptividad antes de inferir e intervalos progresivamente mayores.
Los intercambios sociales elegibles pueden crear oportunidades opcionales a lo
largo de siete días, elegidas en ventanas variadas tras varios días de evidencia
de actividad local. Una tarea ajena a un saludo no cuenta como respuesta positiva;
el uso práctico repetido suprime saludos pero permite seguimientos de tareas.
Desde 0094, los contactos nuevos envían bienvenida y los chats silenciosos reciben
reactivación acotada ([contacto proactivo](initiative.md#proactive-outreach-migration-0094));
llega por las mismas vías de sondeo historial/lista y push, sin cambio web más allá
de actualizar la ayuda. No se agrega temporizador del navegador, solicitudes extra,
caché de tiempos cliente ni programación recurrente de reloj. Una pausa explícita
persiste en el servidor hasta una reanudación explícita o desactivar/activar el
ajuste; las respuestas directas normales siguen funcionando. Archivar cancela el
plan; vaciar historial elimina su aprendizaje y pausa. La ayuda de ambos clientes
está actualizada. Calidad de modelo, comportamiento en dispositivo y entorno de
regresión optativo siguen sin verificarse para 0065; consulta
[iniciativa](initiative.md#verification).

### Mensajes privados desde grupos

Un contacto puede escribir a un miembro del grupo en su chat privado
([grupos](groups.md#private-messages-from-a-group)). El mensaje es un turno ordinario
solo del asistente, por lo que página de chat, vistas previas de lista y cantidades
no leídas ya lo muestran mediante sondeo y cachés existentes; no hizo falta cambio
web, como en iOS. El push del navegador sigue no disponible.

### Mensajes privados consecutivos

El compositor privado permite escribir durante el envío HTTP y enviar otro mensaje
en cuanto se acepta, mientras siguen pendientes respuestas del agente. Un UUID
pendiente conserva la propiedad de su envío incierto; el siguiente borrador queda
en la caché de conversación de sesión. Los eventos reales de entrada informan escritura
como máximo cada dos segundos, sin carga de borrador; salir o cambiar visibilidad
cierra la visita, y una entrada nueva puede renovar una visita vencida. Cambiar de
contacto conserva el contacto original de la visita para la solicitud de salida,
y respuestas tardías de actividad no pueden reabrir esa visita.

Ambos clientes usan las mismas pausas acotadas de servidor, agrupación de ráfagas y
decisión de esperar/enviar solo respuesta descritas en
[chats](chats.md#consecutive-messages-and-composer-pacing). Son requisitos las migraciones
0035–0036 y un release API automático. Un mensaje elegible más reciente que llega
durante la generación se incorpora al siguiente turno en la comprobación atómica
de publicación; se descarta un borrador conversacional obsoleto. Los contextos
nativos coincidentes pueden agruparse; una marca persistida de inicio de herramienta
impide ocultar/repetir una confirmación de acción.

El historial privado renderiza los lados humano y asistente como elementos con
fecha independientes, con IDs estables y desempates deterministas. Los envíos
locales pendientes comparten esta línea temporal; las filas de estado quedan al
final y las confirmaciones nativas junto a su solicitud humana. Una respuesta
 tardía del asistente de un turno antiguo ya no puede insertarse sobre un mensaje
humano más nuevo. Los separadores de días siguen la fecha propia de cada mensaje.
Los turnos del servidor en caché conservan orden por secuencia para paginación y
conciliación. Pasó la comprobación de tipos; sigue pendiente verificar en navegador/
dispositivo envíos rápidos, borradores inactivos, escritura reanudada, fallos,
navegación, revocación y cambio de cuenta.

## Miniapps

Los contactos privados pueden hablar de entradas guardadas de miniapps mediante
la herramienta compartida API `read_mini_app`, en web e iOS. El contacto lee el
estado actual del servidor en este chat privado, no la caché de vista resuelta del
navegador, y no ejecuta conectores. No se conservan borradores sin guardar, entradas
temporales ni respuestas individuales de lecciones; las ediciones pendientes deben
terminar de guardarse primero. Consulta
[hablar del contenido guardado](mini-apps.md#discussing-saved-content-2026-10-31)
para aislamiento, paginación y comprobaciones pendientes en dispositivo/navegador.

La página de chat muestra una tarjeta de miniapp bajo la respuesta que la creó y
sondea la lista del contacto junto con la conversación. `/contacts/:id/mini-apps`
enumera apps y `/contacts/:id/mini-apps/:appID` muestra la revisión (lecturas frente
a escrituras confirmadas, luego **Activar miniapp**) o la app habilitada como pantalla
propia: barra superior con menú ⋯ (acciones de la app, luego Actualizar, Desactivar
y Eliminar), pestaña actual, compositor fijado abajo y barra inferior para apps con
pestañas. `MiniAppView.vue` renderiza el árbol resuelto por el servidor: cuadrículas
de estadísticas, de tarjetas, mosaicos, listas agrupadas, gráficos SVG de barras/
líneas/áreas/dona, barras y anillos de progreso, texto, avisos y formularios que
confirman con el texto de la acción. `MiniAppLesson.vue` muestra una tarjeta de
lección y abre su flujo en una superposición de ventana completa con las mismas
reglas iOS. Los valores se formatean con `Intl` en la configuración regional de
quien mira. Los grupos muestran tarjetas de [miniapps de grupo](mini-apps.md#group-mini-apps)
dentro del mensaje que las creó; `/groups/:id/mini-apps` las lista (enlace en detalles
de grupo) y `/groups/:id/mini-apps/:appID` abre una. Ambas rutas reutilizan
`MiniAppList.vue` y `MiniAppScreen.vue` con base `groups/<id>`. Comportamiento, texto
y límites coinciden con iOS; consulta [miniapps](mini-apps.md) y
[caché](caching.md#mini-apps). No se verificaron diseño en navegador ni cargas reales.

Formularios, barra y filas (31/10/2026):
- Toda acción con campos abre `MiniAppForm.vue`, un `AppSheet` con sus campos. Lo
  abre un botón, un botón de barra o una fila de lista. Los campos pueden ser texto,
  número, fecha, interruptor o selección, y el selector es un `<select>` nativo.
  - Un selector alimentado por una lista muestra «Aún no hay elementos» si está
    vacía, y si es obligatorio bloquea el envío.
  - La hoja solo se cierra si la acción tiene éxito, y los errores aparecen dentro.
- Los componentes `toolbar` de la pantalla o pestaña actual se renderizan en la
  barra superior antes del menú ⋯. Una acción de agregar aparece como ícono + y las
  demás como botón de texto.
- En una lista sobre un estado de lista:
  - Tocar el texto de una fila abre la acción `edit` completada con sus `values`.
  - Las acciones de fila son botones tonales pequeños.
  - `removable` agrega ✕, que envía `remove_item` como una lista de comprobación.
- Las listas de comprobación funcionan igual, pero solo la casilla alterna.
- Las ediciones y acciones de fila publican `row: {state, index}` con su acción y
  esperan la vista del servidor; no son optimistas. Los controles de filas de listas
  comunes se pausan mientras hay pulsaciones pendientes, porque sus índices vienen
  de la vista del servidor.
- Solo destacan los botones de agregar (+, incrementar, anexar), además de un botón
  que esté solo en su fila. Un `choice` vinculado a estado numérico compara su valor
  como texto.
- La tarjeta de lección es una fila estática con un botón **Comenzar** real.
- Una tarjeta de progreso independiente conserva todas las esquinas de tarjeta.
- En pantallas táctiles, tocar fuera del compositor cierra el teclado.
- Nada de esto se probó todavía en navegador.
El estado guardado, listas de comprobación, interruptores, opciones, entradas,
barras de progreso, temporizadores y filas de botones se renderizan con las mismas
reglas iOS (`MiniAppView.vue`, `MiniAppTimer.vue`). Las pulsaciones se aplican de
inmediato y se concilian con el servidor (`useMiniApps`).

## Personalidad de contacto

La ayuda de identidad estable coincide con iOS: valores breves, formas de pensar,
peculiaridades conversacionales y defectos, con especialidades/intereses permitidos
y rutinas humanas inventadas excluidas. El placeholder web sugiere dos o tres frases.
La guía API compartida cubre generación, regeneración, incorporación, respuestas
privadas/grupales e iniciativa; los perfiles antiguos se interpretan como comportamiento
sin reescribir datos guardados. No cambian borradores de sesión, comprobaciones de
revisión, invalidación de caché ni guardado. Sin solicitudes ni almacenamiento nuevos.
Las comprobaciones estáticas no demuestran adherencia del modelo ni comportamiento
en dispositivo; verifica borradores generados y respuestas de perfiles antiguos
con datos ficticios.

El editor de personalidad renderiza la lista compartida de rasgos, por lo que el
nuevo control **Emoji** aparece con los demás; consulta
[emoji y reacciones](personality.md#emoji-and-reactions).

**Detalles de contacto → Personalidad** (`/contacts/:id/personality`) coincide con
el experimento nativo iOS: identidad estable, especialidades opcionales (hasta
1,000 caracteres), fecha de nacimiento opcional, zona horaria del cumpleaños, edad
calculada y quince controles etiquetados de 1–10. Solo el creador puede guardar;
los demás participantes tienen vista de solo lectura. Los contactos existentes
comienzan desactivados. Ambos clientes usan el mismo director de servidor para
respuestas privadas/grupales e iniciativa. Las relaciones siguen IDs estables de
persona en contextos elegibles; al modelo solo llega dirección de actuación categórica.
Las causas privadas permanecen privadas y los chats/grupos con conectores mantienen
su aislamiento local. La UI no descarga puntuaciones de relaciones ni eventos fuente.
No hay excepción de plataforma para esta función.

`usePersonality` posee instantáneas solo de sesión y borradores modificados con
presupuesto de ocho entradas, conservando guardados activos hasta que terminen.
Reabrir usa datos en caché de inmediato y revalida; una actualización nunca sobrescribe
ediciones sin guardar. La actualización explícita pregunta antes de descartar cambios.
Salir con ediciones sin guardar, por navegación interna o cerrando/recargando la
pestaña, pregunta primero; confirmar una salida interna descarta el borrador en
caché (el aviso propio del navegador no puede informar la elección, así que cerrar
una pestaña simplemente lo pierde). El estado de carga cubre la obtención del contacto
que precede a la solicitud de personalidad, para que **Reintentar** aparezca solo
tras un fallo. Guardar está en la barra superior. iOS conserva su borrador modificado
al volver y no pregunta allí; solo confirma antes de actualizar o generar. Las
mutaciones invalidan lecturas anteriores y usan la revisión original de servidor
del borrador, de modo que un 409 conserva la entrada para revisión. Eliminación,
pérdida de acceso y cambio de cuenta eliminan el estado. No hay retención en disco.
Consulta [personalidad](personality.md) y [caché](caching.md). La evaluación local con
modelo real de la API compartida y la corrección del presupuesto del clasificador
se documentan en la [guía de evaluación](personality.md#opt-in-live-model-evaluation);
afectan respuestas iOS y web sin cambios de cliente ni caché adicional. Quedan
pendientes verificaciones funcionales visuales, sin conexión, multicuenta, de
concurrencia y del cliente/modelo desplegado.

## Incorporación de cuenta

Los registros nuevos usan el mismo flujo del primer círculo de iOS: `/onboarding`
requiere nombre, Masculino/Femenino, selectores de idioma y país, uno de cuatro
estilos visuales y aceptación explícita de memoria compartida. Muestra progreso
persistente y reintentos, luego abre la app normal con cinco contactos generados
y un grupo opcional. Amigos, Estudio o Trabajo define el elenco; Estudio/Trabajo
requiere el campo del usuario. Crear grupo es un interruptor separado, activado
por defecto, y usa nombres simples (Amigos, Grupo de estudio, Equipo de trabajo).
Los cinco contactos de incorporación aparecen de inmediato en Chats con Aún no
hay mensajes, sin mensajes ni cantidades no leídas inventados. Las cuentas existentes
omiten la configuración. El store de sesión almacena opciones, progreso y borradores,
deduplica solicitudes/envíos y rechaza respuestas tardías tras mutaciones/cambio
de cuenta. Los borradores sin enviar solo viven en memoria; la entrada enviada se
reanuda desde la API. Las fotos usan la caché privada de imágenes existente. Consulta
[incorporación](onboarding.md) para API, privacidad, frescura, límites de reintento y
comprobaciones pendientes en navegador/dispositivo. No se realizó validación en
navegador/dispositivo ni generación real.

Después de la configuración, incluida la exclusión de contactos IA, el cliente
web navega directamente a `/chats`, como iOS. La recuperación de configuración en
curso/completada y la redirección de `/onboarding` ya completada también abren Chats.
Esto permite que la UI existente de progreso/reintento guíe la primera visita;
`/` también abre Chats en todos los diseños.

### Acceso de contactos a imágenes de perfil

Las respuestas privadas y grupales usan la capacidad API compartida de solo lectura
`view_profile_photo` en web e iOS. Los contactos pueden inspeccionar su propio avatar
y el del humano actual en chat privado, además de avatares actuales de miembros
en grupos. No se necesita carga del cliente ni UI adicional. Las imágenes se cargan
solo bajo demanda con comprobaciones actuales de membresía, consentimiento de modelo
y versión; no se adivinan imágenes ausentes o revocadas. Las cachés de avatares de
sesión existentes no cambian; la inferencia no usa cachés cliente. Consulta
[acceso a imágenes de perfil](profile-photos.md#profile-images-available-to-contacts)
para límites, privacidad, retención y comprobaciones funcionales pendientes.

### Edad y fotos de contacto

La incorporación también requiere una edad entera (1–120), como iOS. Los contactos
nuevos de los cuatro estilos tienen edades validadas dentro de ±2 años, con género
explícito por contacto. El prompt realista usa `N years old female|male social media natural photo
taken with phone. profile picture for social media`, seguido de indicaciones de
apariencia y personalidad. Los demás estilos piden la edad prevista y apariencia
acorde, sin instrucción de solo adultos. La edad usa el borrador/caché de sesión y
la entrada D1 existentes, sin persistencia local adicional. Las configuraciones
antiguas guardadas siguen reanudándose sin exigir ni inventar edad; se conservan
fotos completadas. Consulta [incorporación](onboarding.md). Las comprobaciones
pendientes en navegador/dispositivo incluyen entrada numérica, edades inválidas,
límites inferior/superior, restauración de borrador, reintento antiguo y adherencia
real del modelo.

## Mensajes sucesivos de contactos

Los chats privados renderizan el prefijo entregado `assistantMessages` como burbujas
estables con fecha independiente, usando `assistantText` como respaldo para historial
antiguo. El sondeo de un segundo del chat visible y la caché de sesión existentes
concilian partes; no hay temporizador de navegador para entrega. Escribiendo sigue
visible mientras corre la respuesta. Las miniapps aparecen una sola vez. Citas,
reacciones e identidad de no leídos/push privados siguen por turno de respuesta,
como iOS. Las partes de grupo son mensajes ordinarios en caché con confirmaciones
y cargos de energía independientes. Consulta
[mensajes sucesivos](reply-messages.md) para interrupción, límites, lanzamiento y
comprobaciones con datos ficticios en ambos clientes.

## Compartir texto privado en grupos

Detalles de grupo incluye **Hablar de mis chats privados**, como iOS. Cada interruptor
permite a ese contacto hablar del texto privado pasado y futuro de la persona con
sesión con todos en este grupo, tras confirmación explícita. Está desactivado por
defecto, es revocable y no autoriza conversaciones ajenas. Se excluyen bytes de
archivos, turnos programados y conversaciones aisladas por conectores. Las reglas
de memoria compartida continúan por separado. Consulta
[comportamiento de grupo](groups.md#optional-private-text-sharing).

Detalles ahora comparte la instantánea de conversación grupal de sesión (caché de
20 grupos), incluidas listas de permisos vacías, reapertura síncrona y actualización
en segundo plano. Las solicitudes de detalles se deduplican. Las mutaciones exitosas
actualizan interruptores de inmediato, invalidan solicitudes obsoletas y actualizan;
los errores transitorios conservan el estado confirmado utilizable. Actualizar detalles
revalida explícitamente. Pérdida de acceso y cambios de sesión borran instantáneas
y rechazan resultados tardíos; sin almacenamiento privado nuevo en disco. No se
verificaron comportamiento en navegador/dispositivo ni recuperación por modelo real.

## Indicadores de escritura en grupos

Como iOS, las burbujas de grupo y el subtítulo de miembros usan el
`replies[].isTyping === 1` explícito de la instantánea solo para respuestas en curso.
Trabajo en cola, investigación y decisiones silenciosas no muestran escritura.
Un borrador completo no vacío inicia una espera duradera de escritura según longitud
antes de cada publicación de texto, como iOS. Cada parte tiene presupuesto de
composición propio, limitado a 15 segundos; las partes posteriores no reutilizan
el tiempo de generación de la primera. Las respuestas cortas quedan en una burbuja
salvo que el contexto justifique una ráfaga; las largas pueden dividirse en algunas
ideas completas para legibilidad. La preparación de voz conserva su breve entrada
Grabando. Consulta [mensajes sucesivos](reply-messages.md) para reglas exactas de
ritmo e interrupción. Los reintentos siguen esperando todos los trabajos activos,
incluso los de cola invisibles. La falta de indicadores se trata como inactividad.
Las instantáneas de sesión, sondeo visible de un segundo, invalidación y protecciones
contra respuestas obsoletas existentes no cambian; no se agrega texto de borrador
ni caché extra de cliente. Consulta [grupos](groups.md#group-typing-state) para la
verificación restante con cuentas ficticias y dispositivo/navegador.

## Citas escritas por contactos

Los contactos pueden citar un mensaje si temas superpuestos harían ambigua su
respuesta, y por defecto no citan en respuestas obvias. Los mensajes privados
entregados llevan su `replyTo` opcional propio; los grupales usan la carga de cita
existente. Ambos usan el componente de cita y paginación/navegación al original
existentes, como iOS. Consulta [respuestas](replies.md) para validación y verificación pendiente.

Los contactos de grupo pueden omitir silenciosamente una pregunta humana ya respondida
suficientemente por otro miembro, pero dar su propia respuesta cuando se solicitan
perspectivas individuales. Es comportamiento compartido de servidor con iOS; una
decisión omitida no muestra placeholder ni escritura. Consulta
[participación grupal](groups.md#contextual-participation).

Los reconocimientos y respuestas de cierre grupales pueden terminar continuaciones
automáticas de bots. La transacción compartida de servidor cierra las oportunidades
creadas por esa respuesta; las preguntas humanas originales y los mensajes humanos
nuevos siguen siendo elegibles. iOS y web usan su caché existente de mensajes/presencia.
Consulta [control de bucles](groups.md#ending-acknowledgement-loops).

## Imágenes de chat generadas

El cliente web ya envía `side=assistant` de imágenes privadas como parámetro de
consulta. La corrección de solicitudes iOS usa el mismo contrato mediante
`URLQueryItem`, restaurando paridad para imágenes de bots en burbujas, visor de
pantalla completa y multimedia de chat. No hace falta cambiar comportamiento ni
caché web. La verificación en dispositivo sigue pendiente.

Las miniaturas cargadas conservan la composición completa vertical, horizontal o
cuadrada con `object-fit: contain` y límite de alto de 400 píxeles. iOS también
conserva la composición completa hasta 260 por 360 puntos; los mosaicos de galería
siguen cuadrados. En chats privados y grupos, pulsar una imagen cargada abre un
modal negro de pantalla completa en la misma pestaña, reutilizando su URL de caché
privada sin descargar de nuevo. El visor encaja toda la imagen; Acercar/Ajustar
imagen o doble clic alterna el zoom, con desplazamiento para inspeccionar. Cerrar
o Escape cierra el modal y restaura foco en la miniatura. Navegar, cambiar la fuente
de imagen o cambiar de cuenta elimina el visor. Esta actualización de presentación
solo web sigue las miniaturas de portada y visor de pantalla completa existentes
iOS; pellizcar/desplazar y deslizar para cerrar nativos siguen siendo interacciones
iOS. Está pendiente la verificación visual y táctil en navegador.

Los contactos pueden generar una imagen contextual por respuesta y combinar
opcionalmente hasta tres avatares accesibles en ese momento. El primer mensaje
privado del asistente puede llevar `attachment`; el componente de imagen privada
usa la ruta autorizada de adjunto con `?side=assistant`. Los grupos usan mensajes
comunes con adjunto. iOS y web muestran los mismos datos de imagen/leyenda/cita y
conservan sus cachés de sesión. No se devuelven bytes de borrador durante la generación;
los checkpoints de servidor solo contienen metadatos. Consulta
[imágenes generadas](generated-images.md) para alcance, configuración, límites de
reintento y verificación real pendiente.

Los [álbumes](generated-images.md#albums) generados por contactos (dos o tres imágenes
en un mensaje) se renderizan en `MessageAttachment.vue` como cuadrícula y abren
`ChatImageViewer.vue`, que pagina con botones de flecha, flechas de teclado y gestos
de deslizamiento. Las imágenes de álbum usan `albumImagePath` (`utils/album.ts`)
para rutas `image=N` en burbujas y multimedia de detalles, con el mismo comportamiento
y reglas de caché iOS.

La generación usa avatares actuales para selfies solicitadas y miembros nombrados,
y puede recuperar fotos enviadas por personas o contactos en este mismo chat como
referencias de escena/edición. Las descripciones visuales internas son solo de
servidor y no se muestran en leyendas, historial público ni cuadrículas multimedia.
iOS y web usan la API compartida y el visor/caché de imágenes entregadas existente;
no se necesitan cambios de formato del cliente. Consulta
[referencias y descripciones de imágenes](generated-images.md#internal-image-descriptions-and-retrieval)
para alcance, indexación diferida de historial antiguo, límites, retención y verificación.

## Creación IA y borradores de personalidad

iOS y web crean contactos con [un formulario](contact-generation.md) donde los
campos vacíos se generan con IA, con contexto de incorporación persistido y selectores
solo de bot. La creación usa un borrador/ID pendiente de sesión y un trabajo D1
duradero en el Workflow de incorporación existente; navegar reutiliza el estado en
caché y luego revalida. Los contactos generados nuevos reciben cumpleaños aleatorios
de adultos. Las ediciones deben mantenerlos con al menos 18 años. Ambos clientes
reemplazan el formulario por un indicador destacado desde el envío hasta la creación
activa, muestran **Creando…** en la acción y rotan texto explicativo cada cinco
segundos después de confirmar el trabajo. Los trabajos activos en caché muestran
actividad al reabrir. La animación es solo de vista y se detiene al desmontar (también
al estar inactiva en iOS); no se agregan solicitudes, caché, persistencia ni etapas
de progreso de servidor. Consulta [actividad visible de creación](contact-generation.md#visible-creation-activity)
para texto, accesibilidad y verificación pendiente entre clientes. Los creadores
existentes pueden generar/regenerar todos los campos de personalidad al borrador
de sesión, revisarlos y guardar con protección de conflictos de revisión. La
generación conserva nombre y cumpleaños adulto. Cambio de cuenta o pérdida de acceso
descartan el estado privado en caché; las cachés de fotos siguen siendo autoridad
para bytes. Consulta la guía enlazada para recuperación, retención, límites de
solicitudes, detalles de caché y comprobaciones pendientes de dispositivo.

### Permiso de investigación web de tareas

Los editores de tareas iOS y web ofrecen **Investigación web pública** después de
guardar una asignación a contacto. Guardar una consulta exacta no vacía autoriza
una búsqueda pública de por vida con la app cerrada; borrarla revoca el permiso.
Reasignar borra la autorización. Ambos clientes muestran intentos usados y etiquetas
de confirmación pendiente/borrador/informe/fallido, incluido consumo tras fallo o
eliminación de informe. Reutilizan mutación versionada del tablero y revalidación
en primer plano existentes, sin caché, sondeo, descargas de fuentes ni retención en
disco adicionales. El formulario conserva la versión e instantánea de autorización
capturadas al abrir, para que el sondeo no omita un conflicto de edición concurrente.
Cierra/reabre tras un conflicto para editar datos actualizados. Consulta
[trabajo persistente](persistent-work.md). Sigue pendiente la verificación funcional/
visual: denegación predeterminada, edición/revocación, cambios de asignación,
resultados inciertos, conflictos de edición obsoleta, navegación sin conexión/atrás,
pérdida de acceso y cambio de cuenta con tareas ficticias en ambos clientes.

### Colaboración de tareas

Ambos tableros muestran **Entregable: <título del documento>** y **Ronda de revisión
n/2** con los comentarios del revisor mientras la tarea está abierta (migración
0058). Los contactos lo establecen mediante herramientas; no hay controles nuevos.
Sin verificar en navegador y dispositivo. Consulta
[tareas](tasks.md#collaboration-deliverables-and-bounded-reviews-0058).

### Clasificación semántica de memoria

Solo servidor (migración 0057, indicador `SEMANTIC_MEMORY_ENABLED`, desactivado por
defecto): la selección de memoria puede agregar similitud de embeddings de Workers
AI. Sin cambios de UI, caché o API en iOS ni web. Consulta
[memoria](memory.md#semantic-ranking-migration-0057).

### Monitores de páginas

Ambos editores de tareas ofrecen **Monitor de página** después de guardar una
asignación a contacto: URL pública, **Cada hora / Cada 6 horas / Cada día**, palabras
clave opcionales separadas por comas, últimas cinco comprobaciones y turnos por
cambios usados; la fila del tablero muestra el mismo resumen. El servidor comprueba
la página con código e inicia un turno del contacto solo ante un cambio relevante.
Mismo PATCH versionado, caché de tablero y sondeo que otros campos; sin caché nueva.
La presentación en navegador y dispositivo no está verificada. Consulta
[monitores de páginas](monitors.md).

### Desplazamiento de conversación

Los chats privados y grupos web abren al final instantáneamente, siguen el crecimiento
del contenido, conservan la posición de lectura al subir y ofrecen un botón para
volver a lo más reciente. Consulta [desplazamiento del chat web](web-chat-scrolling.md)
para sincronización y verificación.

## Indicadores de actividad de respuesta

Ambos clientes muestran Grabando... durante la preparación de adjuntos de voz y
Escribiendo... al preparar texto. Las segundas líneas de listas privadas/grupales
muestran temporalmente esa actividad en lugar de vistas previas y confirmaciones,
conservando orden, fechas y cantidades no leídas. Los grupos identifican cada contacto
activo. Reutiliza resúmenes de sesión existentes, sondeo en primer plano, deduplicación,
paginación, aislamiento de cuenta y expulsión de caché sin solicitudes extra por
fila ni almacenamiento de disco. Consulta [actividad del chat](chats.md#reply-activity-indicators)
para frescura/fallos y comprobaciones pendientes de dispositivo, y
[migración 0062](infrastructure.md#recording-presence-migration-0062) para configuración
reproducible y rollback.

## Ciclo de vida de chats

Las filas de chat no tienen botón Administrar; clic derecho abre su menú contextual
(consulta [menú contextual de lista de chats](#chat-list-context-menu-and-message-menu-2026-10-30)).
Abre detalles de un contacto desde el título del chat y baja al final para
Archivar/Desarchivar, Vaciar chat con casilla opcional de eliminación de memoria y
Eliminar contacto y datos. Los detalles de grupo ponen Archivar/Desarchivar y Vaciar
chat exclusivo del propietario abajo, junto a Eliminar grupo/Salir del grupo. Se
conservan confirmaciones destructivas y helpers existentes de mutación/invalidación
de sesión. Este cambio de ubicación es solo web; iOS conserva acciones por
deslizamiento y menús contextuales según lo solicitado. Abre Archivados con el botón
de archivo inmediatamente a la izquierda de Cuenta en la cabecera de lista; alterna
la vista e indica su estado activo. La cabecera archivada también ofrece Volver a
Chats. Home no tiene fila Archivados. iOS coloca Archivados en el menú de tres puntos
superior izquierdo. Archivados sigue como vista de la caché de lista de sesión,
conservando paginación y actualización en segundo plano sin caché ni ruta de solicitud
separadas. Vaciar grupo es solo del propietario y afecta explícitamente a todos.
Comportamiento, texto, cascada, protección del historial y reglas de caché coinciden
con iOS; consulta [ciclo de vida de chats](chat-lifecycle.md), incluidos pasos de
verificación de navegación. No se ejecutó validación en navegador ni de build para
estas acciones.

Las correcciones API de ciclo de vida de la migración 0064 se aplican igual a web
e iOS: la limpieza pendiente ahora incluye trabajo privado derivado de grupo, las
imágenes generadas conservan su alcance de chat y los fallos obsoletos no pueden
demorar limpieza más nueva. Pasan [38 comprobaciones locales de integración](chat-lifecycle-testing.md)
contra rutas reales y bindings emulados; no valida UI de navegador/iOS ni servicios
de producción. No se necesitaron cambios de contrato cliente de API/texto/permisos.

El menú de tres puntos de la cabecera de chat iOS y el título principal de navegación
acotado y truncado (consulta [chats](chats.md)) se limitan a iOS por pedido. Mover
la identidad privada/grupal del espacio de acción inicial al título principal
resuelve el anidamiento nativo con desbordamiento; la cabecera web mantiene sus
botones separados. Sin cambios de API, texto, permisos ni caché de sesión.

## Estado de escucha de voz y vistas previas de lista

Ambos clientes muestran un micrófono abajo a la izquierda del avatar de quien envía
voz y lo colorean junto con el control de búsqueda: gris antes de escuchar y color
de marca de lectura después. Los mensajes entrantes usan `ownListenedAt` de la
cuenta actual; los salientes mantienen `listenedAt` existente del contacto. Solo
una reproducción exitosa confirma audio entrante, incluso desde caché. Las descargas
para formas de onda y lecturas del chat no lo hacen. Las listas muestran micrófono
y `Voice message (0:05)` con duración real, incluidos clips pendientes y atribución
del remitente de grupo. La actividad tiene prioridad.

Se requiere la migración 0066. Escuchar se combina monotónicamente en stores de
conversación y resúmenes de sesión existentes, sin caché persistente adicional del
navegador. Las escrituras concurrentes de una cuenta/ruta comparten solicitud. La
reproducción sin conexión actualiza la conversación retenida de inmediato; las
escrituras fallidas de confirmación reintentan en la próxima reproducción. Tras
expulsar de caché o cerrar sesión, solo sobrevive la escucha confirmada por servidor.
Consulta [política de caché y comprobaciones manuales](caching.md#voice-listening-metadata).
Sigue pendiente la verificación en navegador y dispositivo físico.

El fondo del micrófono de voz saliente usa la clase local al componente
`voice-message-outgoing`. Mantén esta regla con alcance: Vue compila un selector
que empieza por `:global(.outgoing)` como regla para toda la fila saliente, pintando
el fondo detrás de burbujas enviadas de texto, adjunto y voz. Esta corrección CSS
solo web no cambia comportamiento iOS, API, migraciones ni política de caché. Verifica
mensajes enviados y pendientes privados/grupales en claro/oscuro tras el release;
inspeccionar estáticamente el selector no demuestra apariencia renderizada en navegador.

## Aprendizaje de conversación

Detalles de contacto y de grupo enlazan a **Aprendizaje de conversación**, con la
misma API iOS. La pantalla muestra solo observaciones por agente del humano actual,
ajustes, preguntas opcionales, respuestas y evidencia fuente, junto con controles
de participación y restablecimiento. Aprender no activa mensajes espontáneos. Una
caché de sesión de ocho entradas conserva contenido vacío/cargado, deduplica lecturas
y revalida a los treinta segundos o con Actualizar explícito; las mutaciones descartan
lecturas anteriores. Vaciar, eliminar y cambiar de cuenta la invalidan. No se agrega
almacenamiento de disco ni sondeo extra. Consulta
[comportamiento y limitaciones](conversation-learning.md) y
[reglas de caché](caching.md#conversation-learning).

## Estilo natural de conversación

Web e iOS usan el [estilo de conversación](conversation-style.md) compartido en
respuestas privadas, borradores/revisiones de grupo e iniciativa privada opcional.
Los hábitos específicos del contacto, comentarios sobre nombre/longitud de la
audiencia actual, lenguaje regional de preferencias de generación retenidas y
contexto de participación grupal guían respuestas nuevas. Los mensajes normales
favorecen contribuciones breves; las explicaciones útiles conservan profundidad
necesaria. Se preservan identidades y mensajes existentes. La ayuda Voz de ambos
clientes explica que el acento también guía la redacción sin forzar jerga.

No hay contrato de respuesta cliente, solicitud, caché ni migración nuevos. Las
respuestas grupales con preguntas o nombres de miembros pueden usar una revisión
opcional de redacción del servidor, sin herramientas ni repetición de acciones;
agrega costo y latencia del modelo. Los stores existentes conservan historial
cargado y reciben respuestas nuevas mediante sondeo/mutación normales. Actualizar
acento sigue insertando/actualizando el contacto de sesión y rechazando lecturas
tardías/cambios de cuenta. Recargar no puede reescribir mensajes antiguos. Comprueba
ambos clientes con conversaciones ficticias, estilos distintos, mensajes dirigidos
y a todo el grupo, historial parcial, voz activada/desactivada, actualizar/volver,
fallos sin conexión, revocación y cambio de cuenta. Están pendientes calidad del
modelo y comportamiento visual/en dispositivo; las comprobaciones estáticas no son
una evaluación de calidad conversacional.

La misma guía de entrega final y revisión opcional de grupo se aplica a iOS y web.
Los metadatos internos de audiencia/profundidad nunca se exponen como mensaje. Los
efectos nuevos de texto informal como risa escrita, letras repetidas y emoji se
mantienen como texto y no se sintetizan literalmente; las notas conversacionales
simples siguen pudiendo usar audio. El [registro de evaluación](conversation-style-evaluation.md)
ficticio con modelo real cubre comportamiento, mientras la verificación visual/en
dispositivo y acústica es separada.

## Variedad de nombres y actividad conversacional

La incorporación y creación IA de contactos usan los mismos conjuntos locales de
nombres seleccionados por servidor que iOS, con exclusión acotada de duplicados por
cuenta. Se conservan nombres, planes de trabajos guardados, personalidades editadas
por creador e IDs de envío pendientes. Completar el conjunto adicional de nombres
ocurre dentro del estado de generación existente; agrega latencia/costo del modelo
sin solicitudes, paginación ni campos de caché nuevos. Consulta
[nombres generados](contact-generation.md#varied-generated-names).

La iniciativa privada ya no trata un chat abierto pasivamente como escritura activa.
La escritura reciente real aún la demora, y la evidencia nueva de entrada/lectura/
perfil sigue rechazando borradores obsoletos. Los umbrales de continuación según
personalidad son menores, y oportunidades sociales posteriores elegibles usan
intervalos mínimos de aproximadamente 1.1–5.2 horas, con mayor separación ante
receptividad débil y demoras normales de horario silencioso/ventana/modelo. No
cambian presupuestos, pausa/exclusión explícitas ni supresión de saludos ignorados.
Ambos clientes muestran ayuda coincidente de iniciativa y usan las cachés existentes
de contacto/historial.

Los grupos pueden desarrollar activamente un hilo social visible, responder a otro
contacto u ofrecer una propuesta relevante sin esperar otro mensaje humano. La
categoría interna de seguimiento distingue ahora curiosidad conversacional de
aclaración necesaria; la revisión final de redacción conserva ambas. Usa las
oportunidades de respuesta acotadas existentes, no un programador de grupos inactivos.
No se agrega temporizador por cliente, caché de borrador, permiso de segundo plano
ni retención de disco. Consulta [iniciativa](initiative.md) y
[participación grupal](groups.md#conversational-participation). Para este ajuste solo
se registran comprobaciones estáticas; quedan por verificar semántica del proveedor
y tiempos en dispositivo/navegador con conversaciones ficticias.

## Preparación de grupos e información de mensajes

La API compartida admite dos preparadores de grupo (cuatro desde la migración 0071),
coordina publicación y exige participación dirigida según
[grupos](groups.md#concurrent-preparation-and-directed-participation-migration-0070).
iOS y web usan este comportamiento. Clic derecho o pulsación larga en web abre el
menú con **Información del mensaje**, incluidos tiempos de primera lectura y
 destinatarios aún sin leer. La caché solo de sesión de 32 entradas reutiliza
instantáneas cargadas/vacías, deduplica, actualiza al abrir/cada cinco segundos
visibles/manualmente e invalida al vaciar, eliminar, perder acceso o cambiar de
cuenta; rechaza respuestas tardías. No se agrega caché de disco ni decisiones
independientes de permisos.

Los controles de responder/reaccionar al pasar el puntero ahora tienen un área
continua con relleno desde la burbuja hasta botones, incluidos mensajes salientes.
El foco de teclado los mantiene visibles; el tacto conserva el menú de pulsación
larga. Sigue pendiente verificar en navegador ambos lados, movimiento diagonal
del puntero, foco, tacto, desplazamiento, pantallas estrechas y multimedia.

## Título fijo del navegador y favicon actualizado

La cabecera Nuxt web establece `title` y un `titleTemplate` constante a **Wildcard**.
Se eliminaron los escritores de título por página/componente y el prefijo de no
leídos; los encabezados visibles siguen describiendo cada pantalla. El favicon
proporcionado el 30 de octubre de 2026 se copia sin cambios a `public/favicon.svg`
y se enlaza con su prefijo SHA-256 (`0c69391a81ea`) para actualizar caché. El pedido
es solo web; no cambia la identidad nativa ni administrativa. Las comprobaciones
estáticas cubren escritores de cabecera, análisis SVG, igualdad con fuente y picos
de muestras de audio. Quedan pendientes navegación/renderizado en navegador y
escucha; no se ejecutaron pruebas ni builds.

## Exportación JSON del chat (01/11/2026)

Detalles de contacto y grupo incluyen **Exportar chat** en ambos clientes, que
 descarga una transcripción legible de esa conversación (web: descarga del navegador;
iOS: hoja para compartir). Misma API, texto y nombre de archivo en ambos. Las
exportaciones omiten las cachés de conversación y se descartan al cancelar, salir,
cerrar sesión o cambiar de cuenta. Consulta [exportación de chat](chat-export.md)
para formato, límites y comprobaciones de ejecución pendientes.

## Descargas JSON de depuración

**Mi cuenta → Exportar JSON de depuración** descarga todo el historial disponible
de chats privados/grupales y registros relacionados de depuración de la cuenta con
sesión, incluidos chats archivados. La explicación informa del contenido privado
y de credenciales/multimedia excluidos; no se carga nada a una IA. La descarga solo
web usa páginas autorizadas secuenciales, progreso/cancelación y límite de 100 MB,
descarta exportaciones fallidas y vuelve a comprobar acceso/historial antes de
guardar. Omite cachés de navegación y borra datos temporales al cancelar, desmontar
o restablecer sesión. Consulta [exportación de depuración](debug-export.md) para
contenido, limitaciones, configuración y verificación pendiente en navegador. iOS
no tiene UI de exportación en esta función explícitamente limitada a web.

## Indicador de investigación y respuestas ágiles (30/10/2026)

Ambos clientes muestran **Investigando...** cuando la presencia privada tiene
`isResearching` (cabecera e indicador entrante) y cuando una fila de contacto o
respuesta de grupo tiene `replyActivity: "researching"` (vista previa de lista,
subtítulo grupal web e indicador entrante en ambos). La burbuja de anuncio y las
burbujas de respuesta desplazadas usan el renderizado de mensajes sucesivos existente;
sin cambios de caché cliente. Lecturas más rápidas en chat abierto, presencia
persistente, Escribiendo durante inferencia para contactos con voz, límite de
escritura de 15 segundos y planificación de rondas grupales son del servidor y
se aplican a ambos. Consulta [chats](chats.md#responsive-orchestration-2026-10-30)
y [grupos](groups.md#round-coordinator-migration-0071).

## Enlaces pulsables en mensajes (30/10/2026)

Ambos clientes hacen accionables URLs `http(s)` directas, hosts `www.` y correos
en mensajes y leyendas humanos y Markdown de contactos, con reglas de detección
coincidentes; consulta [Markdown de mensajes de bots](chats.md#bot-message-markdown).
Web renderiza texto literal mediante `LinkifiedText` (sin HTML), abriendo enlaces
en pestaña nueva. Sin cambios de caché ni API.

## Tarjetas de enlaces (migración 0073)

Web muestra una tarjeta de enlace por burbuja (`LinkPreviewCard`) mediante
`useLinkPreviews`, una caché de sesión solo en memoria, y la caché privada de blobs
de imágenes para la copia API de la imagen, como iOS. Consulta
[vistas previas de enlaces](link-previews.md).

## Para ti (migración 0074)

[Para ti](updates.md) abre en `/updates` desde el botón Feed de la cabecera de lista
(también **Menú → Para ti**). Aparece junto a la lista en pantallas anchas y a todo
el ancho con Volver en estrechas; `/` abre Chats en todos los diseños. Completar
la incorporación abre Chats en ambos diseños. Desde la migración 0086 es una línea
temporal de [publicaciones](updates.md#posts) (`HomePost`): texto del contacto sobre
la tarjeta en marco redondeado, acento por tarjeta, gráficos SVG en línea e imagen
de vista previa del enlace para el titular principal. `?thread=<topic>` muestra
publicaciones de un tema como hilo; `?post=<id>`, una publicación con sus
[comentarios](updates.md#comments) (`HomePostComments`: compositor, puntos de escritura
mientras responde el contacto, Continuar en chat y **Te escribió en privado** debajo
de una respuesta tras la que el contacto [escribió en privado](updates.md#private-messages-from-comments);
el chat muestra la publicación de ese mensaje sobre la burbuja del contacto), y
una píldora fija **N publicaciones nuevas** aparece cuando llegan publicaciones
mientras se está más abajo. `homePosts()` usa publicaciones sin texto desde `cards`
como respaldo si la API no tiene `posts` (por ejemplo, una Preview de rama contra
una API de producción anterior). **Actualizar ahora**, **Temas** y **Seguir** están
en la barra, y un cuadro «¿Qué deberían seguir tus contactos?» abre Seguir; el
corazón es Más como esto, la burbuja abre comentarios y ⋯ ofrece Mensaje, Menos
como esto y Ocultar. La respuesta sugerida de una nota completa el compositor vacío
del contacto mediante `suggestDraft` y nunca se envía automáticamente. La cabecera
contiene título y controles, sin fecha, saludo, briefing ni resumen de colaboradores.
Las publicaciones tienen 24px de relleno superior y 20px inferior, como iOS; los
hilos conservan su diseño compacto conectado. Seguir usa el placeholder genérico
«Un tema que te interese…». La prosa de nuevas publicaciones y tarjetas usa voz
autónoma de línea temporal en lugar de dirigirse al titular; el feed sigue privado
y las publicaciones existentes conservan texto. Desde la migración 0096 una
publicación puede [citar](updates.md#quote-posts) otra de un contacto (`HomePostQuote`,
abre `?post=<id>`), como iOS. **Temas para seguir** es solo web por pedido: columna
derecha fija con [sugerencias](updates.md#topics-to-follow) del editor y botón Seguir
por cada una, visible desde 1100px de ancho (media query; una container query sobre
la página desplazable atraparía el fondo fijo del menú ⋯), oculta en pantallas
menores, durante configuración y sin sugerencias. iOS no muestra sugerencias.

El campo opcional `setup` de la API distingue contactos en creación (**Ir a Chats**),
sin contactos disponibles (**Agregar contacto**, abre Contactos) y círculo listo sin
publicaciones (**Iniciar un chat** / **Seguir algo**). Los estados sin contactos
suprimen el error anterior, compositor y controles de agregar/actualizar; los fallos
reales de primera solicitud siguen mostrando Reintentar. Los feeds con contactos
en creación sondean cada cuatro segundos, reabrir configuración fuerza revalidación
en segundo plano y los cambios de disponibilidad mientras está montado marcan la
respuesta en caché como obsoleta. El código antiguo `HOME_NO_CONTACTS` usa la misma
bienvenida como respaldo. El despacho del servidor espera un contacto listo antes
de iniciar la curación; sin caché, migración ni infraestructura nuevas. Coincide
con iOS; las transiciones de registro/disponibilidad y el comportamiento visual/del
modelo aún requieren verificación en navegador/dispositivo con datos ficticios.
Comportamiento, texto y caché coinciden con la pestaña Para ti iOS (`useHome`,
consulta [caché](caching.md#updates-feed)). El botón Home y el elemento de menú
llevan la [insignia de tarjetas nuevas](updates.md#new-card-badge) (migración 0076),
sondeada por la lista cada 15 segundos y borrada al montar Para ti, como la insignia
de pestaña iOS.

## Menú contextual de lista de chats y menú de mensaje (30/10/2026)

Los tres primeros cambios son solo web: son interacciones de mouse (clic derecho
y pasar el puntero), y el menú de lista se limitó a web por pedido. iOS ya ofrece
menús de fila y acciones al deslizar, y abre reacciones manteniendo pulsado. La
redacción de escritura grupal se comparte con iOS.

- **Menú contextual de lista.** Clic derecho en una fila (o tecla de menú contextual
  con fila enfocada) abre `ChatRowMenu` en el cursor, limitado al área visible:
  **Detalles del contacto**/**Detalles del grupo**, **Archivar**/**Desarchivar**,
  **Vaciar chat…** cuando está permitido (contactos y grupos propios) y, para
  contactos, **Eliminar contacto…**. Vaciar abre una hoja con la misma elección de
  memoria y confirmación de los detalles (`ChatClearActions`); Eliminar usa el
  mismo texto (`contactDeletionWarning`) y sale de un chat o página de contacto
  abiertos hacia `/`. Todas las acciones reutilizan las mutaciones de ciclo de
  vida de sesión (`archiveChat`, `clearChat`, `deleteChatContact`, que ahora también
  olvida energía, conexiones, miniapps y protección de lectura del contacto), para
  igualar la invalidación de caché de detalles; los fallos se muestran en un aviso
  descartable sobre la lista.
- **Objetivo al pasar el puntero.** Los botones flotantes de responder/reaccionar
  aparecen si el puntero está en cualquier parte de la fila de conversación del
  mensaje, no solo en la burbuja, para que acercarse desde arriba o abajo no los oculte.
- **Menú de mensaje.** Clic derecho, pulsación larga o botón de reacción atenúa
  la pantalla con un velo que deja resaltado el mensaje (un recorte dibujado como
  sombra del foco, para que el mensaje no se mueva ni cambien contextos de apilamiento)
  y centra la barra emoji encima y las acciones debajo; pulsar el velo lo cierra.
  Consulta [reacciones](reactions.md).
- **Texto de escritura grupal.** Las vistas previas y el subtítulo web dicen
  «Ana está escribiendo...», «Ana y Bo están escribiendo...» o «4 personas están
  escribiendo...»; proviene de la API y también se aplica a iOS (consulta [chats](chats.md)).

Sin cambios de caché, contrato API ni almacenamiento más allá de la cadena
`replyActivity` formateada. Solo verificado estáticamente (tipos web, tipos API,
`EXPLAIN` de la consulta de resumen grupal en D1 local); no se verificó el comportamiento
en navegador.

## Alias de contacto (31/10/2026, migración 0075)

Editar contacto (`/contacts/:id/edit`) tiene una fila **Alias** para cada titular,
propietario o miembro. Abre una hoja («Solo tú ves este nombre. Los demás siguen
viendo {realName}.») con Guardar, Cancelar y Quitar alias; un valor vacío lo borra.
El campo de renombrar del propietario parte de `realName ?? name`; los miembros
ven el nombre mostrado y, si hay alias, una línea con el nombre compartido. Todo
lo demás lee `name` resuelto por servidor. Solo comprobación estática de tipos
(`npm run typecheck`); comportamiento en navegador sin verificar. Contrato API:
[contactos](contacts.md#contact-alias-private-display-name).

## Primer círculo progresivo (migración 0077, 31/10/2026)

La incorporación ofrece **Crear mis primeros cinco contactos con IA**; sin ello,
la cuenta comienza vacía. Al elegirlo, la persona llega a Chats justo después de
enviar: la lista sigue el círculo (`useOnboarding().refreshStatus`, cada 3 segundos
durante creación), muestra placeholders y luego filas desactivadas «Creando…» para
contactos con `setupPending`, y ofrece Reintentar si falla. El directorio Contactos
también muestra desactivados los pendientes. Coincide con iOS; consulta
[incorporación](onboarding.md#progressive-setup).

## Estilos de personajes (31/10/2026)

Incorporación, **Crear contacto** y generación IA de foto en detalles ofrecen
**Mascotas animadas 3D** y **Personalizado**; este último muestra **Describe tus
personajes** (80 caracteres). Las opciones se cargan con `?custom=1`. Coincide con
iOS; consulta [incorporación](onboarding.md#character-styles).

## Contactos vinculados (migración 0078, 31/10/2026)

`/contacts/:id/links` (**Contactos vinculados** en detalles) lista contactos
vinculados con **Desvincular** y selector para vincular otro propio; los vínculos
son mutuos. Usa caché de `useContactLinks`. Coincide con iOS; consulta
[contactos vinculados](contacts.md#linked-contacts).

## Encuadre contextual e iniciativa de imágenes (0079)

Los contactos eligen la relación de aspecto según sujeto, composición y formato
solicitado, en lugar de generar siempre cuadrados. La API compartida también permite
que la iniciativa privada envíe una imagen y leyenda relevantes sin pedido de foto,
sujeta a exclusión, pausas, horarios silenciosos, consentimiento y presupuestos de
contacto existentes. Hay como máximo un intento por episodio fuente; si falla,
también se retiene la leyenda. Hay avatares actuales propios/humanos disponibles;
el planificador de iniciativa no puede recuperar imágenes anteriores del chat.
Ambos clientes usan historial de adjuntos de asistente y cachés privadas existentes;
no se agrega sondeo ni persistencia. Aplica la migración 0079 mediante release API
automático. Verifica diseño vertical/horizontal, leyendas, visor completo, repetición,
exclusión durante generación, reapertura sin conexión y cambios de cuenta con datos
ficticios en ambos clientes; quedan pendientes comprobaciones de ejecución/dispositivo.
Consulta [imágenes generadas](generated-images.md) e [iniciativa](initiative.md).

## Banners de incorporación y acceso al historial (0081)

Las filas de historial grupal con `event` no nulo (avisos de membresía, migración
0081) se renderizan en `pages/groups/[id]/index.vue` como píldora centrada y atenuada
(`.system-banner` en `assets/css/main.css`, tokens M3) con `text` preparado por
servidor («Lautaro agregó a Mila», «Ana se unió · invitada por Lautaro»). Los avisos
no tienen burbuja, avatar, nombre, confirmaciones, reacciones, respuesta, información
de mensaje ni menú contextual; interrumpen secuencias de burbujas consecutivas, no
usan color de remitente, no se confirman como recibidos/leídos (sin filas de
confirmaciones), no suenan y se omiten al comparar historial en caché con
`lastMessageID` de la lista y al construir la vista previa (`lastGroupChatMessage`).
La marca de no leídos sigue avanzando por secuencia. Una ronda de bienvenida fallida
muestra la línea habitual de reintento debajo del aviso.

Las citas con `beforeJoin` mantienen texto recortado pero no son pulsables (sin
desplazamiento ni carga de páginas anteriores ni descarga) y muestran **Antes de
que te unieras**. En detalles de grupo, el formulario de invitación y hoja de
agregar contacto tienen **Puede ver mensajes anteriores** (activado por defecto,
restablecido cada vez que abre una hoja), con «Desactivado: solo verá mensajes
desde que se una», enviado como `includeHistory`. Los miembros con `includesHistory`
0 muestran **Se unió sin mensajes anteriores**. En `/invitations`, una invitación
grupal con `includeHistory` desactivado reemplaza la frase de historial completo
del consentimiento por «Verás mensajes desde que te unas». Sin cachés nuevas;
consulta [grupos](groups.md#join-banners-and-welcomes). Verificado estáticamente
(tipos); sin verificar renderizado en navegador/dispositivo, teclado ni lector de pantalla.

## Apariencia (31/10/2026)

**Cuenta → Apariencia** elige **Sistema**, **Claro** u **Oscuro** en ambos clientes,
se aplica inmediatamente y se guarda por dispositivo (clave `appearance` de
`UserDefaults` iOS; clave `wildcard-theme` de `localStorage` web), no por cuenta.
Web lo resuelve a `<html data-theme>` con un script `<head>` en línea antes del
primer renderizado, y todos los estilos oscuros ahora usan `:root[data-theme="dark"]`
en lugar de `prefers-color-scheme`. iOS establece `overrideUserInterfaceStyle` de
las ventanas. Detalles y estado de verificación: [apariencia](appearance.md).

## Mensajería privada de contactos compartidos

Como iOS, un humano puede pedir a un contacto compartido entregar un mensaje
específico a otro participante en su chat privado separado, con atribución al
solicitante y sin grupo. La información al compartir lo explica en ambos clientes.
La entrega usa renderizado ordinario de historial/lista/no leídos solo de asistente
y cachés/sondeo existentes; web no tiene push de navegador. No se requiere ruta,
obtención local a vista, caché ni campo de protocolo nuevos. El release API
compartido y migración 0084 habilitan ambos clientes; solo se requieren binarios/
recursos web actualizados para el texto de ayuda al compartir. Consulta
[comportamiento, límites y verificación pendiente](sharing.md#private-messages-between-shared-contact-participants).

La [corrección de respuesta/historial](sharing.md#reply-references-and-authoritative-send-history)
también se aplica a ambos: metadatos del remitente de mensajes reenviados recibidos
resuelven solicitudes humanas explícitas de respuesta, mientras confirmaciones
recientes de envíos guardados y consulta de confirmaciones antiguas fundamentan las
respuestas sobre estado de entrega. Ningún cliente obtiene historial ajeno ni
agrega caché. Las confirmaciones existentes de migración 0084 funcionan sin rellenado
retroactivo ni reinstalación. Las comprobaciones estáticas no verifican semántica
del modelo ni ida y vuelta con dos cuentas en navegador/dispositivo.

### Panel lateral web expandido (01/11/2026)

Este experimento es explícitamente solo web por pedido del usuario; iOS conserva
pestañas nativas. Rutas, secciones activas e insignias no cambian. La lista permanece
montada mediante `v-show`, conservando desplazamiento, Archivados, sondeo y todas
las cachés de sesión. No se agregaron solicitudes ni persistencia. La navegación
en teléfono conserva el menú de cabecera por debajo de 861 px.

La verificación visual sigue pendiente: inspecciona anchos de 861, 1024 y 1440 px
en claro y oscuro, foco de teclado, insignias finales y títulos largos. Cambia
Para ti → Chats → Cuenta → atrás y confirma desplazamiento y selección retenidos.

## Etiquetas de borrador y reacción en la lista (migración 0090)

La segunda línea de una fila muestra **Borrador:** (color primario) con texto no
enviado solo mientras esa conversación no está abierta. Al escribir o revisitar
un chat privado/grupo, su fila mantiene actividad, reacción o vista previa normal;
salir revela texto sin terminar como borrador. Esta regla de visibilidad es solo
web. Por lo demás muestra `You: reacted with 👍` / `Reacted with 👍` /
`<Name>: reacted with 👍` (grupos) si una reacción es más reciente que el último
mensaje. Los borradores siguen en la caché de conversación de sesión (`entry.draft`),
que ahora nunca expulsa entradas con borrador. Solo tipos; verificación de navegador
pendiente. Consulta [vistas previas de lista](chats.md#chat-list-previews).

## Controles de privacidad (01/11/2026)

Cuenta → **Privacidad** tiene **Los contactos comparten entre sí** y **Cómo funciona
la privacidad** (hoja con reglas); los detalles tienen **Mantener este chat privado**;
Contactos vinculados muestra aviso mientras el interruptor de cuenta está activado;
«Hablar de mis chats privados» explica que un chat privado no está disponible.
iOS tiene las mismas filas y texto (`PrivacyGuide.swift`). Consulta
[privacidad](privacy.md). Solo tipos; renderizado de navegador sin verificar.

## Localización (inglés y español, 01/11/2026)

La app web se publica en inglés (predeterminado y de respaldo) y español con
`@nuxtjs/i18n` 10 (`strategy: 'no_prefix'`, sin cambios de rutas ni enlaces profundos).
**Cuenta → Idioma** ofrece **Sistema** (idiomas del navegador: primero inglés o
español; en su defecto inglés), **English** y **Español**; la elección se aplica
en vivo y se guarda por navegador en `localStorage` (`wildcard-language`), como
Apariencia. Fechas y números siguen el idioma de la app. Los mensajes viven en
`apps/web/i18n/locales/<locale>/<area>.json`; componentes usan `useI18n()` y otro
código usa `translate()` de `app/utils/i18n.ts`. Valida con
`node scripts/check-locales.mjs apps/web`.

Diferencia de plataforma: iOS no tiene anulación de idioma dentro de la app. Su
fila Cuenta → Idioma muestra el idioma actual y abre la página de la app en
Configuración, donde iOS ofrece idioma por app (English o Español), para que widgets,
extensiones y diálogos del sistema coincidan siempre. Comportamiento y texto son
iguales en lo demás, incluida la línea de actividad grupal localizada desde
`replyActivityEntries` nuevo de la API y vistas previas traducidas que la API redacta
en inglés. Errores del servidor, texto push y contenido de IA o usuarios quedan
como los envía el servidor. Detalles, catálogos de cadenas iOS y verificación:
[localización](localization.md).
