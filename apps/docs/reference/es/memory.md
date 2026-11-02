# Memoria de contactos

Un agente tiene un espacio compartido de memoria formado por hechos atribuidos de sus participantes.
Cada participante conserva como máximo 64 hechos y un cursor separado de extracción; un
agente de cuatro personas tiene hasta 256 candidatos. Los contactos existentes de una sola persona
siguen aislados hasta que crear y aceptar una invitación aprueba explícitamente
compartir. Consulta [contactos compartidos](sharing.md) para consentimiento, atribución, acceso,
eliminación, atención exclusiva y migración 0013. El historial sin procesar y adjuntos
siguen privados por conversación; la memoria compartida incluye contenido y cita
de origen. No se incluye endpoint público para editar memoria ni UI de borrado exhaustivo.

## Contexto de respuesta y herramientas

Los turnos privados humanos también pueden [publicar texto solicitado en un grupo compartido](group-requests.md),
con autorización separada. Las publicaciones ordinarias no necesitan destinatario; pedir explícitamente
respuesta de otro agente conserva su retorno privado correlacionado. Es la
única capacidad de escritura grupal, expuesta como herramientas separadas de publicar/preguntar; las respuestas de grupo mantienen herramientas de solo lectura.
Publicaciones dirigidas por personas, preguntas delegadas y retransmisiones privadas no crean eventos de memoria de personalidad para
su remitente, y las retransmisiones automáticas se excluyen de extracción de memoria humana.
Las definiciones/resultados vigentes de herramientas determinan capacidades y acceso. La extracción
 de memoria propia excluye afirmaciones transitorias de conexión, permisos y fallos de envío;
los avisos históricos de incapacidad no prevalecen sobre las capacidades actuales.
La respuesta grupal propia del destinatario sigue siendo elegible para su perfil propio. La recuperación
grupal conserva al interlocutor original en lugar de copiar la preferencia de otro bot
 en la identidad del solicitante.

`chat/context.ts` ensambla instrucciones del contacto, hora UTC actual, recuerdos
seleccionados, turnos recientes completados y mensaje actual. Carga como máximo ocho
turnos previos con presupuesto UTF-8 de 12.000 bytes. Si el último turno solo supera
ese presupuesto, cada lado recibe un extracto recortado; se omiten los anteriores. Se informa al modelo
que el contexto es parcial y puede consultar originales. Los mensajes actuales
conservan el límite existente API de 4.000 puntos de código.

La recuperación automática compara hasta 12 palabras normalizadas de consulta del mensaje
actual y último mensaje humano con nombres de origen, claves guardadas, contenido y citas.
Los recuerdos y preferencias coincidentes se ordenan por coincidencias léxicas y luego actualidad;
se empaquetan hasta ocho candidatos en menos de 3.800 bytes UTF-8. Las preferencias
pueden incluirse sin coincidencia de palabra. Es recuperación léxica; la [clasificación semántica](#semantic-ranking-migration-0057) opcional
añade similitud de embeddings y puede recuperar sinónimos o cambios de idioma. Los presupuestos
son límites de bytes, no afirmaciones sobre el tokenizador exacto ni un contexto de
8.000 tokens. El escape JSON, instrucciones, entrada actual y esquemas añaden sobrecarga.

El modelo tiene tres herramientas internas de funciones de solo lectura:

| Herramienta | Comportamiento |
| --- | --- |
| `search_memories(query)` | Busca hechos, preferencias, decisiones y compromisos pendientes actuales, incluidas fuentes |
| `search_messages(query, from?, to?, before?)` | Búsqueda FTS5 por palabra/prefijo de turnos completados, con fechas Unix inclusivas opcionales en milisegundos y cursor exclusivo de secuencia; hasta cuatro fragmentos fechados |
| `get_conversation_excerpt(turnID, offset?)` | Primero turno solicitado y hasta dos vecinos por lado; los textos usuario/respuesta recortados exponen offsets de caracteres Unicode para partes posteriores |

Las consultas se limitan a 256 bytes UTF-8 y se convierten a palabras normalizadas entre comillas;
quien llama no puede suministrar operadores FTS ni SQL. La búsqueda histórica ordena por secuencia
coincidente más nueva, con cursor para resultados anteriores. Los fragmentos siempre se marcan incompletos.
Los extractos de origen recortan cada lado a 600 bytes UTF-8; usa `nextUserOffset` o
`nextAssistantOffset` para partes posteriores del turno. Empaquetar el resultado completo
puede omitir vecinos e informa truncado. Las búsquedas privadas excluyen el turno actual y secuencias futuras de esa conversación. Buscar memoria puede también recuperar hechos completados de otros participantes del mismo agente, atribuidos por ID/nombre de origen. Las herramientas no pueden acceder a otros agentes, transcripciones/programaciones privadas ajenas, internet, servicios externos ni modificar memoria. Los IDs de origen ausentes/ajenos devuelven
el mismo resultado genérico no encontrado.

Cada intento privado de generación permite tres rondas de herramientas (dos para turnos programados) y seis ejecuciones, luego hace una
solicitud final al modelo sin definiciones de herramientas. Meta Chat Completions solo
acepta `tool_choice: auto`; nunca se envían `none` ni
`required` no compatibles. Se repiten las llamadas del asistente emparejadas con sus resultados.
Hay como máximo tres solicitudes de modelo por intento, cada una con tiempo de espera
de 45 segundos dentro del paso existente de Workflow de tres minutos. Las respuestas del proveedor
se limitan a 256 KiB; argumentos y texto acompañante tienen límites pequeños
separados. Cada resultado ocupa aproximadamente 4.000 bytes UTF-8 con metadatos.
Argumentos inválidos y recuperación no disponible devuelven errores saneados; una búsqueda
no disponible no se representa como búsqueda exitosa vacía. Exceder presupuestos
o respuestas incompletas no puede producir un bucle sin límites.

## Clasificación semántica (migración 0057)

La recuperación léxica pierde sinónimos y cambios de idioma ("allergic to nuts" frente a
"¿qué no puede comer?"). Con `SEMANTIC_MEMORY_ENABLED` en `"true"`, los recuerdos
humanos también se clasifican por similitud de embeddings usando Workers AI
`@cf/baai/bge-m3` (multilingüe, 1.024 dimensiones) mediante el binding existente `AI`.
La bandera se distribuye en `"false"`: el código existe, pero no se verificó la calidad
de clasificación en vivo.

- **Ámbito.** Solo recuerdos humanos privados (`contact_memory`) de chats no aislados
  y recuerdos compartidos de grupo (`group_memory`). Los chats/grupos aislados por conectores, sus
  recuerdos locales, memorias propias, historial y documentos siguen siendo léxicos.
  La clasificación semántica se ejecuta para contexto de respuesta (privado y grupal), iniciativa,
  `search_memories` privado y `search_group_memories` durante turnos grupales (desde un
  privado esa herramienta sigue siendo léxica).
- **La autorización no cambia.** Los candidatos son exactamente los recuerdos ya devueltos
  por las consultas bajo reglas de pertenencia, memoria compartida, aislamiento y Contributor.
  La similitud solo reordena y filtra ese conjunto; nunca lee otra fila.
- **Almacenamiento y eliminación.** Cada fila elegible guarda su vector unitario, cuantizado a
  1 KiB de bytes con signo, en una columna `embedding` anulable. Eliminar un recuerdo o su
  contacto/grupo/cuenta elimina el vector con la fila. Un trigger borra el vector
  al cambiar contenido y se guarda solo si el contenido del que se calculó
  sigue vigente. No hay índice ni servicio separado.
- **Clasificación.** El mensaje actual (como en recuperación léxica) se convierte en embedding una vez por
  clasificación. Puntuación = proporción de palabras halladas + similitud coseno. Un recuerdo es
  elegible con cualquier coincidencia léxica o coseno ≥ 0,5; las preferencias siguen siendo elegibles en
  contexto de respuesta. Ocho primeros y luego empaquetado existente de bytes.
- **Relleno retroactivo.** Los vectores ausentes se calculan bajo demanda al clasificar, hasta 32 por
  llamada en la misma solicitud Workers AI de la consulta; los pendientes mayores se completan en
  turnos posteriores. Los recuerdos existentes no necesitan inferencia durante migración.
- **Fallo.** Un error Workers AI, salida malformada o espera de cinco segundos registra
  `semantic_memory_unavailable` y vuelve a selección léxica en esa llamada.
- **Privacidad.** El texto del recuerdo y mensaje actual se envían a Workers AI (Cloudflare)
  para embeddings; Meta no recibe nada nuevo. Revisa los términos de datos Workers AI de Cloudflare
  antes de activar; no se revisaron en este cambio. Las conversaciones aisladas
  nunca se envían.

Costo: bge-m3 figura a 1.075 neuronas por millón de tokens de entrada; la asignación gratuita
es 10.000 neuronas al día (comprobado el 29 de octubre de 2026). Los recuerdos tienen como máximo 300
caracteres, así que el uso típico es mucho menor, pero las cuotas Workers AI son de toda la cuenta.

Solo verificación estática: TypeScript de API, trigger de cambio de contenido en SQLite y
sentencias nuevas/modificadas preparadas en D1 local de workerd. No verificado: formato de salida Workers AI
en ejecución, ida y vuelta del blob por D1, calidad de clasificación, umbral 0,5,
latencia, relleno con concurrencia y respaldo en producción. Activa solo
después de comprobar recuerdo ficticio entre idiomas y revocación.

## Aprendizaje y procedencia

El Workflow intenta un lote de memoria antes de generar respuesta para ponerse al día con
turnos previos completados. Tras guardar y tratar de entregar push,
intenta otro lote que incluye el turno recién completado antes de liberar la atención al siguiente participante. La extracción no se ejecuta
en el handler HTTP de envío. Sus pasos de un minuto tienen un reintento; fallos agotados
emiten `chat_memory_deferred` y no hacen fallar una respuesta guardada. Un turno posterior reintenta
el lote sin procesar. No hay Cron independiente de mantenimiento ni garantía de que
un contacto inactivo recupere inmediatamente un lote fallido.

Cada lote lee los seis mensajes humanos completados siguientes a un cursor persistido de
secuencia, hasta 16.000 bytes UTF-8. El primer mensaje se conserva siempre completo dentro
del límite existente API. Las respuestas del asistente se excluyen de esta extracción de hechos humanos. El pipeline separado de memoria propia siguiente solo aprende personalidad/preferencias explícitas del agente que responde.
El extractor recibe mensajes, fechas/IDs, identidad del interlocutor resuelta por el servidor y hasta 64 recuerdos existentes solo de él. Usa la variante Muse Spark configurada y JSON restringido por esquema;
luego el backend valida cada cambio antes de confirmar cualquier modificación del lote.

Hay cuatro tipos: `fact`, `preference`, `decision` y `pending`. Cada recuerdo
guarda clave estable, contenido conciso, propietario/contacto, ID/secuencia de turno fuente,
cita literal de la persona y hora de actualización. Las citas deben aparecer realmente en un mensaje humano
del lote. El contenido se limita a 300 caracteres, claves a 80, citas a 240
y un lote a ocho claves distintas. Las existentes pueden reemplazarse o eliminarse al
retractarse explícitamente. Con 64 recuerdos se omiten claves nuevas; las existentes siguen
corrigiéndose. No hay expulsión automática no relacionada. El historial original sigue
disponible para conocimiento que no cabe en este perfil acotado.

Los prompts piden claves/contenido en inglés, conservan nombres propios y citas originales
y excluyen comentarios transitorios, secretos, especulación, hipótesis e instrucciones
para cambiar reglas del sistema. La validación comprueba existencia de fuente y citas
exactas; no puede probar que el modelo interpretó correctamente una afirmación. No
hay puntuación de confianza presentada como verdad. Las instrucciones priorizan
correcciones actuales explícitas, tratan historial como evidencia no confiable y
piden consultar fuentes originales ante ambigüedad. La extracción sigue siendo falible.

Las mutaciones de memoria y avance del cursor comparten una transacción D1. Cada mutación
compara el cursor original para que una repetición o mantenimiento simultáneo de un turno
posterior no aplique un lote desactualizado. Un fallo de validación/almacenamiento deja el cursor
intacto. La extracción simultánea puede generar costo duplicado del proveedor aunque
solo se confirme un lote. Los checkpoints Workflow devuelven booleanos, no contenidos de mensajes ni
recuerdos. Los logs solo contienen eventos genéricos.

## Chats existentes, retención y despliegue

La migración `0007_contact_memory.sql` añade tablas de memoria/estado e índice FTS5
sobre turnos originales. Los triggers sincronizan inserciones, cambios y eliminaciones;
la migración reconstruye el índice del historial existente. Es trabajo de almacenamiento/índices,
no inferencia. Los chats existentes adquieren recuerdos gradualmente con lotes posteriores
Workflow; nunca se envía todo el chat antiguo en una solicitud de extracción.
Los pendientes extensos pueden retrasar aprender correcciones recientes, presentes en la
conversación actual/reciente. No hay inferencia masiva automática retroactiva.

Eliminar contacto elimina en cascada filas de memoria/estado y turnos, y quita entradas
FTS correspondientes. Eliminar una clave recordada no borra mensajes originales, solicitudes
previas al proveedor ni copias/checkpoints de plataforma. No es una función completa de
borrado para usuarios; el historial sigue siendo buscable bajo la retención
existente. No incluye vencimiento automático ni UI de revisión de memoria.

Usa la [guía de infraestructura](infrastructure.md#contact-memory-and-history-search)
para configuración independiente, migraciones locales/automáticas, permisos, verificación
y reversión. No requiere recursos, credenciales ni llamadas de embeddings adicionales.
La extracción y rondas de herramientas añaden costo; esta versión acota contexto y trabajo,
pero no se ha medido como más barata para todos los mensajes, especialmente en chats cortos.

Se realizaron comprobaciones estáticas TypeScript, bindings generados, compilación SQL (12 sentencias usando
EXPLAIN contra un esquema SQLite vacío migrado) y espacios en blanco.
No se ejecutaron builds, tests en ejecución, herramientas en vivo, extracción de pago, migraciones remotas, push
ni despliegue. Recuerdo en ejecución, aislamiento, concurrencia, FTS en D1
y compatibilidad de proveedor deben verificarse con datos ficticios cuando se autorice.

## Referencias

- [Llamadas de funciones Meta](https://dev.meta.ai/docs/cookbook/tool-function-calling)
- [Salida estructurada Meta](https://dev.meta.ai/docs/cookbook/structured-output)
- [Compatibilidad FTS5 D1](https://developers.cloudflare.com/d1/sql-api/sql-statements/)
- [Lotes transaccionales D1](https://developers.cloudflare.com/d1/worker-api/d1-database/)


Los mensajes grupales consentidos pueden aportar recuerdos atribuidos al mismo agente. Seleccionar memoria en privado también considera recuerdos grupales fundamentados mientras usuario de origen y agente sigan en el grupo y el lector sea miembro (desde su límite permitido de historial); una respuesta grupal solo usa recuerdos del mismo grupo. Consulta [privacidad](privacy.md). Las respuestas grupales reciben recuerdos compartidos seleccionados, nunca transcripciones privadas sin procesar. Consulta [grupos](groups.md) para consentimiento, revocación, cambio de modelo y límites.


## Una identidad de agente entre chats privados y grupos

La migración `0019_agent_identity_memory.sql` añade un perfil separado `agent_memory`,
con clave por ID estable de agente y clave de memoria. Los hechos humanos conservan sus stores
atribuidos. Las preferencias y decisiones de personalidad explícitas propias pertenecen al agente,
independientemente del privado o grupo que produjo la respuesta. Otros agentes mantienen
identidades separadas. Una afirmación de bot prueba lo que dijo, no verifica
hechos sobre una persona o el mundo exterior.

Los triggers SQL registran un `agent_memory_event` con clave foránea de origen cada vez que
termina una respuesta privada o se guarda un mensaje grupal de bot. Ocurre en la transacción
de respuesta, incluidas las guardadas por un Worker anterior durante despliegue. Las respuestas
completadas existentes reciben eventos de metadatos cronológicos; la migración no
llama a un modelo. Antes de generar y tras guardar, el Workflow intenta
un lote acotado de memoria propia manteniendo la atención exclusiva existente.
El lote toma como máximo las cuatro respuestas no procesadas elegibles más nuevas, hasta 6.000 bytes UTF-8
por respuesta y 12.000 combinados. El historial pendiente anterior se procesa en turnos
posteriores; las nuevas tienen prioridad para no retrasar preferencias recientes.

El extractor recibe solo respuestas de este agente y perfil propio existente. Se le
indica excluir hechos humanos/ajenos, citas, roleplay, hipótesis,
credenciales, secretos, afirmaciones externas y biografía física inventada. Devuelve
hasta ocho claves distintas con citas exactas; validar comprueba el extracto
suministrado y respuesta original. Cada agente retiene hasta 64 claves;
las nuevas sobre el límite se omiten y las existentes pueden actualizarse. Escrituras de perfil
y confirmaciones de eventos usan un lote D1. Una guarda de evento procesado hace idempotente
la repetición; el orden de origen impide sobrescribir una clave nueva con extracción anterior.
Extracción/almacenamiento inválido deja eventos pendientes. Los fallos solo registran
`agent_memory_deferred`, conservan exitosa la respuesta y reintentan con un Workflow privado/grupal
posterior. No se añade Cron de recuperación de agente inactivo ni extracción inmediata
garantizada. La extracción sigue dependiendo del modelo y es falible.

Cada respuesta recibe un perfil propio clasificado por consulta limitado a 6.000 bytes UTF-8 y puede
usar `search_self_memories(query)` para hasta ocho entradas en un resultado
acotado. `search_memories` privado también puede devolver recuerdos propios atribuidos al agente.
El mismo agente puede recordar preferencias propias en otros chats privados o
grupos; las respuestas privadas sin procesar nunca entran en contexto grupal ni herramientas ajenas.
Se vuelven a comprobar consentimiento de participante/modelo privado y pertenencia/modelo
actual del origen grupal al leer y escribir. Eliminar el agente de un grupo de origen
elimina sus memorias propias/eventos en cascada mediante trigger de eliminación de pertenencia. Eliminar origen elimina en cascada eventos y
entradas de perfil; no borra mensajes entregados ni datos del proveedor.
No hay expulsión automática no relacionada ni editor de memoria nuevo para la persona.

## Identidades grupales y afirmaciones observadas

El contexto privado ahora incluye una página acotada de identidades de grupos compartidos/miembros actuales
y afirmaciones grupales originales pertinentes, con IDs estables de agentes/personas.
Desde el 2026-10-31 se clasifican por pertinencia temática y se añaden turnos privados
anteriores relacionados ([recuerdo por temas](contacts.md#topic-recall)).
Esto permite al bot 1 descubrir al bot 2 en un grupo común y recordar su respuesta.
Las afirmaciones grupales se guardan/indexan una vez, no se copian a cada observador.
El perfil propio del bot 2 no se expone al bot 1; este recupera lo dicho por el bot 2
en un grupo autorizado con atribución de fuente/fecha. Un cambio privado posterior
a la preferencia de bot 2 no se revela silenciosamente a otros bots.

Hay herramientas internas adicionales de solo lectura en respuestas privadas y grupales:

| Herramienta | Comportamiento |
| --- | --- |
| `search_groups(query?, after?)` | Dos grupos compartidos por página, IDs y nombres actuales de humanos/agentes; búsqueda léxica opcional por grupo/miembro y cursor exclusivo de ID |
| `search_group_messages(query?, groupID?, before?)` | Hasta cuatro afirmaciones fechadas humanas/de bots; búsqueda FTS5 normalizada por palabra/prefijo de texto y remitente, o mensajes recientes sin consulta; cursor exclusivo de secuencia |
| `get_group_excerpt(messageID, offset?)` | Primero el mensaje solicitado y hasta dos afirmaciones elegibles por lado en el mismo grupo; texto fuente exacto recortado a 600 bytes UTF-8 por mensaje con offsets Unicode |
| `search_self_memories(query)` | Solo personalidad/preferencias del agente que responde; nunca estado privado de otro bot |

La consulta se limita a 256 bytes UTF-8; el cliente no puede suministrar operadores
FTS. Los resultados llevan banderas de truncado y caben en unos 4.000 bytes UTF-8
con metadatos. Las listas priorizan miembros coincidentes y agentes al empaquetar;
pueden truncarse. Las herramientas tienen el mismo límite de dos rondas/seis ejecuciones
que la recuperación privada existente. La generación grupal ahora permite hasta tres solicitudes
al modelo en su paso de tres minutos. Los fallos de búsqueda son errores
explícitos, no resultados vacíos exitosos; los de grupo registran `group_retrieval_failed`.

Recuperar historial grupal sin procesar por privado exige que agente y persona actuales
sean miembros actuales del grupo fuente con consentimiento aplicable. Conocer un agente
solo por contacto compartido no concede acceso a sus grupos. En respuestas
 grupales, las herramientas se restringen al grupo actual y a la instantánea de secuencia actual de borrador/revisión,
incluidos mensajes humanos posteriores aceptados dentro de esa marca;
no pueden llevar mensajes sin procesar de otro grupo a esa audiencia. Se comprueban pertenencia actual
del hablante de origen y elegibilidad Contributor en cada búsqueda/extracto.
Estas comprobaciones más estrictas de historial no cambian la política existente de uso compartido
consentido de hechos humanos. Los extractos y afirmaciones recuperadas son evidencia no confiable.

El borrador grupal suministra solicitud original y respuestas anteriores de ronda por separado
del historial reciente. Una guarda previa de historial puede activar hasta dos revisiones
con instantáneas nuevas y borrador anterior. Los turnos omitidos no emiten mensaje de asistente
ni evento de memoria propia; la extracción humana conserva su política.
Consulta [política de respuestas grupales](groups.md#reply-rounds-and-exclusive-attention) para
límites de instantánea, cancelación, costos, repetición y escenarios de verificación.

El índice FTS cubre mensajes históricos de grupo inmediatamente después de migrar;
los perfiles propios se llenan gradualmente. La búsqueda sigue siendo léxica, puede perder sinónimos o
cambios de idioma y añade costo acotado de modelo/D1. No se usan embeddings ni carga
ilimitada de transcripciones. La implementación limita trabajo por generación; no
se probó bajo carga ni se midió latencia/costo.

Para esta ampliación se realizaron TypeScript estático, compilación de migraciones SQL y preparación
SQL EXPLAIN. No se ejecutaron builds, tests en ejecución, conversaciones reales, inferencia
pagada, migraciones remotas ni publicaciones. Con datos ficticios, verifica:
(1) bot 1 rojo / bot 2 azul en grupo y luego bot 1 recuerda a bot 2 por privado;
(2) un agente conserva una preferencia dicha primero en privado al preguntarle en grupo y
viceversa; (3) recuerdo fuera de contexto reciente, incluida una respuesta de una palabra junto a
una pregunta recuperada; (4) cambios explícitos de preferencias e historial pendiente/repeticiones;
(5) agentes de nombres similares, grupos no autorizados, eliminaciones y cambios de
consentimiento; (6) fallos de proveedor/almacenamiento y recuperación posterior.

## Conexiones externas privadas

Un chat marcado por configurar MCP usa Estándar para respuestas y extracción local de
memoria humana/propia. Los hechos humanos permanecen en el perfil existente
`contact_memory`; solo son legibles dentro de su conversación privada.
Las preferencias del agente aprendidas allí usan `agent_local_memory`, con clave por agente y
`private:<contactID>`. Ningún origen se exporta mediante recuperación compartida,
incluida la ruta de contacto creador usada por grupos. Desconectar no elimina el
marcador ni memoria local. El historial existente sigue siendo buscable en el chat.
Consulta [conexiones](connectors.md).

## Modelo de extracción seleccionado por cuenta

La extracción de memoria resuelve la preferencia de la cuenta de origen incluso cuando el trabajo de otro participante la actualiza. El trabajo de memoria grupal y propia usa el modelo seleccionado del trabajo de respuesta. Se conservan filtros de elegibilidad Contributor y aislamiento MCP. Estándar en la cuenta no revoca el consentimiento Contributor separado de datos compartidos.

Consulta [ajustes de modelo](model-settings.md) para API, consentimiento compartido, caché,
gasto en AI Gateway y verificación pendiente en ejecución/dispositivos.

## Aislamiento de cuentas Contributor

Con selección por cuenta, el creador ya no tiene exención implícita
Contributor para recuperar/extraer memorias de otras cuentas. Los orígenes ajenos
 de contacto/personalidad requieren consentimiento Contributor explícito; la cuenta
que procesa puede enviar su propio historial acotado. La aceptación explícita
del creador en el flujo de invitación se guarda en su propia fila de contacto.
Las filas existentes no reciben consentimiento nuevo automáticamente. El procesamiento grupal
distingue al solicitante humano del contacto de consulta del propietario del agente.
Consulta [ajustes de modelo](model-settings.md#sharing-and-mcp).


## Memoria local de conversación con MCP

La migración `0030_conversation_memory.sql` restaura memoria persistente acotada para
chats privados y grupos aislados por MCP sin exportar contexto derivado de conectores.
Los límites de historial reciente y búsqueda original no cambian. No hay
servicio nuevo de embeddings, carga ilimitada de transcripciones ni resumen completo del chat.

La extracción humana privada conserva lote existente de seis mensajes/16.000 bytes, citas
fuente, transacción de cursor y límite de 64 claves, pero fuerza Estándar aunque un trabajo de
otra cuenta inicie mantenimiento. Lee sus claves existentes para corregir;
los lectores compartidos/grupales siguen rechazando el marcador permanente del contacto fuente.

Para un grupo aislado, los hechos humanos usan `group_local_memory`, con clave por grupo,
agente, usuario fuente y clave de memoria, hasta tres hechos por fuente humana y
64 claves por agente/usuario/grupo. La extracción compartida sigue escribiendo solo `group_memory`.
Las comprobaciones de lectura/escritura verifican grupo de origen, pertenencia/consentimiento humano y del bot.
Un grupo que se aísla durante extracción no puede confirmar en almacenamiento compartido.
No se extrae masivamente el historial aislado existente; los trabajos futuros completados
hacen extracción humana normal de mejor esfuerzo. Un fallo mantiene
los reintentos existentes del Workflow; no se añade relleno nuevo en segundo plano.

La extracción propia usa `agent_local_memory` para conversaciones marcadas, con
64 claves por agente/audiencia y límites existentes de cuatro respuestas/12.000 bytes por lote.
Confirmaciones de eventos y mutaciones siguen atómicas. La extracción propia compartida
nunca consume eventos aislados. Las lecturas locales requieren propietario privado coincidente o
pertenencia actual al grupo y Estándar. El perfil local prevalece sobre una clave
compartida idéntica solo en esa audiencia; hasta 64 candidatos locales más 64 compartidos elegibles
alimentan el presupuesto existente de 6.000 bytes del perfil. Los perfiles compartidos
nunca se sobrescriben por una preferencia local.

`search_self_memories` sigue la audiencia actual resuelta por servidor.
`search_group_memories(query)` recupera coincidencias léxicas de hechos compartidos
 y, dentro de un trabajo grupal Estándar, sus hechos humanos locales propios. Se conservan selección
normal de ocho coincidencias y empaquetado acotado; no puede enumerar memorias de otro grupo
 aislado. El contexto reciente selecciona hasta ocho recuerdos humanos entre
candidatos locales y compartidos elegibles. Las lecturas humanas locales respetan la marca
de secuencia del borrador. No se añaden resultados externos sin procesar a la extracción factual;
la extracción propia sigue limitada a personalidad/preferencias explícitas, no resúmenes
de datos externos. La búsqueda de conversación original sirve de respaldo para esos detalles.

La migración copia filas de perfiles compartidos existentes con fuentes ya aisladas
al store local correspondiente sin inferencia. Los triggers de inserción del marcador conservan
conocimiento existente localmente cuando se aísla por primera vez una conversación. Las filas
compartidas originales permanecen excluidas por comprobaciones de fuente. No se promueven datos locales tras
revocar conectores. Eliminar fuente elimina filas locales en cascada; miembros grupales o bots
eliminados pierden acceso por comprobaciones actuales. La memoria sigue siendo de mejor esfuerzo,
no una función de borrado exhaustivo ni edición de recuerdos.

iOS y web usan este comportamiento API y explican retención local en la confirmación
de concesión de conectores. No requiere payload, caché de memoria del cliente ni endpoint
nuevo. Consulta [infraestructura](infrastructure.md#conversation-local-memory) para
migración/publicación/reversión y [caché](caching.md#conversation-local-agent-memory)
para caché y verificación en dispositivo.

Verificación estática: TypeScript API/web, parsing Swift, preparación de migración/SQL y
espacios en blanco. El script opcional `node scripts/checks/conversation-memory.cjs` usa
datos ficticios e inferencia simulada; se escribió, no se ejecutó. Tests,
builds, inferencia real, migración remota y comportamiento en dispositivos siguen sin verificarse.

## Observaciones de personalidad

El [experimento de personalidad](personality.md) guarda eventos categóricos transitorios
con referencias de origen en una relación separada. La continuidad de relaciones proyecta
esas observaciones entre contextos elegibles en indicaciones de actuación por destinatario,
sin exportar causas privadas ni añadir narrativa compartida. Las conversaciones de conectores
conservan aislamiento local. La extracción propia compartida excluye
ánimo, enojo con alguien, rechazo percibido, valoraciones de confianza/relación,
saludos ignorados, edad actual y estado de cumpleaños hoy. No son hechos duraderos de
identidad y no deben exportarse a otra audiencia. Identidad configurada
y datos actuales del calendario prevalecen sobre afirmaciones propias históricas inconsistentes.
La memoria factual humana y transcripciones conservan sus reglas;
guardar personalidad solo borra observaciones de personalidad.

## Acceso explícito a texto privado en un grupo

Un participante puede conceder opcionalmente a un agente acceso a su propio historial de
texto privado en un grupo desde **Detalles del grupo → Hablar de mis chats privados**. El
agente puede responder sobre comentarios transitorios como la comida de hoy aunque no se
extrajera un hecho. No cambia el consentimiento existente de memoria compartida ni expone
transcripciones ajenas. Las instrucciones de grupo y comprobaciones SQL vigentes usan
la misma lista autorizada de orígenes. Los privados aislados por conectores siguen
excluidos. Consulta [permisos grupales y revocación](groups.md#optional-private-text-sharing).

## Memoria al vaciar historial

El [ciclo de vida del chat](chat-lifecycle.md) permite conservar solo hechos extraídos/preferencias propias mientras elimina transcripciones, citas, entradas FTS y embeddings. Las filas conservadas usan comprobaciones vigentes de consentimiento/aislamiento y se eliminan en cascada al eliminar contacto/grupo/miembro. Vaciar con memoria elimina conocimiento originado en esa conversación; sobreviven ajustes de personalidad y recuerdos fundamentados de forma independiente en otros lugares.

La migración 0064 también repara el trigger de aislamiento grupal para enumerar columnas explícitamente: la columna embedding de 0057 no debe copiarse a `group_local_memory`. Los [tests locales de ciclo de vida](chat-lifecycle-testing.md) ejercitan aislamiento con recuerdos extraídos existentes, lecturas retenidas, consentimiento actual y eliminación de autores.

## Aprendizaje conversacional junto a memoria factual

El [aprendizaje de conversación](conversation-learning.md) guarda observaciones fundamentadas y con vencimiento
sobre interacción, ajustes del bot y preguntas opcionales separadas de hechos humanos e
identidad. Reutiliza fuentes factuales locales para reconocer respuestas conocidas, sin
exportar estado derivado entre audiencias. Cada persona puede inspeccionar, deshabilitar o restablecer
aprendizaje desde detalles privados/grupales en iOS y web. Vaciar lo elimina incluso conservando memoria
factual. Migración 0067; sigue pendiente verificación con modelo real y dispositivos.


## Audiencias y controles de privacidad (2026-11-01)

`readMemories` toma la audiencia en `MemoryScope.groupID`: una respuesta grupal solo recibe
hechos de personas miembros de ese grupo, y `groupMemories` exige
el mismo grupo o un lector miembro del grupo de origen. "Mantener este chat
privado" (`contact.keep_private`) conserva los hechos de un participante en su chat propio y
"Los contactos comparten entre sí" (`user.contacts_share`) añade hechos propios del lector de
sus otros contactos a chats privados, atribuidos con `sourceContactName`. Consulta
[privacidad](privacy.md) para reglas, auditoría y tests.
