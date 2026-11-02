# Conversaciones privadas

La navegación web usa un botón de ícono **+** sólido con el color primario en el
encabezado de Chats para abrir Contactos. En pantallas anchas una barra de navegación
permite cambiar entre Novedades, Chats y Cuenta; la lista de chats aparece junto a las
conversaciones y los flujos de chat nuevo, y se oculta (sin destruirse) en Novedades y
Cuenta, conservando la selección de Archivados y la posición de desplazamiento.
Por debajo de 860 px, un botón de menú a la izquierda de Chats abre Novedades y
Cuenta, y las páginas reemplazan la lista de chats. Este cambio de diseño se limita
a web; iOS conserva la navegación nativa. Consulta el [diseño web](web.md#design)
y el [comportamiento de caché](caching.md#web-app).

Las solicitudes humanas habituales pueden usar [investigación web](web-research.md)
acotada. El contacto normalmente usa los hallazgos para entender el tema y continuar
el chat, sin crear un documento. Un informe duradero solicitado usa el mismo documento
con fuentes y panel de fuentes en iOS/web. Los hallazgos conversacionales recientes
quedan limitados al chat de este participante con el agente para un contexto de
seguimiento acotado. Los turnos autónomos y los aislados por conectores no adquieren
búsqueda. Consulta los [límites de los agentes](agentic-limits.md) para presupuestos,
manejo de resultados inciertos y límites previos al trabajo persistente.

Cada participante tiene una conversación privada con un agente. Un
[contacto compartido](sharing.md) conserva la misma identidad, memoria global,
presencia y atención exclusiva entre estas conversaciones. La autorización por sesión
Bearer aísla el historial sin procesar, los adjuntos, el estado de lectura, las
notificaciones y las programaciones de cada participante. Un miembro nuevo comienza
sin mensajes. El ID de conversación de otro participante sigue devolviendo 404.

Una persona puede [pedir explícitamente al agente que publique texto en un grupo común](group-requests.md):
saludos, anuncios, declaraciones o preguntas. Las publicaciones habituales confirman el
envío sin iniciar respuestas automáticas. Solo una respuesta solicitada a un agente
específico regresa en un turno privado exclusivamente del asistente con `groupRequestID`
y `userText` vacío. Usa la entrega normal de no leídos/push y no puede iniciar más
acciones de grupo, modificar programaciones ni reintentarse manualmente. La conversación
queda libre para otros mensajes mientras espera la respuesta del grupo. El planificador
usa herramientas separadas para publicar/preguntar y los resultados actuales de las
herramientas para informar el éxito o la categoría real de rechazo. Los destinos
recientes exitosos pueden resolver referencias en una solicitud nueva; no pueden
autorizar la repetición del mensaje anterior.

## Contexto temporal de la conversación

Las respuestas privadas reciben la hora UTC actual, la zona horaria validada del
destinatario del mensaje actual y su fecha/hora local, y los mensajes humanos y las
respuestas recientes con fecha. Cada burbuja publicada del asistente usa su hora de
publicación almacenada. Las respuestas antiguas sin metadatos de burbujas usan la última
actualización del turno, marcada explícitamente como aproximada. Las fechas cuentan
dentro del presupuesto existente de 12.000 bytes de historial reciente.

Los tiempos del servidor distinguen la pausa anterior a la ráfaga humana actual del
tiempo de espera de la generación. Los mensajes humanos consecutivos agrupados comparten
la primera llegada como límite de esa ráfaga, por lo que un segundo mensaje corto no
borra una pausa anterior. El resumen usa solo el historial mostrado y acotado; no afirma
silencio completo ni infiere el estado de lectura. Los turnos programados/de tareas se
etiquetan como automatizados. Las zonas horarias ausentes o inválidas conservan las
fechas UTC sin adivinar un saludo local.

Una pausa o una fecha local nueva no reinicia la memoria ni obliga a saludar. Los
contactos pueden reconocer brevemente un regreso o una pregunta inconclusa cuando el
mensaje actual y la [personalidad](personality.md#returns-after-a-pause) lo hacen
bienvenido. Las tareas actuales, las solicitudes urgentes, las revelaciones sensibles
y las respuestas citadas explícitas tienen prioridad. El silencio no crea la obligación
de responder una pregunta anterior. El servidor no clasifica cada pausa como abandono
ni añade penalizaciones a la relación a partir de este contexto temporal. El
comportamiento existente de las relaciones no cambia.

Es un comportamiento de la API compartido por iOS y web, incluidos los chats aislados
por conectores dentro de su límite existente de historial local. No introduce
migraciones, llamadas adicionales al modelo, servicios, ajustes del cliente ni cachés.
Los historiales conservan el sondeo, la actualización, la invalidación y el manejo de
envíos pendientes existentes. No añade contacto diario ni cambia la programación de
la [iniciativa](initiative.md).

Con conversaciones ficticias, verifica regresos por la mañana tras varias horas, un
intercambio corto que cruce la medianoche, tareas directas y mensajes sensibles después
de una pausa larga, una cita explícita que retome un tema antiguo, un tema nuevo no
relacionado tras una pregunta sin respuesta, mensajes agrupados, procesamiento en cola
que cruce una fecha local, varias burbujas de respuesta, fechas antiguas aproximadas,
cambios de horario estacional y zonas desconocidas. Compara perfiles cálidos/reservados,
pacientes/inquietos y juguetones/serios, además de la personalidad desactivada. En ambos
clientes comprueba volver a abrir/volver atrás, actualizar y recuperar la conexión
mediante el sondeo normal del historial. La comprobación de tipos no demuestra las
frases del modelo real ni el comportamiento en dispositivo; esas verificaciones siguen
pendientes hasta ejecutarse con autorización.

## Contrato de API

Todas las rutas requieren `Authorization: Bearer <session>` y devuelven `Cache-Control:
no-store`. Prefijo: `/api/v1/contacts/:contactID/chat`.

| Método | Ruta | Comportamiento |
| --- | --- | --- |
| GET | `/turns?before=<sequence>` | Últimos 50 turnos, ascendentes, con `nextBefore` para páginas anteriores |
| POST | `/turns` | JSON `{ "id": "<client UUID>", "text": "Hello" }` más [`replyTo`](replies.md#api) opcional; persiste y devuelve `{ turn }` con 202 |
| POST | `/turns/:turnID/retry` | Reintenta el último turno humano fallido; los resultados autónomos de programaciones/grupos no pueden reintentarse; devuelve `{ turn }` con 202 |

Un turno incluye `id`, `sequence` global monótona, `userText`, `assistantText` que
puede ser null, `status` (`queued`, `running`, `complete`, `failed`), `attempt` y
`createdAt`/`updatedAt` en milisegundos, más `readAt` que puede ser null cuando el
modelo procesa correctamente el turno y `groupRequestID` que puede ser null para
resultados automáticos de grupos, además de citas [`replyTo`](replies.md#api) que
pueden ser null. Los saltos de secuencia son normales y no revelan contenido de los
mensajes. Se omiten los IDs internos de Workflow, los propietarios y los errores del
proveedor. Los envíos repetidos con el mismo UUID y texto recortado devuelven el turno
existente. Reutilizar un UUID con otro texto devuelve 409. Pueden ponerse en cola
varios turnos humanos en la misma conversación, con aplicación atómica del límite de
la cuenta. Distintos participantes pueden ponerse en cola simultáneamente; una
reserva de atención para todo el agente admite exactamente uno al procesamiento.
Cada usuario tiene como máximo diez turnos activos y 20 intentos de admisión de
envío/reintento por minuto. Los mensajes permiten de 1 a 4.000 puntos de código Unicode
tras recortar espacios, excluyen NUL y usan un límite de cuerpo de 32 KiB. La falta
de configuración del modelo devuelve 503 antes de persistir un envío nuevo. Las
respuestas tienen un tope de 4.096 tokens de salida, 256 KiB de JSON del proveedor y
20.000 puntos de código.

## Ejecución duradera

1. El manejador HTTP confirma un turno en cola en D1 antes de confirmar la aceptación.
2. Un despacho breve en segundo plano reserva atómicamente la atención del agente
   para la secuencia en espera más antigua y crea `wildcard-chat` con un ID
   determinista para este turno/intento. No hace inferencia durante la solicitud HTTP.
3. `ChatWorkflow` espera un segundo, aplica el ritmo del compositor y la agrupación,
   conecta al agente marcando el turno como activo, lo marca como leído y llama al
   endpoint Chat Completions de Meta con la variante Muse Spark configurada
   (`META_CHAT_MODEL`); registra la respuesta preparada antes de un paso separado de
   publicación. Consulta más abajo el ritmo del compositor.
4. Un Cron Trigger se ejecuta cada minuto, comprueba hasta 50 turnos pendientes y
   recupera huecos de despacho en cola. Comprueba cinco instancias simultáneamente,
   rotando por la hora de la última comprobación. Las instancias terminales con una
   fila incompleta pasan a fallidas y pueden reintentarse desde la app. Los fallos
   temporales al consultar el estado se posponen.

Las solicitudes al proveedor usan manejo manual de redirecciones, como requiere el
runtime de Workers. Se rechazan las respuestas no exitosas, incluidas las
redirecciones, sin reenviar la credencial a otra URL.

La generación tiene un límite de 45 segundos por solicitud al modelo y de tres minutos
por paso. Reintenta dos veces los fallos transitorios de generación con demora
exponencial y después persiste el fallo. Un intento incluye hasta doce turnos previos
completados o agrupados dentro de un presupuesto de historial de 12.000 bytes UTF-8,
más memorias D1 seleccionadas. Los turnos recientes largos se recortan explícitamente.
Los mensajes completados más antiguos siguen disponibles mediante herramientas de
lectura privadas y acotadas; se excluyen los turnos fallidos. Consulta la
[memoria del contacto](memory.md) para extracción, límites de recuperación,
procedencia y puesta en marcha.

El trabajo aceptado continúa independientemente de iOS. Cerrar la app antes de que
se acepte un envío no garantiza su entrega; los borradores sin enviar no se persisten.
El cliente conserva el UUID de envío ante resultados de red inciertos mientras la
conversación esté en caché. El sincronizador de sesión consulta cada segundo mientras
está activo y revalida las conversaciones visibles inactivas en el mismo ciclo para
observar la presencia del servidor. Volver a una conversación en caché muestra
inmediatamente su historial cargado. Consulta la [caché del cliente](caching.md)
para duración, límites, invalidación y actualización manual. Ofrece historial
anterior, un compositor multilínea, estado pendiente y una acción de reintento para
la última respuesta fallida. El compositor compartido de iOS en chats privados y
grupos usa un rectángulo redondeado continuo con radio fijo de 22 puntos, de modo
que las esquinas no crecen al expandirse el campo de una a seis líneas. Verifica
borradores de una línea, con ajuste automático y con varias líneas explícitas,
incluido Dynamic Type más grande, en ambos tipos de chat en un dispositivo; el
comportamiento visual no se ha verificado en dispositivo. Este cambio de presentación
no afecta al almacenamiento de borradores, la caché ni las solicitudes de red. La
lista de Chats muestra la última respuesta o mensaje del usuario, con una vista
previa de 500 puntos de código.

En chats privados y grupos, tocar el historial de mensajes (incluido el espacio vacío)
cierra el teclado del compositor de iOS. Sigue disponible el cierre interactivo al
desplazarse. El gesto de toque funciona junto con las interacciones de mensajes. En
web, tocar fuera del campo enfocado le quita el foco para poder cerrar el teclado
móvil; los eventos del puntero conservan su comportamiento normal. Cerrar el teclado
conserva intactos el borrador, los adjuntos, el destinatario de la respuesta citada y
la caché de historial de sesión, y no hace solicitudes de red. Verifica en un
dispositivo con historiales vacíos y con mensajes, después de reabrir un chat en caché,
y con enlaces de mensajes, vistas previas de imágenes, respuestas citadas, reacciones
por pulsación larga y deslizamiento para responder. La verificación en dispositivo
sigue pendiente.

Alejarse más de 80 puntos del final muestra un botón circular flotante de flecha
hacia abajo sobre el lado de voz/envío del compositor. Tócalo para volver al mensaje
más reciente; desaparece cerca del final. La superposición no reserva espacio en el
historial. Las respuestas nuevas y las actualizaciones de recibos conservan la
posición al leer mensajes anteriores. En iOS, el historial en caché se abre abajo
usando el ancla de desplazamiento predeterminada; el posicionamiento inicial desactiva
las animaciones. El `ScrollPosition` nativo apunta al borde inferior del contenido,
incluidas las inserciones de desplazamiento, en lugar de una fila marcadora. Mientras
sigue el mensaje más reciente, los cambios del tamaño de contenido, área visible e
inserciones realinean ese borde sin animación cuando el desplazamiento queda inactivo.
Las actualizaciones solo del desplazamiento no pueden iniciar un bucle correctivo.
Tocar/arrastrar el historial, cargar mensajes anteriores o seguir una cita desactiva
esta alineación; desplazarse explícitamente al mensaje más reciente vuelve a activarla.
La observación de la distancia inferior incluye el margen de desplazamiento inferior
reservado para el compositor. Las filas cargadas usan un `VStack` normal para que el
texto largo tenga una altura medida antes del posicionamiento, en vez de corregir
estimaciones de alturas diferidas al entrar al chat. Los mensajes nuevos pueden
desplazarse al final, incluido un mensaje saliente optimista; las actualizaciones
solo de recibos no provocan desplazamiento ni animación de inserción en chats privados.
La transición de la flecha se limita a su superposición para que cruzar el umbral
de 80 puntos no anime el diseño del historial. El desplazamiento y las transiciones
del botón respetan Reducir movimiento.

Este cambio de presentación de iOS conserva los almacenes, la paginación y las reglas
de caché de sesión; no añade solicitudes ni persistencia. Medir todas las filas
cargadas cambia el renderizado diferido por posicionamiento estable, por lo que abrir
historiales muy grandes o cargar explícitamente muchas páginas anteriores requiere
verificar el rendimiento en dispositivo. Verifica la entrada en frío y desde caché
con un mensaje final más alto que el área visible, Markdown largo, imágenes, cierre
del teclado, mensajes entrantes/salientes, sondeo de recibos, lectura/paginación de
historial anterior, navegación por citas y Reducir movimiento. El 29 de octubre de
2026, el usuario confirmó que el chat afectado ya se abre correctamente tras el
cambio de alineación al borde nativo. La matriz más amplia de dispositivos y el
rendimiento con historiales grandes siguen sin verificarse; la validación estática
no demuestra la ausencia de parpadeo visual.

Cada burbuja muestra la hora de envío con horas y minutos en la zona horaria local
y el formato preferido del dispositivo. Los mensajes del usuario usan `createdAt`
del turno; las respuestas completadas usan `updatedAt`, registrado al guardarse la
respuesta. Los indicadores de respuestas pendientes y fallidas no muestran hora.

Las actualizaciones de estado D1 dependen del intento y del estado. Una repetición
tras guardar la respuesta omite la inferencia. No hay garantía de exactamente una
llamada externa a Meta: un fallo tras la aceptación del proveedor pero antes de
guardar puede generar otra llamada al reintentar. Agotar la cuota, las instancias
pausadas o un plano de control de Workflows persistentemente indisponible pueden
demorar el trabajo y requerir intervención del operador. La recuperación no fuerza
un nuevo intento de inferencia en una instancia activa cuyo estado no puede consultarse.
Inspecciona el estado de la instancia y los eventos genéricos `chat_*_deferred`;
evita registrar prompts, respuestas, tokens o cuerpos de error del proveedor.

Eliminar un contacto elimina en cascada todos sus turnos y solicita terminar su
Workflow activo. La terminación es de mejor esfuerzo. Una llamada ya aceptada por
el proveedor puede consumir créditos; las escrituras condicionales no pueden recrear
una conversación eliminada. Los metadatos/checkpoints de Cloudflare Workflow tienen
retención de plataforma independiente; solo se pasan IDs de turnos y números de intento
como parámetros del Workflow, y los valores devueltos por los pasos no contienen texto
de conversación. Los mensajes y las memorias seleccionadas se envían a Meta para
respuestas y extracción de memoria; esta implementación no establece una política
nueva de consentimiento o de datos para entrenamiento.

## Entrada de voz

Cuando el borrador está vacío, el compositor ofrece un micrófono para mensajes de
voz grabados: mantén pulsado para grabar y suelta para enviar. Los mensajes se
transcriben después de enviarse, nunca antes. Consulta los [mensajes de voz](voice.md)
para gestos, formatos, límites de endpoints, privacidad, caché e implementación de
cada cliente.

## Configuración y release

Consulta [infraestructura](infrastructure.md) para configuración, permisos, manejo
de secretos, configuración local, releases automáticos y rollback. Las credenciales
de Meta requieren acceso a Muse Spark 1.3. Configura `META_API_KEY` como secreto
cifrado de Workers Builds; el script de release protegido lo transfiere a los secretos
del runtime del Worker sin poner el valor en Git, argumentos ni logs. Solo para
inferencia local, añádelo al archivo ignorado `apps/api/.dev.vars`; omítelo para
trabajar en autenticación/contactos sin llamadas al modelo. Reinicia Wrangler tras
cambiar bindings o secretos locales. La emulación local de Workflows/Cron sigue la
configuración Wrangler versionada; la recuperación por Cron no demuestra un
despliegue en producción.

La migración `0003_chat_turns.sql` añade la tabla de conversaciones, la clave foránea
compuesta contacto-propietario, la eliminación en cascada y el índice único parcial
de turnos activos. Es aditiva y compatible con la API anterior de solo contactos.
Revertir código no elimina mensajes ni detiene instancias existentes de Workflow.
Conserva la exportación/binding `ChatWorkflow` mientras existan instancias; pausa
nuevos envíos y deja terminar o finaliza explícitamente el trabajo activo antes de
volver a código sin esa clase. No elimines la base de datos ni reescribas la
migración para hacer rollback.

## Estado de verificación

Durante la implementación se comprobaron estáticamente TypeScript y Swift, la
sintaxis del script de release, la aplicación local de migraciones y los espacios
en blanco. No se ejecutaron builds de la aplicación, tests automatizados, simuladores,
migraciones remotas, creación de Workflows de producción ni inferencia paga. El
comportamiento de la app instalada, el aprovisionamiento en una cuenta independiente,
los permisos de tokens, el acceso real al modelo y la finalización en segundo plano
siguen pendientes tras un release automático autorizado. Con datos ficticios,
verifica los 404 entre usuarios, reenvío idempotente, rechazo de envíos simultáneos,
recarga tras cerrar la app, reintento tras fallo del proveedor, paginación de historial,
eliminación durante generación y recuperación de huecos de despacho cuando estén
autorizadas las comprobaciones en ejecución.

## Referencias

- [Meta Chat Completions](https://dev.meta.ai/docs/protocols/chat-completions)
- [Disponibilidad de modelos de Meta](https://dev.meta.ai/docs/models)
- [API de Cloudflare Workflows](https://developers.cloudflare.com/workflows/build/workers-api/)
- [Reglas de ejecución de Workflows](https://developers.cloudflare.com/workflows/build/rules-of-workflows/)
- [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)

## Notificaciones de respuestas

Las respuestas completadas ponen en cola [notificaciones push APNs](notifications.md)
atómicamente junto con la respuesta guardada. La entrega y los reintentos son
independientes de la generación; un fallo del proveedor nunca convierte una respuesta
guardada en un chat fallido. Se requiere configurar Apple y una instalación iOS
actualizada. Se sigue usando el sondeo en primer plano.

## Confirmaciones de mensajes salientes

Los mensajes del usuario persistidos muestran doble marca tenue tras la aceptación
del servidor. Las dobles marcas de color aparecen cuando el servidor registra
`readAt`, después de que el agente que atiende haya sido
conectado y antes de escribir (consulta el [orden del ciclo de vida](#message-lifecycle-order)).
La admisión en cola por sí sola no lo marca como leído. Los mensajes en cola de otra
conversación de un participante siguen sin leerse hasta que se libera la atención.
Los reintentos conservan la primera hora de lectura registrada. Son recibos de
procesamiento del agente en servidor, no evidencia de lectura humana ni de entrega
APNs. La marca de respuestas del asistente no leídas por el usuario sigue siendo un
mecanismo separado. Los tamaños de las marcas siguen Dynamic Type y accesibilidad
expone Recibido/Leído.

Inicio muestra el mismo recibo persistido a la izquierda de la vista previa de un
mensaje privado saliente, incluidos los mensajes de solo adjuntos. `lastMessageFromUser`
y `lastMessageReadAt` vienen del mismo último turno que la vista previa. Las vistas
previas entrantes del agente no muestran marcas salientes. En privado, Recibido
significa aceptación duradera en la bandeja del agente en servidor, no entrega al
dispositivo humano ni APNs. Las horas privadas `readAt` almacenadas anteriormente
conservan el significado previo de admisión a la atención; este cambio no certifica
retroactivamente el procesamiento por el modelo de turnos históricos.

## Vaciado inmediato del compositor y escritura del servidor

Tocar Enviar elimina inmediatamente el texto/adjunto enviado del compositor e inserta
una burbuja saliente antes de esperar la aceptación de la API. La burbuja usa hora
local y un recibo de reloj mientras envía; las vistas previas de imágenes usan los
bytes locales seleccionados. Las acciones de vista previa de adjuntos quedan
disponibles tras la aceptación del servidor. ChatStore mantiene esta presentación
optimista separada del historial persistido, por lo que nunca proporciona una secuencia
local a la paginación, las confirmaciones de lectura ni el reintento de respuestas.
El sondeo no puede descartarla. Un UUID persistido coincidente la reemplaza sin
duplicados, usando la hora del servidor y los recibos habituales.

Si falla el envío, la recuperación existente del historial comprueba si el mismo UUID
fue aceptado pese al error. Solo el historial persistido cuenta como aceptación. Un
envío sin confirmar elimina la burbuja optimista y restaura el texto y el adjunto
enviados si no hubo ediciones posteriores del borrador. El texto nuevo del borrador
nunca se borra al completarse correctamente una solicitud anterior. Los reintentos
conservan el mismo UUID para contenido sin cambios para evitar duplicados tras
resultados inciertos. La burbuja local saliente solo vive en la memoria de sesión y
se elimina al invalidarse.

Las respuestas muestran **Escribiendo…** solo cuando su propio turno está activo y
la presencia D1 global es `typing`. Los turnos en cola no tienen etiqueta de espera.
Ningún temporizador del cliente decide si el agente está generando una respuesta.
Las respuestas completadas nunca se demoran artificialmente.

## Presencia persistida del contacto

La migración 0013 reemplaza la tabla y los triggers de presencia originales por
conversación descritos abajo con una fila `agent_presence` por agente compartido.
Consulta los [contactos compartidos](sharing.md#exclusive-attention-and-recovery)
para el arbitraje y la recuperación actuales. El historial original de migraciones
que sigue describe cómo se introdujo la presencia.

Las páginas recientes/anteriores del historial y las respuestas de envío/reintento
incluyen `presence` con `status` (`offline`, `online`, `typing`), `lastSeenAt` que
puede ser null y `expiresAt` que puede ser null, en milisegundos Unix. La propiedad
sigue el middleware de contactos existente. La presencia es actividad del agente
del contacto en servidor, no la conexión de un dispositivo humano. `readAt` registra
por separado el procesamiento exitoso del modelo.

Para contactos compartidos, la API devuelve `typing` solo a la conversación destinataria
que posee la reserva actual de atención para un turno activo y su intento coincidente.
Los demás participantes reciben `online` mientras el agente escribe en otra parte.
La fila global de presencia, la última conexión, el vencimiento y la atención exclusiva
siguen compartidos. Esta proyección de respuesta usa las tablas D1 y la estructura de
respuesta existentes; no requiere migración, binding ni actualización iOS. El cambio
se comprobó estáticamente con TypeScript, preparación SQL y espacios en blanco; la
verificación en ejecución sigue pendiente.

La migración `0008_contact_presence.sql` añade una tabla D1 privada con eliminación
en cascada y triggers atómicos de turnos. La migración
`0009_delayed_contact_connection.sql` los actualiza: aceptar un mensaje/reintento
conserva la presencia anterior (o Sin conexión para una conversación nueva). El
Workflow espera duraderamente un segundo (tres antes de la migración 0045) antes
de marcar el turno como activo y conectar atómicamente al agente como En línea.
Los contactos ya conectados permanecen así; aceptar la cola no extiende su lease.
Esta espera también se aplica a los reintentos y continúa con iOS cerrado. El
Workflow marca el mensaje como leído, mantiene memorias anteriores e inicia de
inmediato la generación; la breve pausa de lectura transcurre en paralelo, y
Escribiendo comienza al terminar si el modelo sigue trabajando (consulta la
[orquestación ágil](#responsive-orchestration-2026-10-30)). Guardar una respuesta o
un fallo establece atómicamente En línea con un vencimiento de inactividad de
30 segundos. La espera/expiración del Workflow y el Cron existente de cada minuto
persisten Sin conexión y `lastSeenAt` igual a ese vencimiento incluso con iOS
cerrado. La expiración tardía usa una condición sobre el vencimiento para no
desconectar un mensaje más nuevo. Las lecturas de historial también reconcilian la
presencia vencida antes de devolverla. Las demoras de Cron/planificador pueden
posponer la actualización física; las solicitudes de historial reconcilian los
vencimientos con la hora del servidor antes de leer la presencia. El trabajo activo
tiene un lease de 15 minutos, renovado en cada intento de generación, para acotar
la presencia obsoleta si el despacho, la recuperación o Workflows siguen
indisponibles. Por eso un trabajo pausado mucho tiempo puede aparecer sin conexión
hasta que comience otro intento de generación.

El sincronizador de sesión consulta cada segundo el historial/presencia autoritativos
visibles. Tiene latencia de sondeo y puede perder fases En línea/Escribiendo muy
breves; no hay servicio WebSocket. Navegar, pasar a segundo plano y los fallos de
actualización borran la presencia en caché, mostrando **Cargando...** hasta la siguiente
actualización exitosa. El encabezado de la barra usa la ranura de título principal,
colocando el avatar de 38 puntos junto al nombre y estado alineados a la izquierda,
con una separación compacta de 6 puntos. Tocarlo abre los detalles del contacto.
Reserva la línea de subtítulo con **Cargando...** mientras no hay presencia disponible,
incluido su valor de accesibilidad. El nombre y el estado usan -2 puntos de
espaciado vertical para ajustar las métricas de las líneas de fuente.

En iOS el encabezado tiene ancho acotado (ancho de barra menos 160 puntos para el
botón atrás, menú de acciones y márgenes, con mínimo de 120 puntos; `ChatHeaderLayout`),
por lo que los nombres largos de contactos y grupos se truncan en una línea. Debe
permanecer en `.principal`: colocar la identidad en `.topBarLeading` permitía a iOS
colapsarla junto al menú de acciones en un menú de desbordamiento del sistema,
incluso con ancho limitado, creando dos niveles. El título principal no tiene
relleno adicional para acciones laterales. Las acciones del chat (Tareas,
Programaciones, Compartir contacto; Tareas en grupos) siguen en un único menú
final de tres puntos (`ChatActionsMenu`) cuyos botones navegan sobre la pila de
Inicio. Esta corrección se limita a iOS por pedido; web conserva sus botones de
encabezado. Los almacenes de sesión, actualización de presencia y caché de avatares
existentes no cambian; no se añaden solicitudes ni cachés. Verificaciones pendientes
en dispositivo: entrada en frío/en caché, nombres largos en teléfonos pequeños,
horizontal, Dynamic Type grande, cambios de presencia, abrir acciones con un toque,
navegación del título y hacia atrás en chats privados y grupos. El título muestra
En línea, Escribiendo..., Últ. vez hoy/ayer a HH:mm, o una Últ. vez con fecha para
actividad anterior. Un contacto sin actividad previa muestra Sin conexión en vez
de una fecha inventada. Los turnos terminados existentes inicializan fechas
históricas de última conexión sin fingir que se conectaron durante la migración.
Los turnos activos existentes comienzan En línea. Las marcas de lectura usan el
recibo persistido de atención del agente descrito arriba.

## Presentación conversacional y longitud de respuestas

El indicador Escribiendo dirigido por el servidor usa tres puntos de animación suave,
sin rueda de carga. Los puntos se pausan al quedar inactivos; Reducir movimiento
los mantiene quietos. Los mensajes salientes nuevos y las respuestas entrantes usan
una transición de opacidad de 0,22 segundos con desplazamiento de ocho puntos en
horizontal y cuatro en vertical. Reducir movimiento usa solo una transición breve
de opacidad y ningún desplazamiento animado. La carga inicial del historial y la
paginación hacia atrás no animan deliberadamente cada mensaje existente.

Las burbujas miden su contenido con ViewThatFits. Si todo el texto y los metadatos
caben en una línea, la hora y las marcas salientes quedan junto al mensaje. El texto
más largo o explícitamente multilínea usa debajo la fila final de metadatos. Se
basa en mediciones reales de diseño, no en un límite de caracteres, y se adapta a
Dynamic Type y al ancho disponible. Las marcas son un 20 por ciento más pequeñas,
con el mismo significado de aceptación/lectura del servidor descrito antes.

La instrucción de sistema del modelo ahora pide respuestas naturales y directas de
persona a persona, normalmente de una a tres oraciones, con el idioma y tono del
usuario. Evita introducciones, resúmenes, listas, explicaciones repetidas y preguntas
automáticas de seguimiento innecesarias. Las respuestas más largas siguen siendo
apropiadas cuando se solicitan o el tema/contexto las requiere; la precisión y la
información útil tienen prioridad. El modelo y el límite de seguridad de tokens no
cambian. Este prompt se aplica a generaciones futuras tras el release automático
por commit/push de la API, sin reescribir respuestas existentes. Se comprobaron
estáticamente Swift/TypeScript y espacios en blanco; no se hicieron builds, tests,
verificación visual en dispositivo ni inferencia paga para este cambio.

## Colores de burbujas salientes

Las burbujas del usuario usan el recurso adaptable de color OutgoingMessageBackground:
un azul pastel (#D9E7FB, aproximadamente 85 por ciento blanco mezclado con el color
primario actual #045DE3) en modo claro y un azul más profundo (#02255B, aproximadamente
60 por ciento negro mezclado con el primario) en modo oscuro. El texto usa el primer
plano primario del sistema, y las horas y marcas Enviado/Recibido usan el secundario.
Las marcas Leído usan azul primario en claro y cian pálido en oscuro. Mantén este
recurso alineado con AccentColor si cambia el color de marca de la app. Las burbujas
del contacto conservan el fondo secundario del sistema. Pasaron las comprobaciones
Swift y de espacios en blanco; sigue pendiente la verificación visual en dispositivo,
sin builds ni tests ejecutados.

## Orden del ciclo de vida del mensaje

La migración `0045_presence_ordering.sql` hace que todos los estados visibles sigan
un orden en chats privados, grupos y seguimientos: el mensaje se entrega, el contacto
se conecta (En línea), lo lee y solo entonces escribe. El cliente nunca puede observar
Leído antes de En línea, ni Escribiendo antes de En línea y Leído, desde el estado
 del servidor.

- Chats privados: un segundo después de reservar la atención, el turno pasa a
  `running`, conectando al agente. Tras otro segundo, `markRead` registra `readAt`
  en el turno y sus mensajes agrupados anteriores, solo mientras el agente está
  conectado. Sigue el mantenimiento de memoria; después comienza la generación
  mientras transcurre la pausa de lectura (`readingDelay`, de 0,4 a 2,5 segundos
  según longitud), y `markTyping` requiere el `readAt` almacenado. Una generación
  rápida aun muestra escritura durante al menos el presupuesto de composición
  según longitud antes de la primera burbuja de texto, descontando el tiempo de
  generación ya pasado escribiendo. Cada mensaje de texto sucesivo inicia su propia
  espera con Escribiendo visible; la recuperación usa el mismo camino. Los
  presupuestos crecen a 12–16 caracteres Unicode por segundo más una pequeña
  introducción y pausas de párrafo, con tope de 15 segundos por burbuja. La voz
  conserva un aviso breve separado de Grabando. Consulta los
  [mensajes sucesivos](reply-messages.md) para detalles.
- Abrir un chat o editar un borrador nunca conecta al contacto. La actividad de
  visita solo marca el ritmo de respuestas y seguimientos (consulta
  [visitar un chat](#visiting-a-chat-and-composing-a-draft)).
- Las revisiones de seguimiento conectan al contacto para decidir, escriben durante
  `messageDelay` al enviar y, de lo contrario, pasan a Sin conexión unos cinco
  segundos después de la revisión. Consulta la
  [iniciativa conversacional](initiative.md#delivery-limits-and-control).
- Los grupos siguen el mismo orden; consulta los
  [recibos de grupo](groups.md#delivery-and-read-receipts).

Una lectura es, por tanto, una acción simulada del contacto, no prueba de que una
respuesta del modelo haya tenido éxito: un fallo de generación posterior deja un
mensaje leído con respuesta fallida, que maneja el reintento existente. Todas las
demoras son esperas deterministas de Workflow para que repetirlas no altere su orden.

## Visitar un chat y redactar un borrador

Desde la migración 0045, las visitas nunca conectan al contacto: se elimina el
trigger de presencia, las aperturas ya no inician trabajos de visita y Cron ya no
los recupera. Las instancias antiguas de Workflow con `kind: visit` terminan
inmediatamente. Las visitas aún registran leases y `typing_at` para regular el
ritmo de respuesta y posponer seguimientos. Los párrafos que siguen describen el
comportamiento anterior de conexión cuando mencionan En línea.

`POST /activity` acepta `{ "visitID": "<UUID>", "kind": "open" }`, `typing` o
`leave`, limitado al propietario/contacto autenticado. Devuelve `{ active }`;
esto indica si el lease de visita acepta actividad, no si el agente ya está
conectado. El endpoint nunca recibe el texto del borrador ni llama a Meta.
Límites: JSON de 1 KiB, 120 solicitudes de actividad y 20 aperturas por usuario
por minuto, y como máximo diez visitas sin cerrar ni vencer por usuario. Abrir es
idempotente por UUID; repetir una visita vencida o cerrada no la reabre. Una
interacción nueva tras el vencimiento usa un UUID nuevo. Los filtros de propiedad
cubren cada lectura y escritura.

La migración `0010_chat_visits.sql` guarda leases de visitas privadas en D1 con
eliminación en cascada del contacto, índices y triggers de actividad. Una apertura
programa un trabajo de visita mediante el binding existente `CHAT_WORKFLOW`, con
un ID de instancia separado `visit-` y un tipo de payload explícito. Su rama no
hace generación, mantenimiento de memoria ni entrega push. Tres segundos después
de que el servidor acepta la apertura, un paso duradero conecta al agente y lo
conserva 30 segundos más. Un chat abierto inactivo no renueva continuamente el
lease ni reconecta repetidamente tras vencer.

Abrir el teclado cuenta una vez como actividad. Las ediciones reales posteriores
del compositor se agrupan en un bucle separado de actividad de primer plano de
tres segundos y extienden el lease hasta 30 segundos después de que el servidor
recibe actividad. Mantener el teclado abierto o un borrador sin cambios no conserva
al contacto conectado. Una interacción nueva tras el vencimiento puede iniciar una
visita nueva demorada. El vaciado programático del compositor tras Enviar no cuenta
como edición. El sondeo de historial/presencia es independiente; las solicitudes de
actividad tienen un límite de cinco segundos y sus fallos nunca bloquean el envío.
El primer cambio de estado puede tardar otro intervalo de sondeo en verse.

Salir o pasar a segundo plano cierra la visita de mejor esfuerzo, cancela una
visita sin conectar y detiene los latidos de edición. Una visita ya conectada
conserva su ventana restante de inactividad. Los registros de cierre impiden que
una apertura desordenada reconecte una visita cerrada. Si falla la entrega o se
termina iOS, los leases igual vencen sin cliente. El Cron y la ruta de expiración
existentes eliminan registros vencidos y de cierre tras un día. Las visitas no
guardan texto ni contenido de teclas, solo IDs, horas e indicadores.

Varios dispositivos/visitas extienden la presencia del mismo contacto. Escribiendo
real del agente tiene prioridad sobre la actividad del borrador; completar/fallar
una respuesta conserva un lease de visita más reciente y elimina el lease largo
de generación. La expiración siempre comprueba el vencimiento combinado actual
para que trabajos anteriores no desconecten generación o redacción actuales.
El trabajo de visita sigue los vencimientos renovados durante hasta 120 ciclos
de espera/comprobación; después Cron y las lecturas autoritativas siguen venciendo
la presencia. Cron también intenta despachar hasta 20 visitas pendientes sin vencer
en grupos de cinco. Las interrupciones del despacho pueden impedir que una visita
breve se conecte antes de vencer; el cliente reintenta registros inciertos con el
mismo UUID. No requiere servicio en tiempo real ni binding nuevo, pero los trabajos
de visita consumen ejecuciones de Workflows y la actividad añade escrituras D1.

## Vistas previas de la lista de chats

La segunda línea de una fila en Chats (Inicio iOS y lista web, tanto privados como
grupos) muestra, en este orden de prioridad:

1. Actividad en vivo (`Typing...`, `Recording...`, `Researching...`) y `Cleaning up...`.
2. Un borrador sin enviar: **`Draft:`** en el color de acento seguido del texto del
   compositor en una línea (espacios colapsados, máximo 500 caracteres). Los
   adjuntos solos no cuentan como borrador. No muestra recibo ni ícono de micrófono.
3. Una reacción más nueva que el último mensaje: `You: reacted with 👍` cuando
   reaccionaste tú, `Reacted with 👍` cuando reaccionó el contacto en privado y
   `<Name>: reacted with 👍` cuando otro miembro o contacto reaccionó en un grupo
   (para contactos, el nombre es el alias de quien mira). Un actor de grupo sin
   nombre usa `Reacted with 👍`.
4. El último mensaje, como antes.

La hora de la fila y el orden de la lista siguen el último mensaje: una reacción
solo cambia la etiqueta y nunca sube el chat, por lo que no cambia la paginación
por cursor del servidor (`COALESCE(lastMessageAt, createdAt)`). Un borrador mantiene
en la lista un chat todavía sin mensajes, con su hora de creación. Cambiar el emoji
de una reacción cuenta como actividad nueva; volver a elegir el mismo no. Eliminar
la reacción más reciente vuelve a la reacción anterior más nueva que el mensaje
o al último mensaje.

### Borradores

En web, el chat privado o grupo abierto oculta la etiqueta de borrador y conserva
en la lista la vista previa normal de actividad, reacción o último mensaje. Salir
de la conversación muestra el texto inconcluso del compositor como **Borrador:**;
reabrirla vuelve a ocultar la etiqueta. Un contacto por lo demás vacío con un
borrador permanece en la lista mientras está abierto, con su vista previa vacía
normal. Esta regla de presentación se limita a web.

El texto del compositor pertenece a la caché de conversación de la sesión, no a la
pantalla: iOS lo conserva en `ChatStore.draft` / `GroupChatStore.draft`, web en el
`entry.draft` existente de `useConversation` / `useGroupConversation`. Salir y
reabrir un chat lo restaura en el campo. Los borradores solo están en memoria y
nunca se envían al servidor; se pierden al cerrar la app o pestaña, cerrar sesión
o cambiar de cuenta, y al vaciar o eliminar un chat o perder acceso (se descarta
su conversación en caché). Una conversación con borrador no vacío nunca se expulsa
de las cachés acotadas (8 en iOS, 20 en web), con la misma protección que los envíos
pendientes.

### Reacciones

`GET /api/v1/contacts` (y las respuestas de un contacto) y `GET /api/v1/groups`
(y `GET /groups/:id`) incluyen `lastReaction: { at, emoji, own, name? } | null`:
la reacción más reciente de cualquier actor en ese chat, con `name` solo en grupos.
Los clientes la muestran solo cuando `at` supera la hora del último mensaje que
muestran (incluido un mensaje más nuevo en caché) y no hay envío en curso. La
migración 0090 añade `message_reaction.created_at` y el `contact_id` / `group_id`
propietario, escritos por cada reacción humana o del agente, con índices parciales
para que cada fila de lista requiera una búsqueda de índice. Las reacciones
guardadas antes de la migración 0090 no tienen hora y nunca se convierten en vista
previa. La lista recoge una reacción nueva en su sondeo habitual (1 s en web y en
el sincronizador de primer plano iOS); no hay actualización optimista de lista
tras reaccionar.

### Verificación

Estática: `tsc`/`vue-tsc` de API y web, `swiftc -typecheck` de iOS y migración 0090
en una D1 local temporal de workerd con filas ficticias: relleno de `contact_id` /
`group_id` en reacciones antiguas, las sentencias reales de `writeReaction`
(usuario y agente, privado y grupo, cambio de emoji frente al mismo emoji), ambas
consultas completas de listas y el plan de índices. Sin verificar: ejecuciones en
dispositivo o navegador, tiempos del sondeo, estilo visual y migración de
staging/producción. Comprueba con cuentas ficticias: escribe sin enviar, vuelve
atrás, observa `Draft:` y reabre el chat con el texto en el campo (privado y grupo,
iOS y web); envía y confirma que desaparezca la etiqueta; reacciona y haz reaccionar
al contacto y confirma ambas etiquetas, luego envía un mensaje y confirma que la
etiqueta vuelva al mensaje; una reacción grupal de otro miembro muestra su nombre;
cierra sesión y vuelve a entrar y confirma que desaparezcan los borradores.

## Mensajes programados

Las [programaciones](schedules.md) añaden turnos autónomos del asistente con
`scheduleID` y `errorCode` que pueden ser null. Su `userText` está vacío; los
clientes no deben mostrar una burbuja de usuario para ellos. Envía `timeZone` IANA
opcional con mensajes humanos nuevos para resolver solicitudes de programación
local. Los clientes existentes de solo mensajes pueden omitirlo. Los turnos
programados comparten presencia, historial, contador de no leídos, recuperación
Workflow y pipeline push normales, pero no pueden reintentarse manualmente ni
modificar programaciones.

## Mensajes con imágenes y PDF

El clip del compositor añade una imagen privada o PDF con texto opcional. El JSON
del turno incluye metadatos de visualización del adjunto; los bytes se recuperan
mediante una ruta autenticada por propietario y se envían en línea a Meta durante
la generación. Consulta [adjuntos](attachments.md) para formatos admitidos,
payloads de API, límite de 5 MiB, retención de contexto, migración, limpieza,
política de datos del proveedor y estado de validación.

## Stickers en chats

El compositor tiene un botón de stickers a la derecha del campo (a la izquierda
de enviar/micrófono) en chats privados y grupos. Un sticker se envía solo como
`sticker: { id }`, se muestra como imagen transparente sin burbuja y admite citas,
respuestas y reacciones. Los contactos responden con stickers en privado y el
menú de pulsación larga de sus stickers ofrece **Guardar sticker**. Consulta
[stickers](stickers.md#ios) (iOS) y [caché](caching.md#stickers-ios).

## Experimento de apariencia de burbujas

Las burbujas usan un contorno continuo con una pequeña cola puntiaguda integrada
en la esquina inferior: izquierda para entrantes, derecha para salientes. La punta
se extiende unos 6 puntos hacia afuera y 3 hacia abajo, con extremo ligeramente
redondeado que vuelve al lateral de la burbuja. Las otras esquinas conservan su
radio base (20 puntos para texto/imágenes, 16 para documentos). Reemplaza el
experimento anterior de círculo decorativo y esquina de medio radio. Las colas
de imágenes usan el color correspondiente de burbuja entrante/saliente; los píxeles
siguen recortados al contorno con borde interior de 2 puntos del color de la
burbuja. La alineación, los recibos y la apertura de adjuntos conservan su
comportamiento.

Las burbujas de texto y los pies de imágenes usan el mismo diseño adaptable de
texto/metadatos. Un mensaje breve de una línea comparte línea base con hora/marcas;
el texto más largo o multilínea coloca metadatos debajo. Las imágenes tienen sus
propias esquinas redondeadas dentro de la burbuja y su borde de 2 puntos.

Las burbujas de texto, imágenes, imágenes con pie y documentos tienen apariencia
plana sin sombra, tanto en conversaciones individuales como grupales.

Las conversaciones grupales tienen historial compartido humano/agente y reutilizan
la cola global de atención del agente. Consulta [grupos](groups.md) para rondas
finitas, consentimiento, identidades de remitentes, avatares grupales, adjuntos y
mensajes de voz.

Los chats grupales e individuales comparten `MessageBubbleView` y el campo del
compositor, botón de acción y control para ir al último mensaje en
`ChatControls.swift`. Los controles compartidos conservan el mismo tratamiento de
vidrio, dimensiones y escalado Dynamic Type. Los grupos añaden nombres/avatares
de remitentes y agregan [recibos grupales](groups.md#delivery-and-read-receipts).
También reutilizan las vistas de adjuntos, selector Fotos/Archivos y grabadora,
gesto del compositor y burbuja de [mensajes de voz](voice.md).
Consulta [grupos](groups.md).

## Estado compartido de Inicio y chat

Inicio proyecta el mismo turno en caché y evidencia de recibos que la conversación,
y APNs en primer plano solicita sincronización antes de presentar sonido. Las
actualizaciones de lista precargan conversaciones ya abiertas con vistas previas
cambiadas o respuestas pendientes. Las solicitudes compartidas sobreviven a la
cancelación de navegación e integran resultados demorados sin hacer retroceder
respuestas completadas ni evidencia de lectura. La puesta al día cubre páginas
faltantes. Consulta la [sincronización compartida](caching.md#shared-conversation-synchronization)
para propiedad de solicitudes, límites de tiempo, regresiones aisladas y
verificación en dispositivo. Es un cambio exclusivo de iOS con la API existente;
instala la app actualizada.

Las observaciones de lectura se ponen en cola sincrónicamente por el chat visible
y la sesión las confirma, así que salir de la pantalla no puede cancelar la
escritura. Las lecturas fallidas se reintentan desde el temporizador de primer
plano mientras Inicio está visible. Los contadores se actualizan al confirmar el
servidor y las listas obsoletas no pueden resucitarlos. Los aciertos de caché de
conversación solo cambian el registro LRU no observable, evitando que una consulta
durante el renderizado provoque su propio renderizado de nuevo. Consulta la
[duración de las confirmaciones de lectura](caching.md#read-acknowledgement-lifetime).

## Reacciones a mensajes privados

Consulta [reacciones](reactions.md) para el selector compartido iOS/web, identidad
de actor y mensaje, herramientas del agente, permisos, reintentos de mutaciones,
frescura de caché de sesión y pasos de verificación. Las reacciones usan la
sincronización existente y no añaden mensajes no leídos ni alertas push.

## Respuestas a mensajes privados

Consulta [respuestas a mensajes](replies.md) para acciones Responder compartidas
iOS/web, payloads de citas, validación de destino, contexto del agente, caché y
pasos de verificación. Son mensajes normales que llevan una cita anterior; no
añaden un tipo de solicitud, almacén ni notificación nuevos.

## Herramientas MCP externas

Los turnos humanos directos privados en chats aislados de contactos pueden descubrir
y llamar herramientas MCP explícitamente autorizadas. Estos chats usan Standard,
excluyen exportar memoria compartida y desactivan publicaciones/delegaciones grupales
y creación/edición de programaciones. Las reservas duraderas impiden repetir
automáticamente escrituras externas inciertas. Consulta [conexiones](connectors.md)
para límites, permisos, transportes admitidos y verificación pendiente.

## Selección de modelo por cuenta

Los Workflows de respuestas privadas guardan al iniciar la preferencia
Standard/Contributor de la cuenta de la conversación; las programaciones y entregas
de resultados grupales usan también esa cuenta. La extracción de memoria lee la
selección de la cuenta origen. Los chats MCP siguen forzando Standard. Las
preferencias se aplican a trabajos nuevos; las respuestas completadas y los
trabajos ya iniciados conservan su resultado/modelo.

Consulta [configuración de modelos](model-settings.md) para API, consentimiento
compartido, caché, gasto de AI Gateway y verificación pendiente en ejecución/dispositivo.

## Respuestas fallidas y recuperación

Las pausas de lectura, escritura y presencia inactiva guardan su duración restante
y usan esperas relativas de Workflow solo si queda tiempo. La actualización de
memoria, generación, reintentos o ejecución demorada pueden consumir el vencimiento
original; una pausa vencida continúa inmediatamente en vez de fallar la respuesta
antes de inferencia o entrega. El checkpoint conserva estable la decisión de espera
al repetir el Workflow. Este comportamiento compartido del servidor se aplica a
iOS y web sin cambiar cachés ni permisos de reintento. Verifica mensajes breves
con actualización lenta de memoria, generación más larga que escritura y Workflows
reanudados con cuentas ficticias tras el release; la validación estática sola no
demuestra recuperación en producción. Los turnos ya fallidos conservan su estado
y usan la acción existente de reintento del último turno.

Ambos clientes mantienen un aviso de respuesta fallida directamente bajo el turno
privado correspondiente: **No se pudo completar la respuesta a este mensaje.**
Deja de mostrarse cuando un turno posterior del historial cargado contiene una
respuesta del asistente. Las filas fallidas se conservan; ya no se acumulan como
fallos visuales activos después de que el agente vuelve a responder. Sigue la
restricción manual existente de reintentar solo el último turno, incluidas sus
comprobaciones de concurrencia y cuenta del servidor.

Una vez agotados los reintentos existentes de generación para un error recuperable
del modelo, un turno humano directo obtiene un paso separado de recuperación de
un minuto, sin reintentos ni herramientas. Reconstruye contexto actual acotado con
las mismas reglas de modelo/aislamiento/consentimiento e indica explícitamente al
agente que falló el intento anterior. Los recibos originales de herramientas del
paso fallido no se entregan a ese contexto nuevo; no debe inventar resultados
externos ni afirmar su éxito/fracaso. El agente puede responder con la evidencia
disponible o explicar trabajo incompleto e incertidumbre. No puede prometer actuar
más tarde ni repetir silenciosamente operaciones MCP/grupos/programaciones.

Solo se aplica mientras el turno original sigue activo y autorizado; los turnos
programados y las entregas privadas de resultados grupales conservan su manejo
existente de fallos. Los errores de acceso/configuración/almacenamiento no inician
recuperación. Las respuestas guardadas usan la misma transacción, outbox de
notificaciones, confirmaciones de lectura, mantenimiento de memoria y liberación
de atención que las normales. Las interrupciones persistentes del modelo siguen
produciendo un fallo contextual con reintento manual, no un mensaje inventado del
asistente. Los eventos saneados `chat_reply_failed`, `chat_reply_recovered` y
`chat_reply_recovery_failed` identifican la rama sin contenido de chat; los turnos
fallidos conservan el código saneado en lugar de un error genérico de generación.
Consulta [caché](caching.md#reply-failure-presentation) para verificación de
caché/dispositivo.

## Caracteres corruptos

Las respuestas de contactos mostraban a veces secuencias como `ðŸ˜€` o `â€™` en
lugar de un emoji o apóstrofo curvo (reporte del 31/10/2026). Es texto UTF-8
decodificado como Windows-1252. La API decodifica las respuestas del proveedor como
UTF-8, ninguno de los clientes decodifica los mensajes con otra codificación y
no hay filas afectadas en datos locales, por lo que el texto corrupto probablemente
viene de la salida del propio modelo; el origen exacto no está confirmado.
`shared/mojibake.ts` (`repairMojibake`) lo repara en `museCompletion`
(`chat/meta.ts`), por donde pasan todas las respuestas de contactos, mensajes de
grupos e iniciativa, tarjetas de Novedades, documentos y argumentos de herramientas,
y en el informe de investigación web (`research/model.ts`). Los mensajes previos
del asistente en el historial del modelo se reparan antes de cada solicitud para
no invitar al modelo a imitarlos.

Solo se reescriben secuencias que decodifican a un carácter plausible: letras
Latin-1 (`Ã©` → `é`), puntuación general, flechas y símbolos, selectores de variante,
puntuación CJK y emojis. Se elimina un fragmento de emoji cuyos bytes restantes
se perdieron (`ðŸ` seguido de texto normal). Desde el 02/11/2026 se elimina también
un `ð` aislado (primer byte de un emoji, normalmente donde debería estar uno final)
que no toca una letra, dígito o marca, así como controles C1 sueltos, invisibles
pero nunca legítimos en texto de chat. Las respuestas JSON (`responseFormat`) y
argumentos de herramientas pueden contener los bytes corruptos como escapes
(`\u00f0\u009f\u0098\u0080`), que la reparación no veía antes de `JSON.parse` y
que luego aparecían como un `ð` solo; `unescapeLatin1` escribe primero literalmente
los escapes del rango 0x80–0xFF (JSON equivalente) para aplicar la reparación.
Las pruebas en vivo con Contributor (unas 300 respuestas, 02/11/2026) no
reprodujeron el problema, pero mostraron que el modelo sí escapa caracteres no
ASCII en respuestas JSON (`\u00e9`, `\uD83C…`), por lo que este camino es plausible;
la causa sigue sin confirmarse. El texto normal, incluidos los acentos españoles,
portugueses y franceses, no se modifica. Los mensajes almacenados no se reescriben;
los que ya tienen texto corrupto lo conservan. Regresión sin conexión:
`node scripts/checks/mojibake.mjs`. Sin cambios en clientes.

## Markdown de mensajes de bots

Tanto iOS como web dan formato a respuestas de bots en chats privados y grupos,
incluidas las ya presentes en el historial cargado. El Markdown esencial admite
párrafos, énfasis, énfasis fuerte, tachado, encabezados, listas ordenadas/sin ordenar
y anidadas, citas, enlaces explícitos, código en línea, código delimitado/indentado
y tablas básicas. iOS usa el parser Markdown de Foundation con diseño de bloques
SwiftUI nativo; web usa markdown-it con HTML en bruto desactivado. Se aplican las
reglas estándar de párrafos Markdown: los saltos suaves pueden unirse dentro de un
párrafo; las líneas vacías separan párrafos. Los mensajes humanos siguen siendo
literales. El texto del bot en vistas previas de citas, notificaciones y lista de
chats se convierte a texto plano sin delimitadores Markdown. El código y las
etiquetas de enlaces/imágenes siguen legibles. En iOS los fallos de análisis
vuelven al texto fuente legible. No se admiten atributos Markdown extendidos,
HTML incrustado, resaltado de sintaxis ni carga de imágenes Markdown remotas.
Las imágenes Markdown no reemplazan el manejo privado de adjuntos. Solo son
accionables enlaces HTTP, HTTPS y mailto. Markdown no inicia recuperaciones de
red. Desde el 30/10/2026, las URLs con esquema, hosts `www.` y direcciones de
correo también son enlaces, tanto en Markdown del bot (fuera del código) como en
mensajes y pies humanos por lo demás literales; textos de solo host como `notes.md`
o `example.com` siguen siendo texto. Web usa linkify de markdown-it
(`linkSegments` para texto literal, pestañas nuevas con `noopener`); iOS usa
`NSDataDetector` con las mismas reglas y subraya enlaces. La instrucción compartida
`formattingInstruction` pide mensajes cortos planos y respuestas largas con
Markdown ligero: datos clave en negrita, listas breves de pasos/opciones, enlaces
con nombre en vez de URLs y sin encabezados ni tablas en el chat. Las respuestas
habladas ya eliminan Markdown antes de sintetizarse. iOS asigna explícitamente
negrita/énfasis en línea a pesos variables de Manrope y un descriptor de fuente
oblicua, incluidas combinaciones y Dynamic Type. No depende del énfasis sintético
automático de la fuente personalizada.

El texto sigue siendo seleccionable. Las respuestas breves en línea conservan el
diseño compacto existente de metadatos iOS; las de bloques colocan los metadatos
debajo. El código se ajusta dentro de burbujas; las tablas anchas se desplazan
horizontalmente. La tipografía nativa sigue respetando Dynamic Type.

Es presentación derivada de los snapshots existentes de conversación de sesión;
no cambian texto fuente, IDs pendientes, frescura, paginación, expulsión ni
invalidación de cuenta. Los campos aditivos de API `lastMessagePreview` y
`previewText` de cita/actividad llevan resúmenes del bot analizados antes de
recortarse (500/200 puntos de código). Los clientes prefieren esos campos y
derivan resúmenes del texto completo en caché cuando existe; los snapshots
anteriores vuelven a analizar su resumen existente. Los campos antiguos de resumen
y cita sin procesar siguen disponibles para identidad del historial y contexto
del modelo. No hay solicitud de red nueva, HTML persistido ni caché compartida de
texto privado analizado. Web memoriza el HTML derivado por mensaje montado y lo
recalcula cuando cambia el texto; el diseño nativo deriva del texto actual.
Consulta [caché](caching.md#markdown-presentation).

Durante la implementación pasaron las comprobaciones estáticas de tipos web e
iOS. No se ejecutaron builds, tests ni verificación visual en dispositivo/navegador.
Con mensajes ficticios, verifica respuestas cortas/largas, énfasis/listas anidados,
código con marcado, tablas básicas,
enlaces con esquemas permitidos y rechazados, sintaxis malformada, tamaños de texto
grandes, apariencia clara/oscura, citas/reacciones/recibos y desplazamiento en ambos
clientes. Reabre el historial en caché sin conexión y cambia de cuenta para confirmar
que el historial con formato sigue la caché de sesión y el texto humano es literal.

## Herramientas nativas de iOS

Los mensajes privados directos de contactos iOS explícitamente habilitados pueden
llevar snapshots de capacidades nativas del dispositivo. `request_native_action`
guarda una propuesta revisable; `list_native_actions` recupera los estados
informados por el dispositivo de esa persona en este chat. Ninguna herramienta lee
datos del sistema ni ejecuta acciones del teléfono en la nube. Pendiente nunca debe
describirse como ejecutado. Los grupos, programaciones y turnos automáticos de
resultados grupales no reciben ninguna de las dos herramientas. Consulta los
[experimentos nativos](native-experiments.md).

## Iniciativa conversacional

La [iniciativa conversacional](initiative.md) añade seguimientos acotados solo del
asistente tras respuestas humanas directas, con contexto de lectura/actividad,
esperas elegidas por IA, horas de silencio e interruptor por participante en los
detalles del contacto en iOS y web. Una entrada humana nueva cancela planes
pendientes; las programaciones explícitas siguen separadas. El historial, sondeo,
vistas previas y notificaciones existentes entregan estos mensajes.

La cadencia compartida del servidor ahora inicia revisiones tras 30 segundos, con
intervalos posteriores mínimos de dos y diez minutos. El planificador trata los
saludos como aperturas y favorece una continuación natural breve; el silencio
posterior recibe progresivamente más espacio. Cron se ejecuta una vez por minuto,
así que los envíos son aproximados. El mismo comportamiento se aplica a iOS y web
sin cambios de cliente ni caché. Siguen vigentes los límites de tres mensajes, seis
evaluaciones, presupuesto diario, horas de silencio y cancelación. Consulta
[iniciativa](initiative.md#faster-cadence-validation) para migración 0033 y
validación local frente a validación en vivo.

## Mensajes consecutivos y ritmo del compositor

Tanto iOS como web permiten otro envío en cuanto se acepta la solicitud HTTP
anterior, sin esperar la respuesta del agente. Escribir el siguiente borrador sigue
disponible durante el envío; los envíos siguen serializados mientras el resultado
de un UUID del cliente es incierto. Se mantienen los límites de diez turnos activos
y veinte por minuto por cuenta. La atención del agente sigue siendo exclusiva entre
conversaciones privadas y grupos.

Las ediciones reales del campo informan actividad (como máximo una vez cada dos
segundos en web; iOS comprueba ediciones nuevas cada tres segundos). El foco,
visibilidad del teclado y texto retenido del borrador no son escritura.
`chat_visit.typing_at` vence a los seis segundos para regular el ritmo, separado
del lease de conexión de treinta segundos. La entrada aceptada borra actividad
anterior y salir cierra la visita. Las visitas vencidas se renuevan solo tras una
entrada nueva. Informar actividad no sube texto de borradores y sus fallos nunca
bloquean envíos.

Tras la demora existente de conexión de tres segundos, un turno permite hasta doce
segundos adicionales de pausas del compositor, comprobadas cada dos segundos. Antes
de la inferencia y atómicamente antes de publicar, los mensajes normales consecutivos
de hasta 1.000 bytes UTF-8 cada uno pueden integrarse en el siguiente mensaje en
cola, con un máximo de siete mensajes anteriores por ráfaga. Los mensajes citados,
adjuntos, programaciones y resultados automáticos conservan su ejecución. Los
mensajes con capacidades nativas pueden agruparse cuando su contexto de
dispositivo/capacidades es idéntico; activar experimentos nativos por sí solo no
impide agrupar. Cada mensaje original conserva su UUID, texto y orden. El modelo
y la autorización de herramientas reciben la ráfaga acotada como solicitud actual,
incluidas correcciones posteriores. Los presupuestos existentes de herramientas
se aplican por ráfaga, incluido el límite de una publicación de solicitudes grupales.

Para compatibilidad con la restricción existente de que completado requiere texto,
una fila integrada usa internamente el estado terminal `failed`/`MESSAGE_BATCHED`,
expuesto por la API como `complete` con respuesta/error null. No es un fallo de
generación ni un turno reintentable. No produce burbuja del asistente, respuesta
no leída, push ni episodio de iniciativa. Su recibo de lectura se registra solo
cuando el modelo procesa la ráfaga; los mensajes agrupados procesados siguen siendo
aptos para extracción de memoria fundamentada y búsqueda de historial.

Si la edición sigue siendo reciente tras generar, una decisión del modelo sin
herramientas elige si la respuesta preparada debe esperar brevemente o publicarse
de inmediato (por ejemplo, una respuesta urgente o recibo de acción). Solo ve texto
enviado y respuesta preparada, usando las reglas actuales de modelo/consentimiento
y aislamiento por conectores. Una decisión positiva permite hasta seis segundos
adicionales, nunca espera indefinida. La decisión no tiene herramientas; una salida
inválida o fallo del proveedor publica por defecto. La latencia del modelo es
adicional a esos límites de pausa. La recuperación conserva su alternativa acotada
existente de solo respuesta y puede publicar inmediatamente. La escritura sola no
regenera respuestas. Un mensaje apto más nuevo aceptado antes de publicar descarta
el borrador obsoleto e integra su entrada humana en el siguiente turno en cola.
Esta comprobación final y la publicación comparten una transacción D1 para que un
envío no se intercale entre ambas. También se comprueba tras preparar memoria para
evitar inferencia obsoleta innecesaria.

La migración `0036_reply_publication_guard.sql` persiste `tools_started` antes de
cualquier llamada de herramienta, incluidas lecturas. Una vez iniciada una
herramienta, la respuesta conserva su ejecución y recibo; agrupar nunca oculta ni
repite acciones. Las filas existentes en curso o reintentadas se marcan de forma
conservadora durante la migración. Las comprobaciones independientes de acciones
nativas/publicaciones grupales conservan resultados ya registrados. La política
de rondas de respuestas grupales no cambia.

La migración `0035_chat_message_queue.sql` se requiere antes de usar la nueva API;
reemplaza el índice de turno activo único por uno de cola y añade la hora de
escritura. Consulta [infraestructura](infrastructure.md#consecutive-message-queue).

Ambos clientes presentan una cronología de mensajes independientes: las burbujas
humanas usan `createdAt`, las del asistente `updatedAt` de publicación, con IDs
estables por lado y desempates deterministas por secuencia/lado para horas iguales.
Las filas de estado quedan después de los mensajes cargados; los recibos nativos
permanecen con su solicitud. Los envíos pendientes web también participan. Una
respuesta a un turno anterior guardada tras un segundo mensaje humano aparece,
por tanto, después de ambos en vez de entre ellos. Las burbujas históricas adquieren
el orden corregido al actualizar/reabrir. Las citas, reacciones y paginación siguen
dirigiéndose a los IDs/secuencias de turnos originales.

La validación estática cubre TypeScript de API/web, comprobación Swift de toda la
app iOS contra el SDK Simulator y compilación SQL. No implica verificación en
ejecución ni dispositivo. Verifica envíos rápidos, ediciones durante generación,
foco solo del teclado, borradores abandonados, retomar edición tras inactividad,
navegación, segundo/primer plano, reintento sin conexión, adjuntos/acciones de
dispositivo, atención de contactos compartidos, revocación de acceso y cambio de
cuenta con conversaciones ficticias.

## Dirección de personalidad

Una [personalidad del contacto](personality.md) habilitada añade al contexto datos
estables compartidos del personaje, hechos autoritativos del calendario y prosa de
comportamiento. Un clasificador separado y acotado crea una observación pendiente
idempotente del origen actual, con el mismo modelo permitido y sin herramientas.
La proyección de relación incluye solo respuestas de texto publicadas aptas, con
continuidad entre contextos privados/grupales aptos. Las causas de origen quedan
en servidor; el contacto recibe un plan categórico de actuación por destinatario
actual. Las conversaciones con conectores no importan ni exportan estado de
relación. Una ráfaga descartada, intento fallido, turno omitido o respuesta de solo
reacción no pueden acumular resentimiento. Las entregas de recuperación y
programadas leen el estado existente sin evaluar un mensaje humano nuevo. Las
entregas de resultados grupales conservan el estilo del contacto manteniendo la
atribución y las restricciones de acciones existentes. Una reacción a una pausa
vista requiere recibos de lectura reales, sigue siendo leve y decae sin reducir
la afinidad duradera. Siguen aplicándose las reglas existentes de consentimiento,
herramientas, agrupación, publicación y entrega.

### Mirar fotos de perfil

Los contactos privados pueden usar `view_profile_photo` para inspeccionar su avatar
canónico o la foto de cuenta de la persona actual cuando sea útil. Está disponible
desde iOS y web sin adjuntar manualmente la imagen. Las fotos ajenas no están
disponibles mediante llamadas privadas. Las lecturas revalidan acceso y versión de
foto antes de inferir; consulta [fotos de perfil](profile-photos.md#profile-images-available-to-contacts)
para presupuestos de imágenes, procesamiento del modelo, caché y validación pendiente.

## Mensajes sucesivos

Un contacto puede elegir una burbuja de respuesta o una secuencia corta, entregada
duraderamente con pausas breves. iOS y web muestran cada parte entregada con su hora
de servidor y conservan visible la escritura mientras corre el turno. Un mensaje
humano nuevo detiene la parte no enviada. Reacciones privadas, citas, sonidos,
no leídos y push conservan identidad de turno. Consulta los
[mensajes sucesivos del contacto](reply-messages.md) para límites, recuperación,
historial antiguo, caché y pasos de verificación.

Los contactos pueden enviar una imagen contextual generada, o un álbum de dos o
tres cuando el contenido requiere varios elementos visuales, con su primer mensaje
de respuesta y referencias opcionales a avatares actuales autorizados. Consulta
[álbumes](generated-images.md#albums). La entrada entregada del asistente contiene
metadatos de adjuntos; ambos clientes usan la UI habitual de imagen/pie entrantes
y la caché de imágenes privadas. Consulta [imágenes generadas](generated-images.md).

La generación usa avatares actuales para selfies solicitadas y miembros nombrados,
y puede recuperar fotos enviadas por personas o contactos en este mismo chat como
referencias de escena/edición. Las descripciones visuales internas son solo del
servidor y no aparecen en pies, historial público ni cuadrículas multimedia.
Ambos clientes usan la API compartida y el visor/caché existentes de imágenes
entregadas; no requiere cambios de formato del cliente. Consulta
[referencias y descripciones de imágenes](generated-images.md#internal-image-descriptions-and-retrieval)
para alcance, indexación diferida de historial antiguo, límites, retención y
verificación.

### Contactos iniciales del onboarding

Los cinco contactos publicados atómicamente por el onboarding tienen
`onboardingChat: 1` (migración 0049). iOS y web los incluyen en Chats antes del
primer mensaje, usando **Aún no hay mensajes**, sin contadores de no leídos ni
mensajes/recibos sintéticos. La hora de creación define el orden inicial; la
actividad real usa orden y paginación normales. Los otros contactos vacíos siguen
excluidos. El marcador queda en los snapshots existentes de contactos de sesión y
se elimina con el contacto, no al abrir un chat. Consulta
[onboarding](onboarding.md) y [caché](caching.md).

## Indicadores de actividad de respuestas

Los encabezados privados e indicadores entrantes muestran **Grabando...** para una
respuesta que será nota de voz, desde el inicio de su pausa de composición hasta
la síntesis. Desde el 30/10/2026 todos los contactos muestran **Escribiendo...**
durante inferencia, incluidos aquellos cuyas respuestas pueden hablarse: mostrar
solo En línea después de Leído mientras trabajaba el modelo parecía ignorar a la
persona. Grabando... reemplaza Escribiendo cuando se sabe que será voz.
**Investigando...** reemplaza ambos mientras corre una búsqueda web
(`isResearching` en presencia; los clientes anteriores siguen mostrando
Escribiendo...). Los contactos grupales ya permanecen conectados durante inferencia
y ahora comienzan con Grabando... cuando su respuesta de un mensaje será hablada.
Los grupos etiquetan por separado a cada contacto que responde. Volver a texto
restaura escritura y un turno terminado vuelve a la presencia normal. Las segundas
líneas de lista reemplazan temporalmente el último mensaje con **Escribiendo...** o
**Grabando...**, ocultando su remitente/marcas. Los grupos nombran a los contactos
en una oración de API (`shared/activity.ts`): **Ana está escribiendo...**,
**Ana y Bo están escribiendo...**, **Ana, Bo y Cy están escribiendo...** (los clientes
actuales la redactan con formato de lista local: **Ana, Bo y Cy están escribiendo...**),
o **Ana está investigando, Bo está escribiendo...** para actividades mixtas. Más
de tres contactos, o una línea de más de 48 caracteres, se reduce a
**4 personas están escribiendo...** (**están respondiendo...** si difieren las
actividades). Los resúmenes de grupos también llevan las mismas entradas
estructuradas como `replyActivityEntries` (`[{ name, activity }]` o `null`);
los clientes actuales redactan la línea en el idioma de interfaz con las mismas
reglas ([localización](localization.md)), mientras las versiones anteriores muestran
`replyActivity` literalmente. Las vistas previas que la API redacta para mensajes
no textuales (`Voice message`, `Scheduled message`, `Group response`,
`Working on a task`, `Sticker <emoji>`, `Attachment: <name>`, `<n> photos`) se
traducen al mostrarse en ambos clientes. No cambian las horas de mensajes, no leídos
ni orden. Las burbujas de trabajo de tareas conservan su etiqueta existente.
Se aplica tanto a iOS como a web.

La actividad procede de los resúmenes existentes de contactos/grupos de sesión y
del sondeo existente de conversaciones; no hay solicitudes por fila ni cachés
nuevas de disco. Las listas se actualizan cada segundo en primer plano con la
deduplicación, comprobaciones de generación de cuenta, paginación y expulsión
existentes. Las lecturas exitosas reemplazan actividad aunque no cambie el último
mensaje. El comportamiento sin conexión/ante fallos conserva el último resumen
cargado hasta actualizar correctamente; por eso la actividad puede quedar obsoleta
sin conexión. Un contacto compartido solo expone escritura o grabación privada
al participante atendido; un grupo solo expone sus propias respuestas atendidas.
La superposición de grabación del servidor (`markRecording` en
`apps/api/src/chat/presence.ts`) vence tras como máximo dos minutos, se borra para
el turno atendido tras sintetizar (incluida la alternativa de texto) y se reinicia
en una fase nueva de escritura. No indica que el contacto esté escuchando audio
entrante.

Requiere la migración `0062_recording_presence.sql`. La comprobación estática de
tipos API/web, análisis de sintaxis Swift y compilación SQL no validan el
comportamiento visible ni audible. Sigue pendiente verificar en
dispositivo/navegador: respuestas de texto/voz/alternativa, varios contactos en
grupo, volver a la lista durante síntesis, reabrir un chat vacío, actualizar,
actualización fallida/sin conexión y recuperación, acceso revocado y cambio de
cuentas. Una síntesis muy rápida puede completarse entre ciclos de sondeo.

## Vaciar y archivar

Consulta el [ciclo de vida del chat](chat-lifecycle.md) para eliminar historial
privado con retención opcional de memoria, Archivar/Desarchivar, eliminación por
creador/miembro, barreras por revisión de historial y limpieza reintentable de
recursos. Vaciar cancela programaciones del chat y trabajo de tareas/monitores,
además de respuestas.

## Aprendizaje de conversación

Las respuestas privadas usan [aprendizaje de conversación](conversation-learning.md)
para aplicar observaciones fundamentadas de interacción, un pequeño ajuste de
comportamiento y preguntas contextuales opcionales. Los intercambios humanos
directos inician periódicamente revisiones silenciosas duraderas; programaciones,
trabajo de tareas y entrega de resultados grupales no los entrenan. Ambos clientes
permiten inspeccionar, desactivar y restablecer desde los detalles del contacto.
La memoria factual habitual y la personalidad configurada siguen separadas.
Se requiere migración 0067; sigue pendiente la validación de modelo/dispositivo.

## Redacción natural y profundidad

Ambos clientes reciben el [estilo de conversación](conversation-style.md)
compartido: nombres usados con moderación, vocabulario regional sutil incluso sin
voz, expresión fundamentada de identidades creativas y hábitos opcionales estables
de escritura por contacto. Las respuestas recientes de la audiencia actual aportan
señales acotadas sobre nombres/longitud; la redacción y mediciones privadas nunca
se llevan a grupos. Las respuestas sociales breves siguen breves; explicaciones,
evidencia y matices necesarios solicitados conservan profundidad. Las respuestas
programadas/de tareas y la iniciativa privada usan la misma dirección de estilo
dentro de sus permisos existentes. No se añade caché del cliente ni contrato de
respuesta. La orientación de entrega privada se refuerza al generar la respuesta
final sin otra llamada; las respuestas grupales pueden usar la revisión opcional
acotada de la guía enlazada. No cambian mensajes existentes; sigue pendiente
verificar modelo/dispositivo.

## Orquestación ágil (2026-10-30)

El ciclo visible (entregado, En línea, Leído, Escribiendo/Grabando, mensaje) no
cambia, pero sus pausas ahora se superponen al trabajo en lugar de precederlo:

- **La generación comienza al leer.** `prepare-reply` inicia `contactReply` y,
  en paralelo, espera la pausa de lectura restante antes de `markTyping`. El
  presupuesto de composición de la primera burbuja descuenta el tiempo visible
  Escribiendo, por lo que suele publicarse en cuanto existe. Las esperas del
  compositor y la agrupación siguen antes de generar, así que las personas que
  escriben no desperdician llamadas.
- **Un chat atendido lee de inmediato.** Cuando la persona tiene abierto el chat
  (un `chat_visit` abierto) y el contacto sigue En línea, los pasos de conexión
  y lectura duran 0,3 segundos en lugar de un segundo cada uno: el contacto está
  «en el chat», por lo que el mensaje pasa casi directamente a Leído.
- **Los contactos se quedan mientras hablas.** El chat visible consulta
  `GET /turns` cada segundo. Ese sondeo renueva la visita abierta y, cuando el
  contacto ya está En línea y la conversación tuvo un mensaje en los últimos tres
  minutos, extiende su lease de presencia 20 segundos (limitado a una escritura
  cada diez segundos). Nunca conecta un contacto Sin conexión. Salir del chat
  detiene el sondeo y el lease vence normalmente; las conversaciones inactivas
  igual pasan a Sin conexión tras tres minutos. Los consumidores de visitas usan
  `typing_at`, así que visitas más largas no cambian ritmo ni iniciativa.
- **La investigación se anuncia.** Consulta la
  [investigación web](web-research.md#announced-research-and-grounded-answers-migration-0071):
  el contacto envía primero una burbuja breve de «lo busco» (`<turn>/assistant/0`),
  muestra Investigando... durante la búsqueda y continúa con lo que encontró.
  Las burbujas posteriores se desplazan tras el anuncio. Un turno cuya única
  burbuja es el anuncio aún puede usar recuperación de respuesta.

## Exportación JSON

Detalles → **Exportar chat** descarga esta conversación como transcripción JSON
legible en iOS y web. Consulta [exportación de chat](chat-export.md).
