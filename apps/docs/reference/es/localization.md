# Localización

La app iOS, la app web y el sitio de marketing se publican en **inglés**
(predeterminado y de respaldo) y **español**. El español es latinoamericano neutro,
con «tú». El texto inglés es la fuente; cualquier cadena que falte en español usa
el inglés como respaldo.

| Cliente | Mecanismo | Elección de idioma | Mensajes |
|---|---|---|---|
| iOS (`apps/ios`) | Catálogos de cadenas (`.xcstrings`), texto inglés como clave | Idioma por app de iOS (Configuración › Wildcard › Idioma); en su defecto, idiomas preferidos del dispositivo | `Localizable.xcstrings` por destino, `InfoPlist.xcstrings` |
| Web (`apps/web`) | `@nuxtjs/i18n` 10 (vue-i18n 11), claves estructuradas, sin prefijo en la URL | Cuenta › Idioma: Sistema (idiomas del navegador), English o Español; por navegador | `apps/web/i18n/locales/<locale>/<area>.json` |
| Sitio (`apps/site`) | `@nuxtjs/i18n`, `/` inglés, `/es` español, ambos prerrenderizados | Enlaces de idioma en el pie; una primera visita a `/` redirige una vez según el idioma del navegador (cookie `wildcard_site_locale`) | `apps/site/i18n/locales/<locale>.json`; consulta [sitio](site.md#localization) |

El panel de administración (`apps/admin`) sigue solo en inglés.

## Qué no se localiza

Los clientes no traducen el texto producido por el servidor o el modelo:

- Mensajes de error de API que los clientes muestran literalmente (`{ "error": "…" }`
  pasado mediante `serverMessage` en web y la asignación equivalente de iOS). Los
  errores de respaldo del cliente sí están localizados.
- Texto de las cargas de notificaciones push y Web Push creado por la API, texto de
  correo y texto de membresía o sistema que la API almacena como contenido de mensajes.
- Mensajes, publicaciones, comentarios, documentos, tareas, definiciones de miniapps
  y cualquier otro contenido escrito por contactos o personas. Los contactos ya
  responden en el idioma elegido durante la [incorporación](onboarding.md) o solicitado
  en la conversación; esa preferencia es independiente del idioma de la interfaz.

De todos modos se atienden dos casos de la lista de chats:

- **Línea de actividad del grupo.** Los resúmenes de grupo ahora incluyen
  `replyActivityEntries` (`[{ name, activity }]` o `null`) junto a la frase inglesa
  `replyActivity`. Los clientes actuales redactan la línea con las mismas reglas
  («Ana y Bo están escribiendo...»: web `useReplyActivityLabel.ts`, iOS
  `ReplyActivityLabel.swift`). Los clientes anteriores siguen mostrando
  `replyActivity`, por lo que el cambio es aditivo y no requiere migración.
- **Vistas previas que la API redacta en inglés.** Para mensajes sin texto, la API
  guarda una etiqueta inglesa fija en el mismo campo `lastMessageText`/`lastMessagePreview`
  que el texto real: `Voice message`, `Scheduled message`, `Group response`,
  `Working on a task`, `Sticker <emoji>`, `Attachment: <name>` y `<n> photos`.
  Ambos clientes traducen exactamente esas etiquetas al mostrar la fila (web
  `utils/serverPreview.ts`, iOS `ServerPreviewText`) y dejan pasar todo lo demás.
  Un mensaje en el que una persona escriba literalmente una de esas etiquetas también
  se muestra traducido solo en la vista previa de la lista. Las comparaciones con
  valores de la API (ContactsStore, GroupsAPI) siguen usando el texto inglés.
- **Banners de incorporación a grupos** se reconstruyen en ambos clientes a partir
  del campo estructurado `event` (web `pages/groups/[id]/index.vue`, iOS
  `GroupChatView.eventText`); cuando un miembro referenciado ya no está en el grupo,
  usan como respaldo el texto inglés de la API.

## iOS

- `LOCALIZATION_PREFERS_STRING_CATALOGS = YES`; `knownRegions` del proyecto incluye
  `es`, y cada destino (app, widgets, extensiones para compartir y servicio de
  notificaciones) tiene `SWIFT_EMIT_LOC_STRINGS = YES`, para que Xcode extraiga los
  nuevos literales de SwiftUI y llamadas a `String(localized:)` al catálogo de cada
  destino en cada build.
- Un `Localizable.xcstrings` por carpeta de destino: `Wildcard/`, `WildcardWidgets/`,
  `WildcardShare/`, `WildcardNotificationService/`. `WildcardNativeShared/` no tiene
  catálogo propio porque se compila en los cuatro destinos (dos catálogos con el
  mismo nombre de tabla en un destino colisionarían); sus cadenas viven en el catálogo
  de cada destino. `InfoPlist.xcstrings` en `Wildcard/` y
  `WildcardNotificationService/` traduce las descripciones de uso de privacidad.
- Los literales de SwiftUI (`Text("Save")`, `Button`, `Label`, `.navigationTitle`,
  `.accessibilityLabel`, alertas…) se localizan automáticamente. Las cadenas tipadas
  como `String` que llegan a pantalla (errores, tablas de opciones, etiquetas construidas)
  usan `String(localized:)` donde se escribe el inglés. `Text(verbatim:)` y
  `Text(someString)` nunca localizan: úsalos solo para contenido del usuario, del
  servidor o de la IA.
- Las interpolaciones se convierten en especificadores de formato (`"\(count) photos"`
  → `%lld photos`). Los valores españoles con dos o más especificadores usan
  especificadores posicionales (`%1$@`). Los sustantivos dependientes de una cantidad
  usan variantes de plural del catálogo (también las variantes inglesas, para que
  «1 photo» sea singular). Las listas de nombres usan `formatted(.list(type: .and))`;
  fechas y números usan `FormatStyle`, que sigue el idioma de la app.
- Elección de idioma: el idioma por app de Apple. Cuenta › Idioma muestra el idioma
  actual de la app y abre su página en Configuración, donde iOS ofrece English y
  Español. No hay una anulación dentro de la app, por lo que los widgets, extensiones,
  diálogos del sistema y App Intents siempre coinciden con ella.
- `AppShortcuts.xcstrings` (en `Wildcard/`) contiene las frases de Siri y Shortcuts,
  y los resúmenes de parámetros de los dos App Intents (`Open ${contact}`, `Draft ${text} to
  ${contact}`) se agregaron a mano al catálogo de la app porque el compilador por
  línea de comandos no los emite. Su formato de clave no está verificado hasta
  ejecutar un build de Xcode: si Xcode marca esas entradas como obsoletas y agrega
  claves con otra escritura, mueve allí los valores españoles.
- Los catálogos se generaron desde las claves extraídas por el compilador
  (`swiftc -emit-localized-strings`), de modo que cada clave coincide exactamente
  con la fuente; Xcode les da formato de nuevo en el siguiente build.

Para agregar texto de iOS: escribe el literal inglés (o `String(localized:)`),
ejecuta un build en Xcode para que el catálogo incorpore la clave y agrega el valor
español en el editor del catálogo (estado *Translated*). Las claves cuyo inglés
cambia se convierten en claves nuevas; elimina las antiguas cuando Xcode las marque.

## Web

- `apps/web/nuxt.config.ts` registra `@nuxtjs/i18n` con `strategy: 'no_prefix'`,
  `en` predeterminado y de respaldo, y un archivo de mensajes por área e idioma
  (`common`, `errors`, `auth`, `account`, `contacts`, `chat`, `groups`, `updates`,
  `miniapps`). La clave de primer nivel de cada archivo es su área, por lo que las
  claves se leen como `chat.composer.placeholder`.
- `app/plugins/locale.ts` se ejecuta antes del primer renderizado: resuelve la
  preferencia, carga la configuración regional, mantiene `<html lang>` actualizado
  mediante el administrador de cabecera, vincula el compositor global para
  `translate()` y alimenta las cadenas integradas de la capa UI compartida
  (`useUiStrings`, más abajo). Con Sistema seleccionado, un cambio de idioma del
  navegador se aplica en vivo.
- `useLanguage()` guarda la preferencia en `localStorage` (`wildcard-language`:
  ausente = Sistema, `en`, `es`). Como Apariencia, es por navegador, no por cuenta:
  sobrevive al cierre de sesión y nunca se restablece con la sesión. Sistema elige
  el primer idioma del navegador que la app admite; en su defecto, inglés (la misma
  regla que aplica iOS).
- Los componentes usan `useI18n()` / `$t`. El código fuera de la configuración de
  componentes (utilidades, stores, asignación de errores, callbacks después de un
  `await`) usa `translate()` de `app/utils/i18n.ts`, siempre dentro de una función,
  nunca en el alcance del módulo. `appLocale()` alimenta cada formateador `Intl` y
  la ordenación de la UI; `nameList()` une nombres. Las fechas de `utils/format.ts`
  siguen el idioma de la app, no la configuración regional directa del navegador.
- Los mensajes siguen la sintaxis de vue-i18n: interpolación `{name}`, ramas de
  plural `a | b` (la misma cantidad en todos los idiomas), `{'@'}` para un `@`
  literal, sin HTML (usa `<i18n-t>`).

## Redacción del texto en español

- Español latinoamericano neutro con «tú»: imperativos como «Elige», «Revisa»,
  «Inténtalo de nuevo»; botones en infinitivo («Guardar», «Eliminar chat»).
- Evita asignar género al usuario o a un contacto: «Te damos la bienvenida»,
  adjetivos o sustantivos invariables («Paciente», «Formal», «Calma»).
- Conserva exactamente los placeholders, el carácter de puntos suspensivos y los
  nombres de marca o modelo (Wildcard, Meta, Muse Spark, Contributor, MCP);
  Standard es «Estándar».
- La misma cadena inglesa se expresa igual en español en todos los clientes.

| Inglés | Español |
|---|---|
| contact / chat / group / member | contacto / chat / grupo / miembro |
| For you / post / comment | Para ti / publicación / comentario |
| mini app / sticker / task / document | miniapp / sticker / tarea / documento |
| connection / connector | conexión / conector |
| personality / energy / initiative / memory | personalidad / energía / iniciativa / memoria |
| scheduled message / voice message | mensaje programado / mensaje de voz |
| Keep this chat private | Mantener este chat privado |
| Contacts share with each other | Los contactos comparten entre sí |
| Appearance / Language / Account | Apariencia / Idioma / Cuenta |
| Sign in / Sign out / Create account | Iniciar sesión / Cerrar sesión / Crear cuenta |
| Done / Retry / Try again / Add | Listo / Reintentar / Intentar de nuevo / Añadir |

## Capa UI compartida

`packages/ui` no depende de i18n. Sus pocas cadenas integradas (botón de cierre de
hojas, búsqueda y resultado vacío del selector, descarte de avisos, limpiar búsqueda,
etiqueta de carga predeterminada) provienen de `useUiStrings()`, en inglés por defecto.
El plugin web las reemplaza en cada cambio de idioma; el panel de administración
mantiene el inglés.

## Validación

- `node scripts/check-locales.mjs` comprueba la app web y el sitio: conjuntos de
  claves idénticos por idioma, compilación de cada mensaje, coincidencia de placeholders
  y ramas de plural con el inglés, y existencia de cada clave literal usada en la fuente.
- `npm run typecheck:web` / `npm run typecheck:site`.
- iOS: comprobación estática de tipos Swift y columna de cobertura del editor de
  catálogos de cadenas después de un build de Xcode (español debería mostrar 100%).

Comprobaciones en dispositivo (no demostradas por comprobaciones estáticas): en iOS,
elige Configuración › Wildcard › Idioma › Español y recorre la incorporación, los
chats, un grupo, Para ti, miniapps, Cuenta y un widget; en web, elige Cuenta › Idioma
› Español y luego Sistema con un navegador en español, y confirma fechas, plurales,
la línea de escritura del grupo y los errores de respaldo.

## Caché

Las traducciones se incluyen con cada cliente; no se obtiene nada de la API. La web
carga el fragmento de mensajes de un idioma una vez por carga de página. La preferencia
de idioma es una configuración no privada del dispositivo y no se borra al cerrar sesión.
