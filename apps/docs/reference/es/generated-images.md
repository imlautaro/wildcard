# Imágenes de chat generadas por contactos

Los contactos privados y de grupo pueden llamar a `generate_chat_image` cuando una
imagen aporta valor conversacional claro, incluida una solicitud directa de imagen.
El contacto elige el prompt y las referencias relevantes; el chat ordinario no
debe adornarse con imágenes innecesarias. Es una decisión del modelo, no la promesa
de que cada momento adecuado produzca una imagen.

Una respuesta hace una llamada a `generate_chat_image`, que produce una imagen o
un [álbum](#albums) de dos o tres; cada imagen tiene hasta tres referencias,
combinando fotos actuales de perfil e imágenes anteriores de la misma conversación.
Para selfies y solicitudes que representan al propio contacto se le indica usar su
avatar actual. Para miembros nombrados, usar el avatar actual de cada miembro
representado (dos contactos juntos usan ambos). Son instrucciones explícitas del
modelo; la validación estática no prueba que toda solicitud natural seleccione
las identidades correctas. Se informa de un avatar obligatorio no disponible en
vez de sustituirlo por una apariencia inventada. Si las referencias necesarias
superan el presupuesto, el contacto pregunta cuáles priorizar.

Las referencias privadas de perfil se limitan a la persona y contacto actuales.
Las de grupo pueden incluir miembros humanos y contactos actuales que pasen las
comprobaciones de ámbito, memoria compartida y Contributor. Se validan IDs de
referencia y versiones actuales de fotos antes y después de inferir y antes de
entregar. Versiones antiguas y avatares ausentes detienen la generación. El prompt
del proveedor distingue referencias de identidad de referencias previas de
escena/composición. Las imágenes son ilustraciones, no evidencia de un evento ni
de que un avatar demuestre apariencia real.

## Descripciones internas de imágenes y recuperación

`search_chat_images` busca descripciones visuales internas, pie atribuido o contexto
de generación y nombres de remitentes, tanto para fotos humanas como de bots, en
este chat privado o grupo exacto. `view_chat_image` aporta originales seleccionados
a la siguiente inferencia. `generate_chat_image.chatImageReferences` usa ID de
mensaje, lado (`user`, `assistant` o `group`) y digest inmutable de esos resultados;
nunca acepta URL, clave de almacenamiento, otra conversación privada ni otro grupo.
Por ejemplo, pedir otro ángulo de una imagen de playa anterior permite recuperar
esa escena y combinarla con el avatar actual del contacto representado. Descripciones
y contexto son evidencia para seleccionar, no verificación de identidad ni memoria
de eventos.

Una respuesta privada disparada por una persona y cada borrador inicial de grupo
indexan de forma oportunista una imagen apta sin indexar, empezando por la más
nueva. También se describen fotos recién generadas tras completar la generación.
La solicitud de visión usa píxeles reales, descripciones/etiquetas visuales de
búsqueda en inglés y contexto atribuido de pie/generación; usa la selección
Estándar/Contributor de la conversación, incluido aislamiento de conectores solo
Estándar. Las descripciones son internas: historial público, endpoints de medios,
iOS y web no las muestran ni almacenan en caché. Nunca entran en memoria compartida
entre chats. Una solicitud Spark de visión extra por foto descrita añade coste y latencia.

La migración `0048_chat_image_references.sql` añade un índice D1 desechable con
clave por objeto inmutable registrado y digest. Los contactos concurrentes de
grupo comparten una concesión de indexado de 60 segundos. Un fallo al indexar nunca
convierte una generación terminada en fallo; las descripciones ausentes pueden
reintentarse tras la concesión. Las descripciones se limitan a 1600 bytes UTF-8,
el contexto a 1800 y la búsqueda a seis resultados (hasta siete para preservar un
límite de turno privado). El contexto de pie y prompt son afirmaciones atribuidas
explícitamente; no establecen qué es visible ni si ocurrió el evento representado.

El historial antiguo se indexa de manera diferida, una imagen ausente por llamada
de búsqueda, sin migración ilimitada ni factura masiva de modelo. `hasUnindexedImages`
indica cobertura incompleta; otra búsqueda puede describir más. La búsqueda es
léxica, con términos visuales alternativos en inglés y palabras originales de
pie/nombre. `before` pagina secuencias anteriores; la paginación privada conserva
ambos lados de un turno en los límites de página. Búsquedas, vistas y generación
resuelven mensajes de origen actuales con comprobaciones de conversación,
pertenencia y consentimiento y una marca de secuencia acotada. Una referencia en
caché no elude una revocación posterior. Hasta tres imágenes inspeccionadas
comparten 8 MiB; las referencias de generación comparten tres espacios y 8 MiB
en total (cada imagen mantiene el límite de carga de 5 MiB). Los bytes se cargan
solo dentro de pasos de inferencia/generación y nunca se guardan en checkpoints.
Las filas del índice no conservan bytes R2.

Eliminar el turno/mensaje de grupo de origen elimina su entrada inmediatamente.
Las descripciones huérfanas de generaciones no publicadas siguen la limpieza con
24 horas de gracia del registro de adjuntos. Las imágenes derivadas ya entregadas
siguen en el historial aunque la imagen o avatar de origen deje de ser accesible;
revocar una referencia suprime una derivada aún pendiente de publicar. Solo se
autoriza información relevante de la conversación en prompts y etiquetas, nunca
credenciales ni información privada no relacionada.

## Proveedor y entrega duradera

La API usa `muse-image-1.0` con `META_API_KEY` existente, mediante
`/v1/images/generations` para texto y `/v1/images/edits` para referencias. Las
entradas usan URLs de datos base64 privadas, nunca URLs públicas de avatares.
La forma JSON de referencias y opciones de salida siguen la
[guía de imágenes de Meta](https://dev.meta.ai/docs/image-generation). Se desactivan
búsqueda web y shell; la búsqueda de imágenes del proveedor se activa solo por
imagen como se describe en [álbumes](#albums). Cada salida es un JPEG cuya relación
de aspecto elige el contacto por contexto (2:3, 3:2, 3:4, 4:3, 9:16, 16:9 o 1:1).
Se admiten selfies verticales, escenas anchas y composiciones cuadradas; las
solicitudes explícitas de formato tienen prioridad. El tamaño del proveedor fija
el encuadre, no píxeles exactos. La salida permanece dentro de los 5 MB ordinarios
de adjuntos. Las solicitudes caducan a los 150 segundos y el JSON se limita a 8 MB
antes de analizarlo. La generación usa Muse Image independientemente de la selección
Spark Estándar/Contributor para texto de la cuenta, igual que los retratos de
onboarding. No se crea estado de conversación en el proveedor.

La migración `0044_generated_chat_images.sql` registra una reserva antes de
solicitar al proveedor. Una respuesta tiene una reserva compartida entre reintentos
de Workflow y usuario. Los recibos completados reutilizan su objeto R2 inmutable.
Un recibo pendiente/fallido o incierto nunca repite automáticamente una solicitud
posiblemente cobrada. Por eso un fallo de proceso puede dejar la respuesta sin
imagen; otro mensaje humano puede pedir otra generación. Solo metadatos de
referencia y texto acotado de descripción/contexto entran en D1; los checkpoints
llevan referencias inmutables y resultados, nunca bytes de imagen. Los bytes quedan
en R2 y en solicitud/respuesta del proveedor. Los prompts no se guardan en la tabla
de recibos; el contexto acotado de generación permanece en el índice interno.
Se comprueban versiones de referencias y acceso antes y después de inferir y otra
vez antes de publicar; la pertenencia/consentimiento actual de grupo y autorización
del turno privado también condicionan publicar. Reemplazar/quitar una referencia
puede suprimir una imagen pendiente de entrega. Las derivadas ya entregadas siguen
como adjuntos normales; cambiar un avatar no las retira.

En grupos, solo se ofrece generación en la respuesta inicial a un mensaje humano
directo, no en continuaciones de bots, revisiones ni respuestas designadas con
retorno privado. Los mensajes privados programados y trabajo autónomo de tareas
no pueden generar imágenes. La iniciativa privada puede proponer una imagen
contextual sin solicitud humana de imagen, con los mismos límites de tiempo,
desactivación, pausa, consentimiento y contacto que el texto. Puede usar avatares
actuales propios/humanos, pero no recuperar imágenes anteriores del chat:
sus chatImageReferences deben estar vacías. La migración 0079 reserva como máximo
un intento de imagen por episodio de origen, separado de la respuesta humana
directa. Los fallidos o inciertos no se regeneran en otra evaluación; si la imagen
no está disponible también se retiene el pie. No crea derecho a otro seguimiento.
Nuevos mensajes, escritura, cambios de perfil/referencia, archivo, vaciado,
selección de modelo o pérdida de permisos pueden suprimir una imagen preparada
antes de publicarla. La generación no inventa una vida sin conexión ni establece
un evento real. La revisión de grupo puede conservar la imagen generada, revisar
su pie u omitir la publicación; nunca la regenera. Otro mensaje humano usa la
revisión normal de borrador obsoleto. El primer mensaje contiene imagen y pie;
los siguientes siguen siendo texto. Una imagen consume la misma energía de grupo
que un mensaje ordinario.

## iOS, web y caché

Ambos clientes muestran imagen con pie, cita opcional y hora ordinaria. Los grupos
reutilizan su componente y endpoint de adjuntos autorizados. En privados,
`assistantMessages[0].attachment` entregado contiene solo metadatos públicos;
los bytes vienen del endpoint privado existente de adjuntos de turno con
`?side=assistant`, que exige propiedad de la misma conversación. Claves R2 y digests
nunca se exponen en el historial. iOS usa burbuja entrante y visor completo de
zoom/deslizamiento; web usa el visor de imágenes/archivos existente. Las miniaturas
cargadas conservan la composición vertical/horizontal completa en ambos clientes,
incluidas vistas optimistas e imágenes privadas y de grupo. iOS las limita a
260 por 360 puntos; web limita la altura a 400 píxeles. Los marcadores de carga
siguen estables hasta recibir píxeles; las celdas de galería siguen cuadradas.

iOS pasa `side=assistant` como `URLQueryItem` al constructor compartido, separado
de la ruta. Incrustarlo en la ruta codifica el signo de pregunta y causa 404,
presentado como error de contacto no disponible. La corrección cubre también visor
completo y descargas de medios del chat mediante el mismo método API; web ya envía
la consulta correcta. La verificación en dispositivo sigue pendiente.

Las imágenes privadas generadas tienen clave/ruta propia del lado asistente,
impidiendo reutilizar el adjunto humano del mismo turno. La caché existente por
cuenta gestiona deduplicación, límites de memoria, retención protegida en disco
iOS, expulsión, cancelación, pérdida de acceso y cambio de cuenta. Los almacenes
de conversación de sesión guardan metadatos entregados y rechazan turnos obsoletos;
no hay descargas locales de vista ni caché nueva. Las imágenes de grupo conservan
claves inmutables de mensaje. La limpieza del registro también reconoce adjuntos
del asistente para conservar entregados; los no publicados/eliminados son aptos
tras las 24 horas de gracia existentes. Eliminar una conversación/grupo elimina
en cascada los recibos de generación. Los bytes se borran con la limpieza
reintentable existente del registro.

## Configuración, compatibilidad y verificación

Sigue [infraestructura](infrastructure.md#contact-generated-chat-images) para
migraciones, recursos y release automático. Los clientes nuevos leen historial
antiguo sin imágenes. Los privados antiguos muestran el pie, pero no la imagen
generada; los de grupo antiguos ya admiten adjuntos. No hay secreto, binding,
permiso de cuenta ni servicio obligatorio nuevo.

La validación de recuperación de referencias es solo estática: TypeScript de API
y preparación SQL contra todas las migraciones locales. El cambio original
reutilizó los flujos existentes coincidentes de imagen/pie iOS/web sin alterar
contratos UI. El refinamiento 0079 de abajo también actualiza el encuadre de
miniaturas en ambos clientes. No implica solicitudes de modelo, tests funcionales,
builds, ejecuciones de dispositivo/navegador, migraciones remotas ni despliegue.

Con participantes ficticios, verifica selfies privadas/de grupo, dos contactos
nombrados, dos avatares más una escena anterior, orígenes humanos y bots, imágenes
sin pie, relleno de historial antiguo y recuperación de descripción fallida,
búsqueda léxica multilingüe, paginación privada con imágenes a ambos lados,
retirada de referencias durante publicación pausada, aislamiento de conectores e
intentos de cruzar límites privados/de grupo; después texto a imagen y una/tres
referencias; aislamiento de ámbito privado/grupo; avatares no disponibles,
reemplazados/eliminados; revocación de pertenencia/consentimiento durante generación;
resultados pendientes y reintentos; disposición de pie/cita; visor de imagen
recibida; imágenes humana y asistente simultáneas en un turno; mensajes sucesivos;
revisión/omisión de grupo; sondeo repetido, reapertura de caché, historial anterior,
recuperación sin conexión y cambio de cuenta; eliminación de conversación y
limpieza de adjuntos. Confirma por separado acceso real a Muse Image, calidad y
latencia antes de afirmar que funciona en vivo.

## Encuadre contextual e imágenes espontáneas (0079)

El planificador de iniciativa devuelve una propuesta de imagen opcional acotada
con pie; la generación corre en un paso Workflow separado de cuatro minutos sin
reintentos automáticos. Su reclamo se renueva por cinco minutos antes de generar.
El mismo registro privado R2, metadatos inmutables y endpoint de imágenes del
asistente existente sirven a ambos clientes. Un recibo D1 vinculado al origen se
elimina en cascada al borrar origen/historial; los objetos no publicados siguen
la limpieza con 24 horas de gracia. Las imágenes entregadas quedan como historial
ordinario. No hay caché de imágenes, URL pública ni sondeo cliente nuevos. El
presupuesto del planificador es 4,400 tokens incluido razonamiento (3,400 antes de
álbumes 0082); una imagen añade además la solicitud Muse y llamada acotada de descripción existentes.

Verifica selfies verticales, escenas horizontales, solicitudes cuadradas explícitas,
miniaturas/pies verticales extremos, iniciativa opcional activada/desactivada,
horas de silencio, contactos ignorados, límites diarios, nuevo mensaje/escritura
y reemplazo de avatar durante generación, fallos/resultados inciertos, repetición
y reserva por episodio, limpieza de vaciado/eliminación, reapertura/sin conexión y
cambios de cuenta con datos ficticios. Lo estático no establece decisiones del
modelo, tiempo de entrega ni calidad UI.

Para 0079 pasaron tipos de API/web, análisis sintáctico Swift, preparación de
42 variantes SQL de iniciativa contra 79 migraciones vacías, 12 variantes SQL de
recibos de imagen/acceso privado, sintaxis del arnés de ciclo de vida y
`git diff --check`. La fixture de regresión de vaciado privado ahora cubre recibos
de iniciativa y limpieza R2, pero no se ejecutó. No se hicieron tests, builds,
inferencia real, comprobaciones de navegador/dispositivo, migraciones remotas ni despliegue.

## Álbumes

Un contacto puede enviar dos o tres imágenes como álbum en un mensaje cuando el
contenido necesita varias imágenes distintas: comparación (por ejemplo dos motores
juntos), antes/después o una secuencia corta de pasos. La instrucción del modelo
mantiene una imagen como norma y prohíbe variaciones casi duplicadas o relleno.
Es decisión del modelo; lo estático no prueba cuándo elige un álbum.

**Forma de herramienta.** `generate_chat_image` recibe `images`: 1–3 entradas,
cada una con `prompt` (hasta 4,000 caracteres), `aspectRatio`, `profileReferences`,
`chatImageReferences` (hasta tres referencias por imagen) e `imageSearch`. El límite
de argumentos es 48,000 bytes. Las referencias distintas se cargan una vez y
comparten 8 MiB en todo el álbum. Las imágenes son solicitudes independientes al
proveedor ejecutadas en paralelo, por lo que tarda aproximadamente lo que su imagen
más lenta (cada una conserva 150 segundos de límite), dentro de los pasos de
cuatro minutos de grupo/iniciativa y ocho de preparación privada. El coste del
proveedor y descripción (una solicitud Spark de visión por imagen entregada)
escala con el número de imágenes.

**Búsqueda de imágenes.** `imageSearch: true` activa `enable_image_search` de Muse
Image para fundamentar sujetos informativos reales (máquinas, lugares, especies,
técnicas) en referencias públicas. El servidor lo fuerza a desactivado si la imagen
tiene referencias de perfil o chat, así que avatares y fotos anteriores nunca se
combinan con búsqueda pública, y la instrucción prohíbe detalles personales o
privados en esos prompts. Los resultados siguen siendo ilustraciones generadas,
no fotos reales. Comportamiento del proveedor, coste, latencia y exactitud con
búsqueda activada están **sin verificar**; confírmalos con inferencia real antes
de depender de ello.

**Recibos.** Las migraciones 0044/0079 conservan un recibo por respuesta o episodio
de iniciativa, así que una respuesta nunca inicia una segunda generación. Los
recibos de álbum guardan `attachment_json` como matriz de imágenes entregadas y
`references_json` como matriz alineada de matrices de referencias por imagen; las
filas anteriores a 0082 (un objeto, una matriz plana) siguen siendo legibles. Las
claves R2 son `generated/<receipt id>/<index>.jpg`; las únicas anteriores conservan
`generated/<receipt id>.jpg`. Si algunas fallan, el recibo se completa con las
exitosas y el resultado indica al contacto que describa solo esas, sin reintentar.
Si todas fallan, el recibo es `failed` y todo objeto almacenado entra en limpieza.
Al publicar se comprueba cada imagen individualmente: si cambió una referencia
o falta el objeto se descarta esa imagen y se entrega el resto.

**Forma del mensaje.** El mensaje conserva `attachment` como primera imagen, para
que clientes antiguos, vistas previas y SQL existente funcionen, y añade
`attachments` con todas en orden (incluida la primera) solo si hay dos o más.
Los privados lo guardan en el JSON del primer mensaje del asistente. Los grupos
añaden la columna anulable `group_message.attachments_json` (migración
`0082_generated_image_albums.sql`); el historial devuelve `attachments` junto a
`attachment`. Los clientes antiguos muestran solo la primera imagen y su pie.

**Endpoints y medios.** `GET .../turns/:turn/attachment?side=assistant&image=N` y
`GET /groups/:id/messages/:message/attachment?image=N` seleccionan N (0–2). Sin
`image` se devuelve la primera o única exactamente como antes; `part` sigue
seleccionando el mensaje asistente para voz. Los medios en detalles muestran cada
imagen como elemento propio con índice `image`. `search_chat_images`,
`view_chat_image` y las referencias de generación ven todas (el digest inmutable
las distingue). Limpieza y comprobación de objetos reutilizados reconocen claves
de álbum para no quitar imágenes entregadas como huérfanas. 0082 también recrea
los triggers de eliminación de `chat_image_index` de 0048 para que borrar un
turno/mensaje elimine inmediatamente todas las descripciones del álbum, no solo la primera.

**Contexto y vistas previas de grupo.** El contexto marca la primera imagen del
álbum con `albumImages`. Una vista previa sin texto muestra «N fotos»; normalmente
los álbumes llevan pie.

**Clientes.** Ambos muestran dos imágenes lado a lado y tres como una ancha sobre
dos cuadrados. Las celdas recortan para rellenar (a diferencia de imágenes únicas,
que conservan la composición completa); el visor completo muestra cada original
y pagina el álbum: deslizamiento con indicador y contador en iOS (`TabView`),
y botones de flecha, flechas del teclado, deslizamiento horizontal y contador en
web. Las celdas de medios de detalles abren un visor de imagen única.

**Caché.** Los álbumes usan las cachés privadas existentes. La imagen 0 mantiene
claves/rutas originales (`contact/:id/assistant-attachment/:turn`,
`group/:id/attachment/:message` y las mismas rutas web), de modo que una imagen
única y la primera del álbum comparten entrada; las posteriores añaden `/image/N`
en iOS y `&image=N`/`?image=N` en web. No hay comportamiento nuevo de caché,
retención, expulsión o cambio de cuenta; perder acceso y cambiar cuenta limpian
álbumes como cualquier imagen del chat.

**Compatibilidad y reversión.** 0082 es aditiva (una columna anulable). Los
Workflows con checkpoint anterior siguen publicando una imagen. Revertir a una
revisión anterior enviada conserva columna y JSON entregado; el código antiguo
muestra la primera e ignora el resto, y sus consultas de medios/limpieza no ven
las imágenes 2–3, que podrían eliminarse como huérfanas tras 24 horas. Evita revertir
más allá de este cambio después de entregar álbumes, o acepta perder esas imágenes extra.

**Validación realizada.** TypeScript de API, `npm run typecheck` de web,
`swiftc -typecheck` de toda la app iOS, migraciones 0001–0082 en D1 local de workerd,
`EXPLAIN` local para SQL modificado (orígenes de imagen, limpieza, registro, marcador
de contexto de grupo, actualización de recibo), comprobaciones literales de la
expansión JSON del álbum y cuerpos recreados de triggers ejecutados en tablas D1
desechables (filas de álbum eliminadas, ajenas conservadas). Los triggers reales
no se ejercitaron contra filas de chat sembradas. No se hicieron tests, builds,
inferencia real, ejecuciones de navegador/dispositivo, migración remota ni despliegue.

**Verifica con datos ficticios:** una comparación directa que produzca álbumes de
dos y tres imágenes en privado y grupo; pies que describan cada imagen en orden;
fallo parcial (una imagen falla); álbum con avatares más imagen informativa con
`imageSearch`; revocación de referencia que descarte una; álbumes de iniciativa;
paginación completa iOS/web, reapertura de caché, recuperación sin conexión y
cambio de cuenta; cuadrícula y descargas de imágenes 2–3; `search_chat_images`
encontrando imágenes de álbum; limpieza al vaciar/eliminar y cliente antiguo que
muestra solo la primera.
