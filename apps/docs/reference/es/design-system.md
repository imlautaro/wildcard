# Sistema de diseño (Wildcard UI)

`packages/ui` es una [capa de Nuxt](https://nuxt.com/docs/guide/going-further/layers)
que ambas apps de navegador extienden: `apps/web` y `apps/admin` declaran
`extends: ['../../packages/ui']` en `nuxt.config.ts`. El sitio público de marketing
(`apps/site`, consulta [sitio](site.md)) también la extiende, por lo que los cambios
de capa también le llegan; ejecuta `npm run typecheck:site` junto con las demás
comprobaciones. La capa es la fuente única de la apariencia web: componentes Material
3, íconos Solar y onda al pulsar, con una personalización Wildcard encima (tipografía,
espaciado, forma, elevación y movimiento). iOS conserva su diseño nativo SwiftUI;
este documento se aplica solo a las apps de navegador.

## Qué proporciona la capa

| Ruta en `packages/ui` | Contenido |
| --- | --- |
| `nuxt.config.ts` | `$meta.name: 'ui'` (alias `#layers/ui`), `@nuxt/icon` en modo de paquete del cliente, los tres archivos CSS, `<head>` compartido (viewport, precarga de fuente y script de tema en línea que establece `data-theme` y las etiquetas color-scheme/theme-color). |
| `app/assets/css/tokens.css` | Orden de capas de cascada, `@font-face`, roles de color (claro y oscuro), tokens de espaciado, tipografía, forma, elevación y movimiento. |
| `app/assets/css/base.css` | Restablecimiento, tipografía del documento, anillo de foco, barras de desplazamiento, casillas y radios Material, utilidades (`.visually-hidden`, `.muted`, `.small`, `.code`, `.tabular`). |
| `app/assets/css/components.css` | Todas las clases de componentes (catálogo abajo). |
| `app/components/` | Componentes Vue (catálogo abajo). |
| `app/plugins/ripple.client.ts` | Onda al pulsar. |
| `app/utils/theme.ts`, `app/composables/useTheme.ts`, `app/plugins/theme.client.ts` | Preferencia de apariencia (Sistema, Claro, Oscuro); consulta [apariencia](appearance.md). |
| `app/utils/icons.ts` | Registro de íconos (`appIcons`, `AppIconName`), autoimportado en ambas apps. |
| `public/fonts/` | Manrope (SIL OFL), servida por ambas apps. |

Las apps agregan su propio `app/assets/css/main.css` para superficies específicas
(estructura de chat web, conversación, miniapps; barra de administración, tabla de
usuarios y estadísticas). Los favicons siguen siendo por app.

### Capas de cascada

Todas las reglas de la capa viven en capas de cascada CSS declaradas una vez en
`tokens.css`: `ui.reset`, `ui.tokens`, `ui.base`, `ui.components`, `ui.utilities`.
El CSS de las apps y los estilos con alcance de componentes permanecen **sin capa**,
por lo que siempre prevalecen sobre la capa independientemente de la especificidad
o el orden de carga. (Nuxt concatena los arreglos `css` con las entradas de la app
antes de las de la capa, por lo que solo el orden de fuente haría ganar a la capa).
Consecuencias:

- Anula un estilo de la capa desde una app con cualquier selector; no hace falta
  `!important`.
- No envuelvas CSS de la app en `@layer`, o la capa volverá a ganar los empates.
- No uses `!important` dentro de la capa: un `!important` en una capa prevalece sobre
  un `!important` sin capa.

## Tokens

Usa tokens, nunca valores directos, para color, espaciado, tipografía, radio,
elevación y movimiento.

- **Roles de color** (`--md-*`): esquema tonal-spot de Material 3 generado con el
  azul de marca `#045de3` (AccentColor de iOS, conservado como primario claro), con
  neutros (superficies, texto, contornos, `secondary`, velo) que son grises puros
  sin tono. Incluye `primary`, `secondary`, `tertiary`, `error`, los roles personalizados
  `success` y `warning` con sus contenedores, toda la escala de contenedores de
  superficie (`surface-container-lowest` … `highest`, `surface-dim`, `surface-bright`),
  `outline`, `outline-variant`, roles inversos y `scrim`. Los roles oscuros se aplican
  bajo `:root[data-theme="dark"]`, establecido desde la preferencia Sistema/Claro/Oscuro
  del usuario ([apariencia](appearance.md)); nunca escribas reglas oscuras como
  `@media (prefers-color-scheme: dark)`. Los alias anteriores (`--accent`, `--surface`,
  `--separator`, `--danger`, …) siguen resolviéndose; usa los roles `--md-*` en código nuevo.
- **Espaciado** (`--space-*`): cuadrícula de 4 px — `0-5` 2, `1` 4, `1-5` 6,
  `2` 8, `3` 12, `4` 16, `5` 20, `6` 24, `8` 32, `10` 40, `12` 48, `16` 64.
- **Tipografía** (`--type-*`, usados con `font:`): `display-small`, `headline-medium`,
  `headline-small`, `title-large`, `title-medium`, `title-small`, `body-large`,
  `body-medium`, `body-small`, `label-large`, `label-medium`, `label-small`, todos en
  Manrope con pesos ligeramente mayores que los que necesita Roboto. Combina tamaños
  grandes con `--tracking-display`, `--tracking-headline` o `--tracking-title`, y las
  etiquetas con `--tracking-label`.
- **Forma** (`--md-shape-*`): `xs` 4, `s` 8, `m` 12, `l` 16, `l-plus` 20, `xl` 28,
  `xl-plus` 32, `full`. Las listas segmentadas usan `--ui-group-radius` (24) afuera
  y `--ui-group-item-radius` (6) entre elementos, separados por `--ui-group-gap` (2).
- **Elevación** (`--md-elevation-1` … `4`): sombras suaves superpuestas desde un
  neutro casi negro (`--ui-shadow`, sin tono); más fuertes en modo oscuro.
- **Movimiento**: `--md-ease` (estándar), `--md-ease-decelerate` (entrada),
  `--md-ease-accelerate` (salida), `--ui-ease-spring` (cambios de forma y controles,
  pequeño sobrepaso); duraciones `--md-motion-short` 150 ms, `medium` 250 ms, `long`
  400 ms. Cada animación tiene una alternativa con `prefers-reduced-motion`.
- **Diseño**: `--ui-bar-height` 64, `--ui-page-width` 720, `--ui-page-width-wide`
  1120, `--ui-page-gutter` (16, 24 desde 600 px), `--ui-pane-gap` (8, 12 desde
  1280 px), `--ui-pane-radius` 24.

## La personalización Wildcard

Lo que da a las apps una apariencia Wildcard en lugar de Material 3 estándar,
expresado íntegramente como tokens y reglas de componentes:

- **Cambio de forma al pulsar.** Los botones, botones de ícono y FAB pasan de una
  píldora (o círculo) a un cuadrado redondeado de 12 px mientras se pulsan, y vuelven
  con efecto de resorte al soltarlos (Material 3 Expressive). La onda y la capa de
  estado siguen el radio animado.
- **Listas segmentadas.** Los ajustes se leen como un bloque redondeado de 24 px
  cuyas filas se unen con esquinas internas de 6 px y separaciones de 2 px; las filas
  completas (incluidas filas de interruptores, radios y casillas) reciben la capa
  de estado y la onda.
- **Interruptores con marca.** El control crece al activarse, muestra una marca y
  crece un poco más mientras se pulsa.
- **Elevación teñida y línea fina en oscuro.** Los paneles y hojas conservan
  profundidad sin sombras negras duras; los paneles de contenido oscuros reciben
  un contorno sutil.
- **Menús con elementos interiores.** Popovers, menús contextuales y listas de
  selección comparten una superficie de 16 px con elementos redondeados y separados
  de los bordes, y aparecen desde su origen.
- **Hojas con entrada suave.** Los diálogos aparecen gradualmente y suben al abrirse
  (`@starting-style`); las hojas inferiores suben y muestran un tirador.
- **Tipografía.** Manrope con espaciado entre letras más cerrado en títulos y
  encabezados, cifras tabulares para horas y cantidades.
- **Detalles.** Indicador giratorio de grosor variable con el color de texto actual,
  barras de desplazamiento discretas, selección de texto teñida, estados vacíos
  con un disco de ícono tonal y tarjetas de autenticación sobre un resplandor primario suave.

## Componentes

Los componentes Vue se autoimportan en ambas apps. Prefiérelos al marcado manual:
sus props tienen tipos, por lo que el comprobador de tipos rechaza variantes y
nombres de íconos desconocidos. Cada uno renderiza clases de `components.css`,
que siguen disponibles para marcado que un componente no puede expresar (consulta
«Clases sin componente»).

| Componente | Uso | Props y slots principales |
| --- | --- | --- |
| `AppIcon` | Glifo Solar (Linear, o Bold con `filled`). | `name`, `filled` |
| `AppButton` | Todos los botones de texto. Una acción rellena por área de tarea. | `variant` (`filled`, `tonal`, `outlined`, `text`, `danger`, `danger-tonal`, `danger-text`), `size` (`small`, `medium`, `large`), `icon`, `trailing-icon`, `to` (renderiza un enlace), `type`, `block`, `loading`, `disabled` |
| `AppIconButton` | Todos los botones solo de ícono. | `icon`, `label` (nombre accesible y tooltip), `variant` (`standard`, `filled`, `tonal`, `outlined`), `size`, `to`, `selected` (alternancia: `aria-pressed` + glifo relleno), `danger`, `badge`, `badge-label`, `tooltip` |
| `AppTopBar` | Barra superior de una página o panel. | `title`, `subtitle`; slots `leading` (navegación), `title` (título personalizado), predeterminado (acciones, separadas 4 px) |
| `AppListGroup` | Sección de lista segmentada. | `title`, `info` (agrega un `InfoButton`), `footer`; slots predeterminado (filas), `title`, `footer`; otros atributos (`role`, `aria-label`) van al bloque de filas |
| `AppListItem` | Fila de grupo de lista: navegación, acción, apertura de hoja o estática. | `icon`, `to`/`href` (navegación, chevron), `opens` (abre hoja, chevron), `danger`, `plain` (estática), `supporting`, `value` (ajuste actual), `disabled`; slots `leading`, `supporting`, `trailing` |
| `AppSwitch` | Fila de interruptor para ajustes de aplicación inmediata. | `label` o slot predeterminado, `icon`, `supporting`, `info`, `v-model` **o** `checked` + `@change` (recibe el evento nativo; un `checked` enlazado siempre prevalece, para que los manejadores puedan revertir un guardado fallido), `disabled`, `busy` |
| `AppTextField` | Campo de texto con contorno y etiqueta flotante. | `label`, `v-model`, `multiline`, `supporting`, `error`; otros atributos van al input |
| `AppSearchField` | Barra de búsqueda completamente redondeada con botón para limpiar. | `label`, `placeholder`, `v-model`; otros atributos van al input |
| `AppSelect` | Selector Material (lista de menú) para toda lista de opciones. | `options`, `v-model`, `label`, `variant` (`outlined`, `plain`, `tonal`), `placeholder` |
| `AppSegmented` | De dos a cinco opciones mutuamente excluyentes. | `options`, `v-model`, `label` |
| `AppSheet` | Diálogo (pantallas anchas) / hoja inferior (estrechas). | `title`, `icon` + `danger` (diálogo básico con ícono centrado y sin botón de cierre), `wide`; slots predeterminado, `header`, `actions`; emite `close` |
| `InfoButton` | Explica un ajuste en una hoja en lugar de un párrafo al pie. | `label`, `text` |
| `AppNotice` | Información en línea. | `tone` (`error`, `warning`, `success`, `info`), `icon`, `dismissible`; slot `actions`; emite `dismiss` |
| `AppEmptyState` | Contenido vacío o fallido. | `icon`, `title`, `text`; slots predeterminado, `actions` |
| `AppLoading` | Indicador de primera carga con etiqueta. | `label` (predeterminado «Loading…»), `fill` (relleno del placeholder de página) |
| `AppChip` | Etiqueta compacta de estado. | `tone` (`neutral`, `primary`, `success`, `warning`, `error`), `icon` |
| `AppMenuItem` | Elemento de popover `.menu` o menú contextual. | `icon`, `to`, `danger`, `disabled` |

Los componentes exclusivos de web se construyen sobre estos: `PageBar` (un
`AppTopBar` con botón Volver adaptable), `AppAvatar` (caché privada de imágenes),
`IdentityEditor`, los componentes de chat y miniapps.

### Clases sin componente

| Clase | Uso |
| --- | --- |
| `.page` / `.page-inner` (`.wide`) | Página desplazable y su columna centrada. |
| `.field` (`> label`, `.lead-icon`), `.two-line` (`.small` línea de apoyo), `.toggle-label` | Filas personalizadas dentro de `.group` (inputs, valores de solo lectura, filas de actividad). |
| `.choice-row` | Opción de radio con título y línea de detalle. |
| `.check-row` | Casilla de consentimiento junto a su explicación. |
| `.text-block` | Párrafos dentro de un grupo. |
| `.menu` + `.menu-divider` | Superficie de popover y menú contextual (los elementos son `AppMenuItem`). |
| `.badge` | Cantidad junto a una fila o dentro de un control personalizado. |
| `.fab` | Botón de acción flotante extendido. |
| `.link-button` | Acción compacta de texto en línea dentro de texto, avisos y líneas de estado. |
| `.code-box`, `details > summary` | Código copiable; contenido desplegable. |
| `.actions-row` (`.split`) | Botones alineados al final después de una sección. |
| `.card` (`.outlined`), `.divider`, `.spinner` (`.large`), `.meter`, `.avatar` | Contenedores e indicadores. |
| `.auth` / `.auth-card` (`.mark`, `.lead`) | Pantallas de inicio de sesión y de bloqueo. |
| `.large-title`, `.section-label`, `.group-title`, `.group-footer` | Encabezados y leyendas fuera de `AppListGroup`. |

## Reglas de espaciado

- Páginas: `AppTopBar` (o `PageBar`) encima de `.page` > `.page-inner`. La columna
  interior mide 720 px (1120 con `.wide`), con margen lateral adaptable y 64 px de
  espacio inferior.
- Secciones: `AppListGroup` maneja su ritmo: 20 px encima de un título, 8 px entre
  título y filas, 4 px antes del pie y 16 px después. Los grupos consecutivos sin
  título están separados 20 px, igual que un grupo después de otro contenido
  (cabecera de identidad, cuadrícula multimedia); después de un título, aviso,
  campo de búsqueda o control segmentado quedan pegados. No agregues estilos en
  línea `margin-top` entre grupos.
- Los avisos tienen 16 px de margen inferior en el flujo de página; dentro de la
  lista de chats se separan 12 px de los lados.
- Barras: botones de ícono de 40 px con 4 px entre ellos; un título inicial se
  alinea con el margen de contenido de 16 px.
- Las filas tienen al menos 56 px de alto (64 para opciones, 76 para filas de chats),
  con 16 px de relleno horizontal y 16 px entre ícono inicial y texto.
- Hojas: relleno lateral de 24 px (20 en teléfonos), acciones alineadas al final
  con 8 px entre ellas.
- `style="margin…"` o `style="padding…"` en línea dentro de plantillas es una señal
  de problema: usa un componente, una clase de capa o una regla con alcance y tokens
  `--space-*`.

## Capas de estado y onda

Las clases interactivas (`.button`, `.icon-button`, `.link-button`, `.button-row`,
`.fab`, `.menu-item`, `.select-option`, `.segmented button`, `label.toggle`,
`label.choice-row`, `label.check-row`) reciben una superposición de `currentColor`:
8 % al pasar el puntero y 10 % al enfocar y pulsar. `plugins/ripple.client.ts`
agrega la onda mediante un único listener delegado de `pointerdown`; su lista de
anfitriones debe coincidir con los selectores de `components.css`. Los elementos
específicos de app se incluyen mediante `data-ripple` (por ejemplo filas de chat,
botón de envío del compositor y controles de miniapps) y se excluyen mediante
`data-no-ripple`. Las pulsaciones táctiles esperan 90 ms y se cancelan si el puntero
se mueve más de 10 px, para que iniciar un desplazamiento no ilumine una fila. Los
controles desactivados (incluidas las filas con control desactivado) y
`prefers-reduced-motion` no reciben onda. La onda se renderiza en su propia capa de
recorte, para que los anfitriones conserven `overflow: visible` (insignias).

## Íconos

`AppIcon` renderiza íconos [Solar](https://icon-sets.iconify.design/solar/) mediante
`@nuxt/icon` en modo SVG, para que se aplique el CSS que dimensiona `svg`.
`app/utils/icons.ts` asigna cada nombre semántico a un glifo Linear (contorno) y
Bold (relleno); flechas, cruces y otros glifos solo de línea usan Linear en ambos
lugares. `nuxt.config.ts` de la capa incluye exactamente esos íconos en el cliente
de ambas apps (unos 145 glifos, ~125 KB sin comprimir en administración): el proveedor
es `none`, sin respaldo API ni paquete de servidor, por lo que las apps nunca
llaman a Iconify y los Workers no incluyen la colección. Administración también
incluye todo el conjunto compartido; es el costo de un registro único. Agrega un
ícono solo después de confirmar su nombre en
`node_modules/@iconify-json/solar/icons.json`: con `scan: false`, un nombre mal
escrito no renderiza nada en lugar de hacer fallar el build.

## Ampliación del sistema

1. Coloca tokens en `tokens.css` y reglas de componentes en `components.css`, dentro
   de los bloques `@layer` existentes.
2. Si el componente es interactivo, agrega su selector a las listas de capas de
   estado en `components.css` y a `rippleHosts` en el plugin, o usa `data-ripple`.
3. Envuelve el marcado repetido con comportamiento o variantes en un componente
   `App*` de `app/components/`, con tipos para que el uso incorrecto falle en la
   comprobación de tipos.
4. Actualiza las tablas anteriores y ejecuta `npm run typecheck:web` y
   `npm run typecheck:admin`: ambas apps compilan la capa.

## Cadenas integradas

La capa no tiene dependencia i18n. El texto que los componentes renderizan por sí
mismos (botón para cerrar hojas, placeholder de búsqueda y resultado vacío del
selector, botón para descartar avisos, botón para limpiar búsquedas y etiqueta
predeterminada de AppLoading) proviene de `useUiStrings()`
(`app/composables/useUiStrings.ts`), en inglés por defecto. `apps/web` reemplaza las
cadenas cuando cambia el idioma (`app/plugins/locale.ts`); `apps/admin` conserva el
inglés. Todas las demás etiquetas las pasa la app ya traducidas. Consulta
[localización](localization.md).

## Verificación

30 de octubre de 2026: pasan `npm run typecheck:web` y `npm run typecheck:admin`,
y ambos rechazan variantes de componentes y nombres de ícono desconocidos. Ambas
apps se ejecutaron localmente (`nuxt dev` contra `wrangler dev` con D1 local) y se
capturaron en Chrome sin interfaz a 1280 px y 390 px, en claro y oscuro: lista de
chats web, conversación, cuenta, hoja Modelo de chat (diálogo y hoja inferior),
detalles de contacto, detalles de grupo, contactos, conexiones, personalidad,
Updates, inicio de sesión; resumen de administración, usuarios, indicadores,
diálogo de eliminación e inicio de sesión. No verificado: dispositivos táctiles
reales, Safari y Firefox, lectores de pantalla, build de producción y todas las
pantallas restantes (miniapps, tareas, documentos, incorporación, invitaciones,
flujos MCP), que se migraron y comprobaron en tipos pero no se visualizaron.

## Panel lateral de navegación de la app web

La app web usa `NavSidebar.vue` por encima de 860 px: filas horizontales con un
Material Symbol inicial, etiqueta visible y cantidad final, y la fila seleccionada
rellena con el rol de contenedor secundario. El ancho es 224 px, o 192 px hasta
1100 px. Este experimento exclusivo de web usa los tokens existentes de tipografía,
forma, color y onda; iOS conserva las pestañas nativas. Las pantallas web estrechas
conservan el menú de la cabecera de chats. No cambian los componentes UI compartidos
ni la navegación administrativa. Consulta [diseño web](web.md#design) para la
conservación de caché y las comprobaciones visuales pendientes.
