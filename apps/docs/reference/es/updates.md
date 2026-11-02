# Para ti

Para ti es un feed personal adaptable que los contactos de una persona construyen
juntos. Cada tarjeta trata algo que realmente le interesa (la liga de su equipo,
los plazos de un trámite que espera, las cotizaciones que sigue, un viaje) y la
prepara el contacto más adecuado, con su propio diseño. También ofrece acceso
rápido a las miniapps más abiertas y una agenda de programaciones próximas y tareas
asignadas a la persona.

En iOS, Para ti es la segunda pestaña de la interfaz autenticada (Chats sigue como
predeterminada). En web está en `/updates`: en pantallas anchas es el primer
elemento de la barra de navegación y el destino de `/`; en pantallas de teléfono
se abre desde Inicio en el encabezado de Chats (o **Menú → Para ti**) y `/` va a
la lista de chats.

La función apareció como «Home» (pestaña predeterminada), pasó a «Updates» el
30/10/2026 y se renombró «For you» con ícono Inicio el 01/11/2026. Desde el
02/11/2026 iOS usa el SF Symbol `rectangle.stack` y web el ícono compartido `feed`
(Solar Feed); web enumera Para ti debajo de Chats en el sidebar y `/` abre Chats.
Solo cambia etiquetas y presentación: `/updates`, rutas API, almacenamiento,
insignias, navegación predeterminada y caché de sesión no cambian. El refinamiento
del 01/11/2026 elimina fecha, saludo, briefing y resumen de colaboradores de ambos
clientes. El título y los controles llevan directamente al cuadro para seguir y
la cronología. Las publicaciones tienen 24 puntos/píxeles arriba y 20 abajo, con
separadores; los hilos temáticos conservan su diseño compacto conectado. La API y
el almacenamiento conservan el nombre original: `/api/v1/home`, tablas `home_*`,
`HOME_FEED_ENABLED` y módulo `apps/api/src/home/`; los tipos del cliente son
`HomeFeed`/`HomeCard`.

Es una primera implementación (30/10/2026). Consulta [verificación](#verification).

## Uso

- **Publicaciones** aparecen al terminarlas los contactos, nuevas primero, como
  una cronología Threads/X; una cápsula indica quién prepara qué («Lucía está
  preparando Barça este finde · 2/5»). Cada publicación es un texto breve de un
  contacto, solo (nota) o con tarjeta (consulta [publicaciones](#posts)). Si una
  ejecución añade publicaciones mientras se lee más abajo, **N publicaciones
  nuevas** permite volver al inicio.
- **Deslizar para actualizar** (iOS) o **Actualizar ahora** (web e iOS
  **⋯ → Actualizar ahora**) pide renovar tarjetas de más de 30 minutos; un
  contacto sin novedades no publica. Se ignoran solicitudes dentro del minuto
  posterior a la anterior.
- **Seguir algo** (**+** o cuadro «¿Qué deberían seguir tus contactos?»): describe
  un interés. El campo sugiere «Un tema que te interese…». Quien coordina elige
  diseño y contacto en la siguiente ejecución.
- **Acciones**: el corazón es **Más como esto** y la burbuja (con contador) abre
  la publicación para [comentar](#comments). ⋯ (o pulsación larga en iOS) ofrece
  **Enviar mensaje a {contact}**, **Menos como esto** y **Ocultar de Para ti**.
  La preferencia es por tema; todas sus publicaciones muestran el mismo corazón.
  Los temas ocultos no vuelven salvo que se muestren otra vez en **Temas**.
- **Cronología** (ambos): columna única de publicaciones, cada una encabezada por
  contacto (avatar, «nombre › tema · antigüedad»), texto y tarjeta en marco redondeado.
  Cada tipo muestra un titular, dos partidos, tres cifras/elementos, cuatro filas
  (más la resaltada), gráfico compacto o seguimiento sin pasos hasta **Mostrar
  más**, que revela motivo y fuentes. Próximamente y apps forman una tira de chips
  sobre la cronología.
- **Hilos**: tocar texto o antigüedad (web) o publicación (iOS) abre todas las del
  tema, nuevas primero como la cronología, unidas por línea, con tarjetas expandidas
  y **Responder a**. Una publicación con **N publicaciones en este hilo** tiene
  anteriores. Web lo conserva en dirección (`?thread=<topic>`), iOS en navegación.
- **Notas** pueden sugerir respuesta. Tocarla abre el chat con el mensaje en el
  compositor (solo si está vacío); nunca lo envía automáticamente.
- **Desde un chat**: cuando se pide a un contacto vigilar algo o ponerlo en Para ti,
  llama `add_to_updates`. El tema se atribuye a ese contacto y queda hasta ocultarlo.
- **Tus apps**: miniapps habilitadas abiertas por la persona, más usadas primero,
  más las creadas en los últimos tres días. Las tarjetas abren pantalla completa
  (iOS) o su página (web).
- **Próximamente**: hasta cuatro programaciones activas en las próximas 48 horas y
  cuatro tareas abiertas asignadas a la persona, cada una abre su chat.
- **Insignia de novedades**: pestaña Para ti (iOS), botón y menú (web) muestran
  cuántas publicaciones aparecieron desde la última apertura. Abrir la limpia.
  Consulta [insignia de tarjetas nuevas](#new-card-badge).

El texto fijo de interfaz está en inglés como el resto de la app; los contactos
redactan las tarjetas en el idioma que usa con ellos la persona.

## Primera visita y feeds vacíos

Tras la configuración, ambos abren **Chats**, con progreso del primer círculo,
contactos listos y reintento existentes. El onboarding web navega a `/chats`,
incluida redirección desde `/onboarding` ya terminado; las visitas normales a `/`
en pantalla ancha aún abren Para ti.

La respuesta del feed incluye `setup` opcional: `creating_contacts`,
`needs_contacts` o `null`. El servidor lo deriva de contactos y onboarding actuales
con la misma elegibilidad del despacho y selección de señales: contacto sin
archivar, sin limpieza y ya no `setup_pending`.

- **Creando contactos**: «Tu círculo está tomando forma», con **Ir a Chats**.
- **Ninguno listo ni creándose**: «Siéntete en casa», con **Añadir un contacto**
  que abre Contactos (donde se crean y se aceptan compartidos).
- **Listos sin publicaciones**: «Un feed que crece contigo», con **Iniciar un chat**
  y **Seguir algo**. La generación real sigue mostrando progreso.

Son bienvenidas, no fallos. El cuadro y controles de añadir/actualizar esperan
contactos listos; apps y agenda siguen disponibles. Las publicaciones en caché
permanecen si se pierden contactos. `HOME_NO_CONTACTS` de APIs anteriores se
interpreta como bienvenida sin contactos en ambos. Los fallos reales ofrecen
Reintentar.

El despacho espera un contacto listo antes de reservar Workflow o invocar modelo.
Un feed ya visto sigue pendiente mientras esté vacío para que el siguiente GET o
Cron lo inicie al quedar listo el primero. Los fallos antiguos por falta de contactos
son elegibles inmediatamente con uno listo. Si desaparecen entre despacho y
planificación, termina en espera, sin error ni avanzar `generated_at`, y vence de
nuevo en un minuto. No requiere esquema ni servicio nuevos.

Los snapshots usan la caché de feed de sesión. Mientras se crean contactos, el
feed visible consulta cada cuatro segundos. Volver a configuración revalida de
inmediato en segundo plano y cambios de identidad/disponibilidad invalidan el
snapshot (mientras esté montado en web; desde la interfaz iOS). El servidor, no la
lista del cliente, decide disponibilidad. Consulta [caché](caching.md#updates-feed).

## Tarjetas

Son datos declarativos de catálogo cerrado, validados por `apps/api/src/home/cards.ts`
y dibujados nativamente (SwiftUI, Swift Charts y Liquid Glass iOS; Material 3 y
SVG en línea web). No se renderizan HTML, scripts ni recursos remotos; los enlaces
se abren solo al tocar y solo si son URLs públicas `http(s)` sin credenciales.

| Tipo | Diseño | Uso típico |
| --- | --- | --- |
| `headlines` | Noticia principal (con imagen de vista previa si existe) y hasta cuatro filas | Noticias de liga, empresa o política |
| `matches` | Calendario/resultados con puntuación y estado (rojo en vivo) | Próximo partido y resultados recientes |
| `table` | Tabla compacta con fila opcional resaltada | Clasificaciones, comparaciones |
| `metrics` | Hasta seis cifras con cambio y tendencia | Cotizaciones, gastos mensuales |
| `chart` | Gráfico de líneas/área o barras con valor principal | Cotización o saldo en el tiempo |
| `tracker` | Cifra grande, barra de progreso y cronología de pasos | Plazo de trámite, envío |
| `note` | Publicación centrada en texto: solo texto del contacto, con rara respuesta sugerida opcional | Opinión, reacción, recomendación, predicción o dato llamativo ([formatos](#post-formats)) |
| `list` | Filas numeradas con detalle y valor final | Lista de viaje, lanzamientos, eventos |

Cada una tiene título, subtítulo opcional, ícono y acento de conjuntos cerrados y
hasta cinco fuentes. Máximo 12.000 caracteres JSON. Frescura: partidos/métricas
2 horas, titulares 4, gráfico 6, nota/tabla/lista 12, seguimiento 24.

## Publicaciones

Desde el 01/11/2026 (migración 0086), Para ti es una cronología. `home_card` conserva
la tarjeta más reciente por tema para programar ejecuciones, editor/revisiones,
y sigue devolviéndose como `cards`; cada tarjeta publicada se añade además a
`home_post` como publicación:

- **Texto**: una o dos frases breves (máximo 280 caracteres) con voz del contacto,
  autónomas para cronología social: iniciar con noticia, observación u opinión sin
  dirigirse al titular, «tú/tu», referencias al chat privado, consejos personales
  ni pregunta final para él. Prosa y notas siguen lo mismo, sin saludos, firmas ni
  hashtags. El contexto personal selecciona temas; no publica datos, añade lectores
  ni cambia acceso. Son instrucciones del modelo, no filtro determinista; se
  conservan publicaciones existentes. Una nota no tiene texto separado: su texto
  es la publicación. Las tarjetas anteriores se copiaron como publicaciones sin
  texto que muestran solo tarjeta.
- **Sin novedades**: al recomponer un tema ve tarjeta previa y hasta tres
  publicaciones anteriores fechadas y puede devolver `{"action":"no_news"}`.
  No publica, cuenta la tarjeta fresca durante su plazo (sin adelantar próxima
  ejecución) y, a diferencia de [omitir](#skipped-topics), nunca penaliza el tema.
  Se instruye no repetir lo mismo con otras palabras. Igual paga llamada al modelo
  (y búsqueda) que no encuentra novedades.
- **Respuestas**: una revisión de [evaluación](#contacts-review-cards) es publicación
  del revisor que responde a la última del tema («Respondiendo a {contact}»).
- **Orden y retención**: la API devuelve las 50 más recientes de temas activos de
  los últimos 14 días. Las anteriores se borran al siguiente ciclo; ocultar tema
  borra al instante sus publicaciones, y las de temas retirados salen con él
  (se borran con el tema siete días después).
- **Idempotencia**: máximo una publicación por tema por ejecución
  (`<topic>-<revision>`, más `-review`); repetir un paso reescribe la propia.

Los clientes vuelven a una publicación sin texto por tarjeta si no hay `posts`
(API previa a 0086), así cualquiera puede publicarse primero.

## Formatos de publicaciones

Desde el 02/11/2026 se pide a editor y compositores escribir como una cronología
seguida por su perspectiva, no tablero (solo prompts, en `home/curator.ts` y
`kindGuide` de `home/cards.ts`):

- **Primero texto**: `note` es publicación nativa (opinión, reacción, recomendación,
  predicción, dato llamativo o resumen corto; mejor menos de 280 caracteres), no
  último recurso sin datos. Su respuesta sugerida (`prompt`) es opcional y rara.
  Los clientes ya muestran notas como texto, sin cambio necesario.
- **Mezcla**: al menos un tercio de temas debe centrarse en texto; diseños de datos
  (partidos, métricas, tabla, gráfico, seguimiento) son para cifras que cambian.
  Intereses incluyen cultura, personas, ideas, hobbies, profesiones y lugares;
  los temas deben ser específicos.
- **Voz**: un ángulo por publicación, nombres/cifras concretos, sin relleno; un
  enlace compartido es tarjeta `headlines` con un elemento bajo el texto. Los
  briefs describen el tema, no a la persona, y se evita segunda persona implícita
  («si estás…») y «tú/tu».
- Se distribuyen temas entre contactos para voces distintas.

Son instrucciones, no validación; catálogo y límites no cambian. Desde entonces
el texto de una nota (en su tarjeta) cuenta como texto para `earlierPosts` y citas;
antes los temas de notas no veían notas anteriores, favoreciendo repetición.

## Publicaciones citadas

Desde migración 0096 puede citarse una publicación reciente de otro contacto como
en X. Cada compositor (no revisiones ni temas de conectores) recibe hasta seis
`otherContactsPosts`: de los últimos tres días, otros temas y contactos, nunca
conectores, con texto de notas incluido. Puede añadir `"quote":"q<n>"` a la
respuesta de publicación si aporta (acuerdo con giro, desacuerdo, dato); la mayoría
no cita. El servidor mapea referencia a ID y guarda en `home_post.quote_of` solo
si aún existe para la misma persona y no es de conector.

- **Feed**: cada publicación tiene `quote: { id, contactID, contactName, contactPhotoVersion,
  text, title, createdAt } | null`, solo mientras el tema citado esté activo.
  Eliminar la citada limpia el vínculo (`ON DELETE SET NULL`).
- **Clientes**: muestran la citada en recuadro con borde (avatar, nombre, tema,
  antigüedad, hasta cuatro líneas) debajo de texto o nota; tocar abre publicación
  y comentarios (web `?post=<id>`, iOS `.updatesPost`). Una citada fuera de las
  50 devueltas se abre como «ya no disponible».
- **Comentarios**: quien responde un comentario en una cita también ve la citada
  (`yourPost.quoting`).
- Los clientes anteriores ignoran `quote` y muestran sin ella.

## Exploración de noticias

Antes de planificar, una ejecución puede explorar la web en busca de novedades de
esta semana sobre los intereses de la persona, para que los temas reaccionen a
lo ocurrido realmente (`scanNews` en `home/curator.ts`):

1. Si existe una exploración de las últimas ocho horas (`home_research` con
   `topic_id =
'news-scan'`), se reutiliza sin coste.
2. Si no, una llamada pequeña al modelo (`reasoning: minimal`) redacta una consulta
   pública desde lo que recuerdan los contactos, mensajes recientes y temas
   seguidos. Se le indica combinar de dos a cuatro intereses concretos y no incluir
   nombres, contactos, detalles privados, salud ni dinero; devuelve consulta vacía
   cuando hay pocos intereses.
3. La consulta usa la vía de investigación de Para ti (`homeResearch`), con los
   mismos presupuestos y repetición que las búsquedas de los compositores.

El informe recortado llega al editor como `worldThisWeek` y a compositores sin
conectores como `whatsNewThisWeek`, con sus fuentes. Cualquier fallo permite
planificar sin él. Como las consultas de compositores, lo redacta un modelo bajo
instrucciones, sin filtrado determinista.

## Temas para seguir

El editor también devuelve hasta cinco `suggestions` `{ title, reason }`: temas
cercanos a los seguidos (equipo rival, creador relacionado, evento próximo o algo
de la exploración de noticias) que no estén seguidos ni ocultos. Reemplazan la
lista anterior de `home_feed.suggestions_json` (0096) en cada plan y `GET /home`
los devuelve como `suggestions`, excluyendo títulos que ya coincidan con un tema.

En web, desde 1100px de ancho (el panel junto al raíl tiene entonces unos 1000px),
una columna fija **Temas para seguir** aparece a la derecha del timeline, como
la barra lateral de X. **Seguir** envía título por `POST /home/topics` existente,
que inicia ejecución; **Seguir otra cosa** abre hoja de seguimiento. Se oculta
sin sugerencias, durante configuración y en pantallas menores. **Solo web** por
petición: iOS ignora `suggestions` por ahora.

## Comentarios

Desde 2026-11-01 (0086, `home_comment`), la persona comenta una publicación y
responde allí el contacto autor, como respuestas bajo Threads. La burbuja abre
publicación (web `?post=<id>`, iOS vista **Publicación** navegada) con comentarios,
compositor («Responder a {contact}…») y **Continuar en chat con {contact}**.

- **Una fila por intercambio**: texto humano de 1–1,000 caracteres y respuesta
  del contacto (`pending`, `complete` o `failed`), como turno. Una pendiente por
  publicación (`409` si no), hasta 20 comentarios; sin respuesta en cinco minutos
  aparece fallida y deja de bloquear.
- **Respuesta**: `POST /home/posts/:id/comments` inicia instancia `home-comment`
  de `CHAT_WORKFLOW` (un reintento). Responde con su voz y en idioma del comentario,
  de una a tres frases salvo pedido mayor, usando publicación, tarjeta,
  comentarios anteriores y recuerdos coincidentes sobre la persona. Puede hacer
  una búsqueda `research_web` (presupuestos diarios Para ti) y nunca inventa cifras.
  No actúa desde comentarios: para recordatorios, tareas o charla larga puede
  [escribir en privado](#private-messages-from-comments) o dirigir al chat.
  Publicaciones de conectores y contactos aislados usan Estándar sin investigación
  ni memorias; si no, modelo de cuenta, con alternativa Estándar si falta
  consentimiento Contributor del contacto.
- **Continuar en chat**: abre privado con publicación adjunta al próximo mensaje
  ([Continuar en chat](#continue-in-chat)). Independientemente, contexto privado
  incluye como historial no confiable las dos publicaciones comentadas más recientes
  de los últimos tres días (texto, tarjeta recortada y comentarios), excluyendo
  conectores, para retomar sin repetir. No en aislados, programaciones ni tareas.
- **Sondeo**: mientras hay respuesta pendiente consulta feed cada pocos segundos
  (web reinicia inmediatamente temporizador en vez de esperar los 60 segundos).
- **Retención**: comentarios se eliminan con publicación (14 días, tema oculto,
  cuenta eliminada).

## Mensajes privados desde comentarios

Desde 2026-11-01 (0088), el contacto que responde también puede decidir escribir
en su privado como mensaje que inicia. El comentario aún recibe respuesta corta
(«te escribo por privado…») y llega el mensaje al chat con publicación encima,
como [Continuar en chat](#continue-in-chat), pero del lado del contacto.

- **Cuándo**: decide mediante `privateMessage` opcional junto a `reply` en JSON.
  Se indica hacerlo solo si conviene uno a uno (la persona pide recordatorio,
  tarea o plan, comparte algo personal o quiere hablar más) y `null` en la mayoría.
  El mensaje debe sostenerse solo, ofrecer siguiente paso o la pregunta necesaria,
  sin afirmar haber hecho nada: herramientas solo corren cuando la persona responde.
- **Límites**: uno por publicación; solo si permite escribir primero
  (**Iniciativa**, `contact.initiative_enabled`), nunca conectores, ni chat vaciándose
  o contacto archivado. Si no se permite, no se ofrece opción y sigue el texto
  anterior de continuar en privado. No cuenta ni inicia presupuestos de
  [iniciativa](initiative.md); como entrada humana nueva termina episodio pendiente
  de ese chat. Su push es el habitual, suprimido con chat abierto.
- **Almacenamiento**: `chat_turn` con `user_text = ''`, `status = 'complete'`,
  publicación en `home_post_id`/`home_post_json` y `home_comment_id` del comentario.
  ID `home-dm-<comment id>`, `home_comment_id` único; escrito en mismo lote D1 que
  completa comentario y solo si sigue pendiente, para no duplicar al repetir Workflow.
- **Contexto**: después lo lee como mensaje propio, marcado como escrito en privado
  tras comentario en esa publicación (sin marcador humano «respondiendo a tu
  publicación»); el [contexto de discusión](#comments) mantiene comentarios.
- **Clientes**: comentarios del feed llevan `privateMessage: true`, mostrado
  bajo respuesta como **Te escribió en privado**, que abre chat sin adjuntar otra
  vez. Ambos muestran referencia sobre primera burbuja del contacto si turno tiene
  `homePost` y no contenido humano. Antiguos ignoran flag y muestran sin publicación.

## Continuar en chat

Desde 2026-11-01 (0087), **Continuar en chat con {contact}** abre privado con
publicación adjunta al siguiente mensaje, como responder a historia. Compositor
la muestra sobre campo (✕ para quitar); enviado la muestra encima de burbuja y
pulsar abre publicación (web `/updates?post=<id>`, iOS vista **Publicación**).

- **Referencia, no cita**: `POST /contacts/:id/chat/turns` acepta
  `homePost: "<post id>"` y guarda `chat_turn.home_post_id`. Debe ser de la persona,
  escrita por contacto de ese chat y no conector (`400` si no); en conectores botón
  solo abre chat porque su contenido nunca entra a privado.
- **Lee publicación actual**: el contexto indica que responde a lo publicado por
  el propio contacto, con texto, tarjeta recortada y hasta seis comentarios para
  hablar directamente. Turnos posteriores guardan marcador corto de título/texto.
  Mensajes que responden publicación nunca se agrupan con otros.
- **Caducidad**: se eliminan tras 14 días o con tema, así que sin FK.
  `home_post_json` conserva `{ title, text, icon, accent, createdAt }` del envío;
  después devuelve `homePost.available: false` con instantánea («Ya no está en
  Para ti») y se indica al contacto que desapareció y qué decía.
- **Turnos** devuelven `homePost: { id, available, title, text, icon, accent, createdAt } | null`.
  Antiguos lo ignoran; APIs antiguas rechazan `homePost`, publica primero API.

## Cómo funciona la selección

Una **ejecución de selección** es instancia `kind: 'home'` de `CHAT_WORKFLOW`
existente (`apps/api/src/home/workflow.ts`), iniciada por Cron por minuto
(`dispatchHome`) o solicitud API, con paso duradero por fase:

1. **Plan** (una llamada, salida estructurada). Editor lee las
   [señales](#what-for-you-reads) y devuelve 2–8 temas ordenados, cada uno con
   disposición, contacto responsable, necesidad de web/conector, motivo visible,
   hasta cinco [temas para seguir](#topics-to-follow) y briefing de una frase
   conservado en API por compatibilidad (clientes actuales omiten en cabecera).
   Primero recibe [exploración de noticias](#news-scan) si hay. Conserva siempre
   temas pedidos por persona/contacto; los de selector omitidos se retiran con
   tarjetas cuando quedan obsoletas (nunca descarta una reciente por un solo plan).
   Retirados se borran a siete días. Ocultos llegan como «no recrear».
2. **Componer** (paso por tarjeta, hasta seis, pedidos primero y luego orden del
   plan). Solo temas nuevos, caducadas y tras actualización manual mayores de
   30 minutos. Contacto escribe con su voz, personalidad y especialidades,
   recuerdos pertinentes, tarjeta anterior, publicaciones previas del tema y
   títulos de otras tarjetas. Puede `research_web` (una por tarjeta, cuatro por
   ejecución) y para conectores `list_mcp_tools`/`call_mcp_tool` (tres lecturas por
   tarjeta), luego publicación (texto y tarjeta), [nada nuevo](#posts) u omitir
   con motivo. Inválida tiene una ronda de reparación; omitir mantiene anterior
   una hora y queda registrado (consulta [omitidos](#skipped-topics)). Guarda cada
   tarjeta al estar lista para llenar progresivamente.
3. **Finalizar**. Próxima automática al caducar primera tarjeta (entre una y doce
   horas) o diez minutos tras fallo.

4. **Revisar** (desde 2026-10-31; consulta [revisiones](#contacts-review-cards)).
   Contactos que saben más revisan.

Las escrituras se protegen por revisión por persona: un reclamo nuevo vuelve
no-op a las antiguas, y una ejecución sin terminar en 45 minutos puede reclamarse
otra vez. Automáticas solo si abrió Para ti en últimos tres días; nunca abierto,
nunca ejecuta.

Disparadores: primera visita, **Actualizar ahora**/deslizar, seguir tema, volver
a mostrar oculto, `add_to_updates` del contacto (Cron recoge tras primera visita)
y caducidad.

## Temas omitidos

Un compositor puede responder `{"action":"skip","reason":"..."}` sin nada honesto
que mostrar. Desde 2026-10-31 (0080) conserva `skips` consecutivos y `skip_reason`
último, una línea inglesa de hasta 200 caracteres:

- Editor recibe `skippedRuns`/`lastSkipReason` y debe reasignar a mejor informado,
  reescribir instrucciones o descartar tema del selector, no devolver sin cambios.
- Tema del selector omitido tres veces (`homeLimits.skipsToRetire`) se retira con
  tarjeta. Pedidos por persona/contacto nunca así; hasta que la persona oculte.
- Publicar restablece ambos. Omitir en [revisión](#contacts-review-cards) solo
  conserva y no cuenta.

## Los contactos revisan tarjetas

Antes solo escribía el asignado, y podía publicar débilmente mientras otro tenía
conversación más abundante/reciente del proyecto. Tras componer, `home/review.ts`
comprueba feed sin llamada al modelo:

1. Para hasta ocho sin conector, construye consulta de texto completo con palabras
   específicas del título (cuatro letras mínimo, sin comunes) y cuenta por contacto
   turnos privados completos coincidentes de últimos 60 días y fecha más reciente.
   Excluye programaciones, tareas, solicitudes de grupo, archivados, en creación
   y aislados por conectores.
2. Candidata si otro tiene al menos dos coincidencias, última posterior a tarjeta
   y más coincidencias o una más reciente que autor. El más reciente revisa;
   máximo dos por ejecución.
3. Compone otra vez con prompt normal, tarjeta anterior y hasta seis turnos propios
   coincidentes (fechados, 400 caracteres por lado, no confiables), indicando
   revisar solo con hechos más nuevos/completos o saltar. Sin web ni conectores.
4. Revisión reemplaza tarjeta (nueva revisión/fecha), se publica como respuesta
   al último post del tema (aparece en [badge](#new-card-badge)), mueve tema al
   revisor y motivo «{contact} actualizó esto con detalles más recientes de tus
   chats». Omitir conserva. Cada revisión es paso Workflow con un reintento y
   protección de revisión de ejecución.

Ocurren en selecciones: el mejor informado alcanza en próxima automática/pedida
(una a doce horas o **Actualizar ahora**), no tras chat inmediatamente. Solo lee
su propio chat con persona, ya parte de datos propios usados por Para ti.

Comprobado el 2026-10-31 con `muse-spark-1.3-contributor` y ficticios: nota «Proyecto
Lumen» decía idea; revisor cuyo chat decía beta con 40 usuarios y pagos próximos
publicó seguimiento con esos hechos; con extracto antiguo «pensando en la idea»
omitió. SQL de revisión se ejecutó en D1 local de workerd.

## Qué lee Para ti

Solo filas propias: contactos (nombre, descripción de personalidad/especialidades,
conectores asignados), recuerdos de cualquier contacto sobre la persona (hasta
60 hechos recientes `contact_memory` entre todos), últimos 30 mensajes privados
propios y 12 grupales, herramientas de lectura aprobadas, miniapps/uso,
programaciones activas, temas, feedback y tarjetas actuales.

Los chats mantenidos privados ([privacidad](privacy.md)) se excluyen de memorias,
mensajes y revisiones. Privados/grupos aislados (`mcp_private_contact`,
`mcp_private_group`) no entran en señales: su historial nunca llega a Contributor.
Combinar conocimiento de contactos propios es intencional: seleccionan juntos.
Nunca lee memorias/mensajes de otros participantes de compartidos/grupos ni
reescribe resultado a memoria de contacto. [Noticias](#news-scan) convierte señales
en consulta pública solo sobre intereses. JSON en D1 (`home_card`) hasta reemplazar,
retirar, ocultar o eliminar cuenta.

## Conectores en Para ti

Un tema de conector permite al asignado leer datos propios: cambio de divisa o
gastos del mes pasado desde finanzas personales.

- Cualquier conector de cuenta, asignado o no al contacto (decisión inicial:
  sin restricción por contacto en Para ti).
- Solo aprobadas en **Conexiones** consideradas lecturas: `readOnlyHint` sin
  `destructiveHint` del servidor, o nombre que empieza con verbo de lectura
  (`get`, `list`, `search`, `fetch`, `read`, `query`, `find`, `lookup`, `price`,
  `rate`, `balance`, …) sin escritura (`create`, `update`, `delete`, `send`, `pay`,
  `transfer`, `set`, …). Heurística de metadatos no confiables, no garantía;
  aprueba solo herramientas confiables.
- Cada llamada redescubre y exige huella aprobada, misma clasificación e entrada
  válida. Resultados al contexto con mismo límite 24 KB texto/estructurado del chat.
- Tarjetas conector con `muse-spark-1.3` Estándar pese a preferencia, como aislados.
  Otras usan modelo de cuenta, Contributor si lo eligió.
- `add_to_updates` no en aislados para no trasladar historial al selector.

## Investigación web y presupuestos

`research_web` usa mismo modelo que investigación conversacional con consulta
pública del contacto, cuyas instrucciones prohíben detalles personales. Cada búsqueda
reserva uno del presupuesto diario cuenta/global (`web_research_usage`, 30/300
por 24 horas) y uno de los 15 propios por persona (`home_research`; 12 antes de
2026-11-02, tres más para [noticias](#news-scan), máximo cada ocho horas). Guarda
hallazgos con reserva para reutilizar al repetir Workflow. Se eliminan a dos días
(limpieza acotada en reservas siguientes). `WEB_RESEARCH_ENABLED` también desactiva
búsquedas de Para ti.

Topes por ejecución: una planificación, como máximo llamada de consulta/noticias
y búsqueda (omitidas con exploración de últimas ocho horas), seis tarjetas,
cuatro rondas por tarjeta, cuatro búsquedas y tres lecturas de conector por tarjeta.

## API

Todas requieren bearer (web proxy con cookie). Lecturas 90/minuto, escrituras 20/minuto.

| Ruta | Propósito |
| --- | --- |
| `GET /api/v1/home?timeZone=…` | Feed: `enabled`, `status`, `pending`, `briefing`, `progress`, `contributors`, `cards`, `posts` (más nuevos primero; cada `{ id, topicID, contactID, contactName, contactPhotoVersion, text, replyTo, quote, reason, source, feedback, connector, createdAt, content, comments }`, comentarios `{ id, text, reply, status, createdAt, repliedAt }`), `suggestions` (`{ title, reason }[]`), `topics`, `apps`, `agenda`. Registra visita/zona e inicia vencida. |
| `GET /api/v1/home/badge` | `{ unseen }`: publicaciones de temas activos posteriores a visita (máximo 99, `0` apagado). Nunca inicia. |
| `POST /api/v1/home/seen` | Registra apertura, limpia badge. `GET /home` también. |
| `POST /api/v1/home/refresh` | Pide actualizar (409 apagado). Devuelve feed. |
| `POST /api/v1/home/topics` `{ text }` | Seguir algo (1–400 caracteres, máximo 20 solicitudes activas). Feed (201). |
| `POST /api/v1/home/posts/:id/comments` `{ text }` | Comenta (1–1,000); contacto responde en fondo. `409` pendiente/20, `404` post/contacto ausente. Feed (201). |
| `PATCH /api/v1/home/topics/:id` `{ status?, feedback? }` | `status`: `active`/`hidden`; `feedback`: `more`/`less`/`null`. Ocultar elimina tarjeta y posts. Feed. |

`enabled` es `false` si `HOME_FEED_ENABLED` no es `"true"` o falta clave; apps y
agenda aún devueltas. `pending` si primera/pedida vencida sin reclamar, para
mostrar progreso inmediato.

Abrir miniapps se cuenta en `POST …/mini-apps/:appID/resolve` en `mini_app_usage`;
recargas dentro de diez minutos son una visita.

## Badge de tarjeta nueva

0076 añade `home_feed.seen_at`, fijado al leer y `POST /home/seen` (anteriores usan
`viewed_at`). Desde 0086 cuenta post nuevo por `created_at` posterior (antes
`generated_at` de tarjeta); tema sin novedades no suma. Ambos consultan
`GET /home/badge` cada 15 segundos con sesión activa (iOS shell en primer plano;
web lista de chats), no con Para ti visible. Abrir pone local 0, incrementa revisión
para que lectura en vuelo no lo restaure y llama `POST /home/seen`. Solo memoria,
se descarta con sesión.

## Caché

Un feed de sesión en memoria (`HomeFeedStore` iOS, `useHome` web), descartado al
salir/cambiar cuenta. Nunca disco por posible información de conectores.

- Navegar muestra último síncronamente; primera carga, marcadores.
- Revalida en fondo tras 60 segundos visible, cada 4 durante ejecución o pendiente.
  Deduplica.
- Cada mutación devuelve feed completo que reemplaza caché; una nueva rechaza
  lecturas en vuelo anteriores.
- Transitorios conservan tarjetas; solo primera carga muestra error.
- Se monta solo donde se ve: página/pestaña propia. Web ancha (más de 860px)
  `/` redirige a `/updates`, contando visita. Ancho teléfono `/` a chats que nunca
  monta Para ti, no sondea ni cuenta visita que mantendría automatismo.
- Imágenes de vista previa reutilizan caché de enlaces e imágenes privadas iOS/
  cargador privado web.

## Infraestructura

`0074_home_feed.sql` añade `home_feed`, `home_topic`, `home_card`, `home_research` y
`mini_app_usage`, todo en cascada con cuenta. `HOME_FEED_ENABLED` versionado en
`apps/api/wrangler.jsonc` activa (`"true"`) o desactiva. Reutiliza `CHAT_WORKFLOW`,
Cron, D1 y `META_API_KEY`, sin servicio/binding/secreto nuevo. Consulta
[infraestructura](infrastructure.md#updates-feed-migration-0074).
`0086_home_posts.sql` añade `home_post` ([publicaciones](#posts)), cascada cuenta/
tema y `home_comment` ([comentarios](#comments)), cascada post.
`0096_for_you_quotes_suggestions.sql` añade `home_post.quote_of`
([citas](#quote-posts)) y `home_feed.suggestions_json`
([temas para seguir](#topics-to-follow)); anulables e ignorados por Workers antiguos.

## Verificación

Formatos, citas, noticias y temas para seguir, realizados el 2026-11-02 en rama
`for-you-content`, antes de release:

- Tipos API/web, locales y tipos estáticos de toda app iOS.
- Migraciones 0001–0096 en D1 local workerd desechable; sentencias modificadas de
  señales, publicar (`quote_of`), plan (`suggestions_json`), feed (join cita),
  reutilizar noticias y comentarios preparadas con `EXPLAIN` y literales.
- Llamadas reales `planHome`/`composeCard` con `muse-spark-1.3-contributor` y datos
  ficticios (español/Argentina; River Plate, Rust, Babasónicos, Japón) e informe
  de noticias ficticio sin exploración real: mezcló una tarjeta de partidos,
  dos notas y lista con tres sugerencias concretas; un compositor citó otro
  («Tomás, ni la IA arreglaba ese medio del domingo…»). Primero las notas trataban
  al lector de segunda persona implícita; se endureció voz y la segunda evitó eso.
- Redactor de consulta real (seis llamadas, reserva rechazada por stub sin buscar)
  con memorias ficticias de nombre de pareja, empleador, medicación y deuda:
  todas solo intereses («qué novedades hay esta semana de River Plate, lenguaje
  Rust y Babasónicos») y omitieron tema oculto. Una con 400 tokens quedó incompleta;
  ahora límite 1,024.
- Render web con API simulada a 1440px claro/oscuro, 1100px, 1060px y 420px en
  Chrome headless: cita, columna fija bajo barra al desplazar, ⋯ abre/cierra y
  sin columna bajo 1100px.

Sin verificar: búsqueda de noticias y reutilización ocho horas, ejecución desplegada,
Seguir de columna contra API real, render iOS simulador/dispositivo y si feeds
reales resultan interesantes durante días.

Publicaciones, realizado el 2026-11-01 en `updates-posts`, antes de release:

- Tipos API/web e iOS completo.
- 0001–0085 en D1 local workerd desechable con ficticios y luego 0086: tarjetas
  existentes copiadas como posts sin texto. Publicar, reintentar (mismo ID reescribe),
  protección obsoleta, respuesta de revisión, feed, badge, señales, sin novedades,
  ocultar, retención y cascada se ejecutaron con literales.
- Compositor real `muse-spark-1.3-contributor` con español/Argentina ficticio:
  primer post con partidos, `no_news` sin evidencia nueva, post solo de resultado
  nuevo si había y revisión como respuesta («Actualizo lo de Tomás: …»).
- Render web API local simulada: timeline/hilo claro de escritorio y oscuro teléfono
  con Chrome headless.
- Comentarios: insertar, responder, feed, discusión/cascada en D1 local; dos
  respuestas `replyToComment` reales (Estándar sin investigación): contestó hora
  desde tarjeta y desconoció transmisión; recordatorio dirigió al privado. En
  web simulada enviar mostró puntos y respuesta sin recargar.

Sin verificar publicaciones/comentarios: ejecución o respuesta desplegada por
Workflow, continuar realmente discusión en privado, investigar al responder,
render iOS, píldora de publicaciones nuevas en ambos con sondeo real y frecuencia
de `no_news` durante días de uso.

Realizado el 2026-10-30, antes de release:

- Tipos API/web e iOS completo.
- 0001–0074 en D1 local workerd desechable; sentencias reales de señales, feed,
  despacho, reclamo, herramienta de chat, plan y composición con parámetros
  enlazados y ficticios mediante `getPlatformProxy`.
- Selección local completa (plan y cinco tarjetas) contra ese D1 con modelo real
  `muse-spark-1.3-contributor` e investigación: español Argentina para partido
  La Liga (`matches`), plazos I-130 (`tracker`), divisas (`metrics`, fechas
  explícitas si no encontraba actual), Champions añadido por `add_to_updates`
  y nota. Unos 128 segundos.

- Render local web claro escritorio/oscuro teléfono con Chrome headless contra
  D1 sembrado con esas tarjetas y fixtures ficticias de gráficos/tablas, accesos
  y agenda; se corrigieron dos defectos CSS hallados.

Sin verificar: desplegado, iOS, repetición Workflow Cloudflare, lecturas de MCP real
y concurrencia Cron/solicitudes. Precisión depende de investigación; cifras pueden
ser antiguas varios días y tarjetas deben indicarlo.

Privados desde comentarios (2026-11-01): tipos API/web/iOS, migraciones hasta 0088
sobre D1 local desechable donde insertar comentario, repetir y otro comentario
en mismo post escribieron exactamente un mensaje, y feed/historial devolvieron
flag y `homeCommentID`. `replyToComment` local mediante `getPlatformProxy` con
`muse-spark-1.3-contributor`: comentario español sobre recordatorio y alternativa
por lluvia recibió respuesta corta más privado pidiendo confirmar hora, sin
acciones declaradas; casual solo respuesta. Sin verificar render web/iOS, push
ni comportamiento desplegado.

## Limitaciones

- Espaciado, cabecera, voz de posts y primera visita de 2026-11-01 solo estáticos:
  tipos API/web, Swift completo simulador con MainActor del proyecto y cinco SQL
  modificados contra 86 migraciones en SQLite vacío en memoria. Sin builds,
  funcionales, inferencia real ni migraciones persistentes. Disposición web/
  dispositivo, alta con/sin contactos IA, transiciones de preparación, offline/
  reabrir/cuenta y lenguaje generado requieren verificación ficticia funcional.
- No lee recordatorios nativos EventKit; agenda solo programaciones/tareas servidor.
- Miniapps grupales aparecen en acceso, pero grupos solo aportan temas por mensajes
  propios de la persona.
- Sin push de tarjetas nuevas ni widgets Para ti.
- Clasificar lecturas de conectores es heurístico (véase arriba).
