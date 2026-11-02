# Sitio de marketing

Los builds automáticos usan los [watch paths específicos por dependencia](infrastructure.md#build-watch-paths)
registrados en [workers-build-paths.json](workers-build-paths.json). Mantén la raíz
`/` e incluye la capa Nuxt compartida `packages/ui/*` junto con esta app y los
archivos raíz que intervienen en el build. Los builds de preview siguen desactivados.

`apps/site` es el sitio público de marketing: una página de presentación larga, en
inglés en `/` y en español en `/es` (consulta [Localización](#localization)), que
presenta lo que distingue a Wildcard (contactos independientes con memoria propia,
iniciativa, contactos compartidos, grupos, Para ti, conectores por contacto, código
abierto y alojamiento propio) mediante escenas animadas en HTML, CSS y JavaScript.
No tiene acceso a la API, estado de cuenta ni datos obtenidos de la red, por lo que
las reglas de caché de sesión de [caché](caching.md) no se aplican: cada página es estática.

El pie y la sección de código abierto enlazan a la documentación publicada en el
idioma actual (`/en` o `/es`). Para una instalación independiente, establece el
origen de documentación en `site.docsUrl`, en `app/utils/site.ts`.

## Estructura

| Ruta | Contenido |
| --- | --- |
| `nuxt.config.ts` | Extiende la [capa del sistema de diseño](design-system.md) (`../../packages/ui`), agrega íconos exclusivos del sitio al paquete, configura `@nuxtjs/i18n` y prerrenderiza cada página. |
| `app/utils/site.ts` | Valores específicos de la instalación: URL del sitio (`url`, usada en enlaces canonical y hreflang), URL de la app web, URL del repositorio, `repositoryPublic`, `iosUrl`, anclas de secciones. |
| `i18n/locales/<locale>.json`, `i18n/i18n.config.ts` | Todo el texto, un archivo por idioma; opciones vue-i18n (inglés de respaldo). |
| `app/app.vue` | Cabecera por idioma: título, descripción, Open Graph, `<html lang>`, hreflang, canonical. |
| `app/components/LanguageSwitch.vue` | Enlaces de idioma en el pie. |
| `app/utils/cast.ts` | Contactos de ejemplo, sus retratos de caricatura unificados y sus variantes de estilo de Crear a cualquiera. |
| `app/utils/siteIcons.ts` | Glifos Solar y `logos` fuera del registro compartido, renderizados con `SiteIcon`. |
| `app/composables/useScene.ts` | Línea temporal de escenas: pasos con demoras, reproducción cuando están visibles, pausa fuera de pantalla, bucle y estado final para SSR y movimiento reducido. |
| `app/plugins/reveal.client.ts` | Aparición gradual al desplazarse para elementos `.reveal` (marcados con `data-in`). |
| `app/components/*Scene.vue`, `MoreGrid.vue` | Escenas animadas. `ContactAvatar.vue` muestra los retratos de ejemplo de `public/contacts/`. |
| `app/assets/css/site.css` | Diseño de marketing y vocabulario de chat compartido con la app web (burbujas, puntos de escritura, banners). |

El sitio reutiliza los tokens, Manrope, íconos Solar, `AppButton`, `AppIcon`, `.chip`,
`.avatar`, `.badge` y estilos de `details` de la capa, y copia las reglas de burbujas
de la app web, por lo que un cambio en el sistema de diseño también se refleja aquí.
Evita los nombres de clase ya usados por la capa (por ejemplo `.center`, `.meter`,
`.field`); `site.css` documenta la regla. Los estilos oscuros usan
`:root[data-theme="dark"]` como las apps; el pie contiene el selector Sistema/Claro/Oscuro
(guardado por navegador en `wildcard-theme`, en el origen propio del sitio).

### Escenas y movimiento

Cada escena es una lista de pasos dirigida por `useScene`. El servidor renderiza
el paso final, de modo que el HTML prerrenderizado (y un navegador sin JavaScript)
muestra toda la historia. En el navegador, una escena que comienza fuera de pantalla
se restablece y reproduce al entrar en el área visible; se pausa fuera de pantalla
y se repite mientras está visible. Salir durante el fundido de un bucle borra el
fundido y restablece la escena para que no pueda quedar transparente. Con
`prefers-reduced-motion: reduce`, las escenas permanecen en el paso final, las
apariciones comienzan visibles y las animaciones CSS se detienen en su último
fotograma. Las apariciones por desplazamiento observan elementos nuevos después
del montaje inicial y de la navegación del cliente, incluidos cambios de idioma.
Las secciones son visibles por defecto; la animación finita de entrada solo se
ejecuta después de la observación, para que una inicialización ausente no deje la
página oculta. Nunca agregues clases de tipo `.reveal` desde código DOM simple a
un elemento con un enlace `:class`: Vue reescribe el atributo y las elimina (usa
un atributo, como hace el plugin de aparición).

Las escenas de chat usan `useChatScene` para insertar un borrador escrito, una
pulsación del botón de enviar y luego la burbuja saliente antes de continuar los
pasos originales. Cada teléfono tiene su propio compositor; el borrador usa el
mismo mensaje localizado que la burbuja. Estos pasos comparten la visibilidad y
el comportamiento de movimiento reducido de `useScene`; los estados finales
muestran la conversación completa con compositores vacíos.

### Retratos de ejemplo

Los seis contactos de ejemplo usan una dirección artística Cartoon unificada en
todo el sitio: contornos limpios, formas redondeadas, colores cálidos planos y
fondos crema claros. Los retratos están en `apps/site/public/contacts/cartoon/`.
Solo la escena **Crear a cualquiera** usa los ejemplos originales de estilo de
`public/contacts/`: Cartoon (Mila), Realistic people (Theo), 3D animated movie (Ivy),
Custom «retro video game robots» (Pixel), Anime (Nova) y 3D animated pets (Coco).
`ContactAvatar` usa el conjunto unificado por defecto; solo `CreatorScene` solicita
retratos `showcase`. Los nombres, roles e identidades de los personajes se mantienen
iguales entre escenas.

Ambos conjuntos usan el generador real de retratos de la app,
`apps/api/src/contacts/portrait.ts` (Meta `muse-image-1.0`, con los mismos prompts de
estilo y opciones de solicitud de la creación de contactos). Los textos de apariencia
y personalidad están escritos a mano para estos ejemplos ficticios; en la app,
Muse Spark escribe ese texto. Las imágenes generadas se redimensionan a JPEG de 384 px.

Para regenerar o agregar uno, edita la lista `cast` de
`apps/site/scripts/generate-portraits.mjs` y ejecuta
`node apps/site/scripts/generate-portraits.mjs [id …]` desde la raíz del repositorio.
Esto genera el conjunto de caricaturas unificado. Usa `--showcase` para regenerar
las variantes de Crear a cualquiera con sus estilos individuales. El script lee
`META_API_KEY` de `apps/api/.dev.vars` sin imprimirla, empaqueta el generador con
esbuild (con un stub de `cloudflare:workflows`), llama una vez por retrato a la API
de imágenes paga y redimensiona con `sips` de macOS. Establece `PORTRAITS_OUT` para
probar un prompt sin reemplazar los archivos del sitio. Los fallos de generación
devuelven un código de salida distinto de cero. Agrega los contactos nuevos y ambas
rutas de retratos a `app/utils/cast.ts`.

### Ejemplos de stickers e imágenes de chat

`MoreGrid` usa recursos generados en `apps/site/public/features/`, en lugar de
círculos de avatar o placeholders de degradado. La tarjeta de stickers muestra
recortes de expresiones de Coco y Pixel con transparencia alfa real. Imágenes y
selfies muestra a Ivy en un parque, a Mila en un café y una panadería ilustrada.
Las selfies usan los avatares de caricatura unificados como referencias de identidad;
todos los sujetos son ficticios y las imágenes son escenas generadas.

Ejecuta `node apps/site/scripts/generate-feature-assets.mjs [asset-id …]` para
regenerar estos ejemplos. Los IDs son `coco-sticker`, `pixel-sticker`, `ivy-selfie`,
`mila-selfie` y `bakery`. Lee la misma `META_API_KEY` local que el script de retratos
y llama a APIs pagas de Meta; `FEATURE_ASSETS_OUT` puede redirigir la salida. Genera
primero los retratos de caricatura. La generación de stickers usa los helpers
`photoShowsFace`, `expressionImage` (Muse Image) y `cutout` (SAM 3.1) de la app,
incluidos el sujeto de respaldo predeterminado y la codificación PNG. Las imágenes
de chat usan exactamente el helper `requestImage` de `photos/generation.ts`, expuesto
solo en el paquete temporal de esbuild, con encuadre vertical y referencias de avatar
para selfies. No se reimplementan solicitudes al proveedor ni se crean chats de
producción, registros D1 u objetos R2. El script guarda los PNG transparentes reales
y redimensiona las imágenes JPEG a 640 px con `sips` de macOS; los fallos devuelven un
código distinto de cero. Son recursos locales estáticos, cargados de forma diferida
por las tarjetas, sin llamadas a modelos durante la ejecución.

## Localización

El sitio usa `@nuxtjs/i18n` con la estrategia `prefix_except_default`: inglés
(`en`, `lang="en-US"`) es el predeterminado en `/`, y español (`es`) está en `/es`.
Ambos se prerrenderizan (`nitro.prerender.routes`); `autoSubfolderIndex: false` emite
`es.html`, de modo que el manejo de recursos `auto-trailing-slash` del Worker sirve
`/es` directamente en lugar de redirigir a `/es/`. Cada página lleva alternativas
hreflang absolutas (`en`, `en-US`, `es`, `x-default`), una URL canonical y `og:locale`
construidos a partir de `site.url` (`i18n.baseUrl`). Los enlaces de sección usan
`localePath('/')`, por lo que se convierten en `/es#memory` en la página española;
los enlaces a la app web y al repositorio son iguales en todos los idiomas. La
página 404 es una estructura renderizada en el cliente y sigue el idioma de la URL.

- **Selector:** el pie enumera English y Español con `aria-current` en el actual.
  La barra superior no tiene selectores de idioma ni de apariencia. Cada enlace
  lleva `lang` y `hreflang`, y es un enlace prerrenderizado simple, por lo que funciona
  sin JavaScript.
- **Idioma del navegador:** `detectBrowserLanguage` redirige una primera visita a `/`
  una vez, en el navegador (el sitio es estático y no hay redirección de servidor),
  a `/es` si el navegador prefiere español. Visitar un idioma o usar el selector lo
  almacena en la cookie `wildcard_site_locale` del origen del sitio, y la raíz sigue
  entonces esa cookie. Durante la redirección, Vue informa en consola una diferencia
  de hidratación (el HTML inglés se hidrata en español justo antes de navegar);
  no tiene efecto visible.
- **Mensajes:** `apps/site/i18n/locales/en.json` y `es.json`, con claves por sección
  y escena. Para agregar una cadena, agrega la misma clave a ambos archivos y usa
  `t('key')` en el componente (dentro de `computed` para arreglos de datos, de modo
  que cambiar de idioma vuelva a renderizar la navegación y el pie, que no se
  remontan). Los mensajes no contienen HTML: para énfasis o enlaces dentro de una
  oración, usa `<i18n-t keypath="…">` con slots con nombre. Escapa `@ { } |` como
  `{'@'}`. Los nombres de contactos de ejemplo, marcas, modelos y comandos de
  terminal no se traducen.
- **Texto español:** sigue las mismas reglas de texto de abajo y las convenciones
  de [localización](localization.md): español latinoamericano neutro con «tú».
- **Validación:** `node scripts/check-locales.mjs apps/site` (paridad de claves,
  sintaxis de mensajes, placeholders, claves desconocidas) y `npm run typecheck:site`.

## Reglas de texto

El texto debe mantenerse fiel a las guías de funciones. Las reglas se aplican a
todos los idiomas. Límites destacados que respeta:

- La iniciativa es para chats privados, se detiene después de un mensaje espontáneo
  sin respuesta y puede desactivarse por contacto ([iniciativa](initiative.md)).
- Los temporizadores y alarmas en el teléfono de otra persona requieren un iPhone
  cuyo propietario haya autorizado a ese participante ([control nativo remoto](native-remote.md));
  compartir por sí solo no concede nada.
- El contexto privado llega a un grupo solo mediante la aceptación explícita de
  «Hablar de mis chats privados» ([privacidad](privacy.md)); «Ponme al día» necesita
  contactos vinculados o «Los contactos comparten entre sí».
- Los chats con conectores se aíslan de la memoria compartida ([conectores](connectors.md)).
- «Retro video game robots» es un ejemplo de estilo Custom, no un estilo incorporado
  ([generación de contactos](contact-generation.md)).
- Las voces usan ElevenLabs, por lo que la sección de Meta enumera solo los modelos
  de Meta que están en uso.
- Marcas: Meta `logos:meta-icon`, Apple `logos:apple` y ElevenLabs
  `simple-icons:elevenlabs` (las marcas de un solo color toman el color del texto
  mediante `.mono`).

## Desarrollo local

```sh
npm ci
npm run dev:site        # http://localhost:3002
npm run typecheck:site
npm run build:site      # nuxt generate → apps/site/.output/public
npm run preview --workspace @wildcard/site   # serves the build with wrangler dev on :3003
```

## Despliegue

Consulta [Worker del sitio de marketing](infrastructure.md#marketing-site-worker).
El sitio es un Worker solo de recursos estáticos (`wildcard-site`), publicado por
su propio proyecto Workers Builds; no necesita binding, secreto ni migración.

## Verificación

1 de noviembre de 2026 (localización): pasan `node scripts/check-locales.mjs apps/site`
y `npm run typecheck:site`. `npm run build:site` prerrenderizó `index.html` y `es.html`
con `lang`, hreflang, canonical, título y descripción esperados; el texto visible de
la página inglesa coincidió con el build anterior salvo por el selector de idioma.
En `wrangler dev`, `/` y `/es` responden 200 y `/es/` redirige a `/es`. En Chrome sin
interfaz: sin errores de consola en `/` ni `/es` (de 390 px a 1280 px, sin desbordamiento
horizontal, la navegación cabe desde 900 px), el selector cambia de idioma y establece
la cookie, un navegador español redirige de `/` a `/es` (con la advertencia de
hidratación descrita arriba), y se conserva una elección inglesa almacenada.

1 de noviembre de 2026: pasa `npm run typecheck:site`. La página se ejecutó en
`nuxt dev` y se capturó en Chrome sin interfaz a 1280 px y 390 px, en claro y oscuro,
con movimiento reducido (estados finales) y con movimiento (escenas de memoria y
grupo a mitad de animación y en bucle): sin errores de consola ni desbordamiento
horizontal a 390 px. `npm run build:site` prerrenderizó la página y `wrangler dev`
la sirvió con la configuración del Worker (200 para `/`, página 404 para rutas
desconocidas, hidratación de producción sin errores de consola). El Worker existente
se conectó a Workers Builds mediante el panel el 1 de noviembre de 2026, con builds
de producción activos para `imlautaro/wildcard` / `main`, los comandos documentados,
raíz `/`, previews desactivadas y caché de build activa. Cloudflare informa que el
próximo push inicia el primer build. La conexión se verificó en Settings; no se hizo
push ni despliegue para esta configuración. No verificado: primer release de Workers
Builds, Safari y Firefox, teléfonos reales y lectores de pantalla.
