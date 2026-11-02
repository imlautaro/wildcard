# Conversaciones grupales

Las respuestas interpretan las pausas mediante las fechas visibles de mensajes y
la llegada del disparador, separadas de la demora de generación. La
[orientación temporal](chats.md#temporal-conversation-context) compartida permite
reconocer opcionalmente un regreso o asunto pendiente según la personalidad,
priorizando la solicitud actual y las reglas existentes de rondas/omisión. Los
grupos no aportan zona horaria local del destinatario, por lo que los bots no deben
inferir la mañana/noche de nadie desde UTC ni desde su zona de cumpleaños ficticia.
Una pausa grupal no demuestra que alguien ignorara una pregunta y no se revelan
pausas privadas. No se introduce servicio, migración, llamada al modelo, ajuste ni
caché nuevos; iOS y web reutilizan su sondeo de historial. La verificación con el
modelo real y los clientes sigue pendiente.

La respuesta inicial a un mensaje humano puede hacer [investigación web](web-research.md)
para entender un tema y continuar la discusión compartida sin tarjeta de informe.
Un informe duradero solicitado por una persona sigue convirtiéndose en documento
grupal con fuentes. Todos los contactos de esa ronda humana comparten una reserva
de investigación para que otro contacto reutilice hallazgos conversacionales
completados sin multiplicar solicitudes pagas. Los disparadores de bots, avisos de
tareas, revisiones, solicitudes dirigidas y grupos aislados por conectores no
adquieren búsqueda. Ambos clientes muestran respuestas conversacionales normales;
los informes explícitos usan sus cachés existentes de documentos grupales y panel
de fuentes. Investigar no autoriza escrituras externas ni acceso a conversaciones
privadas.

Los grupos reúnen agentes de contactos existentes y cuentas humanas en un historial
compartido. Desde Chats, toca **+ → Contactos → Crear grupo**. Toca el encabezado
del grupo para abrir sus detalles en la pila de navegación existente. El chat no
tiene un botón final de miembros y los detalles no se abren en una hoja inferior.
La pantalla de detalles tiene un menú **+** con **Invitar a un usuario** y
**Añadir tu contacto**, habilitado para miembros con permiso de invitación.
Invitar abre un formulario separado de correo. Añadir abre la lista alfabética de
contactos con avatares: los ya presentes siguen visibles, desactivados y con
**En el grupo**. Los contactos compartidos creados por otra persona también están
desactivados y etiquetados **Contacto compartido**. Seleccionar uno apto abre su
pantalla de consentimiento explícito de memoria/Contributor antes de añadirlo.
Volver a la lista actualiza las insignias de pertenencia. Los detalles también
gestionan identidad y permisos, y muestran las fotos y archivos del grupo bajo
**Compartido en este chat** (consulta [adjuntos](attachments.md#shared-in-this-chat)).
Los grupos mantienen [listas de tareas](tasks.md) compartidas que asignan trabajo
a contactos y personas, y [miniapps grupales](mini-apps.md#group-mini-apps) que un
contacto crea cuando se le pide; todos los miembros ven y editan los mismos valores
guardados. Detalles → **Miniapps** las enumera. Las invitaciones aparecen en
**+ → Contactos → Invitaciones de grupo**, con contador pendiente. Contactos
incluye también **Invitaciones de contacto**. Son invitaciones dentro de la app;
el servidor no envía correos.

Al entrar por primera vez, el chat conserva el indicador de carga hasta recibir
correctamente el primer historial. Que lleguen antes los metadatos del grupo no
muestra **Iniciar una conversación**. Ese estado vacío aparece solo tras un
historial vacío exitoso; el historial en caché sigue visible al actualizar. Los
fallos iniciales muestran el error y control **Actualizar** existentes. Consulta
[verificación de caché](caching.md#group-navigation-and-secondary-screens) para
comprobaciones en dispositivo.

La lista Chats de Inicio espera las cargas iniciales de contactos y grupos antes
de mostrar filas combinadas, ordenadas por actividad dentro de la ventana de
paginación cargada. Las solicitudes corren en paralelo. Las filas en caché siguen
visibles durante actualizaciones; un origen fallido expone controles de reintento
y las filas disponibles. Consulta [caché y verificación de listas](caching.md#chats-and-contacts-lists).

## Colores de remitentes

Cada identidad humana y de agente recibe un color de paleta estable y pseudoaleatorio
dentro del grupo. Las etiquetas usan el mismo color en burbujas de texto,
imagen/pie y PDF, incluidos mensajes de antiguos miembros. Un hash fijo del ID
del grupo, tipo e ID de miembro mantiene colores entre aperturas, renombres y
paginación; pueden repetirse. La paleta combina tintas oscuras para modo claro y
tonos claros para oscuro. Los mensajes propios conservan su diseño sin etiqueta
de remitente. No requiere llamadas de red, asignaciones persistidas ni caché
adicional. La [app web](web.md) usa el mismo hash y paleta, por lo que un remitente
tiene el mismo color en ambos clientes.

Verificación en dispositivo: compara etiquetas en texto, imágenes y PDF con ambas
apariencias, reabre el grupo, carga mensajes antiguos y renombra/elimina un miembro.
Confirma colores estables y nombres legibles. Sigue pendiente la verificación
visual en dispositivo; las comprobaciones estáticas no demuestran la apariencia.

## Pertenencia y consentimiento

El creador es propietario del grupo y puede conceder o revocar **Puede invitar**
por miembro humano. Permite invitar cuentas y añadir contactos creados por ese
miembro. Quien recibe un contacto compartido no puede añadir el agente de otra
persona. Solo el propietario del grupo o quien aportó el contacto pueden eliminar
un contacto; solo el propietario puede eliminar a otra persona o dar permisos.
Los miembros pueden salir. El propietario debe eliminar el grupo para salir;
no se implementó transferir propiedad.

**Diseño de detalles (iOS y web).** Filas con íconos: **Hablar de mis chats privados**
muestra «N de M activados» y abre una hoja con interruptores por contacto
(explicación tras un botón informativo), luego Conexiones, Miniapps y Tareas.
Los miembros son filas compactas con rol («Propietario», «Puede invitar», «Miembro»,
«Contacto»); un botón «⋯» en los administrables ofrece **Permitir invitaciones/Dejar
de permitir invitaciones** y **Eliminar del grupo**. Invitar y añadir contactos
se abren desde **+** en la barra iOS y las hojas **Invitar personas** /
**Añadir un contacto** de web, donde sigue visible el texto de memoria compartida
cubierto por el consentimiento. Ambos clientes ofrecen además **Consentimiento
de memoria compartida** como fila con hoja. En web actualizar es un ícono en la barra;
iOS usa deslizar para actualizar.

Crear, aceptar y añadir un contacto requieren confirmación explícita de memoria
compartida inicialmente desmarcada. Con Contributor también requieren consentimiento
separado de uso de datos Contributor. Los detalles permiten renovarlo para mensajes
futuros: **Consentimiento de memoria compartida** en iOS y web muestra «Pendiente»
si falta el consentimiento Contributor de esta cuenta, aparece encima un aviso
**Dar consentimiento** y las personas sin él llevan «Consentimiento Contributor
pendiente». Solo cada miembro puede consentir por sí mismo (`POST /:id/consent`);
no hace falta eliminarlo y volverlo a añadir. El aviso del chat enlaza a Miembros
(`?consent=1` en web abre la hoja si falta el consentimiento de esta cuenta).
Mientras falte el consentimiento de cualquier miembro humano, el chat grupal
muestra un aviso sobre el compositor a partir del snapshot de detalles, antes de
que alguien envíe un mensaje: quienes no consintieron ven **Dar consentimiento**
(abre Miembros), y los demás ven quiénes siguen pendientes.
La divulgación cubre historial grupal (incluidos mensajes anteriores a
entrar, salvo que quien invitó o añadió desactivara **Puede ver mensajes anteriores**;
consulta [avisos de entrada y bienvenidas](#join-banners-and-welcomes)), nombres y
fotos de perfil, acceso a memorias existentes de contactos compartidos y recuerdos
futuros de mensajes humanos grupales recuperables en otras conversaciones. En esta
versión el consentimiento es obligatorio para pertenecer; no hay modo de memoria
privada dentro del grupo. Añadir un agente propio establece su indicador existente
`memory_shared`. Eliminarlo no reinicia ese indicador ni revoca el uso compartido
privado existente del contacto.

Las transcripciones, adjuntos y programaciones privados nunca se incluyen en el
contexto grupal. El contexto del modelo contiene historial grupal reciente acotado
y memorias compartidas seleccionadas, atribuidas por ID estable y nombre visible.
Cada contacto conserva identidad, presencia global y memoria; añadirlo no crea un
agente independiente. La extracción guarda como máximo tres recuerdos fundamentados
por mensaje humano y agente, con cita textual del origen, hasta 64 claves por
agente/usuario origen. Esos recuerdos se usan en respuestas de ese grupo y en chats
privados de personas que pertenecen a él; nunca en otro grupo. Una respuesta grupal
usa hechos de chats privados solo de sus propios miembros y nunca de chats
mantenidos privados ([privacidad](privacy.md)). La extracción es de mejor esfuerzo
y aún no ofrece herramienta explícita para olvidar. Los agentes conservan además
su propia identidad/preferencias explícitas entre respuestas privadas y grupales
en un perfil separado del agente. Los chats privados pueden descubrir miembros
de grupos comunes y recuperar declaraciones humanas/de bots originales de ese
grupo solo mientras la persona actual y el agente que responde son miembros.
Las herramientas grupales buscan solo en el historial de su grupo actual, dentro
del snapshot de secuencia del borrador/revisión. No exponen perfiles privados
ajenos ni respuestas privadas sin procesar. FTS grupal guarda las declaraciones
una vez, con búsqueda/extractos acotados en lugar de copias por bot. Consulta
[identidad y procedencia entre chats](memory.md#one-agent-identity-across-private-chats-and-groups)
para migración 0019, límites de extracción/reintento, revocación y verificación.

Salir/eliminar una persona detiene la recuperación de sus memorias grupales y
elimina los contactos que añadió. Eliminar un contacto detiene la recuperación
de sus memorias originadas en ese grupo. Los mensajes y respuestas ya generadas
permanecen en el historial. Eliminar el grupo borra en cascada mensajes, trabajos,
invitaciones y memorias originadas allí. No se retractan respuestas entregadas ni
memorias privadas no relacionadas. El consentimiento no puede retirar datos ya
enviados a Meta. Cambiar a Contributor bloquea generación hasta que consientan los
miembros actuales; los mensajes históricos sin consentimiento Contributor siguen
excluidos aun tras renovarlo.

Las invitaciones vencen tras 24 horas y requieren permiso actual de invitación al
aceptarse. Revocarlo elimina las invitaciones pendientes de ese remitente. Límites:
16 personas y ocho contactos por grupo, 100 pertenencias por usuario, 20 invitaciones
sin vencer por grupo, 40 mutaciones por usuario/minuto, mensajes de hasta 4.000
caracteres Unicode y máximo 64 respuestas de contactos en cola/activas antes de
aceptar otro mensaje humano. Son elecciones de implementación, no requisitos de
producto. Un mensaje aceptado puede añadir hasta ocho respuestas por encima del
umbral de admisión. Salir no borra el historial; la UI lo explica.

## Rondas de respuestas y atención exclusiva

Cada mensaje humano aceptado captura los contactos actuales en una ronda finita:
como máximo una respuesta por contacto. Un [coordinador de ronda](#round-coordinator-migration-0071)
elige quién habla. Hasta cuatro contactos preparan simultáneamente. La admisión
usa los cuatro lugares incompletos más antiguos, con reserva de atención atómica
única por agente y tope de cuatro reservas por grupo; se publica según rango del
plan y después disponibilidad. Pueden encolarse mensajes humanos nuevos mientras
responden los contactos. Los mensajes de bots publicados pueden encolar otros
contactos del mismo intercambio, sujetos a [energía compartida y límites finitos](energy.md).
Una persona puede [pedir en privado al agente que publique en el grupo](group-requests.md),
incluidos saludos y anuncios. Las publicaciones habituales no requieren destinatario
designado y permiten respuestas públicas acotadas. Una pregunta dirigida comienza
con una respuesta designada que vuelve en privado; esa respuesta pública puede
iniciar conversación acotada. No se crean resultados privados adicionales para la
conversación posterior. Los mensajes grupales siguen publicándose atómicamente
con marca de agua de historial nueva. Los agentes añadidos después no responden
mensajes antiguos, tampoco tras reintento HTTP. Un grupo puede no tener bots.

Cada borrador identifica el disparador humano o bot, miembros actuales, participantes
de la ronda y respuestas anteriores de ella, más hasta 24 mensajes aptos recientes.
Las respuestas anteriores de ronda (máximo ocho) se suministran aparte para que
tráfico humano nuevo no las oculte fuera de la ventana reciente. El texto se recorta
a 1.600 bytes UTF-8 por entrada con indicadores de truncado; la solicitud original
se entrega completa. Historial y herramientas de lectura comparten una marca de
agua inclusiva fija por borrador o revisión. Ahora incluyen mensajes humanos
posteriores ya aceptados antes de esa marca, sin detenerse en la solicitud original.
La pertenencia actual del autor y elegibilidad Contributor filtran historial y
herramientas. Siguen inaccesibles transcripciones privadas e historial de otros
grupos sin procesar.

La instrucción grupal pide continuar el intercambio, evitar saludos/explicaciones
repetidos y preguntas finales automáticas, y mencionar a otro miembro solo cuando
aporte valor. Los agentes conservan sus preferencias aunque otro bot las comparta.
Una pregunta para todos normalmente sigue recibiendo la respuesta propia de cada
agente. Las solicitudes humanas posteriores tienen rondas separadas; este turno
las usa para contemplar correcciones, cancelación o reemplazo sin volver a responder
la solicitud nueva. Las decisiones estructuradas contienen solo una acción y texto
publicable; los metadatos de revisión nunca se publican como mensaje. Son
instrucciones al modelo, no garantía de calidad ni detección perfecta de cancelación.

La publicación comprueba atómicamente cualquier mensaje posterior a la marca del
borrador, revalida atención, pertenencia del autor, uso compartido del agente y
consentimiento Contributor, inserta como máximo un mensaje y completa el lugar.
Por tanto, una carrera entre última lectura e inserción no publica un borrador
sin comprobar. Si cambió el historial, el agente revisa su borrador anterior con
un snapshot acotado nuevo y puede conservar exactamente el texto, revisarlo u
omitir el turno obsoleto. Hay como máximo dos revisiones tras el borrador inicial.
Si el historial vuelve a cambiar tras la segunda, el lugar se completa sin mensaje
para que continúe la cola. Las solicitudes explícitamente canceladas o claramente
reemplazadas también pueden omitirse al redactar. Omitir no crea mensaje, no leídos,
push ni evento de memoria propia; el mantenimiento fundamentado de memoria humana
sigue su política. Los mensajes humanos posteriores conservan sus rondas; los bots
posteriores comparten el intercambio original y presupuesto fijo de publicación.
Las aperturas públicas humanas nuevas requieren respuesta inicial generada salvo
que tráfico humano nuevo permita cancelar/reemplazar; saludos similares antiguos
no suprimen una apertura nueva. Los agentes pueden omitir turnos normales posteriores
de bots si no aportan nada útil. Los turnos agotados/limitados terminan sin inferencia
ni burbuja.

Preparar borrador/revisión, cada inferencia, cada resultado de herramienta, las
confirmaciones de lectura y la publicación protegida usan pasos duraderos separados
de Workflow. Un resultado exitoso se reutiliza al repetir; un fallo de formato final
nunca reinicia investigación completada. La preparación conserva dos reintentos y
dos minutos de límite, permitiendo el clasificador opcional de personalidad y
lecturas de contexto. Los pasos de modelo tienen un reintento transitorio y límite
de un minuto; las solicitudes al proveedor conservan 45 segundos. Los pasos de
herramientas no reintentan automáticamente y tienen límite de un minuto; el registro
de reservas/recibos MCP sigue protegiendo interrupciones anteriores al checkpoint.

Los borradores iniciales tienen dos fases explícitas. Las revisiones de borradores
obsoletos van directamente a finalización sin herramientas con historial nuevo
acotado y borrador guardado; no reinician investigación. La recopilación de
evidencia expone recuperación, reacciones y, solo para disparadores humanos directos
autorizados, MCP. No pide salida estructurada. El modelo termina la fase mediante
la herramienta interna de control sin efectos secundarios `finish_group_research`,
llamada sola. La prosa normal no termina investigación ni se publica como decisión.
La recopilación admite como máximo seis rondas de modelo y seis ejecuciones
internas/externas en una ventana de admisión de tres minutos. Las solicitudes ya
iniciadas pueden terminar después. Agotar el presupuesto pasa a finalización con
evidencia disponible; nunca concede más ejecuciones.

La finalización no expone herramientas y pide JSON estricto con las acciones
actualmente permitidas. El servidor valida además acción, texto, campos extra,
límite de 20.000 puntos de código y reglas de apertura/revisión. La salida
inválida/truncada obtiene un intento nuevo de finalización con la misma evidencia.
Los presupuestos son 4.096 tokens para investigación y primera finalización, y
8.192 para recuperación, incluido razonamiento. La prosa intermedia y salida
truncada nunca cuentan como ejecución exitosa ni decisión final. El análisis puede
ser más largo que la charla grupal habitual. Los fallos registran códigos acotados
sin texto del proveedor. Ninguna alternativa publica silenciosamente prosa sin
validar ni convierte una respuesta inválida en omisión.

Se comprueban acceso al grupo/origen/atención actuales antes de cada inferencia y
ejecución nueva. Los recibos externos en caché también requieren propiedad actual
del conector, permisos de contacto/grupo, generaciones de permisos/OAuth y aprobación
de herramientas antes de inferencia posterior. MCP mantiene comprobaciones de
admisión más estrictas, incluido rechazo tras un disparador humano posterior.
Las revisiones no tienen herramientas. Los snapshots siguen acotados y conservan
su marca de historial. Los adjuntos se guardan como referencias a objetos y se
cargan dentro de pasos de inferencia; sus bytes no se escriben en la salida de
pasos Workflow. No hay puesta al día ilimitada ni generación paralela de borradores.
Hasta dos revisiones siguen ejecutándose solo después de que la protección atómica
detecta mensajes nuevos. Las fases adicionales pueden aumentar latencia/costo,
incluso para respuestas habituales; las mediciones en vivo siguen pendientes.

Regresiones ficticias opcionales: `node scripts/checks/group-completion.cjs`,
`node scripts/checks/group-energy.cjs` y `node scripts/checks/group-receipts.cjs`.
Cubren orquestación/repetición, decisiones malformadas/truncadas, pérdida de permisos,
límites, reglas de apertura/revisión y tiempos de lectura con proveedores simulados.
No demuestran comportamiento real del proveedor ni dispositivo. Para este cambio
solo se ejecutaron comprobaciones estáticas; estas regresiones no se ejecutaron.

Referencias de implementación: [salida estructurada de Meta](https://dev.meta.ai/docs/structured-output),
[Meta Chat Completions](https://dev.meta.ai/docs/protocols/chat-completions) y
[reglas de Cloudflare Workflow](https://developers.cloudflare.com/workflows/build/rules-of-workflows/).

`agent_attention` sigue siendo el bloqueo único por agente. El despacho elige el
trabajo apto más antiguo entre chats privados y rondas grupales. Un grupo admite
como máximo cuatro agentes preparándose (dos antes de migración 0071), y cada uno
espera su trabajo en otros chats. Una decisión no planificada de responder u omitir
sigue En línea, y la investigación web muestra Investigando. Los hablantes
planificados escriben durante generación; en otro caso solo un borrador terminado
no vacío inicia Escribiendo, seguido de espera duradera de composición según
longitud antes de publicar el primer texto. Cada parte posterior renueva Escribiendo
y recibe su espera escalada según longitud Unicode, con tope de 15 segundos
(60 antes del 30/10/2026). El servidor comprueba que el mensaje anterior siga vigente
antes de iniciar cada espera posterior y revalida acceso/historial al publicar.
Las notas de voz conservan el aviso breve Grabando. Consulta [mensajes sucesivos](reply-messages.md)
para tiempos. Revisar contexto vuelve a En línea al reconsiderar; publicar sigue
revalidando historial, permisos y energía para descartar borradores cambiados o
revocados. Guardar la respuesta termina la escritura visible; la extracción de
memoria termina antes de liberar al agente a otro chat. La escritura privada sigue
limitada a la conversación privada atendida; un contacto que responde en grupo
aparece En línea en sus chats privados. Los reintentos de Workflow comprueban
finalización guardada antes de generar otra vez. Cron recupera despachos faltantes
y reservas terminales. Los trabajos grupales eliminados mantienen bloqueada la
atención activa hasta que termine el Workflow o la recuperación observe terminación,
evitando llamadas al modelo superpuestas.

La comprobación estática TypeScript y preparación SQL EXPLAIN cubren este cambio
de contexto/revisión; el comportamiento en ejecución y calidad del modelo siguen
sin verificar. Con cuentas ficticias, comprueba la pregunta del color favorito a
tres bots (incluidas preferencias iguales), una pregunta de seguimiento repetida,
corrección/cancelación durante generación, mensaje entre revisión y guardado,
actividad continua durante ambas revisiones, truncado de historial/herramientas,
repetición tras guardar y cambios de acceso o consentimiento antes de publicar.
Confirma que los turnos omitidos liberen la cola y no creen burbujas, notificaciones
ni no leídos.

Los UUID de mensajes del cliente hacen idempotente el envío. Un fallo de red incierto
conserva el mismo UUID para reintentar. El rechazo de base de datos restaura el
borrador. El historial anterior se pagina de 50 en 50 y el sondeo se pone al día
entre páginas faltantes tras segundo plano. El sincronizador de sesión actualiza
historial visible y estado de respuesta cada segundo en primer plano; los grupos
en caché cambiados y recibos salientes pendientes también se actualizan con Inicio
visible. Las confirmaciones de no leídos corren en una cola de sesión que sobrevive
a navegación, para que una confirmación lenta no demore mensajes entrantes ni deje
un indicador antiguo en pantalla. Sigue pendiente verificar en dispositivo las
confirmaciones lentas, transiciones segundo/primer plano y regreso de detalles del
grupo. Revocar acceso borra el chat visible ante 404.

## API

Todas las rutas requieren autenticación Bearer bajo `/api/v1/groups`; las lecturas,
fotos y mutaciones de un grupo requieren pertenencia actual. Las respuestas tienen
`no-store`.

| Método/ruta | Propósito |
| --- | --- |
| GET / | Hasta 100 pertenencias, vista previa/hora/remitente, `unreadCount`/`lastReadSequence` por miembro, hasta 50 eventos `activity` no leídos, indicador de consentimiento de modelo |
| POST / | Crear con `name`, `shareMemory`, `contributorConsent`; devuelve `id` |
| GET /invitations | Invitaciones pendientes para el destinatario conectado |
| POST /invitations/:id/accept | Consentimiento explícito; devuelve `id` del grupo |
| DELETE /invitations/:id | Rechazar invitación propia |
| GET /:id | Grupo, miembros (las personas incluyen `contributorConsent` 0/1), respuestas en cola/activas/fallidas y permisos |
| POST /:id/consent | Renovar consentimiento propio para mensajes futuros |
| PATCH /:id | El propietario actualiza `name` |
| GET /:id/photo?version=uuid | Avatar actual, solo miembros |
| PUT or DELETE /:id/photo | El propietario reemplaza/elimina el avatar JPEG |
| GET /:id/messages/:messageID/attachment | Descargar archivo de un mensaje grupal |
| POST /:id/transcriptions | Transcribir WAV acotado para un miembro (solo clientes anteriores; consulta [mensajes de voz](voice.md)) |
| POST /:id/agents | Añadir `contactID` propio con consentimiento explícito e `includeHistory` opcional (predeterminado `true`) |
| DELETE /:id/agents/:agentID | Eliminar contacto del grupo |
| POST /:id/invitations | Invitar cuenta existente por `email`, `includeHistory` opcional (predeterminado `true`); `GET /invitations` lo devuelve |
| PATCH /:id/members/:userID | El propietario cambia `canInvite` |
| DELETE /:id/members/:userID | Eliminar una persona o salir |
| DELETE /:id | El propietario elimina el grupo |
| GET /:id/messages?before=sequence | Historial desde `historyStart` del miembro (null = completo), `messages` (con citas [`replyTo`](replies.md#api) y `event` de pertenencia que pueden ser null) y `nextBefore` |
| PUT /:id/read | Confirmar `sequence` mostrada para el miembro actual |
| POST /:id/messages | Enviar UUID `id`, `text`, `attachment` base64 opcional y `replyToID` opcional; HTTP 202 tras persistir |
| POST /:id/replies/:replyID/retry | Reintentar una respuesta fallida al terminar el trabajo activo |
| GET /:id/photos/:kind/:memberID | Avatar actual de miembro, tipo `user` o `agent` |

Las filas de lista muestran un borrador sin enviar como **Borrador:** y una reacción
más nueva que el último mensaje como `You: reacted with 👍` o
`<Name>: reacted with 👍`; consulta [vistas previas de chats](chats.md#chat-list-previews).

## Confirmaciones de entrega y lectura

La migración `0022_group_receipts.sql` registra las identidades humanas y de agentes
destinatarios al insertar cada mensaje nuevo, atómicamente con él. Excluye al
remitente. Los miembros nuevos no reciben mensajes anteriores; salir/eliminar un
miembro nunca borra su snapshot ni inventa confirmación. Un destinatario sin
confirmar que sale puede impedir que el mensaje alcance Recibido/Leído. Eliminar
el grupo/mensaje elimina sus recibos en cascada. Los snapshots contienen IDs, no
nombres ni copias del mensaje, y duran lo mismo que el mensaje compartido.

- Reloj: un envío local espera confirmación del servidor.
- Una marca tenue: mensaje persistido (Enviado), sin confirmar todos.
- Dos marcas tenues: todos los destinatarios capturados confirmaron recepción (Recibido).
- Dos marcas de color: todos los destinatarios capturados confirmaron lectura (Leído).

Para personas, iOS confirma explícitamente las vistas previas descargadas de Inicio
y el historial grupal. Una respuesta HTTP del servidor o solicitud APNs aceptada
no demuestra por sí sola recepción del cliente. Leer requiere una fila de mensaje
visible al menos al 50% en el grupo activo con la app en primer plano. Leer implica
recibir. Es confirmación de visualización del cliente, no prueba de atención ni
comprensión, y no significa abrir un PDF/imagen. La marca del contador de no leídos
es separada y no concede recibos de lectura. Los clientes anteriores no envían
estas confirmaciones y pueden dejar pendiente el agregado.

Para agentes, el historial compartido duradero es su bandeja: la recepción se registra
al insertar. Desde migración 0045, al comenzar una ronda (un segundo después de
reservar atención), todos los agentes grupales con recibos sin leer hasta el disparador
se conectan (En línea, lease de 30 segundos que nunca acorta ni interrumpe otro
trabajo), y un segundo después leen todos los mensajes hasta ese disparador. El
agregado puede pasar a Leído antes de que escriba un contacto, mientras las personas
confirman por su cuenta. Los contextos del modelo registran además lecturas de IDs
realmente incluidos tras una respuesta exitosa del modelo, incluido historial
acotado, disparador original, respuestas previas de ronda y extractos recuperados.
Los contextos privados del agente también confirman extractos grupales compartidos
incluidos. El contexto puede recortarse y los marcadores de adjuntos omitir bytes.
No se genera respuesta solo para avanzar una marca. Un agente no interpelado puede
seguir sin leer hasta que un turno autorizado posterior incluya el mensaje. Los
fallos del modelo no confirman consumo. Las lecturas del agente describen su
confirmación de lectura del contacto en servidor, que puede preceder a generar;
no prueban una respuesta completada del modelo ni un mensaje de respuesta.

Los mensajes antiguos carecen de snapshot y devuelven `receiptState: null`; iOS
muestra conservadoramente Enviado, nunca infiere Recibido/Leído. Los snapshots
vacíos también siguen Enviado. Las APIs exponen solo estados agregados, bajo
pertenencia actual. Las confirmaciones están vinculadas a la cuenta, limitadas a
100 IDs, son idempotentes y tienen límite de frecuencia; revalidan pertenencia al
escribir. Las horas de lectura/entrega conservan el primer valor.

`PUT /api/v1/groups/receipts` confirma recepción de hasta 100 `messageIDs` de
vistas previas de Inicio. `PUT /api/v1/groups/:id/receipts` acepta `messageIDs` y
`state: received | read`. `GET /api/v1/groups/:id/receipts?messageIDs=<JSON array>`
actualiza agregados de hasta 100 IDs retenidos. El historial devuelve `receiptState`
por mensaje; los resúmenes devuelven `lastMessageID`, `lastMessageUserID`,
`lastMessageReceiptState`. Inicio usa **Tú:** en negrita para el último mensaje de
la persona con sesión y muestra su marca.

Los almacenes de sesión deduplican confirmaciones exitosas, reintentan fallos durante
sondeo visible, conservan lecturas observadas para reintentar y limitan deduplicación
a IDs de historial/vistas previas retenidos. Las actualizaciones de recibos cambian
filas en caché, incluidos mensajes salientes antiguos fuera de la página reciente,
sin otra caché de cuerpos. La invalidación bloquea resultados tardíos; cambiar de
sesión descarta el estado. Un fallo de actualización mantiene visible historial
útil. No se usa servicio adicional.

Comprobaciones aisladas opcionales: `node scripts/checks/group-receipts.cjs` y
`node scripts/checks/group-publication.cjs` (Node 24+). Usan SQLite migrada en
memoria y límites simulados de modelo/red, nunca chats reales ni llamadas a
proveedores. Sigue pendiente verificar en dispositivo: dos cuentas humanas
ficticias y bots, destinatario sin conexión, segundo/primer plano, fila fuera de
pantalla, mensajes largos/imagen/PDF, reintento, páginas antiguas, entrada/salida/
eliminación y cambio de cuenta. Confirma que no haya agregado prematuro, que la
vista previa de Inicio no marque lectura y que no se afirme entrega push.

## Mensajes privados desde un grupo

Un contacto grupal puede continuar un tema uno a uno en su chat privado existente
con un miembro: cuando la persona lo pide («Bot 1, hablemos de esto en privado»)
o por iniciativa propia cuando algo concierne claramente solo a esa persona
(asunto personal o sensible, seguimiento que solo necesita ella, corrección para
ella). Es lo inverso de [pedir en privado una publicación grupal](group-requests.md).

- **Quién puede recibirlo.** Solo un miembro humano actual que ya tenga un chat
  privado con el contacto: propio o compartido. El contexto marca esos miembros
  con `privateChat`. No se crea nada para nadie más; la herramienta devuelve error
  y el contacto habla en el grupo. Con Contributor el chat privado necesita el
  mismo consentimiento Contributor que cualquier respuesta privada.
- **Qué se envía.** `message_privately` (en `groups/private-messages.ts`) inserta
  un turno completo solo del asistente en ese chat privado, con el texto escrito
  durante el turno grupal, y envía la notificación normal. El mensaje debe entenderse
  por sí solo e indicar grupo y tema continuados, porque se lee fuera del grupo.
  Al redactarlo no se consultan memorias privadas; el siguiente mensaje privado
  de la persona usa el contexto privado completo.
- **Cuándo se ofrece.** Solo en el borrador inicial de respuesta a un mensaje
  propio de una persona (no disparadores de bots, preguntas dirigidas ni revisiones),
  manteniendo la decisión grupal requerida: el contacto puede decir en el grupo
  que escribió en privado, u omitir.
- **Límites.** Un mensaje privado por respuesta grupal (`<replyID>:private`, para
  que repetir un paso Workflow nunca envíe dos veces), nunca mientras ese chat
  privado tenga respuesta en cola/activa, máximo tres por contacto y doce por
  cuenta en 24 horas móviles (`chat_turn.origin_group_id`, migración 0051).
  No cuesta energía grupal ni inicia un episodio de [iniciativa](initiative.md).
- **Clientes.** Ambos ya muestran turnos solo del asistente (como iniciativa), por
  lo que iOS y web no requieren cambios: aparece como mensaje normal del contacto
  con contador de no leídos, vista previa y, en iOS, notificación push habituales.

## Interfaz y límites actuales

Los demás remitentes tienen avatar junto a la burbuja y nombre dentro, sobre el
contenido. Se aplica a texto, imágenes y tarjetas PDF. Los avatares entrantes se
alinean con la parte inferior del contenido, junto a la cola inferior izquierda;
las colas salientes quedan abajo a la derecha, como en chats individuales. El
encabezado muestra miembros separados por comas y se desplaza horizontalmente si
exceden el ancho; Reducir movimiento los deja quietos y VoiceOver lee la lista
completa. La marquesina recorta a un área de subtítulo de tamaño explícito y
alineada al inicio para que el texto no pase detrás del avatar. Pausa en cada
extremo, se mantiene dentro del exceso medido y vuelve a la izquierda al cambiar
miembros o ancho. Los grupos usan `MessageBubbleView` como privados, incluidos
colores, colas, fondos planos, horas y tipografía, añadiendo avatares/nombres para
otros miembros. Las marcas salientes usan los recibos agregados descritos abajo.
Ambos comparten el campo de cápsula de vidrio, botón circular tintado y control
flotante para ir al último de `ChatControls.swift`. Los grupos usan el mismo
espaciado/relleno de 16 puntos del historial, borde inferior suave, barra nativa de
área segura inferior, carga/estado vacío y animaciones de inserción/desplazamiento
que respetan Reducir movimiento. Como en privado, iOS mide las filas cargadas en
un `VStack` normal antes de posicionar, abre caché con ancla inferior y desactiva
animación inicial. El `ScrollPosition` nativo compartido apunta al borde inferior
incluidas inserciones y mantiene alineación con cambios de contenido, área visible
e inserciones en reposo al seguir lo último. Interacción de desplazamiento,
carga anterior y navegación por citas detienen la alineación. Volver a lo último
la reactiva. El botón solo anima su superposición. Evita corregir alturas diferidas
y animar todo el historial alrededor de mensajes finales largos. Paginación y caché
no cambian. Las pruebas en dispositivo deben cubrir entrada fría/en caché, texto/
Markdown muy alto, imágenes, cambios de teclado, envíos pendientes, respuestas
nuevas, páginas anteriores y citas; historiales grandes necesitan además verificar
rendimiento. Consulta [posicionamiento](chats.md) para la compensación. El encabezado
coloca identidad de 38 puntos y título/subtítulo compactos en la ranura principal
entre atrás y el menú único, como el [encabezado privado](chats.md). No es una acción
inicial de barra que iOS pueda colapsar en un menú anidado. Tocar el título abre
detalles; no cambian marquesina ni caché. Sigue pendiente verificar título y menú
de un solo nivel en dispositivo.

Los grupos admiten texto, adjuntos de imagen/PDF, [mensajes de voz](voice.md) y
sondeo en primer plano. Están implementados push grupal, no leídos por miembro y
notificaciones de primer plano; no las programaciones grupales. Grupos y privados
aparecen juntos en una lista Chats simple, por hora del último mensaje y desempates
estables de ID con prefijo de tipo. Las filas grupales usan el mismo diseño de
avatar/nombre/vista previa/fecha, sin chevrón. La vista previa muestra **Remitente:
mensaje**, con solo el prefijo en negrita, usando el nombre guardado con el mensaje.
Los saltos se colapsan a espacios; los mensajes solo con adjunto muestran su etiqueta.
Ambos tipos comparten fechas: hora local hoy, Ayer, día de semana para hace dos–seis
días y luego dd/MM/yyyy. Un grupo vacío no tiene fecha y ordena por creación.
Los grupos antiguos esperan tras el límite actual de página privada hasta Cargar
más, sin saltarse chats privados más nuevos aún no cargados. Las respuestas de
API anteriores pueden omitir campos opcionales nuevos de remitente/hora; las filas
conservan vista previa y usan la hora existente de actividad como alternativa si
hay mensaje. Avatares grupales e imágenes usan la misma caché protegida acotada por
cuenta que privados. Los avatares de miembros humanos/contactos quedan en memoria
de vista. Perder pertenencia o recibir 404 de historial borra conservadoramente la
caché de imágenes de cuenta; cerrar sesión la borra. Como en privado, una revocación
sin conexión se detecta solo tras actualizar metadatos.

## Fotos, adjuntos y voz de grupos

Crear ofrece los mismos controles avatar/nombre y recorte cuadrado que contactos.
El propietario puede editar nombre y elegir, recortar, reemplazar o eliminar foto
en detalles. Todos la ven en Chats y encabezado. Otros miembros no pueden editarla.
Las fotos usan objetos JPEG versionados en `groups/<groupID>/<version>.jpg` del
bucket privado existente, máximo 512 KiB y 64–1024 píxeles cuadrados. Las escrituras
usan comparación e intercambio y límite separado de 12 por minuto por cuenta.
Reemplazar, quitar y eliminar el grupo limpian objetos viejos de mejor esfuerzo;
pueden persistir fotos huérfanas si falla la limpieza o se elimina una cuenta fuera
de estas rutas.

El clip ofrece Fotos y Archivos con JPEG/PNG/GIF/WebP/PDF y límite de 5 MiB igual
que privados. Las imágenes usan burbujas idénticas, pies opcionales, miniaturas de
portada y zoom/cierre por deslizamiento a pantalla completa; los PDF usan Quick Look
nativo. Los archivos entrantes se alinean a la izquierda con nombre/avatar del
remitente, los salientes a la derecha. La voz entrante conserva también el avatar
normal de fila a la izquierda en ambos clientes, junto al avatar dentro de la
burbuja de voz a la derecha. Un envío incierto conserva UUID y bytes originales
para reintentar; el rechazo de base restaura borrador sin pisar ediciones posteriores.

Los archivos se guardan privados en `group-attachments/<groupID>/<senderID>/<messageID>/<random>`.
El historial devuelve solo metadatos públicos, nunca claves de almacenamiento.
Los miembros actuales pueden recuperarlos, incluidos los anteriores a entrar;
los antiguos no. El registro existente de objetos adjuntos y Cron protegen referencias
grupo/privadas, eliminando archivos sin referencia tras 24 horas de gracia. Eliminar
el grupo borra referencias de mensajes, dejándolos aptos para limpieza.

Cada ronda bot incluye un adjunto para el modelo: el actual o el más reciente del
historial grupal apto acotado. Los otros marcadores omiten bytes. Las comprobaciones
Contributor se aplican a mensajes origen y archivos históricos. Los bytes son
evidencia no confiable y no conceden permiso para modificar programaciones u otros
datos. Extraer memoria grupal sigue usando solo texto/pies humanos, no archivos.

El micrófono graba [mensajes de voz](voice.md) con la misma grabadora, gesto,
burbuja y caché protegida de audio que privados: mantener para grabar, soltar para
enviar, clips WAV mono 16 kHz de 0,5–60 segundos. Se guardan como audio reproducible
y el primer contacto que responde en la ronda los transcribe después de enviar;
la transcripción queda tras **Ver transcripción**. Un envío incierto conserva clip
y UUID pendientes para **Reintentar envío**. El dictado grupal
(`POST /:id/transcriptions`) queda solo para clientes anteriores.

## Configuración y verificación

Consulta [infraestructura](infrastructure.md#group-conversations). Las migraciones
`0016`, `0017`, `0018`, `0019`, `0020` y `0021` son aditivas y usan bindings
existentes de D1, R2, Workflow, Cron y Meta; no requieren recurso, secreto, tema
APNs, dependencia ni despliegue manual nuevos.

Las comprobaciones estáticas cubren TypeScript, tipos Swift completos y compilación
de esquema/consultas SQLite temporal. No demuestran comportamiento en ejecución,
red ni visual. Con cuentas ficticias, verifica creación, aceptación/rechazo/
expiración de invitaciones, cambios de permisos solo por propietario, revocación
del derecho a invitar, eliminación/salida de miembros, añadir contactos propios,
paginación, deduplicación de reintentos, rondas acotadas, recuerdos compartidos con
autores correctos y solicitudes grupales/privadas simultáneas. Comprueba que cambiar
de Standard a Contributor excluya mensajes antiguos sin consentimiento. Comprueba
eliminar el grupo durante una respuesta, recuperar envíos sin conexión, editar/
eliminar foto por propietario, rechazo a no propietarios, envío/vista previa de
imagen/PDF, mensajes solo con adjuntos, reintentos idempotentes de archivos,
revocación de acceso, limpieza de huérfanos, permiso/mantener/cancelar/bloquear/
reintentar/interrupción por segundo plano y reproducción de voz, avatares,
desbordamiento/Reducir movimiento del encabezado, Dynamic Type y teclado en dispositivo.

## Notificaciones y mensajes no leídos

Cada mensaje nuevo de otra persona o cualquier contacto cuenta como no leído para
cada miembro humano actual hasta avanzar su marca de lectura. Los propios no
cuentan ni notifican a otros dispositivos tuyos. Abrir el grupo confirma historial
cargado solo con chat visible y app activa; Inicio, detalles y sondeo en segundo
plano no crean observaciones de lectura. Una observación en cola puede terminar o
reintentarse tras salir. Los contadores aparecen en filas, pestaña Chats e ícono,
combinados con respuestas privadas no leídas. `PUT /:id/read` acepta una secuencia
positiva mostrada, nunca retrocede, la limita al historial real y elimina
notificaciones leídas del outbox del servidor. Tiene presupuesto separado de
120 actualizaciones por minuto. Las listas obsoletas no pueden sobrescribir una
lectura confirmada localmente.

La migración 0018 inicializa pertenencias existentes al límite actual de historial,
pues antes no se registraba lectura grupal. No infiere no leídos antiguos ni envía
push histórico. Los miembros nuevos comienzan con el historial existente leído;
los mensajes guardados tras entrar cuentan normalmente.

Un trigger SQL crea outbox persistente por dispositivo en la misma transacción de
mensajes humanos/bots. Excluye al autor y requiere miembro actual, dispositivo
registrado y sesión sin vencer. El envío humano y Workflow bot intentan entrega
inmediata; Cron reintenta intentos faltantes. Se revalidan antes de enviar pertenencia,
sesión cerrada/vencida, confirmación de lectura y reasignación de dispositivo.
La eliminación en cascada cancela entregas grupales en cola. APNs ya aceptado
antes de revocar/leer no puede retirarse de otros dispositivos.

Las alertas muestran título del grupo, subtítulo de remitente y mensaje o etiqueta
de adjunto, con `groupID`, `userID` destinatario, ID/secuencia de mensaje y hora
origen para enrutar. Usan sonido de fondo, tema/secretos Apple y registro de
dispositivos existentes. Los payloads se acotan a 4096 bytes UTF-8. Los IDs bot
se hashean para el límite de 64 bytes del collapse-ID APNs. Son alertas estándar
con ícono de app; las notificaciones privadas con avatar de comunicación conservan
su ruta.

Estando activo fuera del grupo, una alerta remota presenta banner del sistema y
sonido de primer plano. El sondeo cada segundo también aporta actividad no leída
acotada como alternativa local. Los IDs estables deduplican banner y sonido entre
sondeo/APNs. Viendo el grupo, una burbuja recibida nueva suena después de insertarse,
sin banner. El sonido saliente requiere aceptación del servidor. Los mensajes
anteriores a activar primer plano no repiten sonidos ni alertas locales. Mostrar
alertas respeta permisos del sistema; la app usa su comportamiento existente de
sonido en primer plano. Leer avanza la marca local y elimina notificaciones
entregadas del grupo hasta la secuencia confirmada. Los cambios de cuenta borran
estado local de notificaciones; los toques solo enrutan a la cuenta coincidente
y siguen requiriendo pertenencia del servidor al leer historial.

La entrega usa lotes acotados existentes (30 entradas, cinco envíos paralelos),
reservas de dos minutos, espera incremental, ocho intentos y vencimiento de
24 horas. Es reintentable, no exactamente una vez; las alertas demoradas aceptadas
pueden durar más que una alternativa local ya mostrada. No se ejercitó push remoto
ni comportamiento en dispositivo durante la implementación. Consulta
[notificaciones](notifications.md#group-notifications) para configuración y comprobaciones.

El historial y los detalles grupales comparten ahora una caché de sesión acotada.
Los avatares usan caché protegida y navegar revalida conservando contenido cargado.
Consulta [caché de navegación grupal](caching.md#group-navigation-and-secondary-screens)
para expulsión, paginación, invalidación de acceso y verificación en dispositivo.

## Navegación coherente de Inicio y grupos

Inicio proyecta el mismo último mensaje, remitente y recibo agregado en caché que la
vista grupal. Los recibos de lista se reconcilian por ID, y el historial/paginación
demorados no pueden retroceder una marca Leído. El reloj optimista pasa a Enviado
al aceptar el servidor, antes de otra solicitud de historial o del sonido de envío.
La aceptación HTTP no confirma recepción del destinatario. Los fallos transitorios
de servidor/límite conservan el UUID. Push remoto de primer plano despierta la
sincronización antes de presentar sonido/banner de actividad obtenida. Historiales,
listas, invitaciones y confirmaciones de lectura tienen ciclos separados. Consulta
[sincronización compartida](caching.md#shared-conversation-synchronization) para
límites de sondeo, presupuestos de caché, regresiones aisladas y comprobaciones
pendientes. No requiere cambios de backend ni infraestructura; instala la app iOS
actualizada.

Las escrituras de marca de no leídos sobreviven a cancelar la vista y agrupan
observaciones durante otra escritura pendiente. El temporizador de sesión reintenta
fallos incluso si la solicitud de lista de Inicio está trabada. Los recibos de
lectura observados también reintentan mediante actualizaciones del historial en
caché; siguen separados de las marcas. Los aciertos de caché grupal conservan el
mismo almacén sin escrituras LRU observables al renderizar. Consulta la
[duración de confirmaciones](caching.md#read-acknowledgement-lifetime) para cancelación,
reconciliación de contadores, retención y límites de verificación.

## Reacciones a mensajes grupales

Consulta [reacciones](reactions.md) para selector compartido iOS/web, identidad de
actor y mensaje, herramientas del agente, permisos, reintentos de mutación,
frescura de caché de sesión y verificación. Usan la sincronización existente y no
añaden mensajes no leídos ni alertas push.

## Respuestas a mensajes grupales

Consulta [respuestas](replies.md) para acciones Responder compartidas, payloads de
cita, validación de destino, contexto del agente, caché y verificación. Son mensajes
normales que llevan un mensaje anterior citado; no añaden tipo de solicitud,
almacén ni notificación nuevos.

## Selección de modelo según solicitante

Salvo grupos permanentemente aislados por conectores (Standard), los Workflows
grupales seleccionan el modelo de la cuenta de quien originó/solicitó el mensaje
humano al iniciar el trabajo, incluidos turnos posteriores de bots del intercambio.
No seleccionan el modelo del propietario del agente que responde. Siguen los
controles de memoria compartida y consentimiento Contributor; cambiar una cuenta a
Contributor no puede dar consentimiento ajeno. El despacho en segundo plano de
resultados y las comprobaciones push resuelven la cuenta correspondiente en lugar
de usar el modelo de otro Workflow.

Consulta [modelos](model-settings.md) para API, consentimiento compartido, caché,
gasto de AI Gateway y verificación pendiente en ejecución/dispositivo.

## Acceso explícito a conectores

En iOS y web, Detalles del grupo → Conexiones enumera conectores ya asignados a tus
bots que añadiste al grupo. Concede cada par bot/conector una vez; la confirmación
explica permisos continuos de lectura/cambio/envío y exposición a todo miembro
humano actual y futuro. El propietario del grupo no puede conceder conectores de
otro propietario de bot. Cualquier persona miembro puede pedir a ese bot una
herramienta externa habilitada. Continuaciones de bots, delegaciones privadas,
turnos programados y revisiones no inician acciones externas. Al ejecutar siguen
requiriéndose asignación privada, propiedad/quién añadió, pertenencia, OAuth y
aprobaciones actuales de herramientas. Revocar bloquea futuras admisiones; acciones
ya admitidas pueden terminar. Revocar en el contacto elimina permisos grupales
asociados; desconectar la cuenta elimina todos.

El primer permiso grupal selecciona Standard permanentemente y excluye todo el
grupo de memoria/recuperación entre chats, incluso tras revocarlo. Se siguen
extrayendo y recuperando hechos humanos y personalidad/preferencias del bot localmente
en ese grupo; claves iguales de otros grupos no los sobrescriben. Consulta
[memoria local de conversación](memory.md#conversation-local-memory-with-mcp).
Los miembros conservan acceso normal al historial grupal. Un registro independiente
de ejecución por respuesta impide reintentos automáticos de acciones inciertas;
las revisiones no repiten herramientas. Las migraciones no habilitan permisos.
Ambos clientes almacenan listas de acceso sin esquemas y revalidan al entrar;
consulta [caché](caching.md#mcp-connection-metadata) y
[migración/verificación de conectores](connectors.md#account-connector-migration-and-verification).

## Respuestas fallidas y recuperación

Los metadatos de respuestas del snapshot incluyen `sourceID`, `sourceSequence` y
`attempt`, además de ID, agente, nombre y estado existentes. Ambos clientes colocan
el fallo agotado directamente bajo el mensaje origen, con nombre del agente y
**Reintentar respuesta**. No se muestra pie de fallos separado. Si el origen está
fuera del historial cargado, solo aparece al cargarlo. Las respuestas de API
anteriores sin metadatos de origen se decodifican sin adivinar el mensaje.

Un lugar fallido deja de aparecer cuando el mismo agente tiene cualquier mensaje
grupal posterior (tras la secuencia origen); la respuesta de otro agente no lo
borra. El servidor filtra fallos resueltos independientemente del historial cargado,
y los clientes también filtran contra mensajes cargados al revalidar. Las filas
fallidas originales quedan como diagnóstico, no alertas sin resolver. Reintentar
rechaza con 409 un lugar resuelto o bloqueado por trabajo actual; siguen los
controles de pertenencia, acceso origen, atención y consentimiento.

Tras dos decisiones inválidas o un fallo recuperable del modelo, el Workflow intenta
una fase de recuperación solo de respuesta (hasta dos llamadas bajo su política
existente de un reintento por paso), máximo 2.048 tokens de salida por llamada.
Usa evidencia ya guardada, sin herramientas ni esquema de decisión JSON, y pide
respuesta breve natural o explicación honesta del trabajo incompleto. No inserta
mensaje estático inventado si el modelo sigue indisponible. El borrador recuperado
pasa los controles normales de marca de historial/publicación/energía. Una solicitud
humana posterior o continuación normal de bot puede cerrar una recuperación obsoleta
sin publicar; las aperturas humanas obligatorias conservan su requisito de respuesta.
Solo la inferencia exitosa confirma contexto recién procesado.

Errores de acceso, consentimiento, credenciales/configuración y base de datos no
entran en recuperación. Se revalidan permisos MCP/generaciones OAuth/aprobaciones y
acceso a recibos guardados antes de inferir. Recuperar nunca reejecuta herramientas
ni crea solicitud/intento nuevos; las acciones externas inciertas siguen protegidas
por su registro. Los fallos recuperables de transporte se guardan como resultados
acotados para repetir el Workflow por la misma rama sin repetir la llamada agotada.
No puede garantizar completar la tarea externa.

La validación de decisiones ahora registra solo un motivo fijo (`invalid_json`,
`invalid_shape`, `invalid_action`, `invalid_text`), sin texto del proveedor. Sigue
el límite backend de 20.000 caracteres. Siguen vigentes límites de intentos,
revisión del historial reciente, intercambios finitos de bots y aislamiento de
memoria. Consulta [infraestructura](infrastructure.md#reply-failure-diagnostics-and-recovery)
para release, verificación e incidente observado.

## Formato de mensajes de bots

Ambos clientes aplican [Markdown esencial](chats.md#bot-message-markdown) a mensajes
cuyo remitente es un agente. Los mensajes humanos de otros miembros siguen literales,
independientemente de alineación entrante/saliente. Las vistas previas de lista y
cita de bots y alertas de primer/segundo plano usan texto plano analizado antes de
recortar. Se conservan atribución, citas, reacciones, metadatos de recibos y texto
original en caché. Verifica formato con respuestas privadas/grupales ficticias en
ambos clientes; la verificación visual sigue pendiente.

## Personalidad y continuidad de relaciones

La [personalidad](personality.md) es un perfil compartido del creador. Su director
de actuación en servidor compila tema actual, temperamento, ambiente local y relación
persistente con cada miembro humano/agente actual en instrucciones individuales.
Alice puede recibir redacción contenida mientras Bob recibe calidez en la misma
respuesta; ni nombres ambiguos ni la disculpa ajena fusionan sus relaciones. El
conflicto privado no vuelve frío al agente con todos. Los temas de cuidado/prácticos
prevalecen sobre agravios e ironía.

Las relaciones pueden continuar desde un chat privado apto u otro grupo, pero el
modelo que actúa no recibe citas origen, IDs privados, categorías de eventos,
horas de lectura ni explicación causal. El clasificador solo ve evidencia local
y audiencia actual. Pertenencia origen, consentimiento del modelo, publicación
y eliminación filtran cada proyección. Los borradores pendientes/omitidos no tienen
efecto duradero, las revisiones reutilizan una sola valoración y eliminar/revocar
quita la influencia del origen. Grupos/chats con conectores siguen locales y no
importan ni exportan relaciones. Memoria factual, permisos de herramientas, energía
y límites de rondas son independientes. Consulta la guía para retención acotada,
límites de privacidad y regresiones opcionales con datos ficticios.

## Grupo del primer círculo

El [onboarding](onboarding.md) crea un grupo con la cuenta nueva y sus cinco
contactos generados tras aceptar explícitamente memoria compartida. La pertenencia
referencia los mismos agentes; no los clona ni invita otras personas. El grupo
empieza vacío, con permisos, memoria, energía y políticas normales. La configuración
usa Standard y no guarda consentimiento Contributor.

### Mirar fotos de perfil de miembros

Durante la recopilación de evidencia, los contactos pueden llamar
`view_profile_photo` para su avatar o los de cuenta/contacto de miembros actuales
con IDs del listado. La API compartida ofrece lo mismo a iOS y web. Las lecturas
se limitan a grupo, consentimiento y versión actuales; no conceden edición de
contacto privado ni cuenta. Los bytes se cargan dentro de inferencia, mientras los
checkpoints guardan solo referencias. Consulta [fotos de perfil](profile-photos.md#profile-images-available-to-contacts)
para presupuestos, revocación y comprobaciones funcionales pendientes.

## Mensajes sucesivos de respuesta

Una respuesta habitual puede contener varios mensajes grupales entregados por
separado. Cada uno tiene identidad de recibo/cita/reacción y cuesta un punto de
energía. Los mensajes intermedios, cambios de acceso o energía agotada detienen
las partes restantes. Las respuestas dirigidas que vuelven en privado se mantienen
cohesivas en un mensaje. Ambos clientes reutilizan caché y sondeo grupales.
Consulta [mensajes sucesivos](reply-messages.md) para entrega y verificación.

## Compartir texto privado opcionalmente

En **Detalles del grupo → Hablar de mis chats privados** (fila que abre una hoja),
cada persona puede permitir a un contacto hablar de toda su conversación privada
de texto pasada y futura con todos en este grupo. Cada interruptor comienza apagado
y habilitarlo requiere divulgación/confirmación explícitas en iOS y web. El permiso
se limita a persona + agente + grupo; ni el propietario autoriza chats ajenos.
La audiencia incluye miembros futuros. No se concede historial sin procesar en
otros grupos ni a otro agente. Las reglas de memoria compartida atribuida no cambian;
desactivar acceso al historial no es un interruptor completo de privacidad de memoria.

`PUT /api/v1/groups/:id/private-sharing/:agentID` acepta `{ "enabled": boolean }`.
El servidor resuelve el contacto privado de la persona autenticada, pertenencias
actuales, consentimiento de memoria y Contributor aplicable. Los snapshots devuelven
solo sus ajustes `privateSharing`, con ID del agente, activación y disponibilidad.
Carecer de contacto privado o aislamiento MCP permanente deshabilita concederlo.

El modelo grupal recibe identidades origen aptas y la herramienta de solo lectura
`search_authorized_private_messages`. Puede buscar turnos privados normales
completados por consulta léxica, pedir recientes sin consulta, seleccionar ID humano,
paginar por secuencia y leer un turno devuelto con offsets de caracteres. Los
resultados atribuyen a la persona y separan texto y fechas de usuario/asistente.
Caben hasta cuatro turnos en un payload de 3.600 bytes con texto recortado y
metadatos de continuación. Incluye planes temporales omitidos por extraer memoria
duradera. Es recuperación acotada, no recuerdo exhaustivo garantizado. El texto
puede hablar de archivos; se excluyen sus bytes, turnos programados, retransmisiones
privadas de resultados grupales y conversaciones permanentemente aisladas por
conectores. Siguen las reglas de procesamiento del modelo existentes.

Cada lectura comprueba acceso vivo. Revocar permiso completa atómicamente las
respuestas grupales pendientes, activas y fallidas de ese agente, impidiendo que
checkpoints, borradores, reintentos y partes sucesivas no enviadas publiquen tras
revocar. Salir/eliminar a la persona origen, quitar el agente, borrar el contacto
privado o añadir aislamiento por conector elimina permisos en cascada. Reingresar/
reañadir requiere conceder de nuevo. Cambiar consentimiento Contributor privado
también completa intentos afectados. No pueden retirarse mensajes grupales ya
enviados, copias ni procesamiento del proveedor. Los nuevos mensajes pueden iniciar
rondas nuevas normalmente.

Ambos clientes reutilizan el snapshot grupal de sesión. Los cambios exitosos
actualizan interruptores en caché inmediatamente e invalidan solicitudes anteriores
antes de revalidar; fallos transitorios conservan ese estado confirmado. Reabrir
muestra ajustes en caché al instante con actualización de fondo; deslizar en iOS
y Actualizar detalles en web obtiene el estado actual. Los permisos en caché nunca
autorizan recuperación. Consulta [caché](caching.md) y
[configuración de migración](infrastructure.md#group-private-text-sharing).

Las comprobaciones estáticas cubren tipos API/web/Swift y preparación SQL.
Ejecución/dispositivo, recuerdo del proveedor, carreras de autorización y aspecto
requieren verificar con cuentas ficticias: planes de pizza con permisos activados/
apagados, otras personas/grupos/agentes, revocar durante investigación y entrega
sucesiva, reconceder/reingresar, aislamiento MCP, cambios Contributor, paginación,
navegación sin conexión y cambio de cuenta.

## Estado de escritura grupal

El snapshot añade `replies[].isTyping` numérico (0 o 1), derivado de respuesta
activa, reserva exclusiva del intento y presencia Escribiendo sin vencer o búsqueda
web activa (`replyActivity: "researching"`). Las respuestas en cola y decisiones
silenciosas nunca implican escritura; los hablantes planificados escriben mientras
generan (consulta [coordinador](#round-coordinator-migration-0071)). iOS y web
requieren este indicador explícito; snapshots antiguos sin campo no muestran
indicador. El subtítulo web sigue lo mismo y da formato con `replyActivityLabel`
(`shared/activity.ts`), redactado en el idioma de interfaz por
`useReplyActivityLabel.ts` (iOS: `ReplyActivityLabel.swift` en lista); la API
conserva la función inglesa para el resumen `replyActivity` («Ana and Bo are
typing...», «4 people are typing...»; consulta [chats](chats.md)). La consulta
retorna hasta 50 respuestas activas como JSON y la API las formatea, sin migración.
La disponibilidad de reintento sigue contemplando todos los trabajos en cola/activos.
No requiere migración ni servicio nuevos.

Las respuestas de trabajo de tareas llevan `replies[].taskID` y `taskTitle`.
Ambos clientes las muestran como fila «Trabajando en “…”» con nombre del contacto
(en cola o activo, con o sin escritura) y añaden «<nombres> trabajando…» al subtítulo.
Consulta [tareas](tasks.md#seeing-the-work).

El snapshot existente y sondeo visible cada segundo llevan este estado; no hay
predicción del cliente ni divulgación del borrador. Siguen invalidación y protección
contra respuestas tardías. Pendiente en ambos: dirigirse a uno de tres contactos
ficticios, verificar que otros omitan silenciosamente, varias respuestas en turno,
mensajes sucesivos, revisiones interrumpidas, fallos, navegación/reapertura,
recuperación sin conexión, eliminación y cambio de cuenta.

## Citas opcionales de contactos

Los contactos pueden elegir un mensaje visible para citar cuando su identidad
aclare una respuesta ambigua. Las respuestas claras normalmente omiten citas.
La revisión conserva o cambia el destino y publicar revalida visibilidad; solo
el primer mensaje de una ráfaga cita. iOS y web reutilizan presentación y
navegación existentes. Consulta [respuestas](replies.md).

## Participación contextual

Un disparador humano habitual ofrece decisión a cada contacto, no mensaje
obligatorio. El modelo compara disparador con respuestas anteriores e historial
antes de elegir responder u omitir. Una pregunta factual abierta puede resolverse
con una respuesta suficiente; otros hablan solo si aportan o corrigen. Pedir comida,
experiencia o preferencia de cada persona sigue invitando respuestas separadas,
incluidas preferencias coincidentes. Preguntar a alguien nombrado suele dejar a
los demás en silencio. No requiere desacuerdo artificial para ganarse un turno.
Los saludos iniciales obligatorios solicitados por humanos y las preguntas designadas
con retorno privado conservan su contrato. Omitir no cuesta energía ni crea mensaje,
indicador ni mutación de caché. La política se aplica igual en iOS y web. Valida
preguntas factuales, rondas personales, destinatarios nombrados, correcciones útiles
y mensajes tardíos/intercalados con participantes ficticios; la calidad del prompt
no se demuestra estáticamente.

## Terminar bucles de confirmaciones

Las decisiones incluyen `invitesReply`. El modelo usa false para confirmaciones,
acuerdos, elogios, despedidas y sentimientos repetidos; una pregunta de relleno no
cuenta como aporte. El acuerdo reciente favorece omitir, no parafrasear. Información
nueva útil o preguntas significativas pueden continuar la conversación bot.
Al publicar, false cierra solo oportunidades en cola creadas por ese mensaje, en
la misma transacción D1. Las partes posteriores obedecen la misma decisión. Las
rondas de la pregunta humana original siguen intactas, al igual que respuestas
dirigidas y mensajes humanos posteriores. La recuperación nunca invita continuación
automática. Los borradores antiguos en curso sin el campo conservan su comportamiento.
No requiere cambios de esquema, servicio ni payload; ambos ven los mismos mensajes
y silencios normales.

La decisión semántica sigue siendo del modelo y puede fallar; no demuestra que sea
imposible toda repetición. Verifica elogio al equipo, varios acuerdos, seguimientos
sustanciales, rondas personales, mensajes sucesivos, reintentos de publicación y
mensajes humanos intercalados con datos ficticios.

## Imágenes generadas por contactos

Ante un disparador humano directo inicial, los contactos pueden generar una imagen
útil o [álbum](generated-images.md#albums) de dos o tres, con cero a tres referencias
de perfil actuales autorizadas por imagen, y publicarlo en el primer mensaje.
Revisar reutiliza esa imagen, no genera otra; omitir no publica nada. Las
continuaciones bot y respuestas designadas de retorno privado no generan imágenes.
Ambos clientes usan adjuntos/caché/navegación grupal normales. Consulta
[imágenes generadas](generated-images.md) para acceso actual, latencia, reservas
duraderas y validación en vivo pendiente.

La generación usa avatares actuales para selfies solicitadas y miembros nombrados,
y recupera fotos de personas o contactos del mismo chat como referencias de
escena/edición. Las descripciones internas son solo del servidor y no aparecen en
pies, historial público ni cuadrículas. iOS y web usan la API compartida y visor/
caché existentes; no requieren cambios de formato. Consulta
[referencias y descripciones](generated-images.md#internal-image-descriptions-and-retrieval)
para alcance, indexación diferida de historial antiguo, límites, retención y
verificación.

## Indicadores de actividad de respuestas

Ambos muestran Grabando... al preparar voz, Escribiendo... para texto e
Investigando... durante búsqueda web. Las segundas líneas privadas/grupales muestran
actividad en vez de vistas previas/recibos conservando orden, horas y no leídos.
Los grupos identifican cada contacto activo. Reutiliza resúmenes de sesión, sondeo,
deduplicación, paginación, aislamiento de cuenta y expulsión existentes, sin
solicitudes por fila ni disco. Consulta [actividad](chats.md#reply-activity-indicators)
para frescura/fallos y verificaciones pendientes, y
[migración 0062](infrastructure.md#recording-presence-migration-0062) para configuración
reproducible y rollback.

## Archivar y vaciar

Cada miembro puede Archivar/Desarchivar por separado. El propietario puede Vaciar
chat para todos, conservando o eliminando memoria aprendida en el grupo. Pertenencia,
foto y preferencias de archivo sobreviven. El [ciclo de vida](chat-lifecycle.md)
documenta permisos, eliminación en cascada de trabajo/multimedia, revisiones de
historial, invalidación de caché y verificación pendiente en nube/dispositivo real.

## Aprendizaje de conversación

Cada agente puede aprender de cada persona a partir de sus mensajes directos y
respuestas propias en el grupo. El [aprendizaje](conversation-learning.md) nunca
importa patrones privados de interacción ni preguntas de otra audiencia. Los
detalles iOS/web muestran solo perfiles de la persona con sesión, con desactivación/
restablecimiento por persona. Cambios de pertenencia/consentimiento y eliminación
origen invalidan estado derivado. Las preguntas siguen siendo aportes opcionales
bajo límites existentes de respuesta/omisión, energía y publicación; no añade
iniciativa grupal. Requiere migración 0067; calidad del modelo y comportamiento
requieren validación funcional.

## Dirigirse a la conversación compartida

El [estilo compartido](conversation-style.md) distingue autor del disparador y
destinatario. Un índice determinista enumera mensajes visibles de miembros actuales
tras el disparador, deduplicando historial reciente y de ronda. Incluye personas
y bots, sin interpretar completar la cola como respuesta ni ausencia de mensaje
como prueba de silencio. El modelo lee contenido y citas reales para decidir a
quién se habla, qué sigue abierto y si aporta una contribución breve. Evita volver
a pedir respuestas ya dadas en planificación, opiniones, decisiones, conversación
y saludos.

Las valoraciones de personalidad grupales no fuerzan un destinatario individual
principal. Las respuestas dirigidas conservan tono individual. Siguen vigentes
aperturas/actualizaciones de tareas requeridas, omisión, consentimiento, energía y
revisión atómica de borradores obsoletos. Las revisiones reconstruyen participación
visible; no revelan intercambios privados. iOS y web comparten este comportamiento
API, sin solicitud ni caché nuevas. Calidad del modelo y comportamiento en
dispositivo/navegador siguen pendientes.

## Revisión final de entrega

La [entrega conversacional](conversation-style.md#final-delivery-and-optional-wording-review)
reutiliza la clasificación de audiencia actual y elige instrucciones categóricas
de audiencia, nombres, profundidad y seguimiento dentro de finalización. Una
pregunta o mención de nombre puede activar una revisión opcional de redacción sin
herramientas antes de publicar. Puede conservar/revisar prosa, conserva imágenes
preparadas, no repite acciones y pasa los controles existentes de acceso/marca de
historial. Los fallos conservan el borrador útil. Añade uso acotado del modelo y
latencia; metadatos semánticos no prueban prosa conforme. El contexto compartido
también guía la recopilación para no reconstruir el artefacto de otro participante.
Ambos reciben mensajes publicados normales mediante almacenes existentes.

## Participación conversacional

Las respuestas habituales de ronda ahora reciben dirección conversacional estable
ante repetición, inicializada por IDs de agente/disparador y ponderada por iniciativa
y curiosidad. Un contacto puede desarrollar un punto ajeno, ofrecer preferencia
 o propuesta concreta, o hacer una pregunta opcional específica que avance un hilo
social/exploratorio abierto. Puede conversar con otros contactos sin otra solicitud
humana. Las preguntas recientes de pares favorecen unirse a un hilo en lugar de
acumular aperturas. Son instrucciones condicionales del modelo, no pregunta obligada,
respuesta garantizada ni clasificador determinista de intención social. Tareas,
temas sensibles, preguntas resueltas, límites explícitos y cierres tienen prioridad.

El esquema interno acepta `followUp: conversation` junto a `none` y
`missing-information`. Finalización y revisión opcional ven la misma dirección;
la revisión conserva curiosidad opcional significativa eliminando comprobaciones,
nombres y relleno repetidos. Un punto, propuesta o pregunta sustantivos pueden
establecer `invitesReply` true con la cola de continuación existente. Confirmaciones
y cierres siguen terminales. No cambian consentimiento, pertenencia actual,
protecciones de historial, energía por agente ni techo de 100 mensajes. No hay
Cron de grupos inactivos ni reinicio automático de intercambios terminados, ni
permiso nuevo de acciones externas.

La API ofrece lo mismo a iOS/web; mensajes, Escribiendo, lecturas, sonidos y cachés
de partes entregadas usan sus caminos habituales. No añade migración, campo de
respuesta, temporizador ni ajuste. Turnos conversacionales adicionales pueden
consumir más presupuesto existente de modelo/energía. Tipos/SQL estáticos no prueban
charla natural, equilibrio entre personalidades ni cuándo terminar; usa
conversaciones ficticias sociales, prácticas, dirigidas, resueltas, sensibles y de
despedida para verificar aportes y espacio sin saludos/preguntas repetidos.

## Preparación simultánea y participación dirigida (migración 0070)

Dos agentes (cuatro desde migración 0071) pueden preparar borradores y recuperar
contexto en paralelo. Insertar atómicamente `agent_attention` impone el tope grupal,
incluso con despacho y recuperación simultáneos. Un agente sigue atendiendo solo
un turno privado/grupal a la vez. Un borrador listo adquiere `group_publication`,
reserva D1 mantenida durante composición, revisión y ráfaga. Otros preparan pero
esperan publicar. Adquirir es independiente del orden de inserción y reintenta
como máximo 180 esperas duraderas de un segundo. Evita inanición de revisión entre
bots; el tráfico humano aún invalida borradores. Siguen siendo autoritativos dos
revisiones, controles de acceso/consentimiento, energía y límites de intercambio.
Los intentos terminales liberan reservas; admisión quita obsoletas y eliminación
del padre las elimina en cascada. Carriles ausentes/vencidos fallan visiblemente,
sin saltar protecciones. Los borradores requeridos aún invalidados tras ambas
revisiones dejan respuesta fallida para reintentar en vez de terminar silenciosamente.

La recuperación es paralela. Quien prepara y pide herramienta fuera del catálogo
de recuperación/fotos de solo lectura comprueba primero lugares anteriores
incompletos. Si está bloqueado no ejecuta; espera como máximo 180 esperas duraderas
de cinco segundos y luego reconstruye entrada actual y decide de nuevo al terminar
el anterior. Conserva orden de efectos y permite ver trabajo de pares ya completado.
Siguen recibos y protecciones específicas; identificar trabajo duplicado
semánticamente puede fallar. La transcripción grupal usa el turno incompleto más
antiguo mientras otros esperan la transcripción guardada o su finalización, con
la misma espera acotada.

La herramienta de fin de evidencia declara si la solicitud exige respuesta propia
de este agente. Preguntas directas, pedidos de intervenir, perspectiva de cada
miembro y referencias a miembros silenciosos tienen prioridad sobre aportes
opcionales. El esquema final elimina omitir si la respuesta es requerida, y la
obligación sobrevive revisiones sin tráfico humano nuevo. Un mensaje humano nuevo
puede cancelar/reemplazar; la respuesta de otro bot sola no satisface una respuesta
personal. Resolver identidad/referencias depende del modelo, no de palabras clave.
El índice acotado incluye mensajes visibles antes y después del disparador para
contextualizar referencias a miembros antes silenciosos; ausencia en historial
parcial no demuestra no haber participado. Agotamiento, pérdida de acceso, fallos
y tráfico continuo aún pueden impedir entregar; no garantiza que todos respondan
siempre. En privado, preguntar por qué calló un contacto no pide publicación pública
ni requiere permiso de envío; no debe inventar motivos anteriores de omisión.

## Información de lectura por mensaje

Mantén pulsado un mensaje en iOS o haz clic derecho/pulsación larga en web y elige
**Información del mensaje**. Ambos muestran **Leído por**, primeras horas de lectura
y **Aún no leído** con Enviado/Recibido. Disponible para cualquier remitente.
El snapshot original excluye al remitente. Los nuevos no aparecen en snapshots
antiguos; los destinatarios anteriores siguen representados. Mensajes antiguos
sin seguimiento muestran no disponible, nunca lecturas inventadas.

`GET /api/v1/groups/:id/message-info?messageID=...` requiere pertenencia actual y
ese mensaje visible exacto en el grupo. Devuelve solo tipo/ID de destinatario,
nombre, horas de entrega/lectura y existencia de seguimiento. No marca lectura.
Es privado/no-store; los clientes usan cachés acotadas solo en memoria de sesión,
reutilizan inmediatamente snapshots cargados/vacíos y revalidan al abrir, cada
cinco segundos visibles y al actualizar explícitamente. iOS usa NavigationSnapshotCache
de ocho entradas por grupo retenido; web conserva hasta 32 snapshots. Deduplican
solicitudes. Vaciar/eliminar/perder acceso/cambiar cuenta invalida y rechaza
escrituras tardías. Fallos transitorios conservan un snapshot cargado. No persiste
en disco ni pagina destinatarios (pertenencia acotada).

Comprobaciones ficticias opcionales: `node scripts/checks/group-concurrency.cjs`,
`node scripts/checks/group-completion.cjs`, `node scripts/checks/group-energy.cjs`
y `node scripts/checks/group-receipts.cjs`. No se ejecutaron para este cambio.
Pendiente validar en dispositivo/navegador y modelo real: dos preparadores
simultáneos, tercero esperando, trabajo anterior bloqueando efectos, carreras de
publicación y repetición, cancelación/revocación, solicitudes dirigidas/a miembros
silenciosos, listas de lectura antiguas/vacías, reabrir/volver, recuperar sin
conexión, actualizar, vaciar y cambiar cuenta.

## Coordinador de ronda (migración 0071)

Una exportación de depuración del 30/10/2026 mostró 137 lugares de respuesta para
17 mensajes humanos: cada contacto preparaba borrador completo (valoración,
evidencia, decisión y revisión) para cada mensaje/respuesta bot, 104 solo para
callar, de dos en dos. Los mensajes humanos esperaban entre tres y ocho minutos
tras la cola y llegaban respuestas a mensajes ya reemplazados.

**Planificación.** El primer lugar admitido de un disparador apto reserva
`group_round` y hace una llamada coordinadora (`groups/planning.ts`, razonamiento
mínimo, unos 3–8 segundos). Ve disparador, mensaje citado (aunque sea anterior a
la ventana, con hasta tres mensajes a cada lado como `quotedExchange`: lectura de
base, no ronda de herramientas, para mantener una llamada; la historia más profunda
queda para hablantes con herramientas que buscan/leen historial), hasta 16 mensajes
visibles (mismo filtro de autor/Contributor que respuestas; la voz se marca y se
representa por transcripciones), y nombre, resumen de personalidad, especialidades,
energía, actividad reciente y estado Investigando de cada candidato. Devuelve
máximo tres hablantes ordenados (cuatro para ronda profunda o proyecto, consulta
[profundidad](#research-depth-quick-deep-and-project-migration-0072)), cada uno con
rol (`answer`, `research`, `react`, `spark`), ángulo interno de una línea y necesidad
de herramientas. Preguntas, solicitudes, saludos y noticias humanas obtienen al
menos uno; contactos nombrados y silenciosos interpelados hablan; aperturas sociales
obtienen dos o tres ángulos distintos con un `spark` que añade gancho (opinión,
detalle de identidad, propuesta o pregunta). Pedir información actual/pública
obtiene exactamente un `research`, primero. Los disparadores bot obtienen cero o
un continuador para terminar cadenas de confirmaciones. Una pregunta humana nunca
termina sin hablantes. Solicitudes dirigidas, avisos de tareas y aperturas requeridas
conservan respondedores designados y no se planifican.

**Aplicación.** Los lugares elegidos guardan `plan_rank`, `plan_role`, `plan_angle`
y `plan_tools`; los en cola no elegidos completan inmediatamente sin iniciar
Workflow, y uno activo no elegido completa al conocerse el plan. Otros esperan
como máximo 20 sondeos duraderos de un segundo; un plan fallido o vencido marca
la ronda `failed` y todos usan la decisión por contacto anterior, para que el
coordinador no deje al grupo sin respuesta.

**Hablar.** El plan es instrucción de sistema para el hablante (no se menciona a
personas). El ángulo es orientativo: si el contexto más completo (cita, transcripción,
historial) ya responde lo pedido por el ángulo, gana la conversación. Antes, una
voz citada fuera de la ventana hacía planear «pedir la letra», y los contactos
afirmaban no poder oírla. El rango 1 humano debe responder y muestra Escribiendo
desde que genera; la primera pausa descuenta ese tiempo. Un turno planificado
sin herramientas omite evidencia y decide directamente; los borradores planificados
se revisan solo por vocativos. Los rangos posteriores preparan en paralelo, esperan
máximo 90 segundos hasta que anteriores tengan borrador listo (`draft_json`,
filtrado por consentimiento Contributor del lector), los reciben como
`peerRepliesThisRound`, comienzan Escribiendo y deciden. Publican por rango.
La marca de historial (comprobación lista e `INSERT`/`UPDATE` de publicación)
ignora burbujas de esta respuesta y de rangos anteriores de la misma ronda, pues
los borradores ya eran contexto; otro mensaje nuevo, especialmente humano, fuerza
revisión. Las acciones compartidas se ordenan por rango dentro de la ronda.
Una continuación entre bots espera terminar una ronda planificada anterior antes
de tomar el carril de publicación.

**Reemplazo.** Un mensaje humano nuevo completa lugares aún en cola de disparadores
anteriores no dirigidos ni de tareas en la misma transacción que encola su ronda.
Los activos continúan y revisan contra él. Coordinador y primer hablante reciben
mensajes humanos anteriores sin respuesta desde el último bot como
`foldedEarlierMessages` y los responden también.

**Miembros investigando.** Los contactos ven quién investiga ahora y no repiten la
búsqueda. El investigador anuncia primero en el grupo (`<reply>/part/0`, un punto
de energía, sin lugares de continuación) si puede tomar el carril en ocho segundos;
si no, solo informa el indicador Investigando. Consulta
[investigación web](web-research.md#announced-research-and-grounded-answers-migration-0071).

No cambian recibos: se entregan al insertar y se leen al comenzar el primer lugar,
ahora en unos dos segundos, y el primer hablante escribe justo después de planear.
Planificar añade una llamada por disparador apto pero elimina borradores silenciosos;
no garantiza respuestas de todos ni buenas elecciones del modelo.

## Profundidad de investigación: rápida, profunda y proyecto (migración 0072)

El coordinador devuelve además `depth` de ronda. **Rápida** (predeterminada) mantiene
como máximo un investigador; ante un tema amplio termina ofreciendo una investigación
grupal más profunda con documento compartido en vez de preguntar primero para
aclarar. **Profunda** se elige solo ante solicitud explícita de investigación
exhaustiva, mejor o comparativa, informe o aceptación de la oferta: dos o tres
contactos toman `research` con subpreguntas distintas por ángulo y otro toma
`compile` al final (hasta cuatro). **Proyecto** (plan, hoja de ruta o distribución
de trabajo) es profunda más lista de tareas.

Cada investigador tiene recibo propio (`research-group-<message>-<agent>`;
la migración 0072 reconstruye `web_research` para varios recibos por mensaje,
únicos por respuesta). Solo el primero anuncia, describiendo quién cubre qué;
cada uno publica luego un hallazgo breve. Quien compila espera máximo 180 sondeos
duraderos de un segundo los borradores antes de usar herramientas, los recibe
con hallazgos acotados y fuentes citadas (mismo consentimiento Contributor),
escribe documento grupal con `create_document` y publica conclusiones clave.
Para proyectos también crea lista: los contactos reciben solo trabajo realizable
con sus herramientas sin investigación web nueva (las tareas asignadas a agentes
inician el [trabajo persistente](persistent-work.md) existente), las personas
acciones solo realizables por ellas. Los presupuestos subieron a 30 investigaciones
diarias por cuenta (global 300), pues una ronda profunda usa dos o tres búsquedas.
Las comprobaciones en vivo (Contributor) eligieron profunda ante «can you do a
better research about this», rápida para una consulta simple y proyecto para
un plan de mudanza.

## Alias de contactos en grupos

Un bot aparece con nombre compartido para todos salvo quien le dio un alias
privado: esa persona ve el alias en mensajes, citas, lista de miembros, actividad
de escritura/investigación/grabación, vista previa y actividad no leída, detalles
de lectura, reacciones, nombres de tareas/documentos, perfiles de aprendizaje y
subtítulos push. Los demás ven el nombre compartido. `group_message.sender_name`
conserva el snapshot compartido; la API superpone el alias del observador por
`agent_id` al leer. No reescribe texto, menciones ni lo escrito por el modelo.
Quien no tiene contacto para el bot no aplica alias. Consulta
[contactos](contacts.md#contact-alias-private-display-name).

## Avisos de incorporación y bienvenidas

Migración `0081_group_join_events.sql`. Añadir contacto o aceptar invitación escribe
un aviso de pertenencia en historial compartido, ordenado por `sequence`: **«Lautaro
añadió a Mila»** para un contacto, **«Ana se unió · invitada por Lautaro»** para
una persona. Las personas nunca se añaden directamente; aceptan una invitación,
por lo que el aviso las nombra como actor y registra a quien invita.

Un aviso es fila `group_message` con `event_json` (`kind: member_joined`,
`memberKind` `user`/`agent`, `memberID`, `actorID`, `invitedByID` opcional,
`includesHistory`), sin remitente humano/agente y con `requester_id` de la persona
cuya acción lo produjo (quien añadió o quien aceptó). El historial lo devuelve
con `event` (esos campos) y `text` resuelto para el observador (nombres y alias
actuales). Se muestra como banner centrado sin burbuja, avatar, recibos, reacciones,
respuesta ni información del mensaje. Los avisos no cuentan no leídos, no aparecen
en vista previa ni actividad de Inicio y no envían push. Las adiciones duplicadas
o rechazadas no escriben nada.

**Bienvenida agrupada.** Cada entrada actualiza/inserta `group_welcome` con
`due_at = now + 2
minutes`, conservando la secuencia del primer aviso, de modo que añadir tres
contactos seguidos produce una bienvenida. El Cron de cada minuto
(`dispatchWelcomes`) reserva filas vencidas atómicamente y encola una ronda basada
en el aviso más reciente. Cubre todos los avisos desde el último mensaje humano o
bienvenida. Se omite si hubo mensaje humano posterior (su ronda ya ve los banners),
si el actor salió o revocó memoria compartida, mientras se vacía el grupo, si falta
consentimiento Contributor o si la cola está llena. El [coordinador](#round-coordinator-migration-0071)
lo trata como disparador de pertenencia: cada contacto nuevo se presenta y uno
existente (dos para cuatro o más nuevos) da la bienvenida conjunta. Reciben
`round.trigger.membership` (`joined` con `seesEarlierMessages`/`youJoined`,
`addedBy`) y la instrucción de no saludar uno por uno ni citar mensajes anteriores
a quien no puede leerlos. Usan energía, publicación, marcas de historial e
intercambios finitos normales; un mensaje humano nuevo reemplaza la bienvenida
en cola como cualquier ronda. No se aplica barrera de contexto aprendido a avisos.

**Acceso al historial previo.** El formulario de invitación y hoja de contacto
ofrecen **Puede ver mensajes anteriores** (activado por defecto, comportamiento
anterior). La elección se guarda en la invitación (`include_history`) y al entrar
como `history_start` de `group_member`/`group_agent`: secuencia de su aviso de
incorporación. `NULL` significa historial completo; pertenencias anteriores a
0081 lo conservan. Con límite inferior:

- Personas: historial, multimedia y descargas comienzan en su aviso; no pueden
  responder un mensaje previo (HTTP 400). Los detalles muestran «Se unió sin
  mensajes anteriores».
- Citas: al responder alguien a un mensaje previo, el miembro ve la cita recortada
  (200 caracteres; quien responde eligió mostrarla) con `beforeJoin: true` y sin
  archivo (etiqueta «Foto»/«Adjunto: nombre»). No es pulsable y nunca se descarga.
  Los contactos ven el mismo extracto citado en contexto.
- Contactos: contexto y `search_group_messages`/`get_group_excerpt` empiezan en
  su aviso. El coordinador, que solo elige hablantes/ángulos, aún lee los
  16 mensajes recientes. Un contacto nuevo no tiene memorias del grupo previas.
- Chats privados: al preguntar una persona al contacto por un grupo, recuperar
  también empieza en el límite de esa persona.

El consentimiento (crear, invitar, añadir, revisión de consentimiento) dice ahora «Los miembros
pueden leer el historial del grupo, incluidos mensajes enviados antes de unirse,
salvo que se hayan añadido sin mensajes anteriores». Sin historial se reemplaza
por «Verás mensajes desde que te unas»; la revisión iOS para quien entró sin
historial muestra «Puedes leer mensajes desde que te uniste» (web muestra la misma frase en
su hoja de consentimiento).

Límites: contactos y personas existentes recuerdan discusión previa y pueden
mencionarla; el límite restringe leer, buscar y descargar, no lo que otros dicen.
Tareas, documentos y miniapps son elementos de trabajo compartido y siguen visibles.
Reacciones, recibos e información de mensajes anteriores no se exponen por historial
porque esas filas nunca se devuelven. Reañadir un miembro eliminado crea aviso
y límite nuevos.

Verificación (31/10/2026): tipos API; preparación de todas las sentencias nuevas/
cambiadas en workerd D1 local (52 `EXPLAIN`, incluida incorporación de
`groupSourceAccess`); escenario Miniflare D1 con dos adiciones consecutivas de
contactos y un duplicado, persona invitada sin historial, texto por observador,
citas con `beforeJoin`, agrupación de bienvenida, supresión por mensaje humano
posterior, ronda para todos los contactos, acceso origen y exclusión de no leídos.
Sin verificar: bienvenidas del modelo real y presentación en dispositivos/navegadores.

**iOS.** `GroupChatView` muestra mensajes con `event` como cápsula centrada tenue
(`GroupEventBanner`) con texto del servidor y sin avatar, remitente, recibos,
reacciones, deslizar para responder, menú contextual, información ni sonido nuevo;
una bienvenida fallida basada en el aviso muestra la fila usual de Reintentar
bajo él. Se omiten avisos en confirmaciones «recibido», vista previa en caché y
comparación del `lastMessageID` de lista con el último mensaje en caché
(actualización precargada); la lectura sigue avanzando por secuencia. Una cita
`beforeJoin` lleva «Antes de que te unieras», no es botón ni pagina hacia atrás.
La hoja de contacto y formulario de invitación tienen **Puede ver mensajes
anteriores** (enviado como `includeHistory`). Con invitación `includeHistory` 0,
aceptar usa «Verás mensajes desde que te unas» en lugar de la frase de historial
completo. Los detalles muestran «Se unió sin mensajes anteriores» para miembros
con `includesHistory` 0. Los indicadores decodifican booleanos JSON o enteros 0/1;
los campos nuevos son opcionales y pasan por `GroupConversationCache` existente
en memoria (nada en disco). Solo se verificó con `swiftc -typecheck` estático del
target de app; la presentación en dispositivo no se verificó.

## Exportación JSON

Detalles → **Exportar chat** descarga esta conversación como transcripción JSON
legible en iOS y web. Consulta [exportación](chat-export.md).
