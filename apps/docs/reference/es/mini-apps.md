# Miniapps

Un contacto puede crear una **miniapp** para una persona: contador o seguimiento
con valores guardados o vista de sus herramientas MCP conectadas («hazme una
miniapp de los gastos de la semana pasada»). Es una especificación JSON declarativa,
no código. Sus pasos de datos forman un grafo acíclico, como un flujo de nodos,
y la vista es un árbol de catálogo cerrado de componentes. Ambos clientes lo
dibujan con componentes nativos propios: listas, cuadrículas y Swift Charts en
iOS y estilo de listas agrupadas en web. Sin web views, iframes ni scripts remotos.

Se abre a pantalla completa: en iOS `fullScreenCover` con cerrar (✕), menú ⋯ y,
si tiene pestañas, `TabView` nativo con una pila de navegación por pestaña. En web,
`/contacts/:id/mini-apps/:appID` con mismo menú, barra inferior de pestañas y
compositor fijado encima.

Primera implementación. Calidad de especificaciones Muse Spark, servidores MCP
reales y presentación en dispositivo todavía sin verificar.

## Uso

1. En privado directo, pide app, contador, seguimiento o dashboard. Herramientas
   ofrecidas para mensajes humanos directos, no programaciones. En grupos, consulta
   [miniapps de grupo](#group-mini-apps).
2. Si usa solo **estado**, entradas, constantes y acciones locales (contador con
   **+**), queda habilitada al crear y abre inmediatamente.
3. Para datos conectados necesita conector asignado con herramientas pertinentes
   habilitadas ([conexiones MCP](connectors.md)). El contacto usa `list_mcp_tools`,
   inspecciona resultado real con `call_mcp_tool` y llama a `create_mini_app`. Una
   tarjeta aparece dentro de su burbuja. Abre y revisa herramientas: **Se ejecuta
   cada vez que abres o actualizas** (lecturas) y **Solo al pulsar y confirmar**
   (escrituras). Elige **Activar miniapp**. Antes no carga nada.
4. Abrir una habilitada ejecuta lecturas, transformaciones y resultado completo.
   Cierra con ✕ (iOS) o atrás (web). Entradas (segmentos/campo) recargan con valores
   nuevos. Las acciones muestran confirmación nativa con texto escrito por contacto
   antes de ejecutar una escritura.

Detalles → **Miniapps** las enumera; cada una puede desactivarse/eliminarse.
Pide cambios al contacto, que pasa `miniAppID` para reemplazar. Todo reemplazo
incrementa revisión y exige revisar otra vez.

## Especificación

`create_mini_app` valida en servidor (`apps/api/src/miniapps/spec.ts`) y devuelve
errores precisos con IDs disponibles para referencias rotas. Límites: 24 KB,
ocho valores de estado, 12 pasos (hasta cuatro `mcp`), cuatro entradas, 16 acciones,
cinco pestañas, seis elementos de menú, 20 componentes superiores por pantalla,
80 totales y un nivel de secciones/cuadrículas.

**Estado** declara valores guardados: `number`, `text`, `boolean` o `list` (hasta
200 objetos planos como `{ "name": "Milk", "done": false }`). `stat`, `progress`
o `list` leen estado por ID, pasos lo usan como `from` y plantillas como
`{"$state": id}`. Estado, pasos y entradas tienen espacios de IDs propios, salvo
que estado y pasos comparten uno porque la vista lee ambos.

**Pantallas.** Contiene `view` (una pantalla) o `tabs`: 2–5 entradas
`{ id, title, icon, view }` en barra inferior nativa. Iconos de pestañas/tarjetas
del catálogo (`home`, `list`, `chart`, `check`, `star`, `calendar`, `clock`, `money`,
`cart`, `bolt`, `folder`, `person`, `chat`, `book`, `trophy`, `heart`, `gear`, `grid`),
mapeados a SF Symbols o SVG propios. `menu` lista hasta seis IDs de acción sin
campos para ⋯, como «Vaciar lista» o «Restablecer». Primero propios y luego
Actualizar, Desactivar y Eliminar. Entradas y pie «Actualizado» solo en primera
pantalla. Una especificación con pestañas almacenada no tiene `view`. La respuesta
resuelta lleva `tabs` y `menu` y `view` de la primera, para clientes antiguos.

**Acciones locales** cambian estado sin herramienta externa:
`{ "id": "add", "label": "+", "set": [{ "state": "count", "op": "increment" }] }`.

| Operación | Estado | Efecto |
| --- | --- | --- |
| `increment`, `decrement` | number | Cantidad 1 por defecto |
| `set` | number, text, boolean | `value` de plantilla, puede usar campos |
| `toggle` | boolean | |
| `append` | list | Añade objeto (escalares pasan a `{ "value": … }`) |
| `clear` | list | Quita todo |
| `set_items` | list | Fija `field` a `value` en cada elemento, por ejemplo reiniciar lista |
| `remove_where` | list | Quita elementos cuyo `field` iguala `value`, por ejemplo terminados |
| `pick` | text, number | Elige en servidor una opción `value` aleatoria o, con `from` y `field`, un elemento aleatorio de lista |
| `assign` | list | Reparte `value` (2–20 textos/números) en `field`: `mode: "shuffle"` (predeterminado) aleatorio y equilibrado, como equipos; `mode: "rotate"` mueve al valor siguiente, como tareas semanales |
| `update_item` | list | Solo acciones de fila: fija campos de `value` en fila pulsada; vacíos quitan campo |
| `remove_item` | list | Solo acciones de fila: elimina fila pulsada |

Local no exige confirmación salvo `confirm`, por ejemplo restablecimiento
destructivo. Las **remotas** (`connectionID`, `tool`, `arguments`) siempre exigen
`confirm`. Componentes ligados a estado (`toggle`, `choice`, `input` y filas de
`checklist`) editan directamente por `POST /:appID/state`. Solo acepta operación
permitida por componente: alternar, elegir opción declarada, fijar entrada o
alternar/quitar fila de lista.

| Paso | Propósito |
| --- | --- |
| `mcp` | Herramienta de lectura habilitada con argumentos de plantilla |
| `const` | Valor literal/calculado |
| `select` | Ruta con puntos como `data.expenses` |
| `filter` | Filas que cumplen todas (`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `after`, `before`) |
| `sort`, `limit` | Ordenar por campo; conservar primeras 1–500 |
| `aggregate` | `sum`, `avg`, `min`, `max` o `count` numérico |
| `group` | Agrupar por campo en `{ key, value, count }` |

`from` solo nombra paso anterior o ID de estado, así que es acíclico por construcción.
Plantillas: literales JSON más expresiones estructuradas:

- `{"$input": id}`, `{"$state": id}`, `{"$field": id}` (solo acciones) y
  `{"$item": field}` (solo fila: campo de la pulsada, como planta regada).
- `{"$date": {"days": -7, "format": "date" | "datetime"}}`, relativo a ahora
  en zona de quien mira.
- `{"$daysSince": "YYYY-MM-DD"}` y `{"$daysUntil": …}`, días enteros desde hoy.
- `$add`, `$sub`, `$mul`, `$div` y `$min`/`$max` sobre 2–8 operandos y
  `{"$round": {"value", "digits"}}`.

Operando ausente/no numérico o división por cero da vacío, no suposición. Nada se
evalúa como código, sin expresiones regulares ni referencias remotas.

Componentes de vista:

- `section` y `grid` (dos/tres columnas de tarjetas `stat`, `progress`, `chart`,
  `text`, `action` sin campos y `tile`). Ninguno anida.
- `tile`: tarjeta en cuadrícula o fila de navegación fuera, con icono, título,
  pie/valor opcional. Abre `tab` o ejecuta acción sin campos.
- `composer`: barra inferior fija con envío para acción de exactamente un campo
  texto/número (pendiente/registro). Uno por pantalla, superior. Si solo añade
  fila con literales y ese campo, los clientes muestran fila inmediatamente.
- `stat`: aislada es número destacado grande; consecutivas comparten cuadrícula.
- `progress`: meta numérica o ID de estado numérico. `style: "ring"` dibuja anillo.
- `list` y `checklist`. La lista de comprobación es para cosas por hacer/comprar:
  tocar alterna booleano `done`, deslizar/✕ elimina. Sin `done` usa primer booleano
  de elementos. Una lista sobre estado o filtro/orden/límite suyo (como sección
  por estado) puede ser `removable` (deslizar/✕). Filas mantienen índice en estado.
  Ambas pueden declarar:
  - `edit`, acción con campos. Pulsar fila (texto en checklist, casilla sigue
    alternando) abre hoja rellenada. El servidor envía `values` por cada campo
    que un `update_item` rellena mediante `{"$field": …}`.
  - `actions`, 1–3 botones de fila sin campos, como «Regada hoy».

  Solo las acciones de fila permiten `update_item`, `remove_item` y `$item`.
  El cliente envía `row: {state, index}`.
- `toolbar`: botón de barra superior de pantalla (máximo dos, nivel superior).
  Añadir se muestra **+**; con campos abre formulario en hoja, sin ellos ejecuta.
- `chart` (`bar`, `line`, `area` o `pie`, dona con leyenda y hasta 12 sectores) y `text`.
- `toggle`, `choice` segmentado e `input`, ligados a estado.
- `timer`: cuenta atrás de dispositivo con iniciar/pausar/restablecer. No se guarda;
  se detiene al cerrar pantalla.
- `action`: botones consecutivos sin campos comparten fila; símbolos cortos `+`
  y `−` lado a lado. Añadir (`+`, incremento/anexado) destaca; uno aislado también
  puede, no filas de opciones. Con campos abre formulario en hoja.
- Campos de acción: `text`, `number`, `date`, `toggle` o `select`. Selección con
  `options` fijas o `from` de lista (etiqueta `labelField`, por defecto `name`)
  elige un elemento guardado, como quién pagó. La acción resuelta lleva opciones
  actuales y servidor valida valor contra ellas.
- `choice` liga estado texto/número.
- `lesson`: cuestionario tipo Duolingo. **Comenzar** abre flujo completo con una
  pregunta por vez, progreso y corazones (1–5, tres por defecto). Opción múltiple
  (2–4 e índice/texto correcto) o escrita (respuesta y hasta cinco grafías aceptadas,
  ignorando mayúsculas, acentos, puntuación y espacios extra). **Comprobar** muestra
  resultado y explicación opcional; fallar cuesta corazón. Agotarlos termina sin
  puntuación y ofrece **Reintentar**. Finalizar añade respuestas correctas a estado
  numérico `xp` opcional por edición directa. Solo acepta `increment` entero
  de 0 al total de preguntas. Hasta 20 preguntas. Respuestas viajan al cliente,
  no son secretas para quien juega.

Los valores llevan formato (`number`, `currency` con ISO, `percent`, `date`,
`datetime`, `text`), formateado con configuración regional de quien ve. Fechas
sin hora son días de calendario sin desplazamiento de zona. Entradas (`segmented`,
`number`, `text`) no se guardan; recalculan vista.

**Tolerancia de salida.** El parser acepta errores comunes sin gastar reintento:

- `spec` como cadena JSON, incluidos corchetes finales sobrantes.
- `type` de componente/paso ausente cuando claves son inequívocas.
- Claves desconocidas de vista, descartadas.
- Opciones numéricas y `confirm: ""`/`true` en locales.
- Filtro abreviado de condición única.
- Actualizaciones `{field, value}` sin `op`, interpretadas como `set_items`.
- `$round` con `digits` hermano.

Lo ambiguo sigue rechazado.

## Verificación antes de entregar

Desde el 31 de octubre de 2026, también rechaza formas que la persona notaría
aunque cada acción funcione (comprobaciones de «diseño» del laboratorio de 24 apps):

- `pick` de opciones fijas cuando se mantiene una lista.
- Dos listas del mismo tipo (mismos campos) separadas por estado/grupo, en vez de
  una con campo de estado.
- Lista de nombres y otra donde se vuelven a escribir libres, en vez de campo
  select `from` esa lista o acción de fila.
- Booleanos mostrados como texto true/false.
- Mismo valor duplicado en pantalla mediante stat, progress o tile.
- Varios botones `set` del mismo estado a fijos en vez de `choice`.

Pestañas sin estado guardado compartido producen advertencia.

`create_mini_app` solo guarda si pasa verificación offline
(`apps/api/src/miniapps/verify.ts`). El contacto recibe todos los problemas,
**no** se guarda y debe arreglarlo o explicar qué no pudo crear. Nada remoto se ejecuta.

**Comprobaciones automáticas**, independientes de tests del contacto:

- Ningún paso falla al abrir (`PATH_NOT_FOUND`, `NOT_A_LIST`, …).
- Cada lectura `mcp` se compara con resultado de esa herramienta inspeccionado con
  `call_mcp_tool` en el mismo turno desde `mcp_execution`. Sin resultado se rechaza.
- Toda acción es alcanzable desde botón, tarjeta, menú o compositor, y toda local
  se ejecuta desde estado inicial con campos de muestra.
- Lista visible inicialmente vacía tiene acción alcanzable que añade.
- Tras usar dos veces cada acción cotidiana, advierte sobre acciones sin cambios,
  estado no usado, gráficos sin puntos y estadísticas sin valor. Son advertencias.

**Tests** (`tests`, hasta ocho, almacenados) obligatorios con acciones locales o
componentes editables. Cada uno empieza en estado inicial y ejecuta:

- `{tap, fields?}` acción local. No se prueban remotas.
- `{edit}` lo enviado por componente ligado; solo si uno visible lo permite.
- `{input}` fija entrada.

Comprueba expectativas:

- `{state, equals | count | includes}`.
- `{step, equals}` para paso calculado.
- `{text}` que debe mostrar pantalla, contra valores crudos, no formateados.

Fallar paso/expectativa informa valor real, por ejemplo
`Test "clear" failed: expected items to have 0 items, got 1`.

Al pasar, resultado incluye `verified: { testsPassed, warnings }`. Prueba que se
comporta según tests, no que capturen el deseo de la persona; las comprobaciones
automáticas reducen sin cerrar esa brecha. Evaluación usa mismo verificador.

Primero se analiza JSON de bloques de texto porque fue lo inspeccionado;
`structuredContent` es alternativa. Prosa da `RESULT_NOT_JSON`. No se admite
extraer texto con modelo: añadiría coste y no determinismo a cada carga.

## Permisos y seguridad

- **Por revisión.** Aprobar guarda `approved_revision` y huellas de definiciones
  exactas. Cada carga/acción comprueba revisión, conector asignado, herramienta
  habilitada y huella intacta. Redescubre catálogo en la misma sesión MCP y rechaza
  cambios (`TOOL_CHANGED`) como `call_mcp_tool`. Valida argumentos contra esquema.
  Si falla muestra **Revisar cambios para continuar**.
- **Clase nueva de ejecución.** Lecturas habilitadas corren al abrir/actualizar
  sin mensaje, aprobado explícitamente al activar. Roles lectura/escritura vienen
  de especificación y aprobación, nunca anotaciones MCP. Una herramienta no puede
  ser lectura y acción a la vez.
- **Estado guardado** en D1 (`mini_app_state`) por app y persona, compartido entre
  iPhone/web. Cada toque es comparación/intercambio de versión con registro en misma
  transacción. Reintentar ID devuelve resultado sin aplicar otra vez. Números
  entre ±10¹², texto hasta 500 caracteres. Valores sobreviven revisiones con ID y
  tipo iguales; si no, `initial`. Estado no se envía al modelo.
- **Escrituras** solo desde acción pulsada y confirmada. Cliente crea UUID por
  envío confirmado y reutiliza en red. `mini_app_action` reserva antes de llamar;
  repetir devuelve estado sin otra herramienta. Validación previa falla como
  `failed`; después de empezar llamada, sin resultado es `unknown`, nunca reintenta
  automáticamente. No garantiza exactamente una vez en proveedor, igual que chat.
- **Ámbito.** Privadas pertenecen a un participante/contacto y sus conectores;
  compartir contacto no las expone. Las [de grupo](#group-mini-apps) son del grupo,
  comparten estado con todos y no usan conectores. Datos resueltos solo van al
  cliente solicitante; no D1, modelo ni memoria. Solo IDs/códigos en `last_error`
  para reparar con `list_mini_apps`. Su salida se limita a unos 20 KB; omite
  especificaciones que no caben.
- **Frecuencia.** Por cuenta/minuto: 120 solicitudes de gestión (toques/ediciones
  locales incluidos), 20 cargas y 10 acciones externas. Cada carga: 20 segundos
  MCP por paso, 1 MiB transporte, hasta 5,000 filas por transformación, 100 grupos,
  100 filas de lista, 60 puntos y 160 KB de vistas entre pestañas.

## Miniapps de grupo

Un contacto puede crear para todos («lista de compras compartida», «marcador del
partido»). Pertenece al grupo: todos abren misma app y ven/editan mismo estado;
un toque se ve en la próxima carga de los demás. Solo estado, entradas, constantes
y acciones locales. `create_mini_app` rechaza `mcp` y remotas porque expondría
conector de un miembro a todos; sin nada que revisar, se activa al crear.

- **Oferta.** `create_mini_app` y `list_mini_apps` de `groupMiniAppTools` solo en
  borrador inicial de respuesta a mensaje humano, como imágenes: no bots,
  preguntas dirigidas ni revisiones. Exploración admite 8,192 tokens como privado.
- **Tarjeta.** Guarda `reply_id`; el mensaje publicado por esa respuesta tiene
  mismo ID y la tarjeta va dentro (`replyID` API). Reemplazar con `miniAppID` mueve
  tarjeta a respuesta nueva. Si se omite/reemplaza borrador tras crear, no hay
  tarjeta de mensaje, pero sí app en detalles → **Miniapps**.
- **Límites.** 20 por grupo y una nueva por respuesta (`<replyID>:app`), por lo
  que repetir devuelve original. Crear/reemplazar requiere respuesta activa y
  reclamo de atención del contacto.
- **Permisos.** Cualquier miembro actual abre/usa/desactiva/elimina, como tareas
  y documentos. Salir quita acceso; eliminar grupo elimina apps, estado y registros.
  Quitar contacto creador conserva app.
- **Verificación.** Mismo verificador/tests que privados, en UTC por no haber una
  sola zona de grupo.

## API

Sesión bearer y contacto propio: `/api/v1/contacts/:id/mini-apps`. Mismas rutas
para grupos bajo `/api/v1/groups/:id/mini-apps` con pertenencia actual; resumen
usa `replyID` en vez de `turnID`.

| Método | Ruta | Comportamiento |
| --- | --- | --- |
| GET | `/` | Hasta 20: estado (`needs_review`, `enabled`, `needs_reapproval`), entradas, herramientas y últimos problemas |
| POST | `/:appID/approval` | `{ revision, allowed }`; activar fija huellas actuales |
| POST | `/:appID/resolve` | `{ inputs?, timeZone }`; devuelve `{ revision, inputs, resolvedAt, view, issues }` o 409 `REVIEW_REQUIRED` |
| POST | `/:appID/actions/:actionID` | `{ executionID, revision, inputs?, fields?, timeZone, row? }`; `row: {state, index}` obligatorio para fila (edición/botones), rechazado en otras. Devuelve `{ status, replayed }`, más `resolution` para locales sin lecturas remotas |
| POST | `/:appID/state` | `{ executionID, revision, timeZone, update, inputs? }`; edición de componente ligado. Devuelve `{ status, replayed }`, más `resolution` sin lecturas remotas |
| DELETE | `/:appID` | Elimina app, estado y registro de acciones |

## Comportamiento del modelo

La descripción empieza por planificar (trabajo principal, cada tipo de cosa guardada
y sus usos, pantalla inicial) y diseño: una fuente de verdad, una lista por tipo,
checklist solo para cosas por terminar, registros editables, añadir mediante
compositor o **+** de barra con hoja en vez de formulario principal, cada número
una vez, `choice` para opciones y pantalla única para simples. Números pedidos son
datos/ajustes, no estructura.

Todos los privados directos exponen `start_mini_app`, `create_mini_app`,
`list_mini_apps` y `read_mini_app` con tres rondas de herramientas (programados dos),
hasta 8,192 tokens y seis ejecuciones. Si falla `create_mini_app` en última ronda
(por ejemplo después de `list_mcp_tools` y `call_mcp_tool`), recibe otra para reparar.
`miniAppInstruction` y descripción indican mencionar app solo si devuelve
`miniAppID`. Si necesita cámara, respuestas IA en vivo, multijugador, notificaciones,
código arbitrario o datos sin conector, o no verifica, debe explicar qué no puede
crear y ofrecer alternativa más cercana. `museCompletion` acepta argumentos de `create_mini_app` hasta
30 KB; antes 1 KB rechazaba casi todo. Riesgo: cuatro llamadas al modelo de hasta
45 segundos más MCP dentro del paso `prepare-reply` de tres minutos. Puede vencer
y usar recuperación sin herramientas. Crear requiere turno activo. Un mensaje
crea una app (`<turnID>:app`), repetir devuelve original; hasta 20 por chat. El
resultado indica que está desactivada hasta revisar, para no afirmar que muestra datos.

### Hablar del contenido guardado (2026-10-31)

En iOS/web puedes preguntar sobre notas, entradas, listas o progreso guardados.
Se indica encontrar con `list_mini_apps` y llamar `read_mini_app` antes de responder,
no pedir pegar contenido. Listar especificación no revela valores actuales.

`read_mini_app` recibe `miniAppID`, `stateID` opcional y `offset` Unicode opcional.
Lee definición/estado actuales en una consulta D1 limitada al contacto propio y
privado de este participante. Normaliza como renderizador: ausentes/incompatibles
usan valores declarados. `hasSavedState`, `savedAt`, `revision` y `stateVersion`
distinguen persistencia de valores iniciales intactos. Devuelve página JSON
`content` de hasta 8,000 caracteres, IDs y `nextOffset`. Otras páginas exigen
`revision` y `stateVersion` devueltas; editar/reemplazar obliga reiniciar en cero.
Contenido grande puede exceder presupuesto de herramientas de turno; debe
reconocer evidencia parcial.

Lee incluso desactivada sin ejecutar conectores, aprobar ni cambiar. Excluye grupos
y apps privadas ajenas, incluso del mismo agente compartido. No en programaciones,
tareas ni solicitudes a grupos. Es dato no confiable, nunca instrucciones, que
permanece en privado. Se conserva aislamiento MCP y Estándar.

`inputs` temporales, formularios no guardados, temporizador local y respuestas
individuales de lecciones no persisten ni se recuperan. XP guardado sí, pero no
prueba respuestas concretas. No almacena ni actualiza resultados de conectores.

Sin cambio de protocolo, migración, servicio ni caché: ambos guardan con la misma
API y el contacto lee D1 en cada solicitud. Ediciones pendientes/fallidas solo
visibles tras guardar bien. Se hicieron tipos API y SQL, no tests, builds, llamadas
ni verificación dispositivo/web. Pendiente con datos ficticios: guardar nota en
cada cliente, cerrar/preguntar, editar/eliminar/preguntar, app intacta, lista paginada
larga, editar entre páginas, desactivada/eliminada y aislamiento tras quitar
contacto/cambiar cuenta.

### Anunciar creación (2026-10-31)

Escribir especificación tarda decenas de segundos; antes dejaba «escribiendo…» sin
mensaje. Privados exponen `start_mini_app` (`announcement`, 1–300 caracteres).
`miniAppInstruction` pide usarlo solo y primero para app nueva/cambio sustancial,
no arreglo rápido ni si debe preguntar. Guarda como primera burbuja con el mismo
helper de [anuncios de investigación](web-research.md) (`chat/announcement.ts`:
solo con atención del intento y antes de otra burbuja; repetir no duplica), sigue
turno y respuesta final en más burbujas. El resultado indica no repetir anuncio.
Da una ronda extra por turno para conservar tres de creación (más reparación).
Guarda `announcement: true`; clientes lo ignoran y recuperación trata un turno
solo de anuncio como no respondido, para recuperar si vence al crear. Sin cambios
clientes: es mensaje ordinario y sigue Escribiendo.

Comprobado el 2026-10-31 con `mini-app-eval.mjs --production --only 1,2,3,4` y
`muse-spark-1.3-contributor` (eval refleja ronda y guarda `announcement`): los cuatro
llamaron primero a `start_mini_app` con mensaje rioplatense corto y los dos terminados no lo repitieron.
Dos vencieron generando, problema de fiabilidad existente; producción ahora
responde con recuperación tras anuncio.

## Caché

Ambos mantienen cachés de sesión: lista por base (`contacts/<id>` o `groups/<id>`,
hasta 20, frescura cinco segundos, sondeo de chat visible) y vista resuelta por
app (hasta 16). Reutiliza vista 60 segundos al navegar porque carga ejecuta lecturas.
Actualizar explícitamente, deslizar, cambiar entrada y completar acción omiten
ventana. Deduplica y rechaza respuestas de entradas anteriores, entradas invalidadas
o cuenta previa. Errores conservan contenido. Aprobar/desactivar/eliminar reemplaza
lista y descarta vista. 404 o `REVIEW_REQUIRED` limpia vista y revalida lista.
Eliminar contacto, perder acceso o salir limpia todo. Vistas solo en memoria,
nunca disco. Consulta [caché](caching.md#mini-apps).

## Toques y latencia

Cada toque es solicitud. Para inmediatez, servidor marca cambios literales:
`updates` en acciones, `state` en estadísticas/progreso y rutas de checklist.
Ambos aplican inmediatamente al estado mostrado, encolan y envían en orden con
ID de ejecución por toque. Cada `resolution` reemplaza base; lo visible es servidor
más toques no confirmados. Fallos transitorios reintentan el mismo ID hasta dos
veces; otros descartan pendientes y recargan. Cada toque local cuesta unas cinco
consultas D1 y no consulta conectores sin herramientas. Cambios no literales
(campos, `pick`, `assign`, cálculos, ediciones y filas) esperan servidor.

## Evaluación y comprobaciones visuales

`scripts/checks/mini-app-eval.mjs` genera desde prompts con `museCompletion`,
definiciones e intérprete reales. Lee `META_API_KEY` de entorno o
`apps/api/.dev.vars` ignorado y nunca la imprime. Usa parser/verificación de
producción (`prepareMiniApp`), reparación incluida, y escribe vistas pobladas como
fixtures (`app-NN.json`, con `tabs`/`menu`) y `results.json` con intentos, problemas,
respuestas y latencia. Debug iOS con `MINIAPP_FIXTURE=<path>` (por ejemplo
`SIMCTL_CHILD_MINIAPP_FIXTURE=… xcrun simctl launch …`) muestra fixture con renderizador
real sin red para capturas de simulador.

El 28 de octubre de 2026 con `muse-spark-1.3-contributor`:

- Diez prompts españoles variados (contador, compras, agua, propinas, pádel,
  hábitos, diario de ánimo, gastos, pomodoro y lectura) pasaron de 6/10 con muchos
  reintentos a 10/10 a la primera tras las correcciones.
- Un conjunto de 20, incluidos diez nuevos (prioridades, días sin fumar, dividir
  cuenta, peso, películas, repeticiones de gimnasio, ahorro de viaje, ruleta de
  cena, rutina matinal y conversor de temperatura) creó 18/20. Un fallo fue 500
  del proveedor y 13 a la primera. Mediana de unos 14 segundos, casi todo modelo.
- Simulador iOS y vista estática web mostraron todas las fixtures creadas.

Después ese día, con pantalla completa, verificación y lecciones:

- Diez prompts de disposición (pendientes con compositor/menú, hábitos con dos
  pestañas e inicio de dos columnas, gastos con dona, agua con anillo, propinas,
  lectura con pestañas, diario con compositor, pádel, gimnasio con pestañas y ahorro
  con anillo) crearon 9/10 verificadas, cada una con 2–3 tests válidos. Solo dos a
  la primera. La mayoría de reintentos fueron JSON texto con tokens sobrantes o
  corchetes desequilibrados. Gimnasio siguió fallando y el contacto dijo no poder
  crear, sin presentarlo. Primero creó una app de relleno, motivando regla «sin
  placeholders» y quitar palabras sueltas sobrantes toleradamente.
- Otra ejecución creó dos cursos tipo Duolingo (inglés con tres lecciones de seis
  preguntas, XP y progreso; capitales sudamericanas de elección/escritas), pendientes
  con `remove_where`, gimnasio y pádel. Rechazó chatbot con IA y escanear tickets
  con cámara con explicación y alternativa, como se pretendía. Mediana unos
  30 segundos por reintentos.

No usaron conectores, turno real ni dispositivo físico. Disposiciones nuevas
verificadas por tipos iOS (SDK simulador) y web (`vue-tsc`), pero no renderizadas
en simulador/navegador.

## Laboratorio de miniapps (importación admin)

Para evaluar en dispositivo, un superadministrador importa especificaciones a un
chat propio desde **Lab** (`POST /api/v1/admin/lab/contacts/:id/mini-apps`, consulta
[admin](admin.md#mini-app-lab)). Solo estado, mismo `prepareMiniApp`, máximo 20 por
chat, IDs `lab:<uuid>` sin turno (sin tarjeta), sin migración. iOS/web no cambian:
abren desde Contacto → Miniapps normalmente.

## Configuración y verificación

Aplica migraciones aditivas `0037_mini_apps.sql` y `0038_mini_app_state.sql` mediante
release automático commit/push. Sin servicio/binding/secreto nuevo;
consulta [infraestructura](infrastructure.md#mini-apps-migration-0037). Comprobaciones:
TypeScript API/web, compilación Vue de páginas/componentes cambiados, tipos Swift
completos de simulador, SQL nuevo contra 37 migraciones en SQLite vacío y ejecución
local del intérprete con gastos ficticios, casos de rechazo y conversiones de ida
/vuelta de especificación normalizada.

Pendiente: calidad Muse Spark con prompt de producción (evaluación usa uno reducido),
cargas/acciones MCP reales, presentación iOS completa con barra, compositor, Charts
y formularios en dispositivo; disposición web estrecha; invalidar permisos al
cambiar herramientas; caché al navegar, cambiar cuenta y revocar acceso.

## Vaciar el chat que las contiene

[Vaciar/eliminar](chat-lifecycle.md) quita miniapps, estado y acciones del chat e
invalida instantáneas iOS/web. Eliminar recibos locales no deshace efectos externos
completados. Archivar conserva miniapps.

## Acceso rápido en Updates

Abrir una habilitada (`POST …/resolve`) cuenta una visita por persona en
`mini_app_usage` (recargas en diez minutos cuentan una, 0074). [Updates](updates.md)
lista hasta ocho habilitadas abiertas, primero más usadas, más creadas en últimos
tres días, como tarjetas que abren completo iOS o página web. Las de grupo cuentan
por miembro separado.
